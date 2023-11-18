import type { ExtendedTransaction } from '@nimiq/core-web'
import type { AsyncResult } from '@/types'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/database'

export type PartialSendTxArgs = {
  transfer: Transfer.UserPayment
  recipient: string
  amount: number
  message?: string
} | {
  transfer: Transfer.LocalToRemote | Transfer.RemoteToLocal | Transfer.ExtendRemote | Transfer.RemoteToLocalAfterTimeout
}

// TODO Check if this function is OK!
/**
 * Signs any transaction in the wallet.
 *
 * Diferent Transfer types are used to sign different transactions and therefore different
 * arguments are needed for each one. The amount, flag and recipient will be set automatically
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
export async function getSignedTx(partialArgs: PartialSendTxArgs): AsyncResult<{ tx: Nimiq.ExtendedTransaction, > {
  if (partialArgs.transfer === Transfer.UserPayment) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ Nimiq.Address.fromString(partialArgs.recipient),
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* amount */ partialArgs.amount,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ Nimiq.BufferUtils.fromAscii(partialArgs.message || ''),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return { data: tx, error: undefined }
  }
  else if (partialArgs.transfer === Transfer.LocalToRemote) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useLocalWallet().address,
      /* senderType */ Nimiq.Account.Type.BASIC,
      /* recipient */ Nimiq.Address.CONTRACT_CREATION,
      /* recipientType */ Nimiq.Account.Type.HTLC,
      /* amount */ useLocalWallet().balance,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.CONTRACT_CREATION,
      /* data */ createDepositData(),
    )
    tx.proof = useLocalWallet().localWallet.signTransaction(tx).serialize()
    return await getSignedTxByRemote(tx)
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocal) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().address,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* amount */ useRemoteSigner().remoteBalance,
      /* fee */ 0,
      /* validityStartHeight */ useRemoteSigner().remoteHeight,
      /* flags */ Nimiq.Transaction.Flag.NONE,
      /* data */ new Uint8Array(0),
    )
    tx.proof = createResolveProof({ mode: 'early', tx })
    return await getSignedTxByRemote(tx)
  }
  else if (partialArgs.transfer === Transfer.RemoteToLocalAfterTimeout) {
    const tx = new Nimiq.ExtendedTransaction(
      /* sender */ useRemoteSigner().remoteAddress,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ useLocalWallet().address,
      /* recipientType */ Nimiq.Account.Type.BASIC,
      /* amount */ useRemoteSigner().remoteBalance,
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
      /* sender */ useRemoteSigner().remoteAddress,
      /* senderType */ Nimiq.Account.Type.HTLC,
      /* recipient */ Nimiq.Address.CONTRACT_CREATION,
      /* recipientType */ Nimiq.Account.Type.HTLC,
      /* amount */ useRemoteSigner().remoteBalance,
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

async function getSignedTxByRemote(tx: ExtendedTransaction) {
  const { data: receipt, error } = await useRemoteSignerApi().sendTransaction({ address: useRemoteSigner().remoteAddress, tx })
  if (error)
    return { data: undefined, error }
  return { data: Nimiq.Transaction.fromAny(receipt!.details), error: undefined }
}

function createDepositData() {
  const data = new Nimiq.SerialBuffer(78)
  useLocalWallet().localWallet.address.serialize(data)
  Nimiq.PublicKey.fromAny(useRemoteSigner().remotePublicKey).toAddress().serialize(data)
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

const proofTypes = Nimiq.HashedTimeLockedContract.ProofType

export function createResolveProof({ tx, mode }: CreateResolveProofArgs) {
  const sig = useLocalWallet().localWallet.signTransaction(tx).serialize()
  const isEarly = mode === 'early'
  const proofLen = 1 + sig.length + (isEarly ? useRemoteSigner().remoteProofSize : 0)
  const proof = new Nimiq.SerialBuffer(proofLen)
  proof.writeUint8(isEarly ? proofTypes.EARLY_RESOLVE : proofTypes.TIMEOUT_RESOLVE)
  proof.writePos += isEarly ? useRemoteSigner().remoteProofSize : 0
  proof.write(sig)
  return proof
}
