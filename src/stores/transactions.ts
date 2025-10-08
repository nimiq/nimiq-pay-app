import type { PlainTransactionDetails, TransactionState } from '@nimiq/core'
import type { NimHtlcDetails } from '@nimiq/fastspot-api-v1'
import type { Swap } from '@nimiq/fastspot-api-v2'
import type { DbPagination } from '@/lib/sql-queries'
import type { AsyncResult } from '@/types'
import type { ExternalTransaction, MerchantTransaction, PartialSendTxArgs, Transaction, TransactionSentByUser, UserReceiptTransaction, UserTransaction } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, readonly, ref } from 'vue'
import { useFastspotApiV2 } from '@/composables/useFastspotV2'
import { useLogger } from '@/composables/useLogger'

import { useTransactionSearch } from '@/composables/useTransactionSearch'
import { i18n } from '@/i18n/i18n-setup'
import { nakaBufferAddresses } from '@/lib'
import { DEFAULT_LIMIT, SQLQuery } from '@/lib/sql-queries'
import { getSignedTx, toAccountType } from '@/lib/tx'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'
import { isExternalTx, MerchantCategory, PaymentMethod, Rail, Transfer } from '@/types/transactions'

const logger = useLogger('transactions.ts')
const { isSendingTx } = storeToRefs(useLocks())

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

  const { updateActiveRemoteBalance } = useRemoteSigner()
  const { remoteBalance } = storeToRefs(useRemoteSigner())

  const transactions = ref<ExternalTransaction[]>([])

  /**
   * Select transactions from the database using a basic pagination system. Loads the newest transactions first.
   * If you need to load more transactions, use loadMoreTxs.
   */
  async function selectTxs(options?: DbPagination) {
    const txs = await query<ExternalTransaction[]>(SQLQuery.SelectPaginationTransactions, [options?.limit || DEFAULT_LIMIT, options?.offset || 0])
    // TODO: Temporary, don't handle tx from HTLCs if tx is UserReceiptTransaction
    const filteredTxs = txs.filter((tx) => {
      if (tx.transfer === Transfer.UserReceipt)
        return tx.senderType !== Nimiq.AccountType.HTLC
      else
        return true
    })

    // Convert JSON strings to objects
    txs.forEach((tx) => {
      tx.invoiced = tx.invoiced ? JSON.parse(tx.invoiced as unknown as string) as { amount: number, currency: string } : undefined
      tx.meta = tx.meta ? JSON.parse(tx.meta as unknown as string) as Record<string, any> : undefined
    })

    logger.log(`📚 Selected ${txs.length} transactions`, txs)

    logger.log(`📚 Filtered ${filteredTxs.length} transactions`, filteredTxs)
    return filteredTxs
  }

  async function upsertTx(tx: Transaction) {
    logger.log(`📚 Upsert-ing transaction`, tx)
    await run(
      SQLQuery.UpsertTx,
      // Note: we're storing the original tx.title here and not the translated title. It's translated then at display
      // time to whatever language the user has selected at that time.
      [tx.hash, tx.timestamp, tx.sender, tx.senderType, tx.recipient, tx.recipientType, tx.amount, tx.fee, tx.status, tx.raw, tx.title, tx.transfer, tx.message, tx.rail, tx.railMerchantId, tx.merchantName, tx.merchantCategory, tx.paymentRef, tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap ? tx.paymentMethod : null, tx.fiatAmount, tx.fiatFeeAmount, tx.fiatCurrency, tx.isCashbackClaimed, tx.invoiced ? JSON.stringify(tx.invoiced) : null, tx.meta ? JSON.stringify(tx.meta) : null],
    )
  }

  async function clearTxHistory() {
    await run(SQLQuery.ClearTxHistory)
  }

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<{ tx: TransactionSentByUser, serialized: string }, string> {
    if (isSendingTx.value) {
      logger.error('A transaction is already in progress')
      return { data: undefined, error: i18n.t('A transaction is already in progress') }
    }
    isSendingTx.value = true
    const res = await _sendTx(partialTx)
    isSendingTx.value = false
    return res
  }

  async function _sendTx(partialTx: PartialSendTxArgs): AsyncResult<{ tx: TransactionSentByUser, serialized: string }, string> {
    logger.log('✈️  Preparing new transaction', {
      partialTx,
      remoteAddress: useRemoteSigner().remoteAddress?.toUserFriendlyAddress(),
      remoteBalance: useRemoteSigner().remoteBalance,
      remoteHeight: useRemoteSigner().remoteHeight,
      remotePublicKey: useRemoteSigner().remotePublicKey,
      remoteProofSize: useRemoteSigner().remoteProofSize,
      localAddress: useLocalWallet().localAddress.toUserFriendlyAddress(),
      localBalance: useLocalWallet().localBalance,
    })
    // Require consensus for all transactions that involve the local wallet
    if (partialTx.transfer === Transfer.LocalToRemote || partialTx.transfer === Transfer.ExtendRemote || partialTx.transfer === Transfer.RemoteToLocalAfterTimeout || partialTx.transfer === Transfer.RemoteToLocalImmediateReclaim)
      client.value!.waitForConsensusEstablished()

    const res = await getSignedTx(partialTx)
    if (res.error) {
      logger.error('Error while signing transaction', res.error)
      return res
    }
    logger.log('✈️ Signed transaction', res.data)
    const { signedTx, swap } = res.data!

    let patchedSwap: Promise<Swap> | undefined
    if (swap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
      // Signal the signed transaction to Fastspot as early as possible
      logger.log('Signaling signed transaction to Fastspot', { swap })
      const { provideFundingProof } = await useFastspotApiV2()
      patchedSwap = provideFundingProof(
        partialTx.paymentRef!,
        swap!.contracts.NIM!.id,
        signedTx.toHex(),
      )

      // Enter the swap HTLC into the database, to make sure we have it in case we need to refund it later
      await run(
        SQLQuery.InsertSwapHtlc,
        [
          signedTx.recipient.toUserFriendlyAddress(),
          Number(signedTx.value),
          (swap.contracts.NIM!.htlc as NimHtlcDetails).timeoutTime,
          swap.id,
          swap.status,
        ],
      )
    }

    // Check if the tx is already in the transaction list
    if (transactions.value.some(tx => tx.hash === signedTx.hash())) {
      logger.error('Transaction already sent', signedTx)
      return { data: undefined, error: i18n.t('Transaction already sent') }
    }

    if (!res.data!.txSent) {
      logger.error('Transaction not sent by the cosigner, sending again', signedTx.toPlain())
      await client.value!.waitForConsensusEstablished()
      const details = await client.value!.sendTransaction(signedTx)
      if (details.state === 'invalidated') {
        // Transaction was rejected by the mempool
        logger.error('Transaction invalid', details)

        if (swap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
          const serverSwap = await patchedSwap?.catch(() => undefined)
          if (!serverSwap || !serverSwap.preimage) {
            // Delete the swap HTLC from the database
            await run(SQLQuery.DeleteSwapHtlc, [signedTx.recipient.toUserFriendlyAddress()])
          }
        }

        return { data: undefined, error: i18n.t('Transaction invalid') }
      }
    }

    if (partialTx.transfer === Transfer.LocalToRemote || partialTx.transfer === Transfer.ExtendRemote || partialTx.transfer === Transfer.RemoteToLocalAfterTimeout || partialTx.transfer === Transfer.RemoteToLocalImmediateReclaim) {
      await client.value!.waitForConsensusEstablished()
      const details = useSync().pendingPaymentTransactions.find(tx => tx.transactionHash === signedTx.hash()) || await client.value!.sendTransaction(signedTx)

      if (partialTx.transfer === Transfer.LocalToRemote || partialTx.transfer === Transfer.ExtendRemote) {
        if (details) {
          const plain = details
          const htlcData = details.data
          await useRemoteSigner().updateRemoteSigner({
            active: true,
            balance: plain.value,
            publicKey: useRemoteSigner().remotePublicKey!,
            start: plain.timestamp || await useRemoteSigner().blockHeightToTimestamp(plain.validityStartHeight),
            address: Nimiq.Address.fromUserFriendlyAddress(plain.recipient),
            end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
            // proofSize: tx.proofSize,
            // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
            proofSize: useRemoteSigner().remoteProofSize,
          })
          if (partialTx.transfer === Transfer.LocalToRemote) {
            useSync().pendingHtlcCreationTransactions.push(details)
          }
        }
        else {
          logger.error('Transaction details are undefined, cannot update remote signer', partialTx)
        }
      }
    }

    if (signedTx.networkId !== useNimiqNetwork().networkId) {
      logger.error('Transaction invalid for PoS network', { networkId: signedTx.networkId, expectedNetworkId: useNimiqNetwork().networkId, signedTx })
      return { data: undefined, error: i18n.t('Transaction invalid for PoS network') }
    }
    logger.log('✈️ Sent transaction', signedTx.toPlain())
    const { fee, transactionHash: hash, recipient, sender, value: amount } = signedTx.toPlain()
    const raw = Nimiq.BufferUtils.toHex(signedTx.serializeContent())
    const message = partialTx.transfer === Transfer.UserPaymentToMerchant || partialTx.transfer === Transfer.UserPaymentToAtomicSwap ? partialTx.message : ''
    const status = 'pending'

    const tx = { ...partialTx, fee, recipient, recipientType: signedTx.recipientType, status, hash, sender, senderType: signedTx.senderType, amount, raw, message, proofSize: signedTx.proof.length } as TransactionSentByUser
    if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
      tx.paymentMethod = PaymentMethod.NIM

    if (!tx.timestamp)
      tx.timestamp = Date.now()
    logger.log(`✈️ Sent transaction`, tx)

    await upsertTx(tx)

    if (isExternalTx(tx))
      transactions.value.unshift(tx)

    if (tx.transfer === Transfer.RemoteToLocal || tx.transfer === Transfer.RemoteToLocalAfterTimeout || tx.transfer === Transfer.RemoteToLocalImmediateReclaim) {
      // This transaction will drain the remote signer, so we need to deactivate it and wait for a new one
      await useRemoteSigner().updateRemoteSigner(undefined)
    }
    else {
      await updateActiveRemoteBalance(remoteBalance.value - tx.amount)
    }

    if (patchedSwap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
      // Wait for swap to complete
      const secret = (await patchedSwap.catch(() => undefined))?.preimage || await new Promise<string>((resolve) => {
        let timeoutId: number
        async function checkSecret() {
          const { getSwap } = await useFastspotApiV2()
          const swap = await getSwap((partialTx as MerchantTransaction).paymentRef)
          if ('preimage' in swap && swap.preimage) {
            window.clearTimeout(timeoutId)
            resolve(swap.preimage)
          }
          else {
            timeoutId = window.setTimeout(checkSecret, 1e3) // Check every second
          }
        }

        // Start checking for the secret
        checkSecret()
      })

      // Store secret in the transaction and database
      tx.meta = { secret }
      tx.status = 'confirmed' // If we already have a secret, that means the BTC LN were already received
      await upsertTx(tx)
      // The transaction we are looking for is most likey still the first one, so not much overhead
      const index = transactions.value.findIndex(tx => tx.hash === hash)
      transactions.value[index].meta = {
        secret,
      }
      // Delete the swap HTLC from the database
      await run(SQLQuery.DeleteSwapHtlc, [tx.recipient])
      // Delete the swap quote from the database
      await run(SQLQuery.DeleteSwapQuote, [tx.paymentRef])
    }

    return { data: { tx, serialized: signedTx.toHex() }, error: undefined }
  }

  const { filteredTransactions, searchQuery, allTransactions } = useTransactionSearch()

  onMounted(async () => {
    transactions.value = await selectTxs()
  })

  async function addReceiptTransaction(tx: UserReceiptTransaction) {
    await upsertTx(tx)
    // Don't add tx to the transaction list if it came from an HTLC
    if (tx.senderType !== Nimiq.AccountType.HTLC)
      addTransaction(tx)
  }

  async function addPaymentToMerchantTransaction(tx: MerchantTransaction) {
    await upsertTx(tx)
    addTransaction(tx)
  }

  async function addUnknownPaymentToMerchantTransaction(
    tx: PlainTransactionDetails,
    transfer = Transfer.UserPaymentToMerchant,
    rail = Rail.Unknown,
    paymentRef = '',
    invoiced?: {
      amount: number
      currency: string
    },
    meta?: Record<string, any>,
  ) {
    const newTx = {
      transfer,
      amount: tx.value,
      sender: tx.sender,
      senderType: toAccountType(tx.senderType),
      recipient: tx.recipient,
      recipientType: toAccountType(tx.recipientType),
      hash: tx.transactionHash,
      status: tx.state,
      timestamp: tx.timestamp,
      title: 'Payment', // translated at display time
      fee: tx.fee,
      // proofSize: 'raw' in tx.proof ? tx.proof.raw.length / 2 : 0,
      // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
      proofSize: useRemoteSigner().remoteProofSize,
      isCashbackClaimed: true,
      merchantName: '',
      paymentMethod: PaymentMethod.NIM,
      paymentRef,
      fiatAmount: 0,
      fiatCurrency: '',
      fiatFeeAmount: 0,
      merchantCategory: MerchantCategory.Shop,
      rail,
      invoiced,
      meta,
    } as MerchantTransaction
    await upsertTx(newTx)
    addTransaction(newTx)
  }

  async function addWithdrawalTransaction(tx: UserTransaction) {
    await upsertTx(tx)
    addTransaction(tx)
  }

  function addTransaction(tx: ExternalTransaction) {
    transactions.value = [tx, ...transactions.value].sort(
      (a, b) => (b.timestamp || Number.MAX_SAFE_INTEGER) - (a.timestamp || Number.MAX_SAFE_INTEGER),
    )
  }

  async function updateTransactionStatus({ hash, status, timestamp }: { hash: string, status: TransactionState, timestamp: number | undefined }) {
    await run(SQLQuery.UpdateTxStatus, [status, timestamp, hash])
    const tx = transactions.value.find(tx => tx.hash === hash)
    if (tx) {
      tx.status = status
      tx.timestamp = timestamp
    }
  }

  async function updateTransactionCashbackClaimed({ hash }: { hash: string }) {
    await run(SQLQuery.UpdateCashbackStatus, [true, hash])
    const tx = transactions.value.find(tx => tx.hash === hash)
    if (tx)
      tx.isCashbackClaimed = true
  }

  async function setSwapHtlcRefunded(htlcAddress: string) {
    const tx = transactions.value.find(tx => tx.recipient === htlcAddress)
    if (tx) {
      tx.meta = {
        ...tx.meta,
        refunded: true,
      }
      await upsertTx(tx)
    }
  }

  async function setNakaTxRefunded(amount: number) {
    const tx = transactions.value.find(tx => tx.amount === amount && nakaBufferAddresses.includes(tx.recipient))
    if (tx) {
      tx.meta = {
        ...tx.meta,
        refunded: true,
      }
      await upsertTx(tx)
    }
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
    addUnknownPaymentToMerchantTransaction,
    addWithdrawalTransaction,
    updateTransactionStatus,
    updateTransactionCashbackClaimed,
    setSwapHtlcRefunded,
    setNakaTxRefunded,
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
