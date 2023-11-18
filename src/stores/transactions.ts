import { defineStore, storeToRefs } from 'pinia'
import { onMounted, readonly, ref } from 'vue'
import { useRemoteSigner } from './remote-signer'
import { useConn } from './conn'
import type { Transaction } from '@/types/database'
import { PaymentMethod } from '@/types/database'
import type { AsyncOption, AsyncResult } from '@/types'
import type { PartialSendTxArgs } from '@/lib/tx'
import { getSignedTx } from '@/lib/tx'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'
import { SQLQuery } from '@/lib/sql-queries'

export const useTransactions = defineStore('transactions', () => {
  const { waitForUnlock } = useConn()
  const { db } = storeToRefs(useConn())

  const { updateBalance } = useRemoteSigner()
  const { remoteAddress, remoteSigner } = storeToRefs(useRemoteSigner())

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
    const { hash, ts, sender, recipient, amount, fee, details, status, raw, rail, railId, railPeerId, transfer } = tx
    await db.value!.query(SQLQuery.UpsertTx, [hash, ts, sender, recipient, amount, fee, details, status, raw, rail, railId, railPeerId, JSON.stringify(transfer)])
  }

  onMounted(async () => {
    const { data: txs, error } = await selectTxs()
    if (error)
      throw new Error(error)
    transactions.value = txs!
  })

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<Omit<Transaction, 'id'>> {
    const { data: signedTx, error } = await getSignedTx(partialTx)
    if (error)
      return { data: undefined, error }
    await useNimiqNetwork().client.value!.sendTransaction(signedTx!)

    upsertTx({
      ...partialTx,
    })
    const tx: Omit<NimTransaction, 'id'> = {
      ...partialTx,
      fee: signedTx!.fee,
      remoteAddress: remoteAddress.value,
      ts: Date.now() / 1000,
      status: Nimiq.Client.TransactionState.PENDING,
      method: PaymentMethod.NIM,
      hash: signedTx!.hash.toString(),
    }

    updateBalance(remoteSigner.value!.balance + tx.amount)

    const insertTxError = await insertTx(tx)
    if (insertTxError)
      return { data: undefined, error: insertTxError as string }

    return { data: tx, error: undefined }
  }

  return {
    transactions: readonly(transactions),
    sendTx,
    loadMoreTxs,
  }
})
