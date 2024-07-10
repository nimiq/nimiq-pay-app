import type { ExtendedTransaction } from '@nimiq/core-web'
import type { NimHtlcDetails, PreSwap, Swap } from '@nimiq/fastspot-api-v1'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { useFastspotApiV1 } from '../composables/useFastspotv1'
import { parseBitcoinLightningInvoice } from '../composables/useBitcoinLightning'
import type { AsyncResult } from '@/types'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import { i18n } from '@/i18n/i18n-setup'
import { type PartialSendTxArgs, Transfer } from '@/types/transactions'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('tx.ts')

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
export async function getSignedTx(partialArgs: PartialSendTxArgs): AsyncResult<{ signedTx: ExtendedTransaction; swap?: Swap }, string> {
  if ((partialArgs.transfer === Transfer.UserPayment || partialArgs.transfer === Transfer.UserPaymentToMerchant)) {
    if (!useRemoteSigner().remoteAddress)
      return { error: i18n.t('Something went wrong syncing your account'), data: undefined }
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ Nimiq.Address.fromString(partialArgs.recipient),
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ Math.ceil(partialArgs.amount),
      /* fee */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ Nimiq.BufferUtils.fromAscii(partialArgs.message || ''),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx)
    if (res.error)
      return res
    return { data: { signedTx: res.data! }, error: undefined }
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

    // Verify swap hash
    if (swap.hash !== decoded.payment_hash)
      return { error: i18n.t('Invalid swap hash'), data: undefined }

    // Construct swap NIM HTLC data
    const nimContract = swap.contracts[SwapAsset.NIM]
    if (!nimContract)
      return { error: i18n.t('No NIM HTLC found in swap'), data: undefined }

    const nimHtlc = nimContract.htlc as NimHtlcDetails

    const htlcAccount = new Nimiq.HashedTimeLockedContract(
      nimContract.amount,
      localWallet,
      Nimiq.Address.fromUserFriendlyAddress(nimContract.redeemAddress),
      new Nimiq.Hash(Nimiq.BufferUtils.fromHex(swap.hash), Nimiq.Hash.Algorithm.SHA256),
      1,
      nimHtlc.timeoutBlock,
    )
    const serializedHtlcAccount = htlcAccount.serialize()
    // Cut off account-related data from the serialization:
    // First byte is the account type
    // Then 8 bytes for the account balance
    // At the end, 8 bytes for the HTLC totalAmount
    const data = serializedHtlcAccount.subarray(
      9,
      // `Nimiq.SerialBuffer.prototype.subarray()` does not support negative indices.
      serializedHtlcAccount.byteLength - 8,
    )

    // Verify data gainst data given in swap
    if (Nimiq.BufferUtils.toHex(data) !== nimHtlc.data)
      return { error: i18n.t('Invalid NIM HTLC data in swap'), data: undefined }

    // Setup HTLC creation transaction
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ Nimiq.Address.CONTRACT_CREATION,
      /* recipientType */ Nimiq.Account.Type.HTLC,
      /* value */ partialArgs.amount, // Must be the exact amount
      /* fee */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* flags */ Nimiq.Transaction.Flag.CONTRACT_CREATION,
      /* data */ data,
    )

    // Get it signed by cosigner
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx)
    if (res.error)
      return res
    return { data: { signedTx: res.data!, swap }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.LocalToRemote) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useLocalWallet().localAddress,
      /* senderType */ Nimiq.Account.Type.BASIC,
      /* recipient */ Nimiq.Address.CONTRACT_CREATION,
      /* recipientType */ Nimiq.Account.Type.HTLC,
      /* value */ useLocalWallet().localBalance,
      /* fee */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* flags */ Nimiq.Transaction.Flag.CONTRACT_CREATION,
      /* data */ createDepositData(),
    )
    tx.proof = useLocalWallet().localWallet.signTransaction(tx).serialize()
    return { data: { signedTx: tx }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocal) {
    if (!useRemoteSigner().isHtlcActive)
      return { error: i18n.t('No account has been created yet, or it is currently processing funds'), data: undefined }
    const sender = useRemoteSigner().remoteAddress
    if (!sender)
      return { error: i18n.t('Something went wrong syncing your account'), data: undefined }

    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ sender,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ useRemoteSigner().remoteBalance,
      /* fee */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ new Uint8Array(0),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx)
    if (res.error)
      return res
    return { data: { signedTx: res.data! }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalImmediateReclaim) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ partialArgs.sender,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ partialArgs.amount,
      /* fee */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ new Uint8Array(0),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx, { address: partialArgs.sender })
    if (res.error)
      return res
    return { data: { signedTx: res.data! }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalAfterTimeout) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ partialArgs.sender,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ partialArgs.amount,
      /* fee */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ new Uint8Array(0),
    )
    tx.proof = createResolveProof({ mode: 'timeout', tx })
    return { data: { signedTx: tx }, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.ExtendRemote) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ Nimiq.Address.CONTRACT_CREATION,
      /* recipientType */ Nimiq.Account.Type.HTLC,
      /* value */ useRemoteSigner().remoteBalance,
      /* fee */ 0,
      /* validityStartHeight */ getValidityStartHeight(),
      /* flags */ Nimiq.Transaction.Flag.CONTRACT_CREATION,
      /* data */ createDepositData(),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    const res = await getSignedTxByRemote(tx, { address: useRemoteSigner().remoteAddress! })
    if (res.error)
      return res
    return { data: { signedTx: res.data! }, error: undefined }
  }
  else {
    return { data: undefined, error: i18n.t('Invalid transfer type') }
  }
}

interface GetSignedTxByRemoteArgs {
  // The address of the HTLC contract
  address?: Nimiq.Address
}

async function getSignedTxByRemote(tx: ExtendedTransaction, { address = useRemoteSigner().remoteAddress! }: GetSignedTxByRemoteArgs = {}) {
  if (!useRemoteSigner().remoteAddress)
    return { data: undefined, error: i18n.t('Something went wrong syncing your account') }
  logger.log('Signing transaction by remote', { tx: tx.toPlain(), address: address.toUserFriendlyAddress() })
  const { data: receipt, error, hasError } = await useRemoteSignerApi().sendTransaction({ address: address.toUserFriendlyAddress(false), tx })
  logger.log({ receipt, error })
  if (hasError)
    return { data: undefined, error: error?.message || i18n.t('Something went wrong signing the transaction') }
  return { data: Nimiq.Transaction.fromAny(receipt!.details), error: undefined }
}

function createDepositData() {
  const remotePublicKey = useRemoteSigner().remotePublicKey
  if (!remotePublicKey)
    throw new Error('Remote public key is undefined') // no translation as not user-facing
  const data = new Nimiq.SerialBuffer(78)
  useLocalWallet().localWallet.address.serialize(data)
  Nimiq.PublicKey.fromAny(remotePublicKey).toAddress().serialize(data)
  data.writeUint8(Nimiq.Hash.Algorithm.BLAKE2B)
  data.write(new Uint8Array(32))
  data.writeUint8(1)
  data.writeUint32(useRemoteSigner().remoteHeight + 60 * 24 * 14)
  return data
}

interface CreateResolveProofArgs {
  mode: 'timeout' | 'early'
  tx: Nimiq.Transaction
}

export function createResolveProof({ tx, mode }: CreateResolveProofArgs) {
  const sig = useLocalWallet().localWallet.signTransaction(tx).serialize()
  const isEarly = mode === 'early'
  const proofLen = 1 + sig.length + (isEarly ? useRemoteSigner().remoteProofSize : 0)
  const proof = new Nimiq.SerialBuffer(proofLen)
  proof.writeUint8(isEarly ? Nimiq.HashedTimeLockedContract.ProofType.EARLY_RESOLVE : Nimiq.HashedTimeLockedContract.ProofType.TIMEOUT_RESOLVE)
  proof.writePos += isEarly ? useRemoteSigner().remoteProofSize : 0
  proof.write(sig)
  return proof
}

/**
 * Since the validity start height of the transaction must be greater than the validity start height of the remote wallet,
 * we need to get the maximum between the remote height and the start height of the remote wallet plus one, just in case.
 * @returns The height at which the validity of the transaction starts
 */
function getValidityStartHeight() {
  const { remoteHeight, start } = useRemoteSigner()
  return Math.max(remoteHeight, start + 1)
}
