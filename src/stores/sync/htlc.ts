import type { Client, PlainAccount, PlainTransactionDetails } from '@nimiq/core'
import type { SwapRefundTracker } from '@/lib/swap-telemetry'
import type { WalletContext } from '@/stores/remote-signer'
import type { SwapHtlc } from '@/types/swapHtlcs'
import type { RecoverablePlainTransactionDetails } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { Asset } from '@/lib/assets'
import { isMockEnabled } from '@/lib/mock-mode'
import { HTLC_CHECK_HOLD_STARTED_KV_KEY, SQLQuery } from '@/lib/sql-queries'
import { startSwapRefund } from '@/lib/swap-telemetry'
import { getLegacyTransactionValidityStartHeight, promiseWithTimeout } from '@/lib/utils'
import { kv, useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { NO_ACCOUNT_ERROR, useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { HTLC_HISTORY_CHECK_HOLD_MS, upsertPlainPendingByHash, useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { getSwapHtlcTxHash } from '@/types/swapHtlcs'
import { Transfer } from '@/types/transactions'

const logger = useLogger('useSync')
const { setToast } = useToast()
const HTLC_CALL_TIMEOUT_MS = 30_000

interface PendingHtlcCreationRow {
  hash: string
  timestamp?: number
  raw?: string | null
  sender: string
  senderType: PlainTransactionDetails['senderType'] | number
  recipient: string
  status: PlainTransactionDetails['state']
  validityStartHeight?: number | null
}

type HtlcRollbackMode = 'terminal' | 'nonterminal'

interface HtlcReconciliationContext {
  owner: string
  network: string
  client: Client | undefined
  generation: number
}

export const useSyncHtlc = defineStore('sync-htlc', () => {
  const { getBalance } = useNimiqNetwork()
  const { client, height: localHeight, consensus, headTimestamp, networkId, networkName } = storeToRefs(useNimiqNetwork())
  const { localAddress, localBalance, localWallet } = storeToRefs(useLocalWallet())
  const { isProcessingRemote, isSendingTx, htlcCheckLock } = storeToRefs(useLocks())
  const remoteSignerStore = useRemoteSigner()
  const { remoteHeight, remoteBalance, remoteAddress, hasHtlcExpired, end, start, isHtlcActive, isHtlcPending, isRemoteOk } = storeToRefs(remoteSignerStore)
  const { activateRemoteSignerFromTransaction, deactivateRemoteSigner, findTransactionInHistory, getAllRemoteSigners, getWalletContext, isWalletContextCurrent, updateRemoteSigner } = remoteSignerStore
  const { sendTx, updateTransactionStatus } = useTransactions()
  const { htlcThreshold } = storeToRefs(useApp())
  const { isTransactionPending, nodesAreSynced, pendingRemoteDrainTxs, pendingTransactions, pendingHtlcCreationTransactions, htlcCanBeExtended, walletContextGeneration, htlcCheckHoldStartedAt, lastFundsBlockReason } = storeToRefs(useSyncState())

  const { loadHtlcHistoryFlags, reportFundsBlocked } = useSyncState()

  // A funded active HTLC leaves nothing unsecured to explain, however it got activated.
  watch(remoteBalance, (balance) => {
    if (balance > 0)
      htlcCheckHoldStartedAt.value = undefined
  })

  /**
   * If the local wallet gets some funds, move them to the remote wallet immediately.
   */
  async function handleFunds(bypassThreshold = false) {
    if (localBalance.value === 0)
      return
    if (isTransactionPending.value || isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying handleFunds', { pendingRemoteDrainTxs: pendingRemoteDrainTxs.value, pendingTransactions: pendingTransactions.value, pendingHtlcCreationTransactions: pendingHtlcCreationTransactions.value })
      reportFundsBlocked('pending_tx', {
        is_sending_tx: isSendingTx.value,
        pending_tx_hashes: [
          ...pendingRemoteDrainTxs.value.map(tx => tx.hash),
          ...[...pendingTransactions.value, ...pendingHtlcCreationTransactions.value].map(tx => tx.transactionHash),
        ],
      })
      return
    }

    // Let micro-payments accumulate in the local wallet until they reach the threshold before
    // topping up the HTLC, instead of creating/topping-up an HTLC for every payment. Only applies
    // once a secured balance exists: with remoteBalance 0 there's nothing to batch onto, so a
    // below-threshold deposit would otherwise sit pending forever — secure it immediately instead.
    // Gated before the remote-balance RPC below so an accumulating top-up skips it.
    // Expired signers must still hit the RPC: the cosigner can lag behind a timeout reclaim.
    // (localBalance is already > 0 here, so a threshold of 0 keeps the previous immediate behavior.)
    if (!bypassThreshold && !hasHtlcExpired.value && remoteBalance.value > 0 && localBalance.value < htlcThreshold.value) {
      logger.log(`💤 Local balance ${localBalance.value / 1e5} NIM below HTLC threshold ${htlcThreshold.value / 1e5} NIM — accumulating, skipping HTLC create/top-up`)
      return
    }

    let remoteBalanceOnChain = 0
    if (remoteAddress.value) {
      const { data, error } = await getBalance(remoteAddress.value)
      if (error && error !== NO_ACCOUNT_ERROR) {
        logger.error('Error while getting remote balance before handling funds', error)
        reportFundsBlocked('remote_balance_error')
        return
      }
      remoteBalanceOnChain = data ?? 0
    }

    logger.log(`Local balance: ${localBalance.value / 1e5} NIM. Remote balance: ${remoteBalanceOnChain / 1e5} NIM. ${remoteBalanceOnChain === 0 ? 'New HTLC needed' : 'Top-up needs liquidation'}`)
    logger.log({ isHtlcActive: isHtlcActive.value, isRemoteOk: isRemoteOk.value, isHtlcPending: isHtlcPending.value })

    // A fresh database (install, restore, re-login) does not know older HTLCs yet, so a new HTLC could
    // land beside a funded one. That includes a top-up, which liquidates the active HTLC to recreate it.
    // Wait for the first clean sweep, bounded because payments need an HTLC.
    // Mock mode never verifies remote signers, so it has no sweep to wait for.
    if (!isMockEnabled && !isHtlcPending.value && !(await loadHtlcHistoryFlags()).checked) {
      try {
        let startedAt = htlcCheckHoldStartedAt.value ?? (Number(await kv().getItem(HTLC_CHECK_HOLD_STARTED_KV_KEY)) || undefined)
        // A start in the future (clock moved back) would extend the hold indefinitely.
        if (startedAt === undefined || startedAt > Date.now()) {
          startedAt = Date.now()
          await kv().setItem(HTLC_CHECK_HOLD_STARTED_KV_KEY, String(startedAt))
        }
        if (Date.now() - startedAt < HTLC_HISTORY_CHECK_HOLD_MS) {
          // Only unsecured funds need the explanation; with a funded HTLC the deposit just stays pending.
          if (remoteBalanceOnChain === 0 && htlcCheckHoldStartedAt.value !== startedAt) {
            htlcCheckHoldStartedAt.value = startedAt
            // handleFunds may not run again at the limit (pending tx, RPC error), so release the explanation here.
            setTimeout(() => {
              if (htlcCheckHoldStartedAt.value === startedAt)
                htlcCheckHoldStartedAt.value = undefined
            }, startedAt + HTLC_HISTORY_CHECK_HOLD_MS - Date.now())
          }
          logger.log('🧲 Holding local funds until the HTLC history check completes')
          reportFundsBlocked('history_check_hold')
          return
        }
        // Not marked checked: the sweep keeps following extensions and merges a split HTLC once found.
        logger.warn('🧲 HTLC history check did not finish in time. Securing funds anyway')
        htlcCheckHoldStartedAt.value = undefined
      }
      catch (error) {
        // A DB error must not release the hold; retry on the next head.
        logger.error('Error while checking the HTLC history hold', error)
        reportFundsBlocked('history_check_error')
        return
      }
    }

    if (remoteBalanceOnChain === 0 && !isHtlcPending.value) {
      // Nothing holds the funds now. Cleared before sending so a failure inside the send (activation_failed) stays.
      lastFundsBlockReason.value = undefined
      isProcessingRemote.value = true
      const result = await sendTx({ transfer: Transfer.LocalToRemote })
      if (result.outcome === 'rejected') {
        isProcessingRemote.value = false
        if (result.reason === 'busy') {
          logger.log('Delaying deposit until the pending transaction resolves')
          reportFundsBlocked('deposit_busy')
          return
        }
        setToast({ message: i18n.t('Error while creating deposit'), type: 'error', duration: 5000 })
        logger.error('Error while creating HTLC', result.error)
        reportFundsBlocked('deposit_failed')
      }
      return
    }

    if (!nodesAreSynced.value) {
      reportFundsBlocked('nodes_not_synced', { local_height: localHeight.value, remote_height: remoteHeight.value })
      return
    }

    if (isHtlcActive.value && isRemoteOk.value) {
      // Past validity end the cosigner refuses to sign; checkRemoteValidity reclaims via timeout.
      if (hasHtlcExpired.value) {
        logger.log('Active HTLC expired. Leaving it to the timeout reclaim')
        reportFundsBlocked('htlc_expired')
        return
      }
      const liquidationContext = {
        localBalance: localBalance.value,
        remoteBalance: remoteBalanceOnChain,
        storeRemoteBalance: remoteBalance.value,
        remoteAddress: remoteAddress.value?.toUserFriendlyAddress(),
        localHeight: localHeight.value,
        remoteHeight: remoteHeight.value,
        nodesAreSynced: nodesAreSynced.value,
        isHtlcActive: isHtlcActive.value,
        isRemoteOk: isRemoteOk.value,
        isHtlcPending: isHtlcPending.value,
        pendingRemoteDrainTxs: pendingRemoteDrainTxs.value.length,
        pendingTransactions: pendingTransactions.value.length,
        pendingHtlcCreationTransactions: pendingHtlcCreationTransactions.value.length,
      }
      logger.log('Preparing to top up deposit by liquidating active HTLC', liquidationContext)
      lastFundsBlockReason.value = undefined
      isProcessingRemote.value = true
      const result = await sendTx({ transfer: Transfer.RemoteToLocal })
      if (result.outcome === 'rejected') {
        isProcessingRemote.value = false
        if (result.reason === 'busy') {
          logger.log('Delaying deposit until the pending transaction resolves')
          reportFundsBlocked('liquidation_busy')
          return
        }
        setToast({ message: i18n.t('Error while topping up deposit'), type: 'error', duration: 5000 })
        logger.error('Error while liquidating HTLC', result.error, liquidationContext)
        reportFundsBlocked('liquidation_failed')
      }
      return
    }

    logger.log(`Delaying deposit. isHtlcActive: ${isHtlcActive.value}, isRemoteOk: ${isRemoteOk.value}, isHtlcPending: ${isHtlcPending.value}`)
    reportFundsBlocked('htlc_not_ready', { is_htlc_active: isHtlcActive.value, is_remote_ok: isRemoteOk.value, is_htlc_pending: isHtlcPending.value })
  }

  async function extendValidity() {
    if (remoteBalance.value === 0 || !isHtlcActive.value || remoteHeight.value === -1)
      return
    logger.log(`Can the HTLC be extended? ${htlcCanBeExtended.value}`)
    if (htlcCanBeExtended.value) {
      if (isSendingTx.value) {
        logger.log('There is a pending transaction. Delaying extendValidity')
        return
      }
      isProcessingRemote.value = true
      const result = await sendTx({ transfer: Transfer.ExtendRemote })
      if (result.outcome === 'rejected') {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while extending deposit'), type: 'error', duration: 5000 })
        logger.error('Error while extending HTLC validity', result.error)
        const claimResult = await sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: remoteBalance.value, sender: remoteAddress.value! })
        if (claimResult.outcome === 'rejected')
          logger.error('Error while claiming funds from Remote after extending error', { claimError: claimResult.error })
      }
    }
  }

  /**
   * If the server misses the deadline to finalize the HTLC, the local wallet has to recover the funds.
   */
  async function checkRemoteValidity() {
    if (remoteBalance.value === 0)
      return
    logger.log(`Did the HTLC expire? ${hasHtlcExpired.value}`)
    if (hasHtlcExpired.value) {
      if (isSendingTx.value) {
        logger.log('There is a pending transaction. Delaying extendValidity')
        return
      }
      isProcessingRemote.value = true
      const result = await sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: remoteBalance.value, sender: remoteAddress.value! })
      if (result.outcome === 'rejected') {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while recovering deposit'), type: 'error', duration: 5000 })
        logger.error('Error while recovering funds from Remote', result.error)
      }
    }
  }

  function getHtlcReconciliationContext(): HtlcReconciliationContext | undefined {
    if (!localAddress.value)
      return undefined
    return {
      owner: localAddress.value.toUserFriendlyAddress(),
      network: networkName.value,
      client: client.value,
      generation: walletContextGeneration.value,
    }
  }

  function isHtlcContextCurrent(context: HtlcReconciliationContext) {
    const current = getHtlcReconciliationContext()
    return current?.owner === context.owner
      && current.network === context.network
      && current.client === context.client
      && current.generation === context.generation
  }

  function getCurrentWalletContext(context: HtlcReconciliationContext): WalletContext | undefined {
    const walletContext = getWalletContext()
    if (!walletContext
      || walletContext.owner !== context.owner
      || walletContext.network !== context.network
      || walletContext.client !== context.client
      || walletContext.generation !== context.generation
      || !isWalletContextCurrent(walletContext)) {
      return undefined
    }
    return walletContext
  }

  function removePendingHtlcCreation(hash: string, context: HtlcReconciliationContext) {
    if (!isHtlcContextCurrent(context))
      return false
    const index = pendingHtlcCreationTransactions.value.findIndex(tx => tx.transactionHash === hash)
    if (index >= 0)
      pendingHtlcCreationTransactions.value.splice(index, 1)
    return true
  }

  function upsertPendingHtlcCreation(
    transaction: RecoverablePlainTransactionDetails,
    context: HtlcReconciliationContext,
  ) {
    if (!isHtlcContextCurrent(context))
      return false
    upsertPlainPendingByHash(pendingHtlcCreationTransactions.value, transaction)
    return true
  }

  async function backfillPendingHtlcValidityStartHeight(
    pending: RecoverablePlainTransactionDetails,
    validityStartHeight: number,
    context: HtlcReconciliationContext,
  ) {
    try {
      await useConn().run(SQLQuery.BackfillTxValidityStartHeight, [validityStartHeight, pending.transactionHash])
      if (!isHtlcContextCurrent(context))
        return false
      pending.validityStartHeight = validityStartHeight
      return true
    }
    catch (error) {
      logger.error('Failed to persist recovered HTLC validity height', error)
      return false
    }
  }

  async function rollbackActiveHtlcCreation(
    transaction: Pick<RecoverablePlainTransactionDetails, 'recipient' | 'sender' | 'senderType'>,
    pending: Pick<RecoverablePlainTransactionDetails, 'recipient' | 'sender' | 'senderType'>,
    context: WalletContext,
    mode: HtlcRollbackMode,
  ): Promise<boolean> {
    if (!isWalletContextCurrent(context))
      return false
    const recipient = transaction.recipient || pending.recipient
    if (!recipient || remoteAddress.value?.toUserFriendlyAddress() !== recipient)
      return true

    const sender = transaction.sender || pending.sender
    const senderType = (transaction.senderType ?? pending.senderType) as string | number
    if (sender && (senderType === 'htlc' || Number(senderType) === Nimiq.AccountType.HTLC)) {
      const predecessor = (await getAllRemoteSigners()).find((signer) => {
        const address = typeof signer.address === 'string' ? signer.address : signer.address.toUserFriendlyAddress()
        return address === sender
      })
      if (!isWalletContextCurrent(context))
        return false
      if (predecessor) {
        const address = typeof predecessor.address === 'string' ? Nimiq.Address.fromString(predecessor.address) : predecessor.address
        const { data: balance, error } = await promiseWithTimeout(
          getBalance(address),
          HTLC_CALL_TIMEOUT_MS,
        )
        if (!isWalletContextCurrent(context))
          return false
        if (error && error !== NO_ACCOUNT_ERROR)
          return false
        if (!error && typeof balance === 'number' && balance > 0) {
          // An extension spends the previous HTLC, so its sender is the only safe rollback target.
          await updateRemoteSigner({ ...predecessor, address, active: true, balance }, context)
          return isWalletContextCurrent(context)
        }
      }
    }

    if (mode !== 'terminal' && senderType !== 'basic' && Number(senderType) !== Nimiq.AccountType.Basic)
      return false
    return deactivateRemoteSigner(Nimiq.Address.fromString(recipient), context, true)
  }

  let htlcReconciliationPromise: Promise<void> | undefined
  let htlcReconciliationQueued = false

  async function runHtlcReconciliation(context: HtlcReconciliationContext) {
    const pendingAtQueryStart = new Map(
      pendingHtlcCreationTransactions.value.map(transaction => [transaction.transactionHash, transaction]),
    )
    const persisted = await useConn().query<PendingHtlcCreationRow[]>(SQLQuery.SelectPendingHtlcCreations)
    if (!isHtlcContextCurrent(context))
      return
    const persistedByHash = new Map(persisted.map(row => [row.hash, row]))
    for (const { hash, timestamp, sender, senderType, recipient, status, validityStartHeight } of persisted) {
      const currentPending = pendingHtlcCreationTransactions.value.find(
        transaction => transaction.transactionHash === hash,
      )
      if (currentPending !== pendingAtQueryStart.get(hash)) {
        htlcReconciliationQueued = true
        continue
      }
      if (!upsertPendingHtlcCreation({
        ...currentPending,
        transactionHash: hash,
        timestamp: timestamp ?? currentPending?.timestamp,
        sender,
        senderType,
        recipient,
        state: status,
        validityStartHeight: validityStartHeight ?? currentPending?.validityStartHeight,
      } as RecoverablePlainTransactionDetails, context)) {
        return
      }
    }

    if (isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying checkHtlcState')
      return
    }
    if (!context.client || consensus.value !== 'established')
      return
    const walletContext = getCurrentWalletContext(context)
    if (!walletContext)
      return

    for (const pending of [...pendingHtlcCreationTransactions.value]) {
      if (!isHtlcContextCurrent(context))
        return
      if (typeof pending.validityStartHeight !== 'number') {
        const row = persistedByHash.get(pending.transactionHash)
        const recoveredHeight = row && getLegacyTransactionValidityStartHeight(row, networkId.value)
        if (typeof recoveredHeight === 'number' && !await backfillPendingHtlcValidityStartHeight(pending, recoveredHeight, context)) {
          if (!isHtlcContextCurrent(context))
            return
          continue
        }
      }
      let transaction: PlainTransactionDetails | undefined
      try {
        transaction = await promiseWithTimeout(context.client.getTransaction(pending.transactionHash), HTLC_CALL_TIMEOUT_MS)
      }
      catch (error) {
        logger.error('Error checking pending HTLC transactions', error)
        if (!isHtlcContextCurrent(context))
          return
        const validityStartHeight = pending.validityStartHeight
        const hasValidityHeight = typeof validityStartHeight === 'number'
        const validityExpired = hasValidityHeight && localHeight.value
          > validityStartHeight + Nimiq.Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS
        if ((hasValidityHeight && !validityExpired) || !pending.sender)
          continue
        try {
          // Only a complete sender-history scan can distinguish an absent creation from an accepted HTLC that was later drained.
          transaction = await findTransactionInHistory(Nimiq.Address.fromString(pending.sender), pending.transactionHash)
          if (!isHtlcContextCurrent(context))
            return
          if (!transaction) {
            if (!validityExpired) {
              logger.warn('Cannot expire pending HTLC creation without validity height', {
                hash: pending.transactionHash,
                validityStartHeight,
              })
              continue
            }
            const currentWalletContext = getCurrentWalletContext(context)
            if (!currentWalletContext)
              return
            const rollbackCompleted = await rollbackActiveHtlcCreation(pending, pending, currentWalletContext, 'terminal')
            if (!rollbackCompleted)
              continue
            if (!isHtlcContextCurrent(context))
              return
            await updateTransactionStatus({ hash: pending.transactionHash, status: 'expired', timestamp: pending.timestamp })
            if (!removePendingHtlcCreation(pending.transactionHash, context))
              return
            continue
          }
        }
        catch (historyError) {
          logger.error('Error checking expired HTLC transaction history', historyError)
          continue
        }
      }
      if (!transaction)
        continue
      if (!isHtlcContextCurrent(context))
        return

      if (typeof pending.validityStartHeight !== 'number'
        && typeof transaction.validityStartHeight === 'number'
        && !await backfillPendingHtlcValidityStartHeight(pending, transaction.validityStartHeight, context)) {
        if (!isHtlcContextCurrent(context))
          return
        continue
      }

      let rejectedState: 'failed' | 'expired' | undefined
      if (transaction.executionResult === false || transaction.state === 'invalidated')
        rejectedState = 'failed'
      else if (transaction.state === 'expired')
        rejectedState = 'expired'
      if (rejectedState) {
        try {
          const currentWalletContext = getCurrentWalletContext(context)
          if (!currentWalletContext)
            return
          const rollbackCompleted = await rollbackActiveHtlcCreation(transaction, pending, currentWalletContext, 'terminal')
          if (!rollbackCompleted)
            continue
          if (!isHtlcContextCurrent(context))
            return
          await updateTransactionStatus({ hash: pending.transactionHash, status: rejectedState, timestamp: transaction.timestamp })
          if (!removePendingHtlcCreation(pending.transactionHash, context))
            return
        }
        catch (error) {
          logger.error('Error rolling back rejected HTLC transaction', error)
        }
        continue
      }
      if (transaction.state === 'included' || transaction.state === 'confirmed') {
        try {
          const currentWalletContext = getCurrentWalletContext(context)
          if (!currentWalletContext)
            return
          // Keep finality monitoring separate from activation of an already superseded signer.
          const alreadyActivated = pending.state === 'included' && remoteAddress.value
            && (remoteAddress.value.toUserFriendlyAddress() === transaction.recipient
              || (typeof transaction.timestamp === 'number' && start.value >= transaction.timestamp))
          if (!alreadyActivated && (transaction.state === 'included' || transaction.recipient)) {
            await activateRemoteSignerFromTransaction(transaction, currentWalletContext)
          }
          if (!isHtlcContextCurrent(context))
            return
          await updateTransactionStatus({ hash: pending.transactionHash, status: transaction.state, timestamp: transaction.timestamp })
          const updated = transaction.state === 'confirmed'
            ? removePendingHtlcCreation(pending.transactionHash, context)
            : upsertPendingHtlcCreation(transaction, context)
          if (!updated)
            return
        }
        catch (error) {
          // Keep DB status selectable so restart recovery retries after account or cosigner metadata becomes ready.
          logger.error('Error activating pending HTLC transaction', error)
          if (!upsertPendingHtlcCreation({ ...pending, state: 'pending' }, context))
            return
        }
        continue
      }
      if (transaction.state === 'new' || transaction.state === 'pending') {
        if (!upsertPendingHtlcCreation({ ...pending, ...transaction }, context))
          return
        try {
          // Persist the reorg before rollback so a restart cannot restore an included, spendable state.
          if (pending.state !== transaction.state)
            await updateTransactionStatus({ hash: pending.transactionHash, status: transaction.state, timestamp: transaction.timestamp })
          // Creation is not accepted yet, so keep any funded predecessor as active signer.
          const currentWalletContext = getCurrentWalletContext(context)
          if (!currentWalletContext)
            return
          const rollbackCompleted = await rollbackActiveHtlcCreation(transaction, pending, currentWalletContext, 'nonterminal')
          if (!rollbackCompleted)
            continue
          if (!isHtlcContextCurrent(context))
            return
        }
        catch (error) {
          logger.error('Error rolling back pending HTLC transaction', error)
          continue
        }
      }
      if (!upsertPendingHtlcCreation({ ...pending, ...transaction }, context))
        return
    }

    if (!isHtlcContextCurrent(context))
      return
    const hasUnacceptedCreation = pendingHtlcCreationTransactions.value.some(
      transaction => transaction.state !== 'included',
    )
    isHtlcActive.value = !hasUnacceptedCreation
      && remoteBalance.value > 0
      && start.value <= headTimestamp.value
      && end.value > headTimestamp.value
  }

  async function checkHtlcState() {
    if (htlcReconciliationPromise) {
      htlcReconciliationQueued = true
      return htlcReconciliationPromise
    }

    htlcReconciliationPromise = (async () => {
      let reconciliationError: unknown
      do {
        htlcReconciliationQueued = false
        try {
          const context = getHtlcReconciliationContext()
          if (context)
            await runHtlcReconciliation(context)
          reconciliationError = undefined
        }
        catch (error) {
          logger.error('Error reconciling HTLC state', error)
          reconciliationError = error
        }
      } while (htlcReconciliationQueued)
      if (reconciliationError)
        throw reconciliationError
    })().finally(() => {
      htlcReconciliationPromise = undefined
    })

    return htlcReconciliationPromise
  }

  const reportedRefundFailures = new Set<string>()
  // Records a refund confirmed as executed together with its swap step.
  async function markSwapHtlcRefunded(htlc: SwapHtlc, step: SwapRefundTracker, refund: PlainTransactionDetails, extra?: { rebroadcast: boolean }) {
    step.end(true, { tx_state: refund.state, execution_result: true, ...extra })
    await useTransactions().setSwapHtlcRefunded(htlc.address)
  }

  let lastExpiredSwapHtlcCheckTimestamp = 0
  async function checkExpiredSwapHtlcs() {
    if (htlcCheckLock.value)
      return
    htlcCheckLock.value = true
    try {
      const heightTimestamp = headTimestamp.value > 1 ? headTimestamp.value : Date.now()
      if (heightTimestamp <= lastExpiredSwapHtlcCheckTimestamp + Nimiq.Policy.BLOCKS_PER_BATCH)
        return
      lastExpiredSwapHtlcCheckTimestamp = heightTimestamp

      const conn = useConn()
      const expiredSwapHtlcs = await conn.query<SwapHtlc[]>(SQLQuery.GetExpiredSwapHtlcs, [heightTimestamp])
      logger.log('Expired swap HTLCs:', expiredSwapHtlcs)

      const hasPolygonRows = expiredSwapHtlcs.some(htlc => htlc.address.startsWith('0x'))
      // Loaded once per sweep — dynamic import breaks a polygon-usdt → useSync circular import.
      const polygonUsdt = hasPolygonRows ? (await import('@/stores/polygon-usdt')).usePolygonUsdt() : null

      for (const htlc of expiredSwapHtlcs) {
        if (htlc.address.startsWith('0x')) {
          await handleExpiredPolygonSwapHtlc(htlc, polygonUsdt!)
          continue
        }

        const refundStep = startSwapRefund({ asset: Asset.NIM, swap_id: htlc.swap_id }, reportedRefundFailures)
        try {
          // The stored refund decides the outcome; an empty HTLC alone can't tell a refund from a redeem.
          let refundUnproven = false
          let refundWindowOpen = false
          if (htlc.refund_hash) {
            const refund = await promiseWithTimeout(client.value!.getTransaction(htlc.refund_hash), HTLC_CALL_TIMEOUT_MS)
              .catch((error) => {
                logger.warn('Stored swap HTLC refund lookup failed', htlc.refund_hash, error)
                return undefined
              })
            if (refund?.executionResult === true) {
              await markSwapHtlcRefunded(htlc, refundStep, refund)
              await conn.run(SQLQuery.DeleteSwapHtlc, [htlc.address])
              continue
            }
            if (refund && refund.executionResult !== false)
              continue
            refundUnproven = !refund
            // Until its validity window ends, a refund that can't be found may still be included.
            refundWindowOpen = refundUnproven && localHeight.value <= (htlc.refund_block ?? 0) + Nimiq.Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS
          }

          const account = await promiseWithTimeout(client.value!.getAccount(htlc.address), HTLC_CALL_TIMEOUT_MS) as PlainAccount
          if (!account.balance) {
            if (refundUnproven) {
              if (refundWindowOpen) {
                logger.warn('Swap HTLC is empty but its stored refund is unconfirmed', htlc)
                continue
              }
              // Past its window, only a complete history scan tells whether the refund drained the HTLC.
              const landedRefund = await findTransactionInHistory(Nimiq.Address.fromUserFriendlyAddress(htlc.address), htlc.refund_hash!)
              if (landedRefund?.executionResult === true)
                await markSwapHtlcRefunded(htlc, refundStep, landedRefund)
            }
            logger.log('Swap HTLC is empty, deleting from db', htlc)
            await conn.run(SQLQuery.DeleteSwapHtlc, [htlc.address])
            continue
          }
          // Inside its window an unfound refund is rebuilt unchanged, so a rebroadcast keeps its hash.
          const validityStartHeight = refundWindowOpen ? htlc.refund_block! : localHeight.value

          logger.log('Refunding swap HTLC', htlc, account)
          const refundTx = new Nimiq.Transaction(
            Nimiq.Address.fromUserFriendlyAddress(htlc.address),
            Nimiq.AccountType.HTLC,
            new Uint8Array(0),
            localAddress.value,
            Nimiq.AccountType.Basic,
            new Uint8Array(0),
            BigInt(account.balance),
            0n,
            0,
            validityStartHeight,
            networkId.value,
          )
          const { privateKey, publicKey } = localWallet.value
          const sig = Nimiq.Signature.create(privateKey, publicKey, refundTx.serializeContent())
          const sigProof = Nimiq.SignatureProof.singleSig(publicKey, sig).serialize()
          const proof = new Nimiq.SerialBuffer(1 + sigProof.length)
          proof.writeUint8(/* TIMEOUT_RESOLVE */ 2)
          proof.write(sigProof)
          refundTx.proof = proof
          await conn.run(SQLQuery.SetNativeSwapHtlcRefundHash, [refundTx.hash(), Date.now(), validityStartHeight, htlc.address])
          const txDetails = await promiseWithTimeout(client.value!.sendTransaction(refundTx), HTLC_CALL_TIMEOUT_MS)
          if (txDetails.executionResult === true) {
            await markSwapHtlcRefunded(htlc, refundStep, txDetails, { rebroadcast: refundWindowOpen })
            await conn.run(SQLQuery.DeleteSwapHtlc, [htlc.address])
          }
          else if (txDetails.executionResult === false || txDetails.state === 'invalidated' || txDetails.state === 'expired') {
            logger.error('Error while sending refund swap HTLC tx', txDetails)
            refundStep.end(false, { tx_state: txDetails.state, execution_result: txDetails.executionResult ?? null, rebroadcast: refundWindowOpen })
            // Only an executed failure clears the hash: a rebuilt copy is rejected once the original lands, so its lookup decides.
            if (txDetails.executionResult === false)
              await conn.run(SQLQuery.ClearSwapHtlcRefundHash, [htlc.address])
          }
          else {
            // Pending broadcasts have no outcome yet; the next sweep's lookup reports their confirmed execution.
            logger.warn('Swap HTLC refund has no execution result yet; next sweep checks its hash', txDetails)
          }
        }
        catch (error) {
          logger.error('Error while refunding swap HTLC', error)
          refundStep.fail(error)
        }
      }
      conn.run(SQLQuery.DeleteExpiredSwapQuotes, [heightTimestamp])
    }
    finally {
      htlcCheckLock.value = false
    }
  }

  async function handleExpiredPolygonSwapHtlc(htlc: SwapHtlc, polygonUsdt: ReturnType<typeof import('@/stores/polygon-usdt').usePolygonUsdt>) {
    try {
      const result = await polygonUsdt.refundPolygonSwapHtlc(htlc)
      if (result.refunded || !result.preimage)
        return

      logger.log('Skipping Polygon refund — Lightning preimage arrived late', htlc)
      const txHash = getSwapHtlcTxHash(htlc)
      if (txHash)
        await polygonUsdt.updateSingleTransaction(txHash)
      else
        await useConn().run(SQLQuery.DeleteSwapHtlc, [htlc.address])
    }
    catch (error) {
      // Leave the row in place so the next sweep retries. refund(...) reverts on already-refunded
      // HTLCs, so retries are safe.
      logger.error('Polygon HTLC refund failed; will retry next sweep', error)
    }
  }

  async function maybeCheckHtlcState() {
    if (consensus.value !== 'established')
      return
    if (localHeight.value % 10 !== 0)
      return
    await checkHtlcState()
  }

  return {
    handleFunds,
    extendValidity,
    checkRemoteValidity,
    checkHtlcState,
    checkExpiredSwapHtlcs,
    maybeCheckHtlcState,
  }
})
