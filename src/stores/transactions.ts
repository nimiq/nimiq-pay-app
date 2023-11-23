import { defineStore, storeToRefs } from 'pinia'
import { onMounted, readonly, ref, watch } from 'vue'
import { useRemoteSigner } from './remote-signer'
import { useConn } from './conn'
import type { PartialSendTxArgs, Transaction, TransactionSentByUser } from '@/types/transactions'
import type { AsyncResult } from '@/types'
import { getSignedTx } from '@/lib/tx'
import { useNimiqNetwork } from '@/stores/useNimiqNetwork'
import { useFiat } from '@/stores/fiat'
import { useApp } from '@/stores/app'

import { SQLQuery } from '@/lib/sql-queries'

export const useTransactions = defineStore('transactions', () => {
  const { query, run } = useConn()
  const { client } = storeToRefs(useNimiqNetwork())

  const { selectedFiat } = storeToRefs(useApp())
  const { updateBalance, updateActiveWallet } = useRemoteSigner()
  const { remoteBalance, remoteAddress } = storeToRefs(useRemoteSigner())

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
    return await query<Transaction[]>(SQLQuery.SelectPaginationTransactions, [options?.limit || 30, options?.offset || 0])
  }

  async function upsertTx(tx: Transaction) {
    const { hash, timestamp, sender, recipient, amount, fee, message, status, raw, rail, railPeerId, transfer, title, locationName } = tx
    // eslint-disable-next-line no-console
    console.log(`📚 Upserting transaction`, tx)
    await run(SQLQuery.UpsertTx, [hash, timestamp, sender, recipient, amount, fee, message, status, raw, rail, railPeerId, transfer, title, locationName])
  }

  async function clearTxHistory() {
    await run(SQLQuery.ClearTxHistory)
  }

  onMounted(async () => {
    transactions.value = await selectTxs()
  })

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<Transaction> {
    const { data: signedTx, error } = await getSignedTx(partialTx)
    if (error)
      return { data: undefined, error }
    await client.value!.sendTransaction(signedTx!)

    const { fee, transactionHash: hash, recipient, sender, value: amount, data: { raw: message } } = signedTx!.toPlain()

    const tx = {
      ...partialTx,
      fee,
      recipient,
      timestamp: Date.now() / 1000,
      status: Nimiq.Client.TransactionState.PENDING,
      hash,
      sender,
      amount,
      raw: signedTx!.serialize().toString(),
      message,
      // railId: partialTx.transfer === Transfer.UserPayment ? partialTx.railId : undefined,
      // peerName: partialTx.transfer === Transfer.UserPayment ? partialTx.peerName : (`${signedTx!.sender.toUserFriendlyAddress().substring(0, 9)}...`),
      // peerName: partialTx.transfer === Transfer.UserPayment ? partialTx.peerName : (`${plainSignedTx.sender.substring(0, 9)}...`),
      // rail: partialTx.transfer === Transfer.UserPayment ? partialTx.rail : undefined,
      // railId: partialTx.transfer === Transfer.UserPayment ? partialTx.railId : undefined,
      // railPeerId: partialTx.transfer === Transfer.UserPayment ? partialTx.railPeerId : undefined,
      // transfer: partialTx.transfer,
    } as TransactionSentByUser

    await upsertTx(tx)
    updateBalance(remoteBalance.value + tx.amount, remoteAddress.value!)
    updateActiveWallet()
    return { data: tx, error: undefined }
  }

  return {
    transactions: readonly(transactions),
    sendTx,
    loadMoreTxs: () => selectTxs({ offset: transactions.value.length }),
    clearTxHistory,
  }
})
