import { defineStore, storeToRefs } from 'pinia'
import { onMounted, readonly, ref, watch } from 'vue'
import { useRemoteSigner } from './remote-signer'
import { useConn } from './conn'
import { useLocalWallet } from './local-wallet'
import type { PartialSendTxArgs, Transaction, TransactionSentByUser } from '@/types/transactions'
import type { AsyncResult } from '@/types'
import { getSignedTx } from '@/lib/tx'
import { useNimiqNetwork } from '@/stores/nimiq-network'
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
    const txs = await query<Transaction[]>(SQLQuery.SelectPaginationTransactions, [options?.limit || 30, options?.offset || 0])
    // eslint-disable-next-line no-console
    console.log(`📚 Selected ${txs.length} transactions`, txs)
    return txs
  }

  async function upsertTx(tx: Transaction) {
    // eslint-disable-next-line no-console
    console.log(`📚 Upserting transaction`, tx)
    await run(
      SQLQuery.UpsertTx,
      [tx.hash, tx.timestamp, tx.sender, tx.recipient, tx.amount, tx.fee, tx.status, tx.raw, tx.title, tx.transfer, tx.message, tx.rail, tx.railPeerId, tx.locationName],
    )
  }

  async function clearTxHistory() {
    await run(SQLQuery.ClearTxHistory)
  }

  onMounted(async () => {
    transactions.value = await selectTxs()
  })

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<Transaction> {
    // eslint-disable-next-line no-console
    console.log('✈️  Sending new tx', {
      partialTx,
      remoteAddress: useRemoteSigner().remoteAddress?.toUserFriendlyAddress(),
      remoteBalance: useRemoteSigner().remoteBalance,
      remoteHeight: useRemoteSigner().remoteHeight,
      remotePublicKey: useRemoteSigner().remotePublicKey,
      remoteProofSize: useRemoteSigner().remoteProofSize,
      localAddress: useLocalWallet().localAddress.toUserFriendlyAddress(),
      localBalance: useLocalWallet().localBalance,
    })
    const { data: signedTx, error } = await getSignedTx(partialTx)
    if (error)
      return { data: undefined, error }
    await client.value!.sendTransaction(signedTx!)

    const { fee, transactionHash: hash, recipient, sender, value: amount, data: { raw: message } } = signedTx!.toPlain()
    const raw = signedTx!.serialize().toString()
    const timestamp = Math.floor(Date.now() / 1000)
    const status = Nimiq.Client.TransactionState.PENDING
    const tx = { ...partialTx, fee, recipient, timestamp, status, hash, sender, amount, raw, message } as TransactionSentByUser

    // eslint-disable-next-line no-console
    console.log(`✈️ Sending transaction`, tx)

    await upsertTx(tx)
    transactions.value = [tx, ...transactions.value]

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
