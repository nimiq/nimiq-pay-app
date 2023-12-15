import type { ExtendedTransaction } from '@nimiq/core-web'
import type { AsyncResult } from '@/types'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import type { PartialSendTxArgs } from '@/types/transactions'
import { Transfer } from '@/types/transactions'

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
 * @param args
 * @returns
 */
export async function getSignedTx(partialArgs: PartialSendTxArgs): AsyncResult<ExtendedTransaction> {
  if ((partialArgs.transfer === Transfer.UserPayment || partialArgs.transfer === Transfer.UserPaymentToMerchant)) {
    if (!useRemoteSigner().remoteAddress)
      return { error: 'Remote address is undefined', data: undefined }
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ Nimiq.Address.fromString(partialArgs.recipient),
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ Math.ceil(partialArgs.amount),
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ Nimiq.BufferUtils.fromAscii(partialArgs.message || ''),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return await getSignedTxByRemote(tx)
  }
  else if (partialArgs.transfer === Transfer.LocalToRemote) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useLocalWallet().localAddress,
      /* senderType */ Nimiq.Account.Type.BASIC,
      /* recipient */ Nimiq.Address.CONTRACT_CREATION,
      /* recipientType */ Nimiq.Account.Type.HTLC,
      /* value */ useLocalWallet().localBalance,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.CONTRACT_CREATION,
      /* data */ createDepositData(),
    )
    tx.proof = useLocalWallet().localWallet.signTransaction(tx).serialize()
    const plainData = Nimiq.HashedTimeLockedContract.dataToPlain(tx.data)
    await useRemoteSigner().updateRemoteSigner({
      active: true,
      balance: tx.value,
      publicKey: useRemoteSigner().remotePublicKey!,
      start: tx.validityStartHeight,
      address: tx.recipient,
      end: 'timeout' in plainData ? plainData.timeout : Number.MAX_VALUE,
      proofSize: tx.proof.length,
    })
    return { data: tx, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocal) {
    if (!useRemoteSigner().isHtlcActive)
      return { error: `There is no active HTLC`, data: undefined }
    const sender = useRemoteSigner().remoteAddress
    if (!sender)
      return { error: `There is no sender address provided. Sender: ${sender}`, data: undefined }

    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ sender,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ useRemoteSigner().remoteBalance,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ new Uint8Array(0),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return await getSignedTxByRemote(tx)
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalImmediateReclaim) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ partialArgs.sender,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ partialArgs.amount,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ new Uint8Array(0),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return await getSignedTxByRemote(tx, { address: partialArgs.sender })
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalAfterTimeout && useRemoteSigner().remoteAddress) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().localAddress,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* value */ useRemoteSigner().remoteBalance,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ new Uint8Array(0),
    )
    tx.proof = createResolveProof({ mode: 'timeout', tx })
    return { data: tx, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.ExtendRemote) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress!,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ Nimiq.Address.CONTRACT_CREATION,
      /* recipientType */ Nimiq.Account.Type.HTLC,
      /* value */ useRemoteSigner().remoteBalance,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.CONTRACT_CREATION,
      /* data */ createDepositData(),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return { data: tx, error: undefined }
  }
  else {
    return { data: undefined, error: 'Invalid transfer type' }
  }
}

interface GetSignedTxByRemoteArgs {
  // The address of the HTLC contract
  address?: Nimiq.Address
}

async function getSignedTxByRemote(tx: ExtendedTransaction, { address = useRemoteSigner().remoteAddress! }: GetSignedTxByRemoteArgs = {}) {
  if (!useRemoteSigner().remoteAddress)
    return { data: undefined, error: 'Remote address is undefined' }
  console.log('Signing transaction by remote', tx, address)
  const { data: receipt, error } = await useRemoteSignerApi().sendTransaction({ address: address.toUserFriendlyAddress(false), tx })
  console.log({ receipt, error })
  if (error)
    return { data: undefined, error }
  return { data: Nimiq.Transaction.fromAny(receipt!.details), error: undefined }
}

function createDepositData() {
  const remotePublicKey = useRemoteSigner().remotePublicKey
  if (!remotePublicKey)
    throw new Error('Remote public key is undefined')
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
