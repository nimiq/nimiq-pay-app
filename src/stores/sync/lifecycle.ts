import type { PlainTransactionDetails } from '@nimiq/core'
import type { WalletContext } from '@/stores/remote-signer'
import type { ExternalTransaction } from '@/types/transactions'
import { useTimeoutFn, useTimeoutPoll } from '@vueuse/core'
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
import { sameWalletContext, useRemoteSigner } from '@/stores/remote-signer'
import { useSyncBalances } from '@/stores/sync/balances'
import { useSyncHtlc } from '@/stores/sync/htlc'
import { useSyncRemoteSigners } from '@/stores/sync/remote-signers'
import { useSyncState } from '@/stores/sync/state'
import { isOwnHtlcDrain, useSyncTransactions } from '@/stores/sync/transactions'
import { useTransactions } from '@/stores/transactions'

const logger = useLogger('useSync')

export const useSyncLifecycle = defineStore('sync-lifecycle', () => {
  const { client, height: localHeight, consensus, networkName } = storeToRefs(useNimiqNetwork())
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { remoteHeight, remoteBalance, remoteAddress, isHtlcActive, homeBalanceState } = storeToRefs(useRemoteSigner())
  const { getWalletContext, isWalletContextCurrent } = useRemoteSigner()
  const { isProcessingRemote, isSyncingWallets, headChangePendingDrainLock, headChangeUpdatesLock } = storeToRefs(useLocks())
  const { updateBalances } = useSyncBalances()
  const { handleFunds, checkRemoteValidity, extendValidity, checkHtlcState, checkExpiredSwapHtlcs, maybeCheckHtlcState } = useSyncHtlc()
  const { verifyRemoteSignersDb } = useSyncRemoteSigners()
  const { updateSingleTransaction, updateTransactionHistory, updateTransactionsInDb } = useSyncTransactions()
  const syncState = useSyncState()
  const { pendingTransactions, pendingPaymentTransactions, pendingRemoteDrainTxs, isTransactionPending, nodesAreSynced, walletContextGeneration } = storeToRefs(syncState)

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
    await useTransactions().refreshFromDb()
    if (client.value && consensus.value === 'established')
      await updateBalances()
  }, 30_000, { immediate: false })

  interface ListenerHandle {
    client: NonNullable<typeof client.value>
    id: number
  }

  type OnlineSyncContext = WalletContext

  let pendingDrainHeadListener: ListenerHandle | undefined
  let updatesHeadListener: ListenerHandle | undefined
  let localTransactionListener: ListenerHandle | undefined
  let remoteAddressListener: ListenerHandle | undefined
  let remoteAddressListenerGeneration = 0
  let completedOnlineSyncContext: OnlineSyncContext | undefined

  function getOnlineSyncContext(): OnlineSyncContext | undefined {
    return consensus.value === 'established' ? getListenerContext() : undefined
  }

  function getListenerContext(): OnlineSyncContext | undefined {
    if (!hasLocalWallet.value || !client.value)
      return undefined
    return getWalletContext()
  }

  function isListenerContextCurrent(context: OnlineSyncContext) {
    return hasLocalWallet.value && isWalletContextCurrent(context)
  }

  function isOnlineSyncContextCurrent(context: OnlineSyncContext) {
    return consensus.value === 'established' && isListenerContextCurrent(context)
  }

  async function runOnlineSync(
    context: OnlineSyncContext,
    isCurrent: () => boolean = () => isOnlineSyncContextCurrent(context),
  ) {
    if (!isCurrent())
      return false
    if (!await registerWalletListeners(context, isCurrent))
      return false
    logger.log('Updating balances')
    await updateBalances()
    if (!isCurrent())
      return false
    // Surface cached/history txs ASAP — don't block first paint on remote-signer verification (APP-159)
    void updateTransactionHistory()
    await useRemoteSigner().resolveHomeBalanceState()
    if (!isCurrent())
      return false

    // Initial reconciliation can finish before signer hydration. Unblock deposits before history verification.
    await checkHtlcState()
    if (!isCurrent())
      return false

    logger.log('Verifying remote signers in DB')
    await verifyRemoteSignersDb()
    if (!isCurrent())
      return false

    logger.log(`🧬 Starting to sync wallets. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
    await Promise.all([handleFunds(), checkRemoteValidity(), extendValidity()])
    if (!isCurrent())
      return false
    startPeriodicTransactionRefresh()
    return isCurrent()
  }

  let readinessSyncPromise: Promise<void> | undefined
  let readinessSyncQueued = false

  /**
   * Syncs the local and the remote wallet immediately and then every time a new block is minted.
   */
  async function syncWallets() {
    logger.log('Starting wallet sync process', { hasLocalWallet: hasLocalWallet.value })
    if (!hasLocalWallet.value)
      return

    // Pinia survives an in-app logout/login, but pending work belongs to one wallet only.
    syncState.setWalletContext(localAddress.value.toUserFriendlyAddress(), networkName.value)

    if (isMockEnabled) {
      logger.log('🎭 Mock mode: skipping wallet sync, loading mock data')
      const { loadMockData } = await import('@/lib/mock-data')
      await loadMockData()
      return
    }

    isSyncingWallets.value = true
    try {
      // Polygon startup must not wait for Nimiq readiness or recovery.
      usePolygonSync().init().catch(error => logger.error('Failed to initialize Polygon sync', error))
      await readinessSyncPromise
      logger.log('Hydrating wallet state from DB')
      const restored = await useTransactions().restorePendingOutgoingTransactions()
      startPeriodicDbRefresh()
      if (!restored)
        return
      await Promise.all([
        checkHtlcState(),
        useRemoteSigner().init(),
      ])
      const context = getOnlineSyncContext()
      if (context && await runOnlineSync(context))
        completedOnlineSyncContext = context
    }
    finally {
      isSyncingWallets.value = false
    }
  }

  async function registerWalletListeners(
    context: OnlineSyncContext,
    isCurrent: () => boolean = () => isOnlineSyncContextCurrent(context),
  ) {
    await removeListener(pendingDrainHeadListener)
    await removeListener(updatesHeadListener)
    await removeListener(localTransactionListener)
    pendingDrainHeadListener = undefined
    updatesHeadListener = undefined
    localTransactionListener = undefined
    if (!isCurrent())
      return false

    const registeringClient = context.client
    const pendingDrainId = await registeringClient.addHeadChangedListener(async () => {
      if (!isListenerContextCurrent(context) || headChangePendingDrainLock.value)
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
    if (!isCurrent()) {
      await registeringClient.removeListener(pendingDrainId)
      return false
    }
    pendingDrainHeadListener = { client: registeringClient, id: pendingDrainId }

    const updatesId = await registeringClient.addHeadChangedListener(async () => {
      if (!isListenerContextCurrent(context))
        return

      if (headChangeUpdatesLock.value)
        return
      headChangeUpdatesLock.value = true

      try {
        // Included payments release the send lock, but still need finality/rejection updates.
        const unconfirmed = await useConn().query<{ hash: string }[]>(SQLQuery.SelectUnconfirmedNimPayments)
        if (!isListenerContextCurrent(context)) {
          headChangeUpdatesLock.value = false
          return
        }
        const hashes = new Set([
          ...pendingTransactions.value.map(tx => tx.transactionHash),
          ...unconfirmed.map(tx => tx.hash),
        ])
        for (const hash of hashes)
          await updateSingleTransaction(hash)
      }
      catch (error) {
        logger.error('Error checking pending transactions', error)
      }

      try {
        if (!isTransactionPending.value && localHeight.value % (5 * Nimiq.Policy.BLOCKS_PER_BATCH) === 0)
          await verifyRemoteSignersDb()
        else if (remoteBalance.value === 0 && localHeight.value % 10 === 0)
          await verifyRemoteSignersDb()

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
    if (!isCurrent()) {
      await registeringClient.removeListener(updatesId)
      await removeListener(pendingDrainHeadListener)
      pendingDrainHeadListener = undefined
      return false
    }
    updatesHeadListener = { client: registeringClient, id: updatesId }

    const localTransactionId = await registeringClient.addTransactionListener(
      (tx: PlainTransactionDetails) => {
        if (!isListenerContextCurrent(context))
          return
        return handleIncomingTransaction(tx, context)
      },
      [localAddress.value],
    )
    if (!isCurrent()) {
      await registeringClient.removeListener(localTransactionId)
      await removeListener(pendingDrainHeadListener)
      await removeListener(updatesHeadListener)
      pendingDrainHeadListener = undefined
      updatesHeadListener = undefined
      return false
    }
    localTransactionListener = { client: registeringClient, id: localTransactionId }
    return true
  }

  async function handleIncomingTransaction(tx: PlainTransactionDetails, context: OnlineSyncContext) {
    if (!isListenerContextCurrent(context))
      return
    logger.log(`📬 New ${tx.state} transaction received`, tx)

    if (tx.sender === context.owner || (remoteAddress.value && tx.sender === remoteAddress.value.toUserFriendlyAddress()))
      return

    if (tx.recipientType === 'staking' && tx.data.type === 'add-stake' && (!remoteAddress.value || tx.sender !== remoteAddress.value.toUserFriendlyAddress()))
      return

    // Any already-recorded transfer — see the matching note in updateTransactionHistory.
    const dbTxs: ExternalTransaction[] = await useConn().query(SQLQuery.SelectAllTransactions)
    if (!isListenerContextCurrent(context))
      return
    const hash = tx.transactionHash
    if (dbTxs.some(dbTx => dbTx.hash === hash))
      return

    // Offer the HTLC for registration first — it only accepts our own contract shape. 'foreign'
    // falls through to the receipt path below. 'unknown' means the shape couldn't be read this
    // round (e.g. a timed-out creation-tx query): recording now could never be retracted, so wait
    // rather than guess — the next refresh will retry.
    if (isOwnHtlcDrain(tx, context.owner)) {
      const claim = await useRemoteSigner().registerOwnHtlcIfMissing(tx.sender, context)
      if (!isListenerContextCurrent(context))
        return
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
      if (isListenerContextCurrent(context))
        await useTransactions().setNakaTxRefunded(tx.value)
      return
    }

    const receipt = await buildTopUpReceipt(tx)
    if (!isListenerContextCurrent(context))
      return
    await useTransactions().addReceiptTransaction(receipt, context)
    if (!isListenerContextCurrent(context))
      return
    trackTopUpReceived(receipt, useRemoteSigner().remoteBalance)
    // Real-time only: refresh / history paths must NOT fire the notifier.
    void useNotifications().scheduleIncomingPaymentNotification(receipt)
  }

  async function removeListener(listener: ListenerHandle | undefined) {
    if (!listener)
      return
    await listener.client.removeListener(listener.id)
  }

  async function syncAfterReadiness() {
    if (readinessSyncPromise) {
      readinessSyncQueued = true
      return readinessSyncPromise
    }

    readinessSyncPromise = (async () => {
      do {
        readinessSyncQueued = false
        const context = getOnlineSyncContext()
        if (!context || (completedOnlineSyncContext && sameWalletContext(context, completedOnlineSyncContext)))
          continue
        const isCurrentReadiness = () => !isSyncingWallets.value && isOnlineSyncContextCurrent(context)
        try {
          await useRemoteSigner().init()
          if (!isCurrentReadiness())
            continue
          if (!await useTransactions().restorePendingOutgoingTransactions())
            continue
          if (!isCurrentReadiness())
            continue

          const pendingHashes = [
            ...pendingTransactions.value.map(tx => tx.transactionHash),
            ...pendingRemoteDrainTxs.value.map(tx => tx.hash),
          ]
          await Promise.all([
            checkHtlcState(),
            ...pendingHashes.map(hash => updateSingleTransaction(hash)),
          ])
          if (await runOnlineSync(context, isCurrentReadiness))
            completedOnlineSyncContext = context
        }
        catch (error) {
          logger.error('Error completing wallet sync after readiness', error)
        }
      } while (readinessSyncQueued)
    })().finally(() => {
      readinessSyncPromise = undefined
    })
    return readinessSyncPromise
  }

  watch(
    [client, consensus, isSyncingWallets],
    async ([currentClient, currentConsensus, syncing]) => {
      if (
        syncing
        || !hasLocalWallet.value
        || !currentClient
        || currentConsensus !== 'established'
      ) {
        return
      }
      await syncAfterReadiness()
    },
    { immediate: true },
  )

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

  watch(localHeight, async () => {
    if (isSyncingWallets.value)
      return
    await readinessSyncPromise
    if (isSyncingWallets.value)
      return
    await maybeCheckHtlcState()
  })

  watch([remoteAddress, client, localAddress, networkName, walletContextGeneration], async () => {
    const registrationGeneration = ++remoteAddressListenerGeneration
    const previousListener = remoteAddressListener
    remoteAddressListener = undefined
    await removeListener(previousListener)
    const context = getListenerContext()
    const registeredRemoteAddress = remoteAddress.value
    if (!registeredRemoteAddress || !context)
      return
    const registeredRemoteAddressString = registeredRemoteAddress.toUserFriendlyAddress()
    const isRegisteredRemoteAddressCurrent = () => remoteAddress.value?.toUserFriendlyAddress() === registeredRemoteAddressString

    const listenerId = await context.client.addTransactionListener(async (tx: PlainTransactionDetails) => {
      if (!isListenerContextCurrent(context) || !isRegisteredRemoteAddressCurrent())
        return
      logger.log(`📬 New transaction from remote received`, tx)
      pendingPaymentTransactions.value.push(tx)
      try {
        await updateSingleTransaction(tx.transactionHash, tx)
      }
      catch (error) {
        logger.error('Failed to reconcile remote transaction', { hash: tx.transactionHash, executionResult: tx.executionResult ?? null }, error)
      }
    }, [registeredRemoteAddress])
    if (registrationGeneration !== remoteAddressListenerGeneration || !isListenerContextCurrent(context) || !isRegisteredRemoteAddressCurrent()) {
      await context.client.removeListener(listenerId)
      return
    }
    remoteAddressListener = { client: context.client, id: listenerId }
  }, { immediate: true })

  return {
    syncWallets,
  }
})
