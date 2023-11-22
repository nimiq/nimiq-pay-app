import { defineStore, storeToRefs } from 'pinia'
import { onMounted, readonly, ref } from 'vue'
import { useRemoteSigner } from './remote-signer'
import { useConn } from './conn'
import type { Transaction } from '@/types/database'
import { Transfer } from '@/types/database'
import type { AsyncOption, AsyncResult } from '@/types'
import type { PartialSendTxArgs } from '@/lib/tx'
import { getSignedTx } from '@/lib/tx'
import { useNimiqNetwork } from '@/stores/useNimiqNetwork'
import { SQLQuery } from '@/lib/sql-queries'

export const useTransactions = defineStore('transactions', () => {
  const { waitForUnlock } = useConn()
  const { db } = storeToRefs(useConn())
  const { client } = storeToRefs(useNimiqNetwork())

  const { updateBalance } = useRemoteSigner()
  const { remoteSigner } = storeToRefs(useRemoteSigner())

  const transactions = ref<Transaction[]>([])

  interface SelectTxsOptions {
    limit?: number
    offset?: number
  }

  /**
   * Select transactions from the database using a basic pagination system. Loads the newest transactions first.
   * If you need to load more transactions, use loadMoreTxs.
   */
  async function selectTxs(options?: SelectTxsOptions): AsyncResult<Transaction[]> {
    const error = await waitForUnlock()
    if (error)
      return { data: undefined, error }
    const res = await db.value!.query(SQLQuery.SelectPaginationTransactions, [options?.limit || 30, options?.offset || 0])
    return { data: res.values as Transaction[] || [], error: undefined }
  }

  async function loadMoreTxs() {
    const { data: txs, error } = await selectTxs({ offset: transactions.value.length })
    if (error)
      return { data: undefined, error }
    transactions.value = [...txs!, ...transactions.value]
  }

  async function upsertTx(tx: Omit<Transaction, 'id'>): AsyncOption<string> {
    const error = await waitForUnlock()
    if (error)
      return error
    const { hash, ts, sender, recipient, value, fee, details, status, raw, rail, railId, railPeerId, transfer } = tx
    await db.value!.query(SQLQuery.UpsertTx, [hash, ts, sender, recipient, value, fee, details, status, raw, rail, railId, railPeerId, JSON.stringify(transfer)])
  }

  async function clearTxHistory() {
    const error = await waitForUnlock()
    if (error)
      return error
    await db.value!.query(SQLQuery.ClearTxHistory)
  }

  onMounted(async () => {
    const { data: txs, error } = await selectTxs()
    if (error)
      throw new Error(error)
    transactions.value = txs!
  })

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<Omit<Transaction, 'id'>> {
    const { data: signedTx, error } = await getSignedTx(partialTx)
    console.log('signedTx', signedTx, error)
    if (error)
      return { data: undefined, error }
    await client.value!.sendTransaction(signedTx!)

    const tx: Omit<Transaction, 'id'> = {
      ...partialTx,
      fee: signedTx!.fee,
      recipient: signedTx!.recipient.toUserFriendlyAddress(),
      ts: Date.now() / 1000,
      status: Nimiq.Client.TransactionState.PENDING,
      hash: signedTx!.hash.toString(),
      sender: signedTx!.sender.toUserFriendlyAddress(),
      value: signedTx!.value,
      raw: signedTx!.serialize().toString(),
      rail: partialTx.transfer === Transfer.UserPayment ? partialTx.rail : undefined,
      railId: partialTx.transfer === Transfer.UserPayment ? partialTx.railId : undefined,
      railPeerId: partialTx.transfer === Transfer.UserPayment ? partialTx.railPeerId : undefined,
      details: signedTx!.data ? Nimiq.BufferUtils.toAscii(signedTx!.data) : undefined,
      transfer: partialTx.transfer,
      peerName: partialTx.transfer === Transfer.UserPayment ? partialTx.peerName : (`${signedTx!.sender.toUserFriendlyAddress().substring(0, 9)}...`),
    }

    const insertTxError = await upsertTx(tx)
    if (insertTxError)
      return { data: undefined, error: insertTxError as string }

    updateBalance(remoteSigner.value!.balance + tx.value)
    return { data: tx, error: undefined }
  }

  return {
    transactions: readonly(transactions),
    sendTx,
    loadMoreTxs,
    clearTxHistory,
  }
})
