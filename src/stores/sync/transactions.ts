import type { Client, PlainTransactionDetails, TransactionState } from '@nimiq/core'
import type { ContractWithEstimate } from '@nimiq/fastspot-api-v1'
import type { RemoteSigner } from '@/lib/sql-queries'
import type { AppTransactionState, ExternalTransaction, StakingTransaction, Transaction, UserReceiptTransaction } from '@/types/transactions'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { defineStore, storeToRefs } from 'pinia'
import { useCplApi, useRemoteSignerApi } from '@/composables/useApi'
import { useFastspotApiV1 } from '@/composables/useFastspotv1'
import { useLogger } from '@/composables/useLogger'
import { usePrice } from '@/composables/usePrice'
import { nakaBufferAddresses } from '@/lib'
import { Asset } from '@/lib/assets'
import { isMockEnabled } from '@/lib/mock-mode'
import { SQLQuery } from '@/lib/sql-queries'
import { buildTopUpReceipt, toAccountType } from '@/lib/tx'
import { promiseWithTimeout } from '@/lib/utils'
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
  const { query } = useConn()
  const { client, consensus, height, networkName } = storeToRefs(useNimiqNetwork())
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const remoteSignerStore = useRemoteSigner()
  const { remoteAddress } = storeToRefs(remoteSignerStore)
  const { getAllRemoteSigners, discoverRemoteSignersFromBlockchain, getLocalTransactions, getAllTransactionsForAddress } = remoteSignerStore
  const { isUpdatingTransactions } = storeToRefs(useLocks())
  const { pendingTransactions, pendingRemoteDrainTxs, isTransactionPending, walletContextGeneration } = storeToRefs(useSyncState())
  const {
    addUnknownPaymentToMerchantTransaction,
    addWithdrawalTransaction,
    addStakingtransaction,
    updateTransactionCashbackClaimed,
    updateTransactionStatus,
  } = useTransactions()

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

  async function updateSingleTransaction(hash: string) {
    const current = useTransactions().transactions.find(transaction => transaction.hash === hash)
    if (current && ['failed', 'invalidated'].includes(current.status))
      return

    if (!hasLocalWallet.value)
      return

    const pendingContext = getPendingTransactionContext()
    if (!pendingContext)
      return
    const context: PendingTransactionContext = pendingContext

    const currentPending = pendingTransactions.value.find(transaction => transaction.transactionHash === hash)
      ?? pendingRemoteDrainTxs.value.find(transaction => transaction.hash === hash)
    const pending = currentPending ? { ...currentPending } : undefined

    async function reconcile(transaction: { state: AppTransactionState | 'unknown', timestamp?: number, executionResult?: boolean }) {
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

      await updateTransactionStatus({ hash, status: state, timestamp: transaction.timestamp })
      if (!isPendingTransactionContextCurrent(context))
        return

      if (RESOLVED_TRANSACTION_STATES.has(state)) {
        logger.log(`Removing transaction ${hash} from pending transactions`)
        removeCurrentPendingHash(hash, context)
      }
    }

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
    try {
      const userReceipts: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
      if (!isLocalCurrent())
        return
      try {
        const seenCursors = new Set<string>()
        let startAt: string | undefined
        while (true) {
          const page = await getLocalTransactions({ sinceHeight: 0, ...(startAt ? { startAt } : {}), limit: LOCAL_HISTORY_PAGE_SIZE })
          if (!isLocalCurrent())
            return
          // Publish recent receipts before fetching older pages or reconciling HTLCs.
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
              logger.log('NAKA reversal detected, marking matching tx as reversed', { tx })
              if (isLocalCurrent())
                await useTransactions().setNakaTxRefunded(tx.value)
              return
            }

            const hash = tx.transactionHash
            const savedReceipt = userReceipts.find(dbTx => dbTx.hash === hash)
            if (savedReceipt) {
              if (tx.senderType === 'htlc' && tx.proof.type === 'early-resolve') {
                const receipt = await buildTopUpReceipt(tx)
                if (isLocalCurrent() && receipt.sender !== savedReceipt.sender)
                  await useTransactions().addReceiptTransaction(receipt, context)
              }
              return
            }

            logger.log(`📬 New ${tx.state} transaction received with ${usePrice(tx.value).crypto.formatted}`)
            if (tx.senderType === 'staking') {
              if (isLocalCurrent())
                handleStakingTxs(tx)
            }
            else {
              const receipt = await buildTopUpReceipt(tx)
              if (isLocalCurrent())
                await useTransactions().addReceiptTransaction(receipt, context)
            }
          }))
          // Register own HTLCs once per page after publishing incoming receipts.
          const ownHtlcSenders = new Set<string>()
          for (const tx of page) {
            if (isOwnHtlcDrain(tx, context.owner))
              ownHtlcSenders.add(tx.sender)
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
        logger.error('Error getting local account transactions', error)
      }
      if (!isCurrent() || isTransactionPending.value)
        return

      const allTransactions = await query<ExternalTransaction[]>(SQLQuery.SelectAllTransactions)
      if (!isCurrent())
        return
      const topUpAddresses = [...new Set(((await query<UserReceiptTransaction[]>(SQLQuery.GetAllUserReceipts))).map(tx => tx.sender))]
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
          else if (topUpAddresses.includes(tx.recipient)) {
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

      await discoverRemoteSignersFromBlockchain()
      if (!isCurrent())
        return
      const remoteSigners = await getAllRemoteSigners()
      if (!isCurrent())
        return

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
          const accountTxs = await getAccountTransactions(remoteSigner.address)
          if (!isCurrent())
            return
          const txsToProcess = filterUnseen(
            accountTxs.data.filter(tx => tx.sender === signerLabel),
            `outer:${signerLabel}`,
          )

          const { htlcExtensionTxs, htlcSwapTxs, withdrawalTxs, stakingTxs, unknownTxs } = categorizeTransactions(txsToProcess)
          logger.log(`📦 categorize[${signerLabel}] htlcExt=${htlcExtensionTxs.length} swap=${htlcSwapTxs.length} withdraw=${withdrawalTxs.length} staking=${stakingTxs.length} unknown=${unknownTxs.length}`)

          await Promise.all(htlcExtensionTxs.map(async (tx) => {
            const nestedTxs = await getAllOutgoingTransactionsFromHtlcs(Nimiq.Address.fromString(tx.recipient))
            if (!isCurrent())
              return
            const categorized = categorizeTransactions(filterUnseen(nestedTxs, `nested:${tx.recipient}`))
            htlcSwapTxs.push(...categorized.htlcSwapTxs)
            withdrawalTxs.push(...categorized.withdrawalTxs)
            stakingTxs.push(...categorized.stakingTxs)
            unknownTxs.push(...categorized.unknownTxs)
          }))
          if (!isCurrent())
            return
          await Promise.all([
            ...htlcSwapTxs.map(tx => handleSwapTxs(tx, { remoteSigner }, isCurrent)),
            ...withdrawalTxs.map(tx => handleWithdrawalTxs(tx, { remoteSigner })),
            ...stakingTxs.map(tx => handleStakingTxs(tx)),
            ...unknownTxs.map(tx => handleUnknownTxs(tx, { remoteSigner })),
          ])
        }
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
            executionResult = tx.executionResult
            state = executionResult === false ? 'failed' : tx.state
            timestamp = tx.timestamp || 0
            amount = tx.value
          }
          const current = useTransactions().transactions.find(transaction => transaction.hash === dbTx.hash)
          // Another refresh may record failure while this lookup is pending.
          if (current && ['failed', 'invalidated'].includes(current.status)
            && !['failed', 'invalidated'].includes(state) && executionResult !== true) {
            return
          }
          if ((dbTx.status !== state) || (dbTx.timestamp !== timestamp)) {
            logger.log(`📬 Updating transaction ${dbTx.hash} ${state} with ${usePrice(amount).crypto.formatted}`)
            updateTransactionStatus({ hash: dbTx.hash, status: state, timestamp })
          }
        }
        catch (error) {
          logger.error('[updateTransactionsInDb] Error while getting transaction', error)
        }
      }
    }))
  }

  async function handleSwapTxs(
    tx: PlainTransactionDetails,
    { remoteSigner }: { remoteSigner: RemoteSigner },
    isCurrent: () => boolean,
  ) {
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
      if (isCurrent())
        await addUnknownPaymentToMerchantTransaction(tx)
      return
    }

    if (contract.from.asset !== SwapAsset.NIM) {
      logger.error(`Found a swap from another asset than NIM (${contract.from.asset}) - This type of swap cannot yet be handled`)
    }
    else if (contract.to.asset === SwapAsset.BTC_LN) {
      logger.log(`📬 BTC_LN swap found with ${tx.value / 1e5} from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
      if (isCurrent()) {
        await addUnknownPaymentToMerchantTransaction(tx, Transfer.UserPaymentToAtomicSwap, Rail.BitcoinLightning, '', {
          amount: (contract.to.amount - contract.to.fee) / 1e8,
          currency: 'BTC',
        }, {
          imported: true,
        })
      }
      return
    }
    else {
      logger.error(`Found a swap to another asset than BTC_LN (${contract.to.asset}) - This type of swap cannot yet be handled`)
    }

    if (isCurrent())
      await addUnknownPaymentToMerchantTransaction(tx)
  }

  function handleWithdrawalTxs(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
    logger.log(`📬 New withdrawal transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
    addWithdrawalTransaction({
      transfer: Transfer.UserPayment,
      amount: tx.value,
      sender: tx.sender,
      senderType: toAccountType(tx.senderType),
      recipient: tx.recipient,
      recipientType: toAccountType(tx.recipientType),
      hash: tx.transactionHash,
      status: tx.state,
      timestamp: tx.timestamp,
      title: 'Withdrawal',
      fee: tx.fee,
      // TODO: Proof size should be read from tx proof once all Nimiq client variants expose it consistently.
      proofSize: useRemoteSigner().remoteProofSize,
    })
  }

  function handleStakingTxs(tx: PlainTransactionDetails) {
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

    addStakingtransaction({
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
      title,
      proofSize: tx.proof.raw.length / 2,
    })
  }

  function handleUnknownTxs(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
    logger.log(`📬 New merchant transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
    addUnknownPaymentToMerchantTransaction(tx)
  }

  return {
    updateSingleTransaction,
    updateTransactionHistory,
    updateTransactionsInDb,
  }
})
