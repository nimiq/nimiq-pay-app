import type { AccountType, Address, PlainTransactionDetails, Transaction } from '@nimiq/core'
import type { NimHtlcDetails, PreSwap, Swap } from '@nimiq/fastspot-api-v1'
import type { PartialSendTxArgs, UserReceiptTransaction } from '@/types/transactions'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { storeToRefs } from 'pinia'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { nimiqPayCosignerPublicKeys } from '@/lib'
import { Asset } from '@/lib/assets'
import { errorReason, startSwapStep } from '@/lib/swap-telemetry'
import { promiseWithTimeout } from '@/lib/utils'
import { useLocalWallet } from '@/stores/local-wallet'
import { CashlinkExtraDataHex, useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { isSentByLocalWallet, Transfer } from '@/types/transactions'
import { parseBitcoinLightningInvoice } from '../composables/useBitcoinLightning'
import { useFastspotApiV1 } from '../composables/useFastspotv1'

const logger = useLogger('tx.ts')
const nimiqNetwork = useNimiqNetwork()
const { networkId, height } = storeToRefs(nimiqNetwork)
const COSIGNER_SEND_TIMEOUT_MS = 30_000

export interface GetSignedTxOptions {
  beforeRemoteBroadcast?: (tx: Transaction, swap?: Swap) => Promise<void>
}

export type SignedTransactionResult
  = | { outcome: 'signed', signedTx: Transaction, swap?: Swap, txSent?: boolean }
    | { outcome: 'rejected', error: string }
    | { outcome: 'unknown', error: string }

export async function getSignedTx(partialArgs: PartialSendTxArgs, options: GetSignedTxOptions = {}): Promise<SignedTransactionResult> {
  logger.log(partialArgs.transfer)
  if ((partialArgs.transfer === Transfer.UserPayment || partialArgs.transfer === Transfer.UserPaymentToMerchant)) {
    if (!useRemoteSigner().remoteAddress)
      return { outcome: 'rejected', error: i18n.t('Something went wrong syncing your account') }
    const tx = new Nimiq.Transaction(
      useRemoteSigner().remoteAddress!,
      Nimiq.AccountType.HTLC,
      new Uint8Array(0),
      Nimiq.Address.fromString(partialArgs.recipient),
      Nimiq.AccountType.Basic,
      Nimiq.BufferUtils.fromUtf8(partialArgs.message || ''),
      BigInt(Math.ceil(partialArgs.amount)),
      BigInt(partialArgs.fee ?? 0),
      0,
      getValidityStartHeight(),
      networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return getSignedTxByRemote(tx, {}, options)
  }
  else if (partialArgs.transfer === Transfer.UserPaymentToAtomicSwap) {
    if (!useRemoteSigner().remoteAddress)
      return { outcome: 'rejected', error: i18n.t('Something went wrong syncing your account') }

    const swapContext = { asset: Asset.NIM, swap_id: partialArgs.paymentRef! }
    const localWallet = useLocalWallet().localAddress
    const { confirmSwap, getSwap } = await useFastspotApiV1()
    const confirm = startSwapStep('confirm', swapContext)
    let alreadyConfirmed = false
    let swap: Swap
    try {
      swap = await confirmSwap(
        { id: swapContext.swap_id } as PreSwap,
        { asset: SwapAsset.BTC_LN },
        { asset: SwapAsset.NIM, address: localWallet.toUserFriendlyAddress() },
        localWallet.toHex(),
      ).catch(async (error) => {
        if (!(error instanceof Error && error.message === 'The swap was already confirmed before.'))
          throw error
        alreadyConfirmed = true
        return await getSwap(swapContext.swap_id) as Swap
      })
    }
    catch (error) {
      confirm.fail(error)
      throw error
    }
    confirm.end(true, { already_confirmed: alreadyConfirmed, swap_status: swap.status })

    const decoded = await parseBitcoinLightningInvoice(partialArgs.recipient)
    logger.log({ swap, decoded })

    const nimContract = swap.contracts[SwapAsset.NIM]
    const nimHtlc = nimContract?.htlc as NimHtlcDetails | undefined
    const timestampSection = decoded.sections?.find(section => section.name === 'timestamp') as TimestampSection | undefined
    const expirySection = decoded.sections?.find(section => section.name === 'expiry') as ExpirySection | undefined
    const verify = startSwapStep('verify', swapContext, {
      // Fastspot pays the invoice only before it expires; the HTLC timeout is when an unpaid swap refunds.
      invoice_expires_in_s: timestampSection ? Math.round(timestampSection.value + (expirySection?.value ?? 3600) - Date.now() / 1e3) : undefined,
      htlc_timeout_in_s: nimHtlc ? Math.round((nimHtlc.timeoutTime - Date.now()) / 1e3) : undefined,
    })

    if (swap.hash !== decoded.payment_hash) {
      verify.fail('hash_mismatch')
      return { outcome: 'rejected', error: i18n.t('Invalid swap hash') }
    }

    if (!nimContract || !nimHtlc) {
      verify.fail('missing_nim_contract')
      return { outcome: 'rejected', error: i18n.t('No NIM HTLC found in swap') }
    }

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

    logger.log('Verifying Swap data')
    if (Nimiq.BufferUtils.toHex(data) !== nimHtlc.data) {
      verify.fail('htlc_data_mismatch')
      return { outcome: 'rejected', error: i18n.t('Invalid NIM HTLC data in swap') }
    }
    verify.end(true)

    const tx = new Nimiq.Transaction(
      useRemoteSigner().remoteAddress!,
      Nimiq.AccountType.HTLC,
      new Uint8Array(0),
      Nimiq.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'),
      Nimiq.AccountType.HTLC,
      data,
      BigInt(partialArgs.amount), // Must be the exact amount
      BigInt(partialArgs.fee ?? 0),
      1,
      getValidityStartHeight(),
      networkId.value,
    )

    tx.proof = createResolveProof({ mode: 'early', tx })
    logger.log('New resolve proof', { proof: Nimiq.BufferUtils.toHex(tx.proof), proofLength: tx.proof.length })
    return getSignedTxByRemote(tx, { swap }, options)
  }
  else if (partialArgs.transfer === Transfer.Staking) {
    let data: Uint8Array
    let value = BigInt(0)

    try {
      switch (partialArgs.stakingData.type) {
        case 'create-staker':
          data = Nimiq.StakingDataBuilder.createStaker(
            Nimiq.Address.fromString(partialArgs.stakingData.delegation),
          )
          value = BigInt(partialArgs.amount)
          break
        case 'add-stake':
          data = Nimiq.StakingDataBuilder.addStake(
            useLocalWallet().localAddress,
          )
          value = BigInt(partialArgs.amount)
          break
        case 'update-staker':
          data = Nimiq.StakingDataBuilder.updateStaker(
            Nimiq.Address.fromString(partialArgs.stakingData.newDelegation),
            partialArgs.stakingData.reactivateAllStake,
          )
          break
        case 'set-active-stake':
          data = Nimiq.StakingDataBuilder.setActiveStake(
            BigInt(partialArgs.stakingData.newActiveBalance),
          )
          break
        case 'retire-stake':
          data = Nimiq.StakingDataBuilder.retireStake(
            BigInt(partialArgs.stakingData.retireStake),
          )
          break
        case 'remove-stake': {
          const tx = Nimiq.TransactionBuilder.newRemoveStake(
            useLocalWallet().localAddress,
            BigInt(partialArgs.amount),
            BigInt(partialArgs.fee ?? 0),
            getValidityStartHeight(),
            networkId.value,
          )
          tx.sign(useLocalWallet().localWallet, undefined)
          return { outcome: 'signed', signedTx: tx }
        }
      }
    }
    catch (e) {
      logger.error('Error creating staking transaction', e)
      return { outcome: 'rejected', error: e instanceof Error ? e.message : String(e) }
    }

    const localWallet = useLocalWallet()
    const sentByLocal = isSentByLocalWallet(partialArgs.stakingData, partialArgs.fee ?? 0, localWallet.localBalance)
    // wasm-bindgen throws an opaque "expected instance of Address" for an undefined sender
    if (!sentByLocal && !useRemoteSigner().remoteAddress)
      return { outcome: 'rejected', error: i18n.t('Something went wrong syncing your account') }

    const tx = new Nimiq.Transaction(
      sentByLocal ? localWallet.localAddress : useRemoteSigner().remoteAddress!,
      sentByLocal ? Nimiq.AccountType.Basic : Nimiq.AccountType.HTLC,
      new Uint8Array(0),
      Nimiq.Address.fromString(Nimiq.Policy.STAKING_CONTRACT_ADDRESS),
      Nimiq.AccountType.Staking,
      data,
      value,
      BigInt(partialArgs.fee ?? 0),
      // If value > 0, it's a create or add stake transaction, otherwise it's a signaling transaction.
      value > 0n ? 0b00 : 0b10,
      getValidityStartHeight(),
      networkId.value,
    )

    if (sentByLocal) {
      // sign() also sets the staker's inner proof; setting it by hand first would make the transaction invalid
      tx.sign(localWallet.localWallet, undefined)
      return { outcome: 'signed', signedTx: tx }
    }

    // Add-stake transactions do not have an inner signature.
    if (partialArgs.stakingData.type !== 'add-stake') {
      const { privateKey, publicKey } = localWallet.localWallet
      const innerSig = Nimiq.Signature.create(privateKey, publicKey, tx.serializeContent())
      const innerSigProof = Nimiq.SignatureProof.singleSig(publicKey, innerSig)
      tx.data = Nimiq.StakingDataBuilder.setProof(tx.data, innerSigProof)
    }

    tx.proof = createResolveProof({ mode: 'early', tx })
    return getSignedTxByRemote(tx, {}, options)
  }
  else if (partialArgs.transfer === Transfer.LocalToRemote) {
    let tx = new Nimiq.Transaction(
      useLocalWallet().localAddress,
      Nimiq.AccountType.Basic,
      new Uint8Array(0),
      Nimiq.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'),
      Nimiq.AccountType.HTLC,
      createDepositData(),
      BigInt(useLocalWallet().localBalance),
      0n,
      1,
      getValidityStartHeight(),
      networkId.value,
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
    return { outcome: 'signed', signedTx: tx }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocal) {
    if (!useRemoteSigner().isHtlcActive)
      return { outcome: 'rejected', error: i18n.t('No account has been created yet, or it is currently processing funds') }
    const sender = useRemoteSigner().remoteAddress
    if (!sender)
      return { outcome: 'rejected', error: i18n.t('Something went wrong syncing your account') }

    const tx = new Nimiq.Transaction(
      sender,
      Nimiq.AccountType.HTLC,
      new Uint8Array(0),
      useLocalWallet().localAddress,
      Nimiq.AccountType.Basic,
      new Uint8Array(0),
      BigInt(useRemoteSigner().remoteBalance),
      0n,
      0,
      getValidityStartHeight(),
      networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return getSignedTxByRemote(tx, {}, options)
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalImmediateReclaim) {
    const tx = new Nimiq.Transaction(
      partialArgs.sender,
      Nimiq.AccountType.HTLC,
      new Uint8Array(0),
      useLocalWallet().localAddress,
      Nimiq.AccountType.Basic,
      new Uint8Array(0),
      BigInt(partialArgs.amount),
      0n,
      0,
      getValidityStartHeight(),
      networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'early', tx, cosignerProofSize: partialArgs.proofSize })
    return getSignedTxByRemote(tx, { address: partialArgs.sender }, options)
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalAfterTimeout) {
    const tx = new Nimiq.Transaction(
      partialArgs.sender,
      Nimiq.AccountType.HTLC,
      new Uint8Array(0),
      useLocalWallet().localAddress,
      Nimiq.AccountType.Basic,
      new Uint8Array(0),
      BigInt(partialArgs.amount),
      0n,
      0,
      getValidityStartHeight(),
      networkId.value,
    )
    tx.proof = createResolveProof({ mode: 'timeout', tx })
    return { outcome: 'signed', signedTx: tx }
  }
  else if (partialArgs.transfer === Transfer.ExtendRemote) {
    let tx = new Nimiq.Transaction(
      useRemoteSigner().remoteAddress!,
      Nimiq.AccountType.HTLC,
      new Uint8Array(0),
      Nimiq.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'),
      Nimiq.AccountType.HTLC,
      createDepositData(),
      BigInt(useRemoteSigner().remoteBalance),
      0n,
      1,
      getValidityStartHeight(),
      networkId.value,
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
    return getSignedTxByRemote(tx, { address: useRemoteSigner().remoteAddress! }, options)
  }
  else {
    return { outcome: 'rejected', error: i18n.t('Invalid transfer type') }
  }
}

interface GetSignedTxByRemoteArgs {
  address?: Address
  swap?: Swap
}

export async function getSignedTxByRemote(
  tx: Transaction,
  { address = useRemoteSigner().remoteAddress, swap }: GetSignedTxByRemoteArgs = {},
  options: GetSignedTxOptions = {},
): Promise<SignedTransactionResult> {
  logger.log('Signing transaction by remote')
  if (!address) {
    logger.error('Cannot sign transaction by remote: missing remote address', {
      tx: tx.toPlain(),
    })
    return { outcome: 'rejected', error: i18n.t('Something went wrong syncing your account') }
  }
  if (tx.networkId !== networkId.value) {
    logger.error('Network ID mismatch', { tx, networkId: tx.networkId, expectedNetworkId: networkId.value })
    return { outcome: 'rejected', error: i18n.t('Network ID mismatch') }
  }

  try {
    await options.beforeRemoteBroadcast?.(tx, swap)
  }
  catch (error) {
    return { outcome: 'rejected', error: error instanceof Error ? error.message : String(error) }
  }

  logger.log('Requesting Cosigner signature', { tx: tx.toPlain(), address: address.toUserFriendlyAddress() })
  const cosign = swap && startSwapStep('cosign', { asset: Asset.NIM, swap_id: swap.id }, {
    head_height: height.value,
    remote_height: useRemoteSigner().remoteHeight,
  })
  try {
    const response = await promiseWithTimeout(
      useRemoteSignerApi().sendTransaction({ address: address.toUserFriendlyAddress().replaceAll(' ', ''), tx }),
      COSIGNER_SEND_TIMEOUT_MS,
    )
    logger.log({ receipt: response.data, error: response.error })
    if (response.hasError) {
      cosign?.fail(response.error?.message || 'unknown', { status: response.status, replayed: !!response.replayed })
      const plainTx = tx.toPlain()
      logger.error('Cosigner failed to sign transaction', {
        status: response.status,
        error: response.error,
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
      return {
        // A replay rejection cannot rule out a broadcast by the original request.
        outcome: response.replayed || response.status >= 500 ? 'unknown' : 'rejected',
        error: response.error?.message || i18n.t('Something went wrong signing the transaction'),
      }
    }

    const receipt = response.data
    // The cosigner signed and may have broadcast, so a failure building the local copy below is not a failed cosign.
    cosign?.end(true, { tx_sent: receipt.txSent ?? null })
    const signedTx = new Nimiq.Transaction(
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
    signedTx.proof = Nimiq.BufferUtils.fromHex(typeof receipt.details.proof === 'string' ? receipt.details.proof : receipt.details.proof.raw)
    return { outcome: 'signed', signedTx, swap, txSent: receipt.txSent }
  }
  catch (error) {
    cosign?.fail(error)
    return { outcome: 'unknown', error: errorReason(error) }
  }
}

function createDepositData() {
  const remotePublicKey = useRemoteSigner().remotePublicKey
  if (!remotePublicKey)
    throw new Error('Remote public key is undefined')
  const data = new Nimiq.SerialBuffer(82)
  data.write(useLocalWallet().localWallet.toAddress().serialize())
  data.write(Nimiq.PublicKey.fromHex(remotePublicKey).toAddress().serialize())
  data.writeUint8(1 /* BLAKE2B */)
  data.write(new Uint8Array(32))
  data.writeUint8(1)
  const timestamp = Date.now() + 14 * 24 * 60 * 60 * 1000
  data.writeUint64(timestamp)
  return data
}

interface CreateResolveProofArgs {
  mode: 'timeout' | 'early'
  tx: Transaction
  cosignerProofSize?: number
}

export function createResolveProof({ tx, mode, cosignerProofSize }: CreateResolveProofArgs) {
  const effectiveCosignerProofSize = cosignerProofSize ?? useRemoteSigner().remoteProofSize
  logger.log('Creating resolve proof', { mode, tx: tx.toPlain(), remoteProofSize: effectiveCosignerProofSize })
  const { privateKey, publicKey } = useLocalWallet().localWallet
  const sig = Nimiq.Signature.create(privateKey, publicKey, tx.serializeContent())
  const sigProof = Nimiq.SignatureProof.singleSig(publicKey, sig).serialize()
  const isEarly = mode === 'early'
  const proofLen = 1 + sigProof.length + (isEarly ? effectiveCosignerProofSize : 0)
  logger.log({ proofLen, isEarly, sigProofLength: sigProof.length })
  const proof = new Nimiq.SerialBuffer(proofLen)
  proof.writeUint8(isEarly ? /* EARLY_RESOLVE */ 1 : /* TIMEOUT_RESOLVE */ 2)
  proof.writePos += isEarly ? effectiveCosignerProofSize : 0
  proof.write(sigProof)
  return proof
}

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
  const nimiqPayHtlcOwner = tx.senderType === 'htlc'
    && tx.proof.type === 'early-resolve'
    && nimiqPayCosignerPublicKeys.includes(tx.proof.publicKey)
    ? tx.proof.creator
    : undefined
  return {
    transfer: Transfer.UserReceipt,
    amount: tx.value,
    sender: cashlinkFundingTx?.sender || nimiqPayHtlcOwner || tx.sender,
    senderType: toAccountType(cashlinkFundingTx?.senderType || (nimiqPayHtlcOwner ? 'basic' : tx.senderType)),
    recipient: tx.recipient,
    recipientType: toAccountType(tx.recipientType),
    hash: tx.transactionHash,
    status: tx.state,
    timestamp: tx.timestamp,
    title: isCashlink ? 'Cashlink Claiming' : 'Top-Up',
    message: isCashlink ? '' : Nimiq.BufferUtils.toUtf8(Nimiq.BufferUtils.fromHex(tx.data.raw)),
    fee: tx.fee,
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
