import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, readonly, ref } from 'vue'
import { useRemoteSigner } from './remote-signer'
import { useConn } from './conn'
import { useLocalWallet } from './local-wallet'
import { isExternalTx } from '@/types/transactions'
import type { ExternalTransaction, PartialSendTxArgs, Transaction, TransactionSentByUser, UserReceiptTransaction } from '@/types/transactions'
import type { AsyncResult } from '@/types'
import { getSignedTx } from '@/lib/tx'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import type { DbPagination } from '@/lib/sql-queries'
import { DEFAULT_LIMIT, SQLQuery } from '@/lib/sql-queries'
import { useTransactionSearch } from '@/composables/useTransactionSearch'

export enum TransactionListState {
  // There are no transactions to show
  Empty = 'empty',

  // Showing the transactions that are in the database
  Showing = 'showing',

  // There are transaction in the database, but the search query does not match any of them
  NoResults = 'no-results',

  // There are transactions in the database, and the search query matches some of them
  ShowingResults = 'showing-results',
}

export const useTransactions = defineStore('transactions', () => {
  const { query, run } = useConn()
  const { client } = storeToRefs(useNimiqNetwork())

  const { updateBalance, updateActiveWallet } = useRemoteSigner()
  const { remoteBalance, remoteAddress } = storeToRefs(useRemoteSigner())

  const transactions = ref<ExternalTransaction[]>([])

  /**
   * Select transactions from the database using a basic pagination system. Loads the newest transactions first.
   * If you need to load more transactions, use loadMoreTxs.
   */
  async function selectTxs(options?: DbPagination) {
    const txs = await query<ExternalTransaction[]>(SQLQuery.SelectPaginationTransactions, [options?.limit || DEFAULT_LIMIT, options?.offset || 0])
    // TODO: Temporary, don't handle tx from HTLCs if tx is UserReceiptTransaction
    const filteredTxs = txs.filter(tx => 'senderType' in tx && tx.senderType !== Nimiq.Account.Type.HTLC)

    // eslint-disable-next-line no-console
    console.log(`📚 Selected ${txs.length} transactions`, txs)
    console.log(`📚 Filtered ${filteredTxs.length} transactions`, filteredTxs)
    return filteredTxs
  }

  async function upsertTx(tx: Transaction) {
    // eslint-disable-next-line no-console
    console.log(`📚 Upserting transaction`, tx)
    await run(
      SQLQuery.UpsertTx,
      [tx.hash, tx.timestamp, tx.sender, tx.senderType, tx.recipient, tx.recipientType, tx.amount, tx.fee, tx.status, tx.raw, tx.title, tx.transfer, tx.message, tx.rail, tx.railPeerId, tx.shopName, tx.shopCategory],
    )
  }

  async function clearTxHistory() {
    await run(SQLQuery.ClearTxHistory)
  }

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<Transaction> {
    // eslint-disable-next-line no-console
    console.log('✈️  Preparing new transaction', {
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
    if (error) {
      console.error('Error while signing transaction', error)
      return { data: undefined, error }
    }
    await client.value!.sendTransaction(signedTx!)

    const { fee, transactionHash: hash, recipient, sender, value: amount, data: { raw: message }, senderType, recipientType } = signedTx!.toPlain()
    const raw = signedTx!.serialize().toString()
    const timestamp = Math.floor(Date.now() / 1000)
    const status = Nimiq.Client.TransactionState.PENDING
    // TODO:
    // eslint-disable-next-line ts/ban-ts-comment
    // @ts-expect-error
    const tx = { ...partialTx, fee, recipient, recipientType, timestamp, status, hash, sender, senderType, amount, raw, message } as TransactionSentByUser

    // eslint-disable-next-line no-console
    console.log(`✈️ Sending transaction`, tx)

    await upsertTx(tx)

    if (isExternalTx(tx))
      transactions.value = [tx, ...transactions.value]

    updateBalance(remoteBalance.value + tx.amount, remoteAddress.value!)
    updateActiveWallet()
    return { data: tx, error: undefined }
  }

  const { filteredTransactions, searchQuery, allTransactions } = useTransactionSearch()

  onMounted(async () => {
    transactions.value = await selectTxs()
  })

  async function addReceiptTransaction(tx: UserReceiptTransaction) {
    await upsertTx(tx)
    transactions.value = [tx, ...transactions.value]
  }

  async function updateTransactionStatus({ hash, status }: { hash: string; status: Nimiq.Client.TransactionState }) {
    await run(SQLQuery.UpdateTxStatus, [status, hash])
  }

  const status = computed(() => {
    if (transactions.value.length === 0)
      return TransactionListState.Empty
    else if (searchQuery.value && filteredTransactions.value.length === 0)
      return TransactionListState.NoResults
    else if (searchQuery.value && filteredTransactions.value.length > 0)
      return TransactionListState.ShowingResults
    else
      return TransactionListState.Showing
  })

  return {
    transactions: readonly(transactions),
    sendTx,
    addReceiptTransaction,
    updateTransactionStatus,
    clearTxHistory,

    // Search for transactions
    transactionsToShow: computed(() => searchQuery.value ? filteredTransactions.value : transactions.value),
    allTransactions,
    filteredTransactions,
    searchQuery,

    status,

    // Function to run when the user scrolls to the bottom of the list
    loadMoreTxs: () => { selectTxs({ offset: transactions.value.length }) },

    // A function that returns true if there are more transactions to load
    // FIXME: This is not exactly true, because if there is exactly DEFAULT_LIMIT transactions, it will return true, but there are no more transactions to load
    canLoadMore: () => searchQuery.value ? false : transactions.value.length % DEFAULT_LIMIT === 0,
  }
})
