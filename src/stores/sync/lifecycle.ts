import type { PlainTransactionDetails } from '@nimiq/core'
import type { UserReceiptTransaction } from '@/types/transactions'
import { until, useTimeoutFn, useTimeoutPoll } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { useNotifications } from '@/composables/useNotifications'
import { usePolygonSync } from '@/composables/usePolygonSync'
import { usePrice } from '@/composables/usePrice'
import { nakaBufferAddresses } from '@/lib'
import { trackTopUpReceived } from '@/lib/analytics'
import { isMockEnabled } from '@/lib/mock-mode'
import { SQLQuery } from '@/lib/sql-queries'
import { buildTopUpReceipt } from '@/lib/tx'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSyncBalances } from '@/stores/sync/balances'
import { useSyncHtlc } from '@/stores/sync/htlc'
import { useSyncRemoteSigners } from '@/stores/sync/remote-signers'
import { useSyncState } from '@/stores/sync/state'
import { isOwnHtlcDrain, useSyncTransactions } from '@/stores/sync/transactions'
import { useTransactions } from '@/stores/transactions'

const logger = useLogger('useSync')

export const useSyncLifecycle = defineStore('sync-lifecycle', () => {
  const { client, height: localHeight, consensus } = storeToRefs(useNimiqNetwork())
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { remoteHeight, remoteBalance, remoteAddress, isHtlcActive, homeBalanceState } = storeToRefs(useRemoteSigner())
  const { isProcessingRemote, isSyncingWallets, headChangePendingDrainLock, headChangeUpdatesLock } = storeToRefs(useLocks())
  const { updateBalances } = useSyncBalances()
  const { handleFunds, checkRemoteValidity, extendValidity, checkHtlcState, checkExpiredSwapHtlcs, maybeCheckHtlcState } = useSyncHtlc()
  const { verifyRemoteSignersDb } = useSyncRemoteSigners()
  const { updateSingleTransaction, updateTransactionHistory, updateTransactionsInDb } = useSyncTransactions()
  const { pendingTransactions, pendingPaymentTransactions, pendingRemoteDrainTxs, isTransactionPending, nodesAreSynced } = storeToRefs(useSyncState())

  const { resume: startPeriodicTransactionRefresh } = useTimeoutPoll(async () => {
    if (!hasLocalWallet.value)
      return

    await updateTransactionHistory()
    await updateTransactionsInDb()
  }, 30_000, { immediate: false })

  // Reloading from DB catches transactions saved outside the in-memory list.
  const { resume: startPeriodicDbRefresh } = useTimeoutPoll(async () => {
    if (!hasLocalWallet.value)
      return
    await Promise.all([
      useTransactions().refreshFromDb(),
      updateBalances(),
    ])
  }, 30_000, { immediate: false })

  let pendingDrainHeadListener: number | undefined
  let updatesHeadListener: number | undefined
  let localTransactionListener: number | undefined
  let remoteAddressListener: number | undefined

  /**
   * Syncs the local and the remote wallet immediately and then every time a new block is minted.
   */
  async function syncWallets() {
    logger.log('Starting wallet sync process', { hasLocalWallet: hasLocalWallet.value })
    if (!hasLocalWallet.value)
      return

    if (isMockEnabled) {
      logger.log('🎭 Mock mode: skipping wallet sync, loading mock data')
      const { loadMockData } = await import('@/lib/mock-data')
      await loadMockData()
      return
    }

    isSyncingWallets.value = true
    logger.log('🔄 Remote Signer initialization')
    await useRemoteSigner().init()
    usePolygonSync().init().catch(error => logger.error('Failed to initialize Polygon sync', error))
    logger.log('Updating balances')
    await updateBalances()
    logger.log('Checking HTLC state and updating transactions in DB')
    await Promise.all([checkHtlcState(), updateTransactionsInDb()])

    startPeriodicDbRefresh()

    logger.log('Waiting for client to be ready')
    await until(client).toBeTruthy()
    logger.log('Waiting for consensus to be established')
    await client.value!.waitForConsensusEstablished()
    // Surface cached/history txs ASAP — don't block first paint on remote-signer verification (APP-159)
    void updateTransactionHistory()
    await useRemoteSigner().resolveHomeBalanceState()

    logger.log('Verifying remote signers in DB')
    await verifyRemoteSignersDb()

    logger.log(`🧬 Starting to sync wallets. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
    await Promise.all([handleFunds(), checkRemoteValidity(), extendValidity()])
    startPeriodicTransactionRefresh()
    await registerWalletListeners()

    isSyncingWallets.value = false
  }

  async function registerWalletListeners() {
    await removeListener(pendingDrainHeadListener)
    await removeListener(updatesHeadListener)
    await removeListener(localTransactionListener)
    pendingDrainHeadListener = undefined
    updatesHeadListener = undefined
    localTransactionListener = undefined

    pendingDrainHeadListener = await client.value?.addHeadChangedListener(async () => {
      if (headChangePendingDrainLock.value)
        return
      headChangePendingDrainLock.value = true

      if (pendingRemoteDrainTxs.value.length > 0) {
        try {
          for (const tx of pendingRemoteDrainTxs.value)
            await updateSingleTransaction(tx.hash)
        }
        catch (error) {
          logger.error('Error checking pending transactions', error)
        }
      }
      headChangePendingDrainLock.value = false
    })

    updatesHeadListener = await client.value?.addHeadChangedListener(async () => {
      if (!isTransactionPending.value && localHeight.value % (5 * Nimiq.Policy.BLOCKS_PER_BATCH) === 0)
        await verifyRemoteSignersDb()
      else if (remoteBalance.value === 0 && localHeight.value % 10 === 0)
        await verifyRemoteSignersDb()

      if (headChangeUpdatesLock.value)
        return
      headChangeUpdatesLock.value = true

      if (pendingTransactions.value.length > 0) {
        try {
          for (const tx of pendingTransactions.value)
            await updateSingleTransaction(tx.transactionHash)
        }
        catch (error) {
          logger.error('Error checking pending transactions', error)
        }
      }

      try {
        await updateBalances()
        await handleFunds()

        if (localHeight.value % Nimiq.Policy.BLOCKS_PER_BATCH === 0)
          await Promise.all([checkRemoteValidity(), extendValidity()])

        if (localHeight.value % 10 === 0)
          await updateTransactionsInDb()
      }
      catch (error) {
        logger.error('Error in headChangeUpdates', error)
      }
      headChangeUpdatesLock.value = false
    })

    localTransactionListener = await client.value?.addTransactionListener(handleIncomingTransaction, [localAddress.value])
  }

  async function handleIncomingTransaction(tx: PlainTransactionDetails) {
    logger.log(`📬 New ${tx.state} transaction received`, tx)

    if (tx.sender === localAddress.value.toUserFriendlyAddress() || (remoteAddress.value && tx.sender === remoteAddress.value.toUserFriendlyAddress()))
      return

    if (tx.recipientType === 'staking' && tx.data.type === 'add-stake' && (!remoteAddress.value || tx.sender !== remoteAddress.value.toUserFriendlyAddress()))
      return

    const dbTxs: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
    const hash = tx.transactionHash
    if (dbTxs.some(dbTx => dbTx.hash === hash))
      return

    // Offer the HTLC for registration first — it only accepts our own contract shape. 'foreign'
    // falls through to the receipt path below. 'unknown' means the shape couldn't be read this
    // round (e.g. a timed-out creation-tx query): recording now could never be retracted, so wait
    // rather than guess — the next refresh will retry.
    if (isOwnHtlcDrain(tx, localAddress.value.toUserFriendlyAddress())) {
      const claim = await useRemoteSigner().registerOwnHtlcIfMissing(tx.sender)
      if (claim === 'ours') {
        logger.log(`🚫 handleIncomingTransaction skipped own-HTLC drain`, { hash, sender: tx.sender, amount: tx.value })
        return
      }
      if (claim === 'unknown') {
        logger.log(`⏳ handleIncomingTransaction deferred own-HTLC drain — shape unreadable this round`, { hash, sender: tx.sender, amount: tx.value })
        return
      }
    }

    logger.log(`📬 Saving ${tx.state} transaction with ${usePrice(tx.value).crypto.formatted}`)

    if (nakaBufferAddresses.includes(tx.sender)) {
      logger.log('NAKA reversal detected, marking matching tx as reversed', { tx })
      return useTransactions().setNakaTxRefunded(tx.value)
    }

    const receipt = await buildTopUpReceipt(tx)
    useTransactions().addReceiptTransaction(receipt)
    trackTopUpReceived(receipt, useRemoteSigner().remoteBalance)
    // Real-time only: refresh / history paths must NOT fire the notifier.
    void useNotifications().scheduleIncomingPaymentNotification(receipt)
  }

  async function removeListener(listener: number | undefined) {
    if (listener === undefined)
      return
    await client.value?.removeListener(listener)
  }

  watch(consensus, (newConsensus, oldConsensus) => {
    if (newConsensus === 'established' && (!oldConsensus || oldConsensus === 'syncing'))
      checkExpiredSwapHtlcs()
  }, { immediate: true })

  watch(localHeight, async (newHeight) => {
    if (newHeight > 1 && newHeight % (10 * Nimiq.Policy.BLOCKS_PER_BATCH) === 0)
      checkExpiredSwapHtlcs()
  })

  watch([remoteBalance, isHtlcActive, homeBalanceState], async ([newBalance, , balanceState], [oldBalance]) => {
    if (balanceState === 'resolved-empty') {
      logger.log('Home balance resolved as empty. Show 0 balance instead of skeleton')
      isProcessingRemote.value = false
      return
    }

    if (newBalance > 0 && isHtlcActive.value) {
      logger.log('Remote signer has funds. Show balance instead of skeleton', { newBalance, oldBalance })
      isProcessingRemote.value = false
    }
  })

  const { isPending: isPendingReconnectNetwork, start: startReconnectNetwork, stop: stopReconnectNetwork } = useTimeoutFn(() => {
    useNimiqNetwork().reconnect()
  }, 30 * 1e3, { immediate: false })
  watch(nodesAreSynced, (synced) => {
    if (consensus.value !== 'established')
      return
    if (synced && isPendingReconnectNetwork.value) {
      logger.log('Nodes are synced. Stopping reconnect network timeout', { localHeight: localHeight.value, remoteHeight: remoteHeight.value, synced, isPending: isPendingReconnectNetwork.value })
      stopReconnectNetwork()
    }
    else if (!synced && !isPendingReconnectNetwork.value && localHeight.value !== -1 && remoteHeight.value !== -1) {
      logger.log('Nodes are not synced. Starting reconnect network timeout', { localHeight: localHeight.value, remoteHeight: remoteHeight.value, synced, isPending: isPendingReconnectNetwork.value })
      startReconnectNetwork()
    }
  }, { immediate: true })

  watch(localHeight, maybeCheckHtlcState)

  watch(remoteAddress, async () => {
    await removeListener(remoteAddressListener)
    remoteAddressListener = undefined
    if (!remoteAddress.value)
      return

    remoteAddressListener = await client.value?.addTransactionListener((tx: PlainTransactionDetails) => {
      logger.log(`📬 New transaction from remote received`, tx)
      pendingPaymentTransactions.value.push(tx)
    }, [remoteAddress.value])
  }, { immediate: true })

  return {
    syncWallets,
  }
})
