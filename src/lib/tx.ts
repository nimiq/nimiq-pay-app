import type { AccountType, Address, PlainTransactionDetails, SerialBuffer, Transaction } from '@nimiq/core'
import type { NimHtlcDetails, PreSwap, Swap } from '@nimiq/fastspot-api-v1'
import type { AsyncResult } from '@/types'
import type { PartialSendTxArgs, UserReceiptTransaction } from '@/types/transactions'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { storeToRefs } from 'pinia'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { useLocalWallet } from '@/stores/local-wallet'
import { CashlinkExtraDataHex, useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/transactions'
import { parseBitcoinLightningInvoice } from '../composables/useBitcoinLightning'
import { useFastspotApiV1 } from '../composables/useFastspotv1'

const logger = useLogger('tx.ts')
const nimiqNetwork = useNimiqNetwork()
const { networkId, height } = storeToRefs(nimiqNetwork)

/**
 * Signs any transaction in the wallet.
 *
 * Different Transfer types are used to sign different transactions and therefore different
 * arguments are needed for each one. The value, flag and recipient will be set automatically
 * depending on the Transfer type.
 *
 * Basically, we have two different Transfer Types in the local wallet:
 *  - UserPayment or UserReceipt: When the user interacts with other wallets in the network
 *  - Sync: Any other transaction that is needed to keep the HTLC alive. See the Transfer enum
 *    for more information.
 *
 * @param partialArgs
 */
export async function getSignedTx(partialArgs: PartialSendTxArgs): AsyncResult<{ signedTx: Transaction, swap?: Swap, txSent?: boolean }, string> {
  logger.log(`In getSignedTx: transfer = ${partialArgs.transfer}`)
  if ((partialArgs.transfer === Transfer.UserPayment || partialArgs.transfer === Transfer.UserPaymentToMerchant)) {
    if (!useRemoteSigner().remoteAddress)
      return { error: i18n.t('Something went wrong syncing your account'), data: undefined }
    const tx = new Nimiq.Transaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ Nimiq.Address.fromString(partialArgs.recipient),
      /* recipientType */ Nimiq.AccountType.Basic,
      /* recipientData */ Nimiq.BufferUtils.fromUtf8(partialArgs.message || ''),
      /* value */ BigInt(Math.ceil(partialArgs.amount)),
      /* fee */ BigInt(partialArgs.fee ?? 0),
      /* flags */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx)
    if (res.error)
      return res
    return { data: { signedTx: res.data!.newTx, txSent: res.data!.txSent }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.UserPaymentToAtomicSwap) {
    if (!useRemoteSigner().remoteAddress)
      return { error: i18n.t('Something went wrong syncing your account'), data: undefined }

    // Confirm swap with Fastspot
    const localWallet = useLocalWallet().localAddress
    const { confirmSwap, getSwap } = await useFastspotApiV1()
    let swap: Swap
    try {
      swap = await confirmSwap(
        /* swap */ { id: partialArgs.paymentRef! } as PreSwap,
        /* redeem */ { asset: SwapAsset.BTC_LN },
        /* refund */ { asset: SwapAsset.NIM, address: localWallet.toUserFriendlyAddress() },
        /* uid */ localWallet.toHex(),
      )
    }
    catch (error) {
      if (error instanceof Error && error.message === 'The swap was already confirmed before.')
        swap = await getSwap(partialArgs.paymentRef!) as Swap
      else throw error
    }

    const decoded = await parseBitcoinLightningInvoice(partialArgs.recipient)
    logger.log({ swap, decoded })

    // Verify swap hash
    if (swap.hash !== decoded.payment_hash)
      return { error: i18n.t('Invalid swap hash'), data: undefined }

    // Construct swap NIM HTLC data
    const nimContract = swap.contracts[SwapAsset.NIM]
    if (!nimContract)
      return { error: i18n.t('No NIM HTLC found in swap'), data: undefined }

    const nimHtlc = nimContract.htlc as NimHtlcDetails

    logger.log({ nimHtlc })
    logger.log('Writing Swap data')
    const data = new Nimiq.SerialBuffer(
      /* sender */ 20
      /* recipient */ + 20
      /* hashAlgorithm */ + 1
      /* hashRoot */ + 32
      /* hashCount */ + 1
      /* timeout */ + 8,
    )
    data.write(localWallet.serialize())
    data.write(Nimiq.Address.fromUserFriendlyAddress(nimContract.redeemAddress).serialize())
    data.writeUint8(/* SHA256 */ 3)
    data.write(Nimiq.BufferUtils.fromHex(swap.hash))
    data.writeUint8(1)
    data.writeUint64(nimHtlc.timeoutTime)

    // Verify data gainst data given in swap
    logger.log('Verifying Swap data')
    if (Nimiq.BufferUtils.toHex(data) !== nimHtlc.data)
      return { error: i18n.t('Invalid NIM HTLC data in swap'), data: undefined }

    // Setup HTLC creation transaction
    const tx = new Nimiq.Transaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ Nimiq.Address.NULL,
      /* recipientType */ Nimiq.AccountType.HTLC,
      /* recipientData */ data,
      /* value */ BigInt(partialArgs.amount), // Must be the exact amount
      /* fee */ BigInt(partialArgs.fee ?? 0),
      /* flags */ 1,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )

    // Get it signed by cosigner
    tx.proof = createResolveProof({ mode: 'early', tx })
    logger.log('New resolve proof', { proof: Nimiq.BufferUtils.toHex(tx.proof), proofLength: tx.proof.length })
    const res = await getSignedTxByRemote(tx)
    if (res.error)
      return res
    return { data: { signedTx: res.data!.newTx, txSent: res.data!.txSent, swap }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.HTLC) {
    let proof: SerialBuffer

    try {
      switch (partialArgs.htlcData.type) {
        case 'new-htlc': {
          const data = new Nimiq.SerialBuffer(
            /* sender */ 20
            /* recipient */ + 20
            /* hashAlgorithm */ + 1
            /* hashRoot */ + 32
            /* hashCount */ + 1
            /* timeout */ + 8,
          )
          data.write(partialArgs.htlcData.sender.serialize())
          data.write(partialArgs.htlcData.recipient.serialize())
          data.writeUint8(partialArgs.htlcData.hashAlgorithm)
          data.write(partialArgs.htlcData.hashRoot)
          data.writeUint8(partialArgs.htlcData.hashCount)
          data.writeUint64(partialArgs.htlcData.timeout)

          let tx = new Nimiq.Transaction(
            /* sender */ useRemoteSigner().remoteAddress!,
            /* senderType */ Nimiq.AccountType.HTLC,
            /* senderData */ new Uint8Array(0),
            /* recipient */ Nimiq.Address.NULL,
            /* recipientType */ Nimiq.AccountType.HTLC,
            /* recipientData */ data,
            /* value */ BigInt(partialArgs.amount),
            /* fee */ 0n,
            /* flags */ 1, // Contract creation
            /* validityStartHeight */ getValidityStartHeight(),
            /* networkId */ networkId.value,
          )
          const contractAddress = Nimiq.Address.fromString(tx.hash().substring(0, 40))
          tx = new Nimiq.Transaction(
            tx.sender,
            tx.senderType,
            tx.senderData,
            contractAddress,
            tx.recipientType,
            tx.data,
            tx.value,
            tx.fee,
            tx.flags,
            tx.validityStartHeight,
            tx.networkId,
          )

          // Now we create the HTLC early resolve proof
          tx.proof = createResolveProof({ mode: 'early', tx })
          // Finally, we get the cosigner to sign the transaction
          const res = await getSignedTxByRemote(tx)
          if (res.error)
            return res
          return { data: { signedTx: res.data!.newTx, txSent: res.data!.txSent }, error: undefined }
        }
        case 'redeem-regular':
          proof = new Nimiq.SerialBuffer(
            /* type */ 1
            /* hash count */ + 1
            /* hash algorithm */ + 1
            /* hash root */ + partialArgs.htlcData.hashRoot.length
            /* pre image length */ + 1
            /* pre image */ + partialArgs.htlcData.preImage.length
            /* signature proof */ + Nimiq.SignatureProof.SINGLE_SIG_SIZE,
          )
          proof.writeUint8(0) // regular transfer
          proof.writeUint8(partialArgs.htlcData.hashCount)
          proof.writeUint8(partialArgs.htlcData.hashAlgorithm)
          proof.write(partialArgs.htlcData.hashRoot)
          proof.writeUint8(partialArgs.htlcData.preImage.length)
          proof.write(partialArgs.htlcData.preImage)
          break
        case 'redeem-timeout':
          proof = new Nimiq.SerialBuffer(
            /* type */ 1
            /* signature proof */ + Nimiq.SignatureProof.SINGLE_SIG_SIZE,
          )
          proof.writeUint8(2) // timeout resolve
          break
        case 'sign-early':
          throw new Error('sign-early HTLC data type should not go through `getSignedTx`')
        case 'redeem-early':
          proof = new Nimiq.SerialBuffer(
            /* type */ 1
            /* signature proof recipient */ + partialArgs.htlcData.recipientSignatureProof.serialize().length
            /* signature proof sender */ + partialArgs.htlcData.senderSignatureProof.serialize().length,
          )
          proof.writeUint8(1) // early resolve
          proof.write(partialArgs.htlcData.recipientSignatureProof.serialize())
          proof.write(partialArgs.htlcData.senderSignatureProof.serialize())
          break
      }

      const tx = new Nimiq.Transaction(
        /* sender */ Nimiq.Address.fromString(partialArgs.sender),
        /* senderType */ Nimiq.AccountType.HTLC,
        /* senderData */ new Uint8Array(0),
        /* recipient */ Nimiq.Address.fromString(partialArgs.recipient),
        /* recipientType */ Nimiq.AccountType.Basic,
        /* recipientData */ new Uint8Array(0),
        /* value */ BigInt(partialArgs.amount),
        /* fee */ 0n,
        /* flags */ 0,
        /* validityStartHeight */ getValidityStartHeight(),
        /* networkId */ networkId.value,
      )

      if (partialArgs.htlcData.type !== 'redeem-early') {
        // Create the signature and set it on the proof
        const { privateKey, publicKey } = useLocalWallet().localWallet
        const sig = Nimiq.Signature.create(privateKey, publicKey, tx.serializeContent())
        const sigProof = Nimiq.SignatureProof.singleSig(publicKey, sig)
        proof.write(sigProof.serialize())
      }
      tx.proof = proof

      return { data: { signedTx: tx }, error: undefined }
    }
    catch (e) {
      logger.error('Error creating HTLC transaction', e)
      return { data: undefined, error: e instanceof Error ? e.message : String(e) }
    }
  }
  else if (partialArgs.transfer === Transfer.Staking) {
    let data: Uint8Array
    let value = BigInt(0)

    try {
      switch (partialArgs.stakingData.type) {
        case 'create-staker':
          data = Nimiq.StakingDataBuilder.createStaker(
            /* delegation */ Nimiq.Address.fromString(partialArgs.stakingData.delegation),
          )
          value = BigInt(partialArgs.amount)
          break
        case 'add-stake':
          data = Nimiq.StakingDataBuilder.addStake(
            /* stakerAddress */ useLocalWallet().localAddress,
          )
          value = BigInt(partialArgs.amount)
          break
        case 'update-staker':
          data = Nimiq.StakingDataBuilder.updateStaker(
            /* newDelegation */ Nimiq.Address.fromString(partialArgs.stakingData.newDelegation),
            /* reactivateAllStake */ partialArgs.stakingData.reactivateAllStake,
          )
          break
        case 'set-active-stake':
          data = Nimiq.StakingDataBuilder.setActiveStake(
            /* newActiveBalance */ BigInt(partialArgs.stakingData.newActiveBalance),
          )
          break
        case 'retire-stake':
          data = Nimiq.StakingDataBuilder.retireStake(
            /* retireStake */ BigInt(partialArgs.stakingData.retireStake),
          )
          break
        case 'remove-stake': {
          // For stake removal, the local wallet must sign the transaction, the remote wallet is not involved.
          const tx = Nimiq.TransactionBuilder.newRemoveStake(
            /* recipient */ useLocalWallet().localAddress,
            /* value */ BigInt(partialArgs.amount),
            /* fee */ 0n,
            /* validityStartHeight */ getValidityStartHeight(),
            /* networkId */ networkId.value,
          )
          tx.sign(useLocalWallet().localWallet, undefined)
          return { data: { signedTx: tx }, error: undefined }
        }
      }
    }
    catch (e) {
      logger.error('Error creating staking transaction', e)
      return { data: undefined, error: e instanceof Error ? e.message : String(e) }
    }

    const tx = new Nimiq.Transaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ Nimiq.Address.fromString(Nimiq.Policy.STAKING_CONTRACT_ADDRESS),
      /* recipientType */ Nimiq.AccountType.Staking,
      /* recipientData */ data,
      /* value */ value,
      /* fee */ 0n,
      // If value > 0, it's a create or add stake transaction, otherwise it's a signaling transaction.
      /* flags */ value > 0n ? 0b00 : 0b10,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )

    // Next, we create the inner signature and set it on the recipient data field.
    // Add-stake transactions do not have an inner signature.
    if (partialArgs.stakingData.type !== 'add-stake') {
      const { privateKey, publicKey } = useLocalWallet().localWallet
      const innerSig = Nimiq.Signature.create(privateKey, publicKey, tx.serializeContent())
      const innerSigProof = Nimiq.SignatureProof.singleSig(publicKey, innerSig)
      tx.data = Nimiq.StakingDataBuilder.setProof(tx.data, innerSigProof)
    }

    // Now we create the HTLC early resolve proof
    tx.proof = createResolveProof({ mode: 'early', tx })
    // Finally, we get the cosigner to sign the transaction
    const res = await getSignedTxByRemote(tx)
    if (res.error)
      return res
    return { data: { signedTx: res.data!.newTx, txSent: res.data!.txSent }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.LocalToRemote) {
    let tx = new Nimiq.Transaction(
      /* sender */ useLocalWallet().localAddress,
      /* senderType */ Nimiq.AccountType.Basic,
      /* senderData */ new Uint8Array(0),
      /* recipient */ Nimiq.Address.NULL,
      /* recipientType */ Nimiq.AccountType.HTLC,
      /* data */ createDepositData(),
      /* value */ BigInt(useLocalWallet().localBalance),
      /* fee */ 0n,
      /* flags */ 1,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )
    const contractAddress = Nimiq.Address.fromString(tx.hash().substring(0, 40))
    tx = new Nimiq.Transaction(
      tx.sender,
      tx.senderType,
      tx.senderData,
      contractAddress,
      tx.recipientType,
      tx.data,
      tx.value,
      tx.fee,
      tx.flags,
      tx.validityStartHeight,
      tx.networkId,
    )
    tx.sign(useLocalWallet().localWallet, undefined)
    return { data: { signedTx: tx }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocal) {
    if (!useRemoteSigner().isHtlcActive)
      return { error: i18n.t('No account has been created yet, or it is currently processing funds'), data: undefined }
    const sender = useRemoteSigner().remoteAddress
    if (!sender)
      return { error: i18n.t('Something went wrong syncing your account'), data: undefined }

    const tx = new Nimiq.Transaction(
      /* sender */ sender,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.AccountType.Basic,
      /* recipientData */ new Uint8Array(0),
      /* value */ BigInt(useRemoteSigner().remoteBalance),
      /* fee */ 0n,
      /* flags */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx)
    if (res.error)
      return res
    return { data: { signedTx: res.data!.newTx, txSent: res.data!.txSent }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalImmediateReclaim) {
    const tx = new Nimiq.Transaction(
      /* sender */ partialArgs.sender,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.AccountType.Basic,
      /* recipientData */ new Uint8Array(0),
      /* value */ BigInt(partialArgs.amount),
      /* fee */ 0n,
      /* flags */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx, { address: partialArgs.sender })
    if (res.error)
      return res
    return { data: { signedTx: res.data!.newTx, txSent: res.data!.txSent }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalAfterTimeout) {
    const tx = new Nimiq.Transaction(
      /* sender */ partialArgs.sender,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.AccountType.Basic,
      /* recipientData */ new Uint8Array(0),
      /* value */ BigInt(partialArgs.amount),
      /* fee */ 0n,
      /* flags */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'timeout', tx })
    return { data: { signedTx: tx }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.ExtendRemote) {
    let tx = new Nimiq.Transaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ Nimiq.Address.NULL,
      /* recipientType */ Nimiq.AccountType.HTLC,
      /* recipientData */ createDepositData(),
      /* value */ BigInt(useRemoteSigner().remoteBalance),
      /* fee */ 0n,
      /* flags */ 1,
      /* validityStartHeight */ getValidityStartHeight(),
      /* networkId */ networkId.value,
    )
    const contractAddress = Nimiq.Address.fromString(tx.hash().substring(0, 40))
    tx = new Nimiq.Transaction(
      tx.sender,
      tx.senderType,
      tx.senderData,
      contractAddress,
      tx.recipientType,
      tx.data,
      tx.value,
      tx.fee,
      tx.flags,
      tx.validityStartHeight,
      tx.networkId,
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx, { address: useRemoteSigner().remoteAddress! })
    if (res.error)
      return res
    return { data: { signedTx: res.data!.newTx, txSent: res.data!.txSent }, error: undefined }
  }
  else {
    return { data: undefined, error: i18n.t('Invalid transfer type') }
  }
}

interface GetSignedTxByRemoteArgs {
  // The address of the HTLC contract
  address?: Address
}

export async function getSignedTxByRemote(tx: Transaction, { address = useRemoteSigner().remoteAddress! }: GetSignedTxByRemoteArgs = {}) {
  logger.log('Signing transaction by remote')
  if (!useRemoteSigner().remoteAddress) {
    logger.error('Cannot sign transaction by remote: missing remote address', {
      requestedAddress: address?.toUserFriendlyAddress(),
      tx: tx.toPlain(),
    })
    return { data: undefined, error: i18n.t('Something went wrong syncing your account') }
  }
  if (tx.networkId !== networkId.value) {
    logger.error('Network ID mismatch', { tx, networkId: tx.networkId, expectedNetworkId: networkId.value })
    return { data: undefined, error: i18n.t('Network ID mismatch') }
  }
  logger.log('Requesting Cosigner signature', { tx: tx.toPlain(), address: address.toUserFriendlyAddress() })
  const { data: receipt, error, hasError, status } = await useRemoteSignerApi().sendTransaction({ address: address.toUserFriendlyAddress().replaceAll(' ', ''), tx })
  logger.log({ receipt, error })
  if (hasError) {
    const plainTx = tx.toPlain()
    logger.error('Cosigner failed to sign transaction', {
      status,
      error,
      address: address.toUserFriendlyAddress(),
      hash: tx.hash(),
      sender: plainTx.sender,
      senderType: plainTx.senderType,
      recipient: plainTx.recipient,
      recipientType: plainTx.recipientType,
      value: plainTx.value,
      fee: plainTx.fee,
      validityStartHeight: plainTx.validityStartHeight,
      networkId: tx.networkId,
      expectedNetworkId: networkId.value,
    })
    return { data: undefined, error: error?.message || i18n.t('Something went wrong signing the transaction') }
  }

  const newTx = new Nimiq.Transaction(
    Nimiq.Address.fromString(receipt.details.sender),
    typeof receipt.details.senderType === 'number' ? receipt.details.senderType : toAccountType(receipt.details.senderType),
    new Uint8Array(0),
    Nimiq.Address.fromString(receipt.details.recipient),
    typeof receipt.details.recipientType === 'number' ? receipt.details.recipientType : toAccountType(receipt.details.recipientType),
    Nimiq.BufferUtils.fromHex(typeof receipt.details.data === 'string' ? receipt.details.data : receipt.details.data.raw),
    BigInt(receipt.details.value),
    BigInt(receipt.details.fee),
    receipt.details.flags,
    receipt.details.validityStartHeight,
    networkId.value,
  )
  newTx.proof = Nimiq.BufferUtils.fromHex(typeof receipt.details.proof === 'string' ? receipt.details.proof : receipt.details.proof.raw)
  return {
    data: { newTx, txSent: receipt.txSent },
    error: undefined,
  }
}

function createDepositData() {
  const remotePublicKey = useRemoteSigner().remotePublicKey
  if (!remotePublicKey)
    throw new Error('Remote public key is undefined') // no translation as not user-facing
  const data = new Nimiq.SerialBuffer(
    /* sender */ 20
    /* recipient */ + 20
    /* hashAlgorithm */ + 1
    /* hashRoot */ + 32
    /* hashCount */ + 1
    /* timeout */ + 8,
  )
  data.write(useLocalWallet().localAddress.serialize())
  data.write(Nimiq.PublicKey.fromHex(remotePublicKey).toAddress().serialize())
  data.writeUint8(1 /* BLAKE2B */)
  data.write(new Uint8Array(32)) // Hash root - the zero hash, because this HTLC will only ever be redeemed "early" or after timeout
  data.writeUint8(1) // Hash count
  data.writeUint64(Date.now() + 14 * 24 * 60 * 60 * 1000) // Current time + 14 days
  return data
}

interface CreateResolveProofArgs {
  mode: 'timeout' | 'early'
  tx: Transaction
}

export function createResolveProof({ tx, mode }: CreateResolveProofArgs) {
  logger.log('Creating resolve proof', { mode, tx: tx.toPlain(), remoteProofSize: useRemoteSigner().remoteProofSize })
  const { privateKey, publicKey } = useLocalWallet().localWallet
  const sig = Nimiq.Signature.create(privateKey, publicKey, tx.serializeContent())
  const sigProof = Nimiq.SignatureProof.singleSig(publicKey, sig).serialize()
  const isEarly = mode === 'early'
  const proofLen = 1 + sigProof.length + (isEarly ? useRemoteSigner().remoteProofSize : 0)
  // TODO: check if sigProofLength is different from remoteProofSize
  logger.log({ proofLen, isEarly, sigProofLength: sigProof.length })
  const proof = new Nimiq.SerialBuffer(proofLen)
  proof.writeUint8(isEarly ? /* EARLY_RESOLVE */ 1 : /* TIMEOUT_RESOLVE */ 2)
  proof.writePos += isEarly ? useRemoteSigner().remoteProofSize : 0
  proof.write(sigProof)
  return proof
}

/**
 * Since the validity start height of the transaction must be greater than the validity start height of the remote wallet,
 * we need the remote height plus one, just in case.
 * @returns The height at which the validity of the transaction starts
 */
function getValidityStartHeight() {
  return Math.max(useRemoteSigner().remoteHeight, height.value) + 1
}

export async function buildTopUpReceipt(tx: PlainTransactionDetails): Promise<UserReceiptTransaction> {
  const isCashlink = tx.data.raw.toLowerCase() === CashlinkExtraDataHex.CLAIMING
  const cashlinkFundingTx = isCashlink
    ? (await nimiqNetwork.getAccountTransactions(tx.sender as unknown as Address)).data.find(candidate =>
        candidate.recipient === tx.sender
        && candidate.data.raw.toLowerCase() === CashlinkExtraDataHex.FUNDING
        && candidate.state !== 'invalidated'
        && candidate.state !== 'expired'
        && candidate.value >= tx.value + tx.fee
        && (candidate.blockHeight === undefined || tx.blockHeight === undefined || candidate.blockHeight <= tx.blockHeight),
      )
    : undefined
  return {
    transfer: Transfer.UserReceipt,
    amount: tx.value,
    sender: cashlinkFundingTx?.sender || tx.sender,
    senderType: toAccountType(cashlinkFundingTx?.senderType || tx.senderType),
    recipient: tx.recipient,
    recipientType: toAccountType(tx.recipientType),
    hash: tx.transactionHash,
    status: tx.state,
    timestamp: tx.timestamp,
    title: isCashlink ? 'Cashlink Claiming' : 'Top-Up',
    message: isCashlink ? '' : Nimiq.BufferUtils.toUtf8(Nimiq.BufferUtils.fromHex(tx.data.raw)),
    fee: tx.fee,
    // TODO: Proof size should be read from tx proof once all Nimiq client variants expose it consistently.
    proofSize: useRemoteSigner().remoteProofSize,
  }
}

export function toAccountType(type: 'basic' | 'vesting' | 'htlc' | 'staking'): AccountType {
  switch (type) {
    case 'basic': return Nimiq.AccountType.Basic
    case 'vesting': return Nimiq.AccountType.Vesting
    case 'htlc': return Nimiq.AccountType.HTLC
    case 'staking': return Nimiq.AccountType.Staking
  }
}
