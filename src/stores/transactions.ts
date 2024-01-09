import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, readonly, ref } from 'vue'
import { useRemoteSigner } from './remote-signer'
import { useConn } from './conn'
import { useLocalWallet } from './local-wallet'
import { type ExternalTransaction, type MerchantTransaction, type PartialSendTxArgs, type Transaction, type TransactionSentByUser, Transfer, type UserReceiptTransaction, isExternalTx } from '@/types/transactions'
import type { AsyncResult } from '@/types'
import { getSignedTx } from '@/lib/tx'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { DEFAULT_LIMIT, type DbPagination, SQLQuery } from '@/lib/sql-queries'
import { useTransactionSearch } from '@/composables/useTransactionSearch'
import { i18n } from '@/i18n/i18n-setup'
import { PaymentMethod } from '@/types/database'

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

  const { updateBalance } = useRemoteSigner()
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
    // eslint-disable-next-line no-console
    console.log(`📚 Filtered ${filteredTxs.length} transactions`, filteredTxs)
    return filteredTxs
  }

  async function upsertTx(tx: Transaction) {
    // eslint-disable-next-line no-console
    console.log(`📚 Upsert-ing transaction`, tx)
    await run(
      SQLQuery.UpsertTx,
      // Note: we're storing the original tx.title here and not the translated title. It's translated then at display
      // time to whatever language the user has selected at that time.
      [tx.hash, tx.timestamp, tx.sender, tx.senderType, tx.recipient, tx.recipientType, tx.amount, tx.fee, tx.status, tx.raw, tx.title, tx.transfer, tx.message, tx.rail, tx.railPeerId, tx.shopName, tx.shopCategory, tx.transfer === Transfer.UserPaymentToMerchant ? tx.paymentMethod : null],
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
    const details = await client.value!.sendTransaction(signedTx!)
    if (details.state === 'invalidated') {
      console.error('Transaction was invalidated', details)
      return { data: undefined, error: i18n.t('Transaction was invalidated') }
    }

    const { fee, transactionHash: hash, recipient, sender, value: amount, data: { raw: message }, senderType, recipientType } = signedTx!.toPlain()
    const raw = signedTx!.serialize().toString()
    const timestamp = Math.floor(Date.now() / 1000)
    const status = Nimiq.Client.TransactionState.PENDING
    // TODO:
    // eslint-disable-next-line ts/ban-ts-comment
    // @ts-expect-error
    let tx = { ...partialTx, fee, recipient, recipientType, timestamp, status, hash, sender, senderType, amount, raw, message, proofSize: signedTx!.proof.length } as TransactionSentByUser
    if (tx.transfer === Transfer.UserPaymentToMerchant)
      tx = { ...tx, paymentMethod: PaymentMethod.NIM }

    // eslint-disable-next-line no-console
    console.log(`✈️ Sending transaction`, tx)

    await upsertTx(tx)

    if (isExternalTx(tx))
      transactions.value = [tx, ...transactions.value]

    if (tx.transfer === Transfer.LocalToRemote || tx.transfer === Transfer.ExtendRemote) {
      if (details) {
        const plain = details?.toPlain()
        const htlcData = Nimiq.HashedTimeLockedContract.dataToPlain(details.data.raw)
        useRemoteSigner().updateRemoteSigner({
          active: true,
          balance: plain.value,
          publicKey: useRemoteSigner().remotePublicKey!,
          start: plain.validityStartHeight,
          address: Nimiq.Address.fromUserFriendlyAddress(plain.recipient),
          end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
          proofSize: tx.proofSize,
        })
      }
      else {
        console.error('Transaction details are undefined, cannot update remote signer', tx)
      }
    }
    else {
      updateBalance(remoteBalance.value + tx.amount, remoteAddress.value!)
    }

    return { data: tx, error: undefined }
  }

  const { filteredTransactions, searchQuery, allTransactions } = useTransactionSearch()

  onMounted(async () => {
    transactions.value = await selectTxs()
  })

  async function addReceiptTransaction(tx: UserReceiptTransaction) {
    await upsertTx(tx)
    const remoteAddressTable = await useRemoteSigner().getAllRemoteSigners()
    // Don't add tx to the transaction list if it came from the remote signer (remote-to-local)
    if (!remoteAddressTable.some(remoteAddress => remoteAddress.address.toUserFriendlyAddress() === tx.sender))
      transactions.value = [tx, ...transactions.value]
  }

  async function addPaymentToMerchantTransaction(tx: MerchantTransaction) {
    await upsertTx(tx)
    transactions.value = [tx, ...transactions.value]
  }

  async function updateTransactionStatus({ hash, status, timestamp }: { hash: string; status: Nimiq.Client.TransactionState; timestamp: number }) {
    await run(SQLQuery.UpdateTxStatus, [status, timestamp, hash])
    const tx = transactions.value.find(tx => tx.hash === hash)
    if (tx)
      tx.status = status
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
    addPaymentToMerchantTransaction,
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
