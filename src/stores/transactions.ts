import type { PlainTransactionDetails } from '@nimiq/core'
import type { NimHtlcDetails } from '@nimiq/fastspot-api-v1'
import type { Swap } from '@nimiq/fastspot-api-v2'
import type { DbPagination } from '@/lib/sql-queries'
import type { AsyncResult } from '@/types'
import type { AppTransactionState, ExternalTransaction, MerchantTransaction, PartialSendTxArgs, StakingTransaction, Transaction, TransactionSentByUser, TransactionTitle, UserReceiptTransaction, UserTransaction } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, shallowRef, watch } from 'vue'
import { useFastspotApiV2 } from '@/composables/useFastspotV2'
import { useLogger } from '@/composables/useLogger'

import { useTransactionSearch } from '@/composables/useTransactionSearch'
import { i18n } from '@/i18n/i18n-setup'
import { nakaBufferAddresses } from '@/lib'
import { Asset, Chain } from '@/lib/assets'
import { DEFAULT_LIMIT, SQLQuery } from '@/lib/sql-queries'
import { getSignedTx, toAccountType } from '@/lib/tx'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'
import { isExternalTx, MerchantCategory, PaymentMethod, Rail, Transfer } from '@/types/transactions'

const logger = useLogger('transactions.ts')
const { isSendingTx } = storeToRefs(useLocks())

export function getSwapHtlcKey(tx: Pick<ExternalTransaction, 'chain' | 'hash' | 'recipient'>) {
  return tx.chain === Chain.Polygon ? tx.hash : tx.recipient
}

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
  const { activeAsset } = storeToRefs(useApp())

  const { updateActiveRemoteBalance } = useRemoteSigner()
  const { remoteBalance } = storeToRefs(useRemoteSigner())

  const transactions = shallowRef<ExternalTransaction[]>([])

  /**
   * Select transactions from the database using a basic pagination system. Loads the newest transactions first.
   * If you need to load more transactions, use loadMoreTxs.
   */
  async function selectTxs(options?: DbPagination) {
    const txs = await query<ExternalTransaction[]>(SQLQuery.SelectPaginationTransactionsByAsset, [activeAsset.value, options?.limit || DEFAULT_LIMIT, options?.offset || 0])
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
      [
        tx.hash,
        tx.timestamp,
        tx.sender,
        tx.senderType,
        tx.recipient,
        tx.recipientType,
        tx.amount,
        tx.fee,
        tx.status,
        tx.raw,
        tx.title,
        tx.transfer,
        tx.message,
        tx.rail,
        tx.railMerchantId,
        tx.merchantName,
        tx.merchantCategory,
        tx.paymentRef,
        tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap
          ? tx.paymentMethod
          : null,
        tx.fiatAmount,
        tx.fiatFeeAmount,
        tx.fiatCurrency,
        tx.isCashbackClaimed,
        tx.asset || Asset.NIM,
        tx.chain || Chain.Nimiq,
        tx.invoiced
          ? JSON.stringify(tx.invoiced)
          : null,
        tx.meta
          ? JSON.stringify(tx.meta)
          : null,
        tx.senderData ? Nimiq.BufferUtils.toHex(tx.senderData) : null,
        tx.recipientData ? Nimiq.BufferUtils.toHex(tx.recipientData) : null,
      ],
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
    // TODO: check if tx is valid before continuing
    logger.log('✈️ Signed transaction', { signedTx: res.data!.signedTx.toPlain(), isValid: res.data!.signedTx.toPlain().valid, swap: res.data!.swap, txSent: res.data!.txSent })
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

    const tx = { ...partialTx, fee, recipient, recipientType: signedTx.recipientType, status, hash, sender, senderType: signedTx.senderType, amount, raw, message, proofSize: signedTx.proof.length, asset: Asset.NIM, chain: Chain.Nimiq } as TransactionSentByUser
    if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
      tx.paymentMethod = PaymentMethod.NIM

    if (!tx.timestamp)
      tx.timestamp = Date.now()
    logger.log(`✈️ Sent transaction`, tx)

    await upsertTx(tx)

    if (isExternalTx(tx))
      // Not using unshift to keep reactivity
      transactions.value = [tx, ...transactions.value]

    if (tx.transfer === Transfer.RemoteToLocal || tx.transfer === Transfer.RemoteToLocalAfterTimeout || tx.transfer === Transfer.RemoteToLocalImmediateReclaim) {
      // This transaction will drain the remote signer, so we need to deactivate it and wait for a new one
      await useRemoteSigner().updateRemoteSigner(undefined)
    }
    else if (tx.transfer !== Transfer.LocalToRemote && tx.transfer !== Transfer.ExtendRemote) {
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

  const activeAssetTransactions = computed(() => transactions.value.filter(tx => (tx.asset || Asset.NIM) === activeAsset.value))
  const { filteredTransactions, searchQuery, allTransactions } = useTransactionSearch(activeAssetTransactions)

  /**
   * Reload transactions from DB, merging with any in-memory transactions
   * that might not have been persisted yet (e.g. pending transactions).
   * This ensures the in-memory list stays in sync with the database.
   */
  async function refreshFromDb() {
    const dbTxs = await query<ExternalTransaction[]>(SQLQuery.SelectTransactionsByAsset, [activeAsset.value])
    dbTxs.forEach((tx) => {
      tx.invoiced = tx.invoiced ? JSON.parse(tx.invoiced as unknown as string) as { amount: number, currency: string } : undefined
      tx.meta = tx.meta ? JSON.parse(tx.meta as unknown as string) as Record<string, any> : undefined
    })
    const knownHashes = new Set(dbTxs.map(tx => tx.hash))
    // Keep any in-memory transactions not yet in DB (e.g. just-added pending txs)
    const memoryOnlyTxs = activeAssetTransactions.value.filter(tx => !knownHashes.has(tx.hash))
    transactions.value = [...dbTxs, ...memoryOnlyTxs].sort(
      (a, b) => (b.timestamp || Number.MAX_SAFE_INTEGER) - (a.timestamp || Number.MAX_SAFE_INTEGER),
    )
  }

  watch(activeAsset, async () => {
    await refreshFromDb()
  }, { immediate: true })

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
      asset: Asset.NIM,
      chain: Chain.Nimiq,
    } as MerchantTransaction
    await upsertTx(newTx)
    addTransaction(newTx)
  }

  async function addPaymentTransaction(tx: UserTransaction) {
    await upsertTx(tx)
    addTransaction(tx)
  }

  async function addWithdrawalTransaction(tx: UserTransaction) {
    await upsertTx(tx)
    addTransaction(tx)
  }

  async function addStakingtransaction(tx: StakingTransaction) {
    await upsertTx(tx)
    addTransaction(tx)
  }

  async function replaceTransaction(tx: ExternalTransaction) {
    await upsertTx(tx)
    const index = transactions.value.findIndex(existingTx => existingTx.hash === tx.hash)
    if (index >= 0) {
      const nextTransactions = [...transactions.value]
      nextTransactions[index] = tx
      transactions.value = nextTransactions.sort(
        (a, b) => (b.timestamp || Number.MAX_SAFE_INTEGER) - (a.timestamp || Number.MAX_SAFE_INTEGER),
      )
      return
    }

    addTransaction(tx)
  }

  function addTransaction(tx: ExternalTransaction) {
    transactions.value = [tx, ...transactions.value].sort(
      (a, b) => (b.timestamp || Number.MAX_SAFE_INTEGER) - (a.timestamp || Number.MAX_SAFE_INTEGER),
    )
  }

  async function updateTransactionStatus({ hash, status, timestamp }: { hash: string, status: AppTransactionState, timestamp: number | undefined }) {
    await run(SQLQuery.UpdateTxStatus, [status, timestamp, hash])
    const index = transactions.value.findIndex(tx => tx.hash === hash)
    if (index >= 0) {
      const nextTransactions = [...transactions.value]
      nextTransactions[index] = {
        ...nextTransactions[index],
        status,
        timestamp,
      }
      transactions.value = nextTransactions.sort(
        (a, b) => (b.timestamp || Number.MAX_SAFE_INTEGER) - (a.timestamp || Number.MAX_SAFE_INTEGER),
      )
    }
  }

  async function updateTransactionTitle({ hash, title }: { hash: string, title: TransactionTitle }) {
    await run(SQLQuery.UpdateTxTitle, [title, hash])
    const index = transactions.value.findIndex(tx => tx.hash === hash)
    if (index >= 0) {
      const nextTransactions = [...transactions.value]
      nextTransactions[index] = {
        ...nextTransactions[index],
        title,
      }
      transactions.value = nextTransactions
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
    if (activeAssetTransactions.value.length === 0)
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
    addPaymentTransaction,
    addWithdrawalTransaction,
    addStakingtransaction,
    replaceTransaction,
    updateTransactionStatus,
    updateTransactionTitle,
    updateTransactionCashbackClaimed,
    setSwapHtlcRefunded,
    setNakaTxRefunded,
    clearTxHistory,
    refreshFromDb,

    // Search for transactions
    transactionsToShow: computed(() => searchQuery.value ? filteredTransactions.value : activeAssetTransactions.value),
    activeAssetTransactions,
    allTransactions,
    filteredTransactions,
    searchQuery,

    status,

    // Function to run when the user scrolls to the bottom of the list
    loadMoreTxs: async () => {
      const nextTransactions = await selectTxs({ offset: activeAssetTransactions.value.length })
      const knownHashes = new Set(activeAssetTransactions.value.map(tx => tx.hash))
      const newTransactions = nextTransactions.filter(tx => !knownHashes.has(tx.hash))
      if (newTransactions.length)
        transactions.value = [...transactions.value, ...newTransactions]
    },

    // A function that returns true if there are more transactions to load
    // FIXME: This is not exactly true, because if there is exactly DEFAULT_LIMIT transactions, it will return true, but there are no more transactions to load
    canLoadMore: () => searchQuery.value ? false : activeAssetTransactions.value.length % DEFAULT_LIMIT === 0,
  }
})
