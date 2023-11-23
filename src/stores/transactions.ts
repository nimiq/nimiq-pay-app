import { defineStore, storeToRefs } from 'pinia'
import { onMounted, readonly, ref, watch } from 'vue'
import { useRemoteSigner } from './remote-signer'
import { useConn } from './conn'
import type { Transaction, TransactionDb } from '@/types/transactions'
import { Transfer } from '@/types/transactions'
import type { AsyncOption, AsyncResult } from '@/types'
import type { PartialSendTxArgs } from '@/lib/tx'
import { getSignedTx } from '@/lib/tx'
import { useNimiqNetwork } from '@/stores/useNimiqNetwork'
import { useFiat } from '@/stores/fiat'
import { useApp } from '@/stores/app'

import { SQLQuery } from '@/lib/sql-queries'

export const useTransactions = defineStore('transactions', () => {
  const { query, run } = useConn()
  const { client } = storeToRefs(useNimiqNetwork())

  const { selectedFiat } = storeToRefs(useApp())
  const { updateBalance } = useRemoteSigner()
  const { remoteBalance } = storeToRefs(useRemoteSigner())

  const { getTxPrice } = useFiat()

  const transactions = ref<Transaction[]>([])
  // Update the value of each transaction when the fiat currency changes
  watch(selectedFiat, () => transactions.value.forEach(async tx => Object.assign(tx, await getTxPrice(tx))))

  interface SelectTxsOptions {
    limit?: number
    offset?: number
  }

  /**
   * Select transactions from the database using a basic pagination system. Loads the newest transactions first.
   * If you need to load more transactions, use loadMoreTxs.
   */
  async function selectTxs(options?: SelectTxsOptions): Promise<Transaction[]> {
    const res = await query<TransactionDb[]>(SQLQuery.SelectPaginationTransactions, [options?.limit || 30, options?.offset || 0])
    const txs = await Promise.all(res.map(parseTx))
    return txs
  }

  async function upsertTx(tx: TransactionDb) {
    const { hash, timestamp, sender, recipient, value, fee, message, status, raw, rail, railId, railPeerId, transfer } = tx
    console.log(`📚 Upserting TX. ${JSON.stringify(tx)}`)
    await run(SQLQuery.UpsertTx, [hash, timestamp, sender, recipient, value, fee, message, status, raw, rail, railId, railPeerId, transfer])
  }

  async function clearTxHistory() {
    await run(SQLQuery.ClearTxHistory)
  }

  async function parseTx(tx: TransactionDb): Promise<Transaction> {
    const title = tx.peerName || (tx.transfer === Transfer.UserPayment ? 'Payment' : `${tx.railPeerId?.substring(0, 9)}...`)
    return {
      ...tx,
      ...await getTxPrice(tx),
      title,
      location: tx.peerName,
    }
  }

  onMounted(async () => {
    transactions.value = await selectTxs()
  })

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<Transaction> {
    const { data: signedTx, error } = await getSignedTx(partialTx)
    if (error)
      return { data: undefined, error }
    await client.value!.sendTransaction(signedTx!)

    const tx: TransactionDb = {
      ...partialTx,
      fee: signedTx!.fee,
      recipient: signedTx!.recipient.toUserFriendlyAddress(),
      timestamp: Date.now() / 1000,
      status: Nimiq.Client.TransactionState.PENDING,
      hash: signedTx!.hash.toString(),
      sender: signedTx!.sender.toUserFriendlyAddress(),
      value: signedTx!.value,
      raw: signedTx!.serialize().toString(),
      rail: partialTx.transfer === Transfer.UserPayment ? partialTx.rail : undefined,
      railId: partialTx.transfer === Transfer.UserPayment ? partialTx.railId : undefined,
      railPeerId: partialTx.transfer === Transfer.UserPayment ? partialTx.railPeerId : undefined,
      message: signedTx!.data ? Nimiq.BufferUtils.toAscii(signedTx!.data) : undefined,
      transfer: partialTx.transfer,
      peerName: partialTx.transfer === Transfer.UserPayment ? partialTx.peerName : (`${signedTx!.sender.toUserFriendlyAddress().substring(0, 9)}...`),
    }

    await upsertTx(tx)
    updateBalance(remoteBalance.value + tx.value)
    return { data: await parseTx(tx), error: undefined }
  }

  return {
    transactions: readonly(transactions),
    sendTx,
    loadMoreTxs: () => selectTxs({ offset: transactions.value.length }),
    clearTxHistory,
  }
})
