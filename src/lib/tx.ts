import type { AccountType, Address, Transaction } from '@nimiq/core'
import type { NimHtlcDetails, PreSwap, Swap } from '@nimiq/fastspot-api-v1'
import type { AsyncResult } from '@/types'
import type { PartialSendTxArgs } from '@/types/transactions'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { storeToRefs } from 'pinia'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/transactions'
import { parseBitcoinLightningInvoice } from '../composables/useBitcoinLightning'
import { useFastspotApiV1 } from '../composables/useFastspotv1'

const logger = useLogger('tx.ts')
const { networkId, height } = storeToRefs(useNimiqNetwork())

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
  logger.log(partialArgs.transfer)
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
      /* recipient */ Nimiq.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'),
      /* recipientType */ Nimiq.AccountType.HTLC,
      /* recipientData */ data,
      /* value */ BigInt(partialArgs.amount), // Must be the exact amount
      /* fee */ 0n,
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
  else if (partialArgs.transfer === Transfer.Staking) {
    let tx: Transaction;
    switch (partialArgs.stakingData.type) {
      case 'create-staker':
        tx = Nimiq.TransactionBuilder.newCreateStaker(
          /* sender */ useRemoteSigner().remoteAddress!,
          /* delegation */ Nimiq.Address.fromString(partialArgs.stakingData.delegation),
          /* value */ BigInt(partialArgs.amount),
          /* fee */ 0n,
          /* validityStartHeight */ getValidityStartHeight(),
          /* networkId */ networkId.value,
        )
        break;
      case 'add-stake':
        tx = Nimiq.TransactionBuilder.newAddStake(
          /* sender */ useRemoteSigner().remoteAddress!,
          /* staker_address */ useLocalWallet().localAddress,
          /* value */ BigInt(partialArgs.amount),
          /* fee */ 0n,
          /* validityStartHeight */ getValidityStartHeight(),
          /* networkId */ networkId.value,
        )
        break;
      case 'update-staker':
        tx = Nimiq.TransactionBuilder.newUpdateStaker(
          // This is a signaling transaction (which does not transfer funds) and could also be sent by the local wallet.
          /* sender */ useRemoteSigner().remoteAddress!,
          /* newDelegation */ Nimiq.Address.fromString(partialArgs.stakingData.newDelegation),
          /* reactivate_all_stake */ partialArgs.stakingData.reactivateAllStake,
          /* fee */ 0n,
          /* validityStartHeight */ getValidityStartHeight(),
          /* networkId */ networkId.value,
        )
        break;
      case 'set-active-stake':
        tx = Nimiq.TransactionBuilder.newSetActiveStake(
          // This is a signaling transaction (which does not transfer funds) and could also be sent by the local wallet.
          /* sender */ useRemoteSigner().remoteAddress!,
          /* new_active_balance */ BigInt(partialArgs.stakingData.newActiveBalance),
          /* fee */ 0n,
          /* validityStartHeight */ getValidityStartHeight(),
          /* networkId */ networkId.value,
        )
        break;
      case 'retire-stake':
        tx = Nimiq.TransactionBuilder.newRetireStake(
          // This is a signaling transaction (which does not transfer funds) and could also be sent by the local wallet.
          /* sender */ useRemoteSigner().remoteAddress!,
          /* retire_stake */ BigInt(partialArgs.stakingData.retireStake),
          /* fee */ 0n,
          /* validityStartHeight */ getValidityStartHeight(),
          /* networkId */ networkId.value,
        )
        break;
      case 'remove-stake':
        tx = Nimiq.TransactionBuilder.newRemoveStake(
          /* recipient */ useLocalWallet().localAddress,
          /* value */ BigInt(partialArgs.amount),
          /* fee */ 0n,
          /* validityStartHeight */ getValidityStartHeight(),
          /* networkId */ networkId.value,
        )
        // For stake removal, the local wallet must sign the transaction
        tx.sign(useLocalWallet().localWallet)
        return { data: { signedTx: tx }, error: undefined };
    }

    // Before signing, we have to change the sender type to HTLC (the TransactionBuilder methods set it to Basic).
    // For this we convert to plain, change it, and convert back, because there is no setter for the sender type.
    let plain = tx.toPlain()
    plain.senderType = 'htlc'
    tx = Nimiq.Transaction.fromPlain(plain)
    // Then we sign the transaction with our local wallet, so the inner signature gets set
    // (the outer signature/proof gets set too, but will be overwritten by the HTLC-early-resolve proof)
    tx.sign(useLocalWallet().localWallet)
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
      /* recipient */ Nimiq.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'),
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
    tx.sign(useLocalWallet().localWallet)
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
      /* recipient */ Nimiq.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'),
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
  if (!useRemoteSigner().remoteAddress)
    return { data: undefined, error: i18n.t('Something went wrong syncing your account') }
  if (tx.networkId !== networkId.value) {
    logger.error('Network ID mismatch', { tx, networkId: tx.networkId, expectedNetworkId: networkId.value })
    return { data: undefined, error: i18n.t('Network ID mismatch') }
  }
  logger.log('Requesting Cosigner signature', { tx: tx.toPlain(), address: address.toUserFriendlyAddress() })
  const { data: receipt, error, hasError } = await useRemoteSignerApi().sendTransaction({ address: address.toUserFriendlyAddress().replaceAll(' ', ''), tx })
  logger.log({ receipt, error })
  if (hasError)
    return { data: undefined, error: error?.message || i18n.t('Something went wrong signing the transaction') }

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
  const data = new Nimiq.SerialBuffer(82)
  data.write(useLocalWallet().localWallet.toAddress().serialize())
  data.write(Nimiq.PublicKey.fromHex(remotePublicKey).toAddress().serialize())
  data.writeUint8(1 /* BLAKE2B */)
  data.write(new Uint8Array(32))
  data.writeUint8(1)
  // Current time + 14 days
  const timestamp = Date.now() + 14 * 24 * 60 * 60 * 1000
  data.writeUint64(timestamp)
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

export function toAccountType(type: 'basic' | 'vesting' | 'htlc' | 'staking'): AccountType {
  switch (type) {
    case 'basic': return Nimiq.AccountType.Basic
    case 'vesting': return Nimiq.AccountType.Vesting
    case 'htlc': return Nimiq.AccountType.HTLC
    case 'staking': return Nimiq.AccountType.Staking
  }
}
