import type { Client, PlainTransactionDetails, TransactionState } from '@nimiq/core'
import type { ContractWithEstimate } from '@nimiq/fastspot-api-v1'
import type { RemoteSigner } from '@/lib/sql-queries'
import type { WalletContext } from '@/stores/remote-signer'
import type { AppTransactionState, ExternalTransaction, MerchantTransaction, StakingTransaction, Transaction, UserReceiptTransaction, UserTransaction } from '@/types/transactions'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { defineStore, storeToRefs } from 'pinia'
import { useCplApi, useRemoteSignerApi } from '@/composables/useApi'
import { useFastspotApiV1 } from '@/composables/useFastspotv1'
import { useLogger } from '@/composables/useLogger'
import { nakaBufferAddresses } from '@/lib'
import { Asset } from '@/lib/assets'
import { isMockEnabled } from '@/lib/mock-mode'
import { SQLQuery } from '@/lib/sql-queries'
import { buildTopUpReceipt, toAccountType } from '@/lib/tx'
import { getLegacyTransactionValidityStartHeight, promiseWithTimeout } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePoints } from '@/stores/points'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { PaymentMethod, PointsHashPrefix, Rail, Transfer } from '@/types/transactions'

const logger = useLogger('useSync')
const LOCAL_HISTORY_PAGE_SIZE = 100
const TRANSACTION_LOOKUP_TIMEOUT_MS = 30_000
const DISCOVERY_RETRY_MS = 5 * 60_000
const RESOLVED_TRANSACTION_STATES = new Set<AppTransactionState>([
  'included',
  'confirmed',
  'invalidated',
  'failed',
  'expired',
])

interface PendingTransactionContext {
  owner: string
  network: string
  client: Client | undefined
  generation: number
}

// HTLC drains back to local carry the original creator's address inside the proof.
// For our own HTLCs (including extension chains) the creator is always the local wallet.
// Used by both batch refresh and the live tx listener to skip mis-categorized "Top-Up" entries.
export function isOwnHtlcDrain(tx: PlainTransactionDetails, localUserFriendly: string): boolean {
  return tx.senderType === 'htlc'
    && (tx.proof.type === 'timeout-resolve' || tx.proof.type === 'early-resolve')
    && tx.proof.creator === localUserFriendly
}

export const useSyncTransactions = defineStore('sync-transactions', () => {
  const { getAccountTransactions, getAllOutgoingTransactionsFromHtlcs } = useNimiqNetwork()
  const { query, run } = useConn()
  const { client, consensus, height, headTimestamp, lastMacroBlockHeight, networkName, networkId } = storeToRefs(useNimiqNetwork())
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const remoteSignerStore = useRemoteSigner()
  const { remoteAddress } = storeToRefs(remoteSignerStore)
  const { getAllRemoteSigners, discoverRemoteSignersFromBlockchain, getLocalTransactions, getAllTransactionsForAddress } = remoteSignerStore
  const { isUpdatingTransactions } = storeToRefs(useLocks())
  const { pendingTransactions, pendingRemoteDrainTxs, isTransactionPending, walletContextGeneration } = storeToRefs(useSyncState())
  const {
    saveTransactions,
    toUnknownPaymentToMerchantTransaction,
    updateTransactionCashbackClaimed,
    updateTransactionStatus,
  } = useTransactions()

  // Lets periodic history runs skip already-synced history. Set only after a run that fetched and saved
  // everything, and kept in memory so every app start, login or wallet switch runs one full sync.
  let historyCursor: {
    context: WalletContext
    // Final (macro) block height known when that run started.
    height: number
    // Remote signers fully scanned by that run.
    signers: Set<string>
    // Extension HTLCs found per signer. Their creating txs are older than the cursor,
    // so incremental runs would no longer find them.
    extensionHtlcs: Map<string, Set<string>>
  } | undefined

  // Discovery reads all local history and asks the cosigner about every HTLC, so it runs once per
  // wallet context instead of on every poll. Old HTLCs can keep it incomplete for good (the cosigner
  // answers "Wallet no longer active"), so an incomplete one retries after a delay, not every poll.
  let discovery: { context: WalletContext, isComplete: boolean, at: number } | undefined

  function getPendingTransactionContext(): PendingTransactionContext | undefined {
    if (!localAddress.value)
      return undefined
    return {
      owner: localAddress.value.toUserFriendlyAddress(),
      network: networkName.value,
      client: client.value,
      generation: walletContextGeneration.value,
    }
  }

  function isPendingTransactionContextCurrent(context: PendingTransactionContext) {
    const current = getPendingTransactionContext()
    return current?.owner === context.owner
      && current.network === context.network
      && current.client === context.client
      && current.generation === context.generation
  }

  function removeCurrentPendingHash(hash: string, context: PendingTransactionContext) {
    if (!isPendingTransactionContextCurrent(context))
      return false

    const plainIndex = pendingTransactions.value.findIndex(transaction => transaction.transactionHash === hash)
    if (plainIndex >= 0)
      pendingTransactions.value.splice(plainIndex, 1)

    const drainIndex = pendingRemoteDrainTxs.value.findIndex(transaction => transaction.hash === hash)
    if (drainIndex >= 0)
      pendingRemoteDrainTxs.value.splice(drainIndex, 1)

    return true
  }

  async function updateSingleTransaction(hash: string, observedTransaction?: PlainTransactionDetails) {
    if (!hasLocalWallet.value)
      return

    const pendingContext = getPendingTransactionContext()
    if (!pendingContext)
      return
    const context: PendingTransactionContext = pendingContext

    async function reconcile(transaction: { state: AppTransactionState | 'unknown', timestamp?: number, executionResult?: boolean, validityStartHeight?: number }) {
      if (transaction.state === 'unknown')
        return
      const state = transaction.executionResult === false ? 'failed' : transaction.state
      if (!isPendingTransactionContextCurrent(context))
        return

      const current = useTransactions().transactions.find(transaction => transaction.hash === hash)
      // Older cosigners omit executionResult; inclusion alone cannot clear a known failure.
      if (current && ['failed', 'invalidated'].includes(current.status)
        && !['failed', 'invalidated'].includes(state) && transaction.executionResult !== true) {
        return
      }

      if (typeof transaction.validityStartHeight === 'number'
        && Number.isSafeInteger(transaction.validityStartHeight) && transaction.validityStartHeight >= 0) {
        // Save chain evidence before a reorg can make the transaction unavailable.
        await run(SQLQuery.BackfillTxValidityStartHeight, [transaction.validityStartHeight, hash])
        if (!isPendingTransactionContextCurrent(context))
          return
        const currentPending = pendingTransactions.value.find(transaction => transaction.transactionHash === hash)
          ?? pendingRemoteDrainTxs.value.find(transaction => transaction.hash === hash)
        if (currentPending && typeof currentPending.validityStartHeight !== 'number')
          currentPending.validityStartHeight = transaction.validityStartHeight
      }

      await updateTransactionStatus({ hash, status: state, timestamp: transaction.timestamp, executionResult: transaction.executionResult })
      if (!isPendingTransactionContextCurrent(context))
        return

      if (RESOLVED_TRANSACTION_STATES.has(state)) {
        logger.log(`Removing transaction ${hash} from pending transactions`, { state, executionResult: transaction.executionResult ?? null })
        removeCurrentPendingHash(hash, context)
      }
    }

    // Listener events already contain execution evidence; a fresh lookup can miss it before finality.
    if (observedTransaction)
      return reconcile(observedTransaction)

    const current = useTransactions().transactions.find(transaction => transaction.hash === hash)
    if (current && ['failed', 'invalidated'].includes(current.status)) {
      // Batch refresh can persist failure before the pending-send entry is reconciled.
      removeCurrentPendingHash(hash, context)
      return
    }

    const currentPending = pendingTransactions.value.find(transaction => transaction.transactionHash === hash)
      ?? pendingRemoteDrainTxs.value.find(transaction => transaction.hash === hash)
    const pending = currentPending ? { ...currentPending } : undefined

    if (context.client && consensus.value === 'established') {
      try {
        const transaction = await promiseWithTimeout(context.client.getTransaction(hash), TRANSACTION_LOOKUP_TIMEOUT_MS)
        if (!isPendingTransactionContextCurrent(context))
          return
        if (transaction)
          return reconcile(transaction)
      }
      catch {
        if (!isPendingTransactionContextCurrent(context))
          return
      }
    }

    try {
      const { data: transaction, error } = await promiseWithTimeout(useRemoteSignerApi().getTransactionState({ hash }), TRANSACTION_LOOKUP_TIMEOUT_MS)
      if (!isPendingTransactionContextCurrent(context))
        return
      if (!error && transaction && transaction.state !== 'unknown')
        return reconcile(transaction)
      logger.error('[updateSingleTransaction] Error while getting transaction state from remote signer', error)
    }
    catch (error) {
      if (!isPendingTransactionContextCurrent(context))
        return
      logger.error(`[updateSingleTransaction] Error while getting transaction: ${hash}`, error)
    }

    if (!pending)
      return

    const history = await getAllTransactionsForAddress(Nimiq.Address.fromString(pending.sender))
    if (!isPendingTransactionContextCurrent(context))
      return

    const found = history.transactions.find(transaction => transaction.transactionHash === hash)
    if (found)
      return reconcile(found)
    if (!history.complete)
      return
    if (typeof pending.validityStartHeight !== 'number') {
      const row = await query<{ hash: string, sender: string, recipient: string, raw?: string, validityStartHeight?: number | null }>(SQLQuery.GetTransactionByHash, [hash], { single: true })
      if (!isPendingTransactionContextCurrent(context))
        return
      const recoveredHeight = row && (row.validityStartHeight ?? getLegacyTransactionValidityStartHeight(row, networkId.value))
      if (typeof recoveredHeight === 'number') {
        await run(SQLQuery.BackfillTxValidityStartHeight, [recoveredHeight, hash])
        if (!isPendingTransactionContextCurrent(context))
          return
        pending.validityStartHeight = recoveredHeight
      }
    }
    if (typeof pending.validityStartHeight !== 'number') {
      logger.warn('Cannot expire pending transaction without validity height', {
        hash,
        validityStartHeight: pending.validityStartHeight,
      })
      return
    }
    if (height.value <= pending.validityStartHeight + Nimiq.Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS)
      return
    return reconcile({ state: 'expired', timestamp: pending.timestamp })
  }

  /**
   * Updates the transactions history getting transactions from the blockchain and adding them to the db if they are not already there.
   */
  async function updateTransactionHistory() {
    if (isMockEnabled)
      return

    const context = remoteSignerStore.getWalletContext()
    if (!context)
      return
    const expectedRemoteAddress = remoteAddress.value?.toUserFriendlyAddress()
    const isCurrent = () => remoteSignerStore.isWalletContextCurrent(context)
      && remoteAddress.value?.toUserFriendlyAddress() === expectedRemoteAddress

    const isLocalCurrent = () => remoteSignerStore.isWalletContextCurrent(context)

    if (isUpdatingTransactions.value) {
      logger.log('📬 Transactions are already being updated')
      return
    }
    isUpdatingTransactions.value = true
    const cursor = historyCursor && remoteSignerStore.isWalletContextCurrent(historyCursor.context) ? historyCursor : undefined
    // One batch of overlap covers history peers that lag behind our head.
    const sinceHeight = cursor ? Math.max(0, cursor.height - Nimiq.Policy.BLOCKS_PER_BATCH) : 0
    const nextCursorHeight = lastMacroBlockHeight.value
    // Any failed fetch or write keeps the old cursor, so the next run fetches that range again.
    let isComplete = true
    try {
      const userReceipts: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
      if (!isLocalCurrent())
        return
      try {
        const seenCursors = new Set<string>()
        let startAt: string | undefined
        while (true) {
          const page = await getLocalTransactions({ sinceHeight, ...(startAt ? { startAt } : {}), limit: LOCAL_HISTORY_PAGE_SIZE })
          if (!isLocalCurrent())
            return
          const receipts: UserReceiptTransaction[] = []
          const stakingTxs: StakingTransaction[] = []
          await Promise.all(page.map(async (tx) => {
            if (!isLocalCurrent())
              return
            if (tx.sender === context.owner || (remoteAddress.value && tx.sender === remoteAddress.value.toUserFriendlyAddress()))
              return

            if (isOwnHtlcDrain(tx, context.owner)) {
              logger.log(`🚫 updateTransactionHistory skipped own-HTLC drain`, { hash: tx.transactionHash, sender: tx.sender, amount: tx.value })
              return
            }

            if (nakaBufferAddresses.includes(tx.sender)) {
              logger.log(`🚫 updateTransactionHistory skipped legacy NAKA refund`, { hash: tx.transactionHash, sender: tx.sender, amount: tx.value })
              return
            }

            const hash = tx.transactionHash
            const savedReceipt = userReceipts.find(dbTx => dbTx.hash === hash)
            if (savedReceipt) {
              if (tx.senderType === 'htlc' && tx.proof.type === 'early-resolve') {
                const receipt = await buildTopUpReceipt(tx)
                if (receipt.sender !== savedReceipt.sender)
                  receipts.push(receipt)
              }
              return
            }

            logger.log(`📬 New ${tx.state} transaction received with ${tx.value / 1e5} NIM`, { hash: tx.transactionHash, executionResult: tx.executionResult ?? null })
            if (tx.senderType === 'staking')
              stakingTxs.push(toStakingTransaction(tx))
            else
              receipts.push(await buildTopUpReceipt(tx))
          }))
          // Publish recent receipts before fetching older pages or reconciling HTLCs.
          // One write per page: per-tx writes queue hundreds of native calls and re-sort the list each time.
          if (!isLocalCurrent())
            return
          if (receipts.length && !await useTransactions().addReceiptTransactions(receipts, context))
            isComplete = false
          if (!isLocalCurrent())
            return
          if (!await saveTransactions(stakingTxs))
            isComplete = false
          // Register own HTLCs once per page after publishing incoming receipts.
          const ownHtlcSenders = new Set<string>()
          for (const tx of page) {
            if (isOwnHtlcDrain(tx, context.owner))
              ownHtlcSenders.add(tx.sender)
            // A cosigner HTLC we don't know yet (e.g. created on another device) needs discovery again.
            if (discovery
              && tx.sender === context.owner
              && tx.recipientType === 'htlc'
              && tx.data.type === 'htlc'
              && remoteSignerStore.isCosignerAddress(tx.data.recipient)
              && !await remoteSignerStore.isOurRemoteSigner(tx.recipient)) {
              logger.log('🔎 New HTLC creation found, discovering remote signers again', { hash: tx.transactionHash, htlc: tx.recipient })
              discovery = undefined
            }
          }
          if (ownHtlcSenders.size > 0)
            await Promise.all([...ownHtlcSenders].map(sender => remoteSignerStore.registerOwnHtlcIfMissing(sender, context)))
          if (!isLocalCurrent())
            return

          if (page.length < LOCAL_HISTORY_PAGE_SIZE)
            break
          const nextCursor = page.at(-1)?.transactionHash
          if (!nextCursor || seenCursors.has(nextCursor)) {
            logger.error('Local transaction history pagination made no progress')
            break
          }
          seenCursors.add(nextCursor)
          startAt = nextCursor
        }
      }
      catch (error) {
        isComplete = false
        logger.error('Error getting local account transactions', error)
      }
      if (!isCurrent() || isTransactionPending.value)
        return

      const allTransactions = await query<ExternalTransaction[]>(SQLQuery.SelectAllTransactions)
      if (!isCurrent())
        return
      const topUpAddresses = new Set((await query<{ sender: string }[]>(SQLQuery.GetUserReceiptSenders)).map(tx => tx.sender))
      if (!isCurrent())
        return

      function categorizeTransactions(txs: PlainTransactionDetails[]) {
        const htlcExtensionTxs: PlainTransactionDetails[] = []
        const htlcSwapTxs: PlainTransactionDetails[] = []
        const withdrawalTxs: PlainTransactionDetails[] = []
        const stakingTxs: PlainTransactionDetails[] = []
        const unknownTxs: PlainTransactionDetails[] = []
        for (const tx of txs) {
          if (tx.recipientType === 'htlc') {
            const data = tx.data
            if ('hashRoot' in data && data.hashRoot === '0000000000000000000000000000000000000000000000000000000000000000')
              htlcExtensionTxs.push(tx)
            else
              htlcSwapTxs.push(tx)
          }
          else if (tx.recipientType === 'staking' || tx.senderType === 'staking') {
            stakingTxs.push(tx)
          }
          else if (topUpAddresses.has(tx.recipient)) {
            withdrawalTxs.push(tx)
          }
          else {
            unknownTxs.push(tx)
          }
        }
        return {
          htlcExtensionTxs,
          htlcSwapTxs,
          withdrawalTxs,
          stakingTxs,
          unknownTxs,
        }
      }

      if (!discovery
        || !remoteSignerStore.isWalletContextCurrent(discovery.context)
        || (!discovery.isComplete && Date.now() - discovery.at > DISCOVERY_RETRY_MS)) {
        const result = await discoverRemoteSignersFromBlockchain()
        if (!isCurrent())
          return
        discovery = { context, isComplete: result.localComplete, at: Date.now() }
      }
      const remoteSigners = await getAllRemoteSigners()
      if (!isCurrent())
        return

      const scannedSigners = new Set<string>()
      const nextExtensionHtlcs = new Map<string, Set<string>>()
      if (remoteSigners && remoteSigners.length) {
        // Drain-to-local txs are user reclaims tracked by _sendTx, and DB-known hashes are already
        // categorized — both filters apply at the outer level AND to recursive traversal results
        // (which can otherwise yield the same hash twice via overlapping extension chains).
        const localUserFriendly = localAddress.value.toUserFriendlyAddress()
        const seenHashes = new Set<string>(allTransactions.map(tx => tx.hash))
        const filterUnseen = (txs: PlainTransactionDetails[], origin: string) => {
          let droppedReclaim = 0
          let droppedDup = 0
          const result = txs.filter((tx) => {
            if (tx.recipient === localUserFriendly) {
              droppedReclaim++
              return false
            }
            if (seenHashes.has(tx.transactionHash)) {
              droppedDup++
              return false
            }
            seenHashes.add(tx.transactionHash)
            return true
          })
          if (droppedReclaim > 0 || droppedDup > 0)
            logger.log(`🧹 filterUnseen[${origin}] in=${txs.length} out=${result.length} reclaims=${droppedReclaim} dups=${droppedDup}`)
          return result
        }

        for (const remoteSigner of remoteSigners.sort((a, b) => b.end - a.end)) {
          const signerLabel = remoteSigner.address.toUserFriendlyAddress()
          // Only empty, expired signers already scanned in full skip old history; active ones are always scanned in full.
          const isIncremental = !!cursor?.signers.has(signerLabel)
            && remoteSigner.balance === 0
            && remoteSigner.end < headTimestamp.value
          const accountTxs = await getAccountTransactions(remoteSigner.address, undefined, isIncremental ? sinceHeight : 0)
          if (!isCurrent())
            return
          if (accountTxs.error)
            isComplete = false
          const txsToProcess = filterUnseen(
            accountTxs.data.filter(tx => tx.sender === signerLabel),
            `outer:${signerLabel}`,
          )

          const { htlcExtensionTxs, htlcSwapTxs, withdrawalTxs, stakingTxs, unknownTxs } = categorizeTransactions(txsToProcess)
          logger.log(`📦 categorize[${signerLabel}] htlcExt=${htlcExtensionTxs.length} swap=${htlcSwapTxs.length} withdraw=${withdrawalTxs.length} staking=${stakingTxs.length} unknown=${unknownTxs.length}`)

          const extensionHtlcs = new Set([
            ...(isIncremental ? cursor?.extensionHtlcs.get(signerLabel) ?? [] : []),
            ...htlcExtensionTxs.map(tx => tx.recipient),
          ])
          nextExtensionHtlcs.set(signerLabel, extensionHtlcs)
          scannedSigners.add(signerLabel)
          await Promise.all([...extensionHtlcs].map(async (htlcAddress) => {
            const nestedTxs = await getAllOutgoingTransactionsFromHtlcs(Nimiq.Address.fromString(htlcAddress))
            if (!isCurrent())
              return
            const categorized = categorizeTransactions(filterUnseen(nestedTxs, `nested:${htlcAddress}`))
            htlcSwapTxs.push(...categorized.htlcSwapTxs)
            withdrawalTxs.push(...categorized.withdrawalTxs)
            stakingTxs.push(...categorized.stakingTxs)
            unknownTxs.push(...categorized.unknownTxs)
          }))
          if (!isCurrent())
            return
          const swapTxs = await Promise.all(htlcSwapTxs.map(tx => toSwapTransaction(tx, { remoteSigner }, isCurrent)))
          if (!isCurrent())
            return
          const isSaved = await saveTransactions([
            ...swapTxs.filter(tx => tx !== undefined),
            ...withdrawalTxs.map(tx => toWithdrawalTransaction(tx, { remoteSigner })),
            ...stakingTxs.map(tx => toStakingTransaction(tx)),
            ...unknownTxs.map(tx => toUnknownTransaction(tx, { remoteSigner })),
          ])
          if (!isSaved)
            isComplete = false
        }
      }

      // lastMacroBlockHeight stays 0 until the first macro block after startup.
      if (isComplete && nextCursorHeight > 0 && isCurrent()) {
        historyCursor = { context, height: nextCursorHeight, signers: scannedSigners, extensionHtlcs: nextExtensionHtlcs }
        logger.log(`📍 History cursor set to block ${nextCursorHeight}`, { sinceHeight, signers: scannedSigners.size })
      }
    }
    catch (error) {
      logger.error('Error while updating transaction history', error)
    }
    finally {
      isUpdatingTransactions.value = false
    }
  }

  /**
   * Updates the transactions in the db if they have a different status or timestamp.
   */
  async function updateTransactionsInDb() {
    const context = getPendingTransactionContext()
    const dbTxs: Transaction[] = await useConn().query(SQLQuery.SelectAllTransactions)

    await Promise.all(dbTxs.map(async (dbTx) => {
      if (['failed', 'invalidated'].includes(dbTx.status))
        return

      if ((dbTx.asset || Asset.NIM) === Asset.USDT)
        return

      if ((dbTx.status === 'included' || dbTx.status === 'confirmed') && (dbTx.transfer === Transfer.UserPaymentToMerchant || dbTx.transfer === Transfer.UserPaymentToAtomicSwap) && dbTx.paymentMethod === PaymentMethod.NIM) {
        if (!dbTx.isCashbackClaimed && useApp().pointsToken) {
          const { error, errorType } = await usePoints().claimCashback(dbTx)
          if (error) {
            logger.error(error)
            if (errorType === 'CPL_PAYMENT_REQUEST_ALREADY_PROCESSED' || errorType === 'CPL_MERCHANT_NOT_FOUND')
              updateTransactionCashbackClaimed({ hash: dbTx.hash })
          }
          else {
            updateTransactionCashbackClaimed({ hash: dbTx.hash })
          }
        }
      }

      if (dbTx.status === 'confirmed' && dbTx.timestamp)
        return

      if (dbTx.hash.includes(PointsHashPrefix)) {
        if (!dbTx.paymentRef) {
          logger.error('Reference not found', dbTx)
          return
        }
        const { data, error } = await useCplApi().getOrderById({ id: dbTx.paymentRef })
        if (error) {
          logger.error(error)
          return
        }

        const txStatus = data?.status as TransactionState
        if (!txStatus) {
          logger.error('No status from CPL API')
          return
        }
        if (dbTx.status !== txStatus) {
          logger.log(`📬 Updating transaction ${dbTx.hash} ${txStatus}`)
          updateTransactionStatus({ hash: dbTx.hash, status: txStatus, timestamp: dbTx.timestamp })
        }
      }
      else {
        try {
          let state: AppTransactionState, timestamp: number, amount: number
          let executionResult: boolean | undefined
          let validityStartHeight: number | undefined
          if (!client.value || consensus.value !== 'established') {
            const { data: tx, error } = await useRemoteSignerApi().getTransactionState({ hash: dbTx.hash })
            if (error || !tx || tx.state === 'unknown') {
              logger.error('[updateTransactionsInDb] Error while getting transaction state', error)
              return
            }
            executionResult = tx.executionResult
            state = executionResult === false ? 'failed' : tx.state
            timestamp = tx.timestamp || 0
            amount = tx.value
          }
          else {
            const tx = await client.value!.getTransaction(dbTx.hash)
            validityStartHeight = tx.validityStartHeight
            executionResult = tx.executionResult
            state = executionResult === false ? 'failed' : tx.state
            timestamp = tx.timestamp || 0
            amount = tx.value
          }
          if (!context || !isPendingTransactionContextCurrent(context))
            return
          if (typeof validityStartHeight === 'number' && Number.isSafeInteger(validityStartHeight) && validityStartHeight >= 0) {
            await run(SQLQuery.BackfillTxValidityStartHeight, [validityStartHeight, dbTx.hash])
            if (!isPendingTransactionContextCurrent(context))
              return
          }
          const current = useTransactions().transactions.find(transaction => transaction.hash === dbTx.hash)
          // Another refresh may record failure while this lookup is pending.
          if (current && ['failed', 'invalidated'].includes(current.status)
            && !['failed', 'invalidated'].includes(state) && executionResult !== true) {
            return
          }
          if (dbTx.status !== state || dbTx.timestamp !== timestamp || (executionResult !== undefined && current?.executionResult !== executionResult)) {
            logger.log(`📬 Updating transaction ${dbTx.hash} ${state} with ${amount / 1e5} NIM`, { executionResult: executionResult ?? null })
            updateTransactionStatus({ hash: dbTx.hash, status: state, timestamp, executionResult })
          }
        }
        catch (error) {
          logger.error('[updateTransactionsInDb] Error while getting transaction', error)
        }
      }
    }))
  }

  async function toSwapTransaction(
    tx: PlainTransactionDetails,
    { remoteSigner }: { remoteSigner: RemoteSigner },
    isCurrent: () => boolean,
  ): Promise<MerchantTransaction | undefined> {
    let contract: ContractWithEstimate<SwapAsset>
    try {
      const fastspot = await useFastspotApiV1()
      if (!isCurrent())
        return
      contract = await fastspot.getContract(SwapAsset.NIM, tx.recipient)
      if (!isCurrent())
        return
    }
    catch (error: any) {
      logger.error('Error fetching contract info from Fastspot:', error.message)
      return toUnknownPaymentToMerchantTransaction(tx)
    }

    if (contract.from.asset !== SwapAsset.NIM) {
      logger.error(`Found a swap from another asset than NIM (${contract.from.asset}) - This type of swap cannot yet be handled`)
    }
    else if (contract.to.asset === SwapAsset.BTC_LN) {
      logger.log(`📬 BTC_LN swap found with ${tx.value / 1e5} from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
      return toUnknownPaymentToMerchantTransaction(tx, Transfer.UserPaymentToAtomicSwap, Rail.BitcoinLightning, '', {
        amount: (contract.to.amount - contract.to.fee) / 1e8,
        currency: 'BTC',
      }, {
        imported: true,
      })
    }
    else {
      logger.error(`Found a swap to another asset than BTC_LN (${contract.to.asset}) - This type of swap cannot yet be handled`)
    }

    return toUnknownPaymentToMerchantTransaction(tx)
  }

  function toWithdrawalTransaction(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }): UserTransaction {
    logger.log(`📬 New withdrawal transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
    return {
      transfer: Transfer.UserPayment,
      amount: tx.value,
      sender: tx.sender,
      senderType: toAccountType(tx.senderType),
      recipient: tx.recipient,
      recipientType: toAccountType(tx.recipientType),
      hash: tx.transactionHash,
      status: tx.state,
      timestamp: tx.timestamp,
      validityStartHeight: tx.validityStartHeight,
      title: 'Withdrawal',
      fee: tx.fee,
      // TODO: Proof size should be read from tx proof once all Nimiq client variants expose it consistently.
      proofSize: useRemoteSigner().remoteProofSize,
    }
  }

  function toStakingTransaction(tx: PlainTransactionDetails): StakingTransaction {
    let title: StakingTransaction['title']
    if (tx.senderType === 'staking') {
      logger.log(`📬 New ${tx.senderData!.type} transaction found with ${tx.value / 1e5} NIM from staking contract`)
      switch (tx.senderData!.type) {
        case 'remove-stake':
          title = 'Remove Stake'
          break
        case 'delete-validator':
          title = 'Delete Validator'
          break
        default:
          title = 'Staking Contract'
          break
      }
    }
    else if (tx.recipientType === 'staking') {
      logger.log(`📬 New ${tx.data.type} transaction found with ${tx.value / 1e5} NIM to staking contract`)
      switch (tx.data.type) {
        case 'create-staker':
          title = 'Create Staker'
          break
        case 'add-stake':
          title = 'Add Stake'
          break
        case 'set-active-stake':
          title = 'Set Active Stake'
          break
        case 'update-staker':
          title = 'Update Staker'
          break
        case 'retire-stake':
          title = 'Retire Stake'
          break
        default:
          title = 'Staking Contract'
          break
      }
    }
    else {
      title = 'Staking Contract'
    }

    return {
      transfer: Transfer.Staking,
      amount: tx.value,
      fee: tx.fee,
      hash: tx.transactionHash,
      sender: tx.sender,
      senderType: toAccountType(tx.senderType),
      senderData: tx.senderData ? Nimiq.BufferUtils.fromHex(tx.senderData.raw) : undefined,
      recipient: tx.recipient,
      recipientType: toAccountType(tx.recipientType),
      recipientData: tx.data?.raw ? Nimiq.BufferUtils.fromHex(tx.data.raw) : undefined,
      status: tx.state,
      timestamp: tx.timestamp,
      validityStartHeight: tx.validityStartHeight,
      title,
      proofSize: tx.proof.raw.length / 2,
    }
  }

  function toUnknownTransaction(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
    logger.log(`📬 New merchant transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
    return toUnknownPaymentToMerchantTransaction(tx)
  }

  return {
    updateSingleTransaction,
    updateTransactionHistory,
    updateTransactionsInDb,
  }
})
