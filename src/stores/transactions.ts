import type { Transaction as NimiqTransaction, PlainTransactionDetails } from '@nimiq/core'
import type { NimHtlcDetails } from '@nimiq/fastspot-api-v1'
import type { Swap } from '@nimiq/fastspot-api-v2'
import type { DbPagination } from '@/lib/sql-queries'
import type { WalletContext } from '@/stores/remote-signer'
import type { AppTransactionState, ExternalTransaction, MerchantTransaction, PartialSendTxArgs, RecoverablePlainTransactionDetails, StakingTransaction, Transaction, TransactionSendResult, TransactionSentByUser, TransactionTitle, UserReceiptTransaction, UserTransaction } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, shallowRef, watch } from 'vue'
import { useFastspotApiV2 } from '@/composables/useFastspotV2'
import { useLogger } from '@/composables/useLogger'

import { useTransactionSearch } from '@/composables/useTransactionSearch'
import { i18n } from '@/i18n/i18n-setup'
import { nakaBufferAddresses } from '@/lib'
import { trackSwapCompleted, trackSwapFailed } from '@/lib/analytics'
import { Asset, Chain } from '@/lib/assets'
import { isMockEnabled } from '@/lib/mock-mode'
import { DEFAULT_LIMIT, SQLQuery, UPSERT_POLYGON_HISTORY_TX } from '@/lib/sql-queries'
import { getSignedTx, toAccountType } from '@/lib/tx'
import { promiseWithTimeout } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { upsertPlainPendingByHash, useSyncState } from '@/stores/sync/state'
import { isExternalTx, MerchantCategory, PaymentMethod, Rail, Transfer } from '@/types/transactions'

const logger = useLogger('transactions.ts')
const BROADCAST_TIMEOUT_MS = 30_000
const SEND_CONSENSUS_TIMEOUT_MS = 30_000

interface PendingOutgoingRow {
  hash: string
  timestamp: number | undefined
  sender: string
  senderType: PlainTransactionDetails['senderType'] | number
  recipient: string
  recipientType: PlainTransactionDetails['recipientType'] | number
  amount: number
  fee: number
  status: AppTransactionState
  transfer: Transfer
  validityStartHeight?: number | null
}

interface PendingHtlcCreationRow {
  hash: string
  timestamp: number | undefined
  sender: string
  senderType: PlainTransactionDetails['senderType'] | number
  recipient: string
  recipientType: PlainTransactionDetails['recipientType'] | number
  status: PlainTransactionDetails['state']
  validityStartHeight?: number | null
}

interface StagedSend {
  plain: RecoverablePlainTransactionDetails
  tx: TransactionSentByUser
  serialized?: string
}

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
  const { query, run, runSet } = useConn()
  const { client, networkId, networkName, height, headTimestamp } = storeToRefs(useNimiqNetwork())
  const { activeAsset, showHiddenTransactions } = storeToRefs(useApp())
  const { isSendingTx } = storeToRefs(useLocks())
  const syncState = useSyncState()

  const remoteSigner = useRemoteSigner()
  const { updateActiveRemoteBalance } = remoteSigner
  const { remoteBalance } = storeToRefs(remoteSigner)

  const transactions = shallowRef<ExternalTransaction[]>([])

  /**
   * Select transactions from the database using a basic pagination system. Loads the newest transactions first.
   * If you need to load more transactions, use loadMoreTxs.
   */
  // UserReceipts whose sender is one of our remote-signer HTLCs are drains, not real Top-Ups —
  // mis-recording them as receipts would bump the original deposit to the top of the home list with
  // a recent (drain block) timestamp. Foreign HTLC senders (other Nimiq Pay users paying us) stay.
  async function filterDisplayableTxs<T extends Pick<ExternalTransaction, 'transfer' | 'sender' | 'hash'>>(txs: T[]): Promise<T[]> {
    const ourSigners = await remoteSigner.getOurRemoteSignerAddresses()
    const dropped: string[] = []
    const result = txs.filter((tx) => {
      if (tx.transfer === Transfer.UserReceipt && ourSigners.has(tx.sender)) {
        dropped.push(tx.hash)
        return false
      }
      return true
    })
    if (dropped.length > 0)
      logger.log(`🧹 filterDisplayableTxs dropped ${dropped.length} own-HTLC UserReceipt(s)`, dropped)
    return result
  }

  async function selectTxs(options?: DbPagination) {
    const txs = await query<ExternalTransaction[]>(SQLQuery.SelectPaginationTransactionsByAsset, [activeAsset.value, options?.limit || DEFAULT_LIMIT, options?.offset || 0])
    const filteredTxs = await filterDisplayableTxs(txs)

    // Convert JSON strings to objects
    txs.forEach((tx) => {
      tx.invoiced = tx.invoiced ? JSON.parse(tx.invoiced as unknown as string) as { amount: number, currency: string } : undefined
      tx.meta = tx.meta ? JSON.parse(tx.meta as unknown as string) as Record<string, any> : undefined
    })

    logger.log(`📚 Selected ${txs.length} transactions`, txs)

    logger.log(`📚 Filtered ${filteredTxs.length} transactions`, filteredTxs)
    return filteredTxs
  }

  function getUpsertTxValues(tx: Transaction) {
    // Store the untranslated title so it follows the user's current language at display time.
    return [
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
      tx.validityStartHeight ?? null,
    ]
  }

  async function upsertTx(tx: Transaction) {
    logger.log(`📚 Upsert-ing transaction`, tx)
    await run(SQLQuery.UpsertTx, getUpsertTxValues(tx))
  }

  async function getStoredTransaction(hash: string) {
    const tx = await query<ExternalTransaction | null>(SQLQuery.GetTransactionByHash, [hash], { single: true })
    if (tx) {
      tx.invoiced = typeof tx.invoiced === 'string' ? JSON.parse(tx.invoiced) : tx.invoiced
      tx.meta = typeof tx.meta === 'string' ? JSON.parse(tx.meta) : tx.meta
    }
    return tx
  }

  async function clearTxHistory() {
    await run(SQLQuery.ClearTxHistory)
    // Also reset Polygon history scan state so the next sync re-scans all blocks
    const { usePolygonUsdt } = await import('@/stores/polygon-usdt')
    await usePolygonUsdt().resetHistoryState()
  }

  function isRemoteDrainTransfer(transfer: Transfer) {
    return transfer === Transfer.RemoteToLocal
      || transfer === Transfer.RemoteToLocalAfterTimeout
      || transfer === Transfer.RemoteToLocalImmediateReclaim
  }

  function upsertSentPendingByHash(collection: TransactionSentByUser[], transaction: TransactionSentByUser) {
    const index = collection.findIndex(tx => tx.hash === transaction.hash)
    if (index >= 0)
      collection.splice(index, 1, transaction)
    else
      collection.push(transaction)
  }

  async function restorePendingOutgoingTransactions(): Promise<boolean> {
    const owner = useLocalWallet().localAddress?.toUserFriendlyAddress()
    const restoreNetwork = networkName.value
    const restoreClient = client.value
    const restoreGeneration = syncState.walletContextGeneration
    if (!owner)
      return false

    try {
      const pendingTransactionsAtQueryStart = new Map(
        syncState.pendingTransactions.map(transaction => [transaction.transactionHash, transaction]),
      )
      const pendingDrainsAtQueryStart = new Map(
        syncState.pendingRemoteDrainTxs.map(transaction => [transaction.hash, transaction]),
      )
      const pendingHtlcsAtQueryStart = new Map(
        syncState.pendingHtlcCreationTransactions.map(transaction => [transaction.transactionHash, transaction]),
      )
      const [rows, pendingHtlcRows] = await Promise.all([
        query<PendingOutgoingRow[]>(SQLQuery.SelectPendingOutgoingTransactions, [owner]),
        query<PendingHtlcCreationRow[]>(SQLQuery.SelectPendingHtlcCreations),
      ])
      const contextChanged = useLocalWallet().localAddress?.toUserFriendlyAddress() !== owner
        || networkName.value !== restoreNetwork
        || client.value !== restoreClient
        || syncState.walletContextGeneration !== restoreGeneration
      if (contextChanged)
        return false

      for (const row of rows) {
        if (isRemoteDrainTransfer(row.transfer)) {
          const currentPending = syncState.pendingRemoteDrainTxs.find(transaction => transaction.hash === row.hash)
          if (currentPending !== pendingDrainsAtQueryStart.get(row.hash)) {
            return false
          }
        }
        else {
          const currentPending = syncState.pendingTransactions.find(transaction => transaction.transactionHash === row.hash)
          if (currentPending !== pendingTransactionsAtQueryStart.get(row.hash)) {
            return false
          }
        }
      }

      for (const row of rows) {
        if (isRemoteDrainTransfer(row.transfer)) {
          upsertSentPendingByHash(syncState.pendingRemoteDrainTxs, {
            ...row,
            hash: row.hash,
            timestamp: row.timestamp,
            transfer: row.transfer,
          } as TransactionSentByUser)
        }
        else {
          upsertPlainPendingByHash(syncState.pendingTransactions, {
            transactionHash: row.hash,
            timestamp: row.timestamp,
            sender: row.sender,
            senderType: row.senderType as PlainTransactionDetails['senderType'],
            recipient: row.recipient,
            recipientType: row.recipientType as PlainTransactionDetails['recipientType'],
            value: row.amount,
            fee: row.fee,
            state: row.status as PlainTransactionDetails['state'],
            validityStartHeight: row.validityStartHeight,
            data: { raw: '' },
            proof: { raw: '' },
          } as RecoverablePlainTransactionDetails)
        }
      }
      for (const row of pendingHtlcRows) {
        const currentPending = syncState.pendingHtlcCreationTransactions.find(
          transaction => transaction.transactionHash === row.hash,
        )
        if (currentPending !== pendingHtlcsAtQueryStart.get(row.hash)) {
          return false
        }
        upsertPlainPendingByHash(syncState.pendingHtlcCreationTransactions, {
          transactionHash: row.hash,
          timestamp: row.timestamp,
          sender: row.sender,
          senderType: row.senderType as PlainTransactionDetails['senderType'],
          recipient: row.recipient,
          recipientType: row.recipientType as PlainTransactionDetails['recipientType'],
          state: row.status,
          validityStartHeight: row.validityStartHeight,
          data: { raw: '' },
          proof: { raw: '' },
        } as RecoverablePlainTransactionDetails)
      }
      return true
    }
    catch (error) {
      logger.error('Failed to restore pending outgoing transactions', error)
      return false
    }
  }

  function removePendingHash(hash: string, sendContext: WalletContext) {
    if (!remoteSigner.isWalletContextCurrent(sendContext))
      return

    for (const collection of [syncState.pendingTransactions, syncState.pendingHtlcCreationTransactions]) {
      const index = collection.findIndex(tx => tx.transactionHash === hash)
      if (index >= 0)
        collection.splice(index, 1)
    }
    const drainIndex = syncState.pendingRemoteDrainTxs.findIndex(tx => tx.hash === hash)
    if (drainIndex >= 0)
      syncState.pendingRemoteDrainTxs.splice(drainIndex, 1)
  }

  function unknownResult(staged: StagedSend, error: unknown): TransactionSendResult {
    return {
      outcome: 'unknown',
      stagedTx: staged.tx,
      stagedHash: staged.tx.hash,
      error: error instanceof Error ? error.message : String(error),
      ...(staged.serialized ? { serialized: staged.serialized } : {}),
    }
  }

  async function sendTx(
    partialTx: PartialSendTxArgs,
    expectedContext?: WalletContext,
  ): Promise<TransactionSendResult> {
    if (isSendingTx.value) {
      logger.log('A transaction is already in progress')
      return { outcome: 'rejected', reason: 'busy', error: i18n.t('A transaction is already in progress') }
    }

    isSendingTx.value = true
    try {
      if (expectedContext && !remoteSigner.isWalletContextCurrent(expectedContext)) {
        return {
          outcome: 'rejected',
          error: i18n.t('Wallet or network changed before sending'),
        }
      }
      if (!await restorePendingOutgoingTransactions())
        return { outcome: 'rejected', error: i18n.t('Could not verify pending transactions') }
      if (syncState.isTransactionPending) {
        return {
          outcome: 'rejected',
          reason: 'busy',
          error: i18n.t('A transaction is still pending. Wait for it to resolve before sending another.'),
        }
      }

      const sendContext = expectedContext ?? remoteSigner.getWalletContext()
      if (!sendContext)
        return { outcome: 'rejected', error: i18n.t('Nimiq network unavailable') }
      if (!remoteSigner.isWalletContextCurrent(sendContext)) {
        return {
          outcome: 'rejected',
          error: i18n.t('Wallet or network changed before sending'),
        }
      }

      await promiseWithTimeout(
        sendContext.client.waitForConsensusEstablished(),
        SEND_CONSENSUS_TIMEOUT_MS,
      )
      if (!remoteSigner.isWalletContextCurrent(sendContext)) {
        return {
          outcome: 'rejected',
          error: i18n.t('Wallet or network changed before sending'),
        }
      }

      return await _sendTx(partialTx, sendContext)
    }
    catch (error) {
      return { outcome: 'rejected', error: error instanceof Error ? error.message : String(error) }
    }
    finally {
      isSendingTx.value = false
    }
  }

  async function _sendTx(partialTx: PartialSendTxArgs, sendContext: WalletContext): Promise<TransactionSendResult> {
    const localWallet = useLocalWallet()
    const createsHtlc = partialTx.transfer === Transfer.LocalToRemote || partialTx.transfer === Transfer.ExtendRemote
    let stagedSend: StagedSend | undefined
    let broadcastPhase: 'not-started' | 'possible' | 'accepted' = 'not-started'

    logger.log('✈️  Preparing new transaction', {
      partialTx,
      remoteAddress: remoteSigner.remoteAddress?.toUserFriendlyAddress(),
      remoteBalance: remoteSigner.remoteBalance,
      remoteHeight: remoteSigner.remoteHeight,
      remotePublicKey: remoteSigner.remotePublicKey,
      remoteProofSize: remoteSigner.remoteProofSize,
      localAddress: localWallet.localAddress.toUserFriendlyAddress(),
      localBalance: localWallet.localBalance,
    })

    function buildPendingTransaction(transaction: NimiqTransaction) {
      const transactionPlain = transaction.toPlain() as RecoverablePlainTransactionDetails
      const timestamp = transactionPlain.timestamp ?? (createsHtlc
        && typeof transactionPlain.validityStartHeight === 'number'
        && height.value >= 0
        && headTimestamp.value > 0
        ? headTimestamp.value - (height.value - transactionPlain.validityStartHeight) * 1000
        : Date.now())
      const plain = { ...transactionPlain, timestamp } as RecoverablePlainTransactionDetails
      const { fee, transactionHash: hash, recipient, sender, value: amount } = plain
      const raw = Nimiq.BufferUtils.toHex(transaction.serializeContent())
      const message = partialTx.transfer === Transfer.UserPaymentToMerchant || partialTx.transfer === Transfer.UserPaymentToAtomicSwap ? partialTx.message : ''
      const tx = {
        ...partialTx,
        fee,
        recipient,
        recipientType: transaction.recipientType,
        status: 'pending',
        hash,
        sender,
        senderType: transaction.senderType,
        amount,
        raw,
        message,
        proofSize: transaction.proof.length,
        validityStartHeight: plain.validityStartHeight,
        timestamp,
        asset: Asset.NIM,
        chain: Chain.Nimiq,
      } as TransactionSentByUser
      if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
        tx.paymentMethod = PaymentMethod.NIM
      return { plain, tx }
    }

    async function stageTransaction(transaction: NimiqTransaction, includeSerialization: boolean) {
      if (!remoteSigner.isWalletContextCurrent(sendContext))
        throw new Error(i18n.t('Wallet or network changed before sending'))

      const staged = buildPendingTransaction(transaction)
      stagedSend = {
        ...staged,
        ...(includeSerialization ? { serialized: transaction.toHex() } : {}),
      }
      await upsertTx(staged.tx)
      if (!remoteSigner.isWalletContextCurrent(sendContext))
        throw new Error(i18n.t('Wallet or network changed before sending'))

      if (createsHtlc)
        upsertPlainPendingByHash(syncState.pendingHtlcCreationTransactions, staged.plain)
      else if (isRemoteDrainTransfer(staged.tx.transfer))
        upsertSentPendingByHash(syncState.pendingRemoteDrainTxs, staged.tx)
      else
        upsertPlainPendingByHash(syncState.pendingTransactions, staged.plain)

      if (!remoteSigner.isWalletContextCurrent(sendContext))
        throw new Error(i18n.t('Wallet or network changed before sending'))
      if (createsHtlc) {
        const htlcData = staged.plain.data
        await remoteSigner.upsertInactiveRemoteSigner({
          active: false,
          balance: 0,
          publicKey: remoteSigner.remotePublicKey!,
          start: staged.tx.timestamp ?? Date.now(),
          address: Nimiq.Address.fromUserFriendlyAddress(staged.plain.recipient),
          end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
          proofSize: remoteSigner.remoteProofSize,
        }, sendContext)
      }

      if (isExternalTx(staged.tx) && remoteSigner.isWalletContextCurrent(sendContext))
        addTransaction(staged.tx)
    }

    function staleContextResult(errorMessage: string): TransactionSendResult {
      if (broadcastPhase === 'accepted' && stagedSend) {
        return {
          outcome: 'submitted',
          tx: stagedSend.tx,
          serialized: stagedSend.serialized!,
        }
      }
      if (stagedSend)
        return unknownResult(stagedSend, errorMessage)
      return { outcome: 'rejected', error: errorMessage }
    }

    async function cleanupRejectedStaged(errorMessage: string) {
      if (!stagedSend)
        return { outcome: 'rejected', error: errorMessage } as const
      if (!remoteSigner.isWalletContextCurrent(sendContext))
        return unknownResult(stagedSend, errorMessage)
      try {
        await updateTransactionStatus({
          hash: stagedSend.tx.hash,
          status: 'failed',
          timestamp: stagedSend.tx.timestamp,
        })
        if (!remoteSigner.isWalletContextCurrent(sendContext))
          return unknownResult(stagedSend, errorMessage)
        removePendingHash(stagedSend.tx.hash, sendContext)
        return { outcome: 'rejected', error: errorMessage } as const
      }
      catch (error) {
        logger.error('Failed to persist rejected transaction status', error)
        return unknownResult(stagedSend, errorMessage)
      }
    }

    try {
      if (!remoteSigner.isWalletContextCurrent(sendContext))
        return { outcome: 'rejected', error: i18n.t('Wallet or network changed before sending') }

      const signing = await getSignedTx(partialTx, {
        beforeRemoteBroadcast: async (transaction, swap) => {
          await stageTransaction(transaction, false)
          // The cosigner can broadcast before replying, so refunds must already be recoverable.
          if (swap) {
            await run(SQLQuery.InsertSwapHtlc, [
              transaction.recipient.toUserFriendlyAddress(),
              Number(transaction.value),
              (swap.contracts.NIM!.htlc as NimHtlcDetails).timeoutTime,
              swap.id,
              swap.status,
              null,
            ])
          }
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            throw new Error(i18n.t('Wallet or network changed before sending'))
          broadcastPhase = 'possible'
        },
      })

      if (signing.outcome === 'rejected')
        return cleanupRejectedStaged(signing.error)
      if (signing.outcome === 'unknown')
        return unknownResult(stagedSend!, signing.error)

      const { signedTx, swap, txSent } = signing
      const returnedHash = signedTx.hash()
      if (txSent === true)
        broadcastPhase = 'accepted'
      // txSent: false also covers a cosigner broadcast timeout; preserve possible submission.

      if (!remoteSigner.isWalletContextCurrent(sendContext)) {
        if (stagedSend && returnedHash !== stagedSend.tx.hash)
          return unknownResult(stagedSend, i18n.t('Cosigner returned a different transaction'))
        if (broadcastPhase === 'accepted' && stagedSend) {
          return {
            outcome: 'submitted',
            tx: stagedSend.tx,
            serialized: signedTx.toHex(),
          }
        }
        return staleContextResult(i18n.t('Wallet or network changed before sending'))
      }
      if (!stagedSend) {
        await stageTransaction(signedTx, true)
      }
      else if (returnedHash !== stagedSend.tx.hash) {
        return unknownResult(stagedSend, i18n.t('Cosigner returned a different transaction'))
      }
      else {
        stagedSend.serialized = signedTx.toHex()
      }
      if (!stagedSend)
        throw new Error(i18n.t('Transaction could not be staged'))
      const staged = stagedSend
      if (signedTx.networkId !== networkId.value)
        throw new Error(i18n.t('Transaction invalid for PoS network'))

      let patchedSwap: Promise<Swap> | undefined
      let swapStartedAt = 0
      if (swap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
        swapStartedAt = Date.now()
        logger.log('Signaling signed transaction to Fastspot', { swap })
        const { provideFundingProof } = await useFastspotApiV2()
        if (!remoteSigner.isWalletContextCurrent(sendContext))
          return staleContextResult(i18n.t('Wallet or network changed before sending'))
        if (txSent !== true)
          broadcastPhase = 'possible'
        patchedSwap = provideFundingProof(
          partialTx.paymentRef!,
          swap.contracts.NIM!.id,
          signedTx.toHex(),
        )
        void patchedSwap.catch(() => undefined)
      }

      let details = syncState.pendingPaymentTransactions.find(tx => tx.transactionHash === staged.tx.hash)
      if (!details && txSent !== true) {
        if (!remoteSigner.isWalletContextCurrent(sendContext)) {
          if ((broadcastPhase as string) === 'possible')
            return unknownResult(staged, i18n.t('Wallet or network changed before sending'))
          return cleanupRejectedStaged(i18n.t('Wallet or network changed before sending'))
        }
        broadcastPhase = 'possible'
        details = await promiseWithTimeout(
          sendContext.client.sendTransaction(signedTx),
          BROADCAST_TIMEOUT_MS,
        )
        if (!remoteSigner.isWalletContextCurrent(sendContext)) {
          if (
            details?.executionResult === false
            || details?.state === 'invalidated'
            || details?.state === 'expired'
          ) {
            return { outcome: 'rejected', error: i18n.t('Transaction invalid') }
          }
          if (
            details?.state === 'pending'
            || details?.state === 'included'
            || details?.state === 'confirmed'
          ) {
            broadcastPhase = 'accepted'
          }
          return staleContextResult(i18n.t('Wallet or network changed before sending'))
        }
      }

      if (
        details?.executionResult === false
        || details?.state === 'invalidated'
        || details?.state === 'expired'
      ) {
        logger.warn('Transaction rejected', { hash: staged.tx.hash, state: details.state, executionResult: details.executionResult ?? null })
        const errorMessage = i18n.t('Transaction invalid')
        if (!remoteSigner.isWalletContextCurrent(sendContext))
          return { outcome: 'rejected', error: errorMessage }
        try {
          await updateTransactionStatus({
            hash: staged.tx.hash,
            status: details.state === 'expired' ? 'expired' : 'failed',
            timestamp: details.timestamp,
          })
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return { outcome: 'rejected', error: errorMessage }
          removePendingHash(staged.tx.hash, sendContext)
        }
        catch (error) {
          logger.error('Failed to persist rejected transaction status', error)
        }
        if (swap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
          try {
            if (!remoteSigner.isWalletContextCurrent(sendContext))
              return { outcome: 'rejected', error: errorMessage }
            await run(SQLQuery.DeleteSwapHtlc, [staged.tx.recipient])
            if (!remoteSigner.isWalletContextCurrent(sendContext))
              return { outcome: 'rejected', error: errorMessage }
            await run(SQLQuery.DeleteSwapQuote, [staged.tx.paymentRef])
          }
          catch (error) {
            logger.error('Failed to clean rejected swap bookkeeping', error)
          }
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return { outcome: 'rejected', error: errorMessage }
          trackSwapFailed({ error_reason: errorMessage, asset: Asset.NIM })
        }
        return { outcome: 'rejected', error: errorMessage }
      }

      const accepted = txSent === true
        || details?.state === 'pending'
        || details?.state === 'included'
        || details?.state === 'confirmed'
      if (!accepted)
        return unknownResult(staged, i18n.t('Transaction submission could not be confirmed'))
      broadcastPhase = 'accepted'
      if (!remoteSigner.isWalletContextCurrent(sendContext))
        return staleContextResult(i18n.t('Wallet or network changed before sending'))

      if (details?.state === 'included' || details?.state === 'confirmed') {
        let canClearPending = true
        if (createsHtlc) {
          try {
            await remoteSigner.activateRemoteSignerFromTransaction(details, sendContext)
            if (!remoteSigner.isWalletContextCurrent(sendContext))
              return staleContextResult(i18n.t('Wallet or network changed before sending'))
          }
          catch (error) {
            canClearPending = false
            logger.error('Failed to activate included HTLC signer', error)
          }
        }
        if (canClearPending) {
          try {
            if (!remoteSigner.isWalletContextCurrent(sendContext))
              return staleContextResult(i18n.t('Wallet or network changed before sending'))
            await updateTransactionStatus({
              hash: staged.tx.hash,
              status: details.state,
              timestamp: details.timestamp,
              executionResult: details.executionResult,
            })
            if (!remoteSigner.isWalletContextCurrent(sendContext))
              return staleContextResult(i18n.t('Wallet or network changed before sending'))
          }
          catch (error) {
            canClearPending = false
            logger.error('Failed to persist accepted transaction status', error)
          }
        }
        if (!remoteSigner.isWalletContextCurrent(sendContext))
          return staleContextResult(i18n.t('Wallet or network changed before sending'))

        if (canClearPending) {
          removePendingHash(staged.tx.hash, sendContext)
          if (createsHtlc && details.state === 'included')
            upsertPlainPendingByHash(syncState.pendingHtlcCreationTransactions, details)
        }
      }

      logger.log('✈️ Sent transaction', staged.plain, { state: details?.state ?? null, executionResult: details?.executionResult ?? null })
      logger.log('✈️ Sent transaction', staged.tx)

      try {
        if (isRemoteDrainTransfer(staged.tx.transfer)) {
          const senderAddress = Nimiq.Address.fromUserFriendlyAddress(staged.tx.sender)
          const deactivated = await remoteSigner.deactivateRemoteSigner(senderAddress, sendContext)
          if (!deactivated) {
            logger.warn('Skipped stale remote signer deactivation after accepted drain', {
              address: staged.tx.sender,
            })
          }
        }
        else if (
          remoteSigner.isWalletContextCurrent(sendContext)
          && staged.tx.transfer !== Transfer.LocalToRemote
          && staged.tx.transfer !== Transfer.ExtendRemote
        ) {
          await updateActiveRemoteBalance(remoteBalance.value - staged.tx.amount)
        }
      }
      catch (error) {
        logger.error('Failed to update balances after accepted transaction', error)
      }
      if (!remoteSigner.isWalletContextCurrent(sendContext))
        return staleContextResult(i18n.t('Wallet or network changed before sending'))

      if (patchedSwap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
        try {
          const patchedSwapResult = await patchedSwap.catch(() => undefined)
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return staleContextResult(i18n.t('Wallet or network changed before sending'))
          const secret = patchedSwapResult?.preimage || await new Promise<string>((resolve, reject) => {
            let timeoutId: number
            async function checkSecret() {
              if (!remoteSigner.isWalletContextCurrent(sendContext)) {
                reject(new Error(i18n.t('Wallet or network changed before sending')))
                return
              }
              const { getSwap } = await useFastspotApiV2()
              if (!remoteSigner.isWalletContextCurrent(sendContext)) {
                reject(new Error(i18n.t('Wallet or network changed before sending')))
                return
              }
              const currentSwap = await getSwap((partialTx as MerchantTransaction).paymentRef)
              if (!remoteSigner.isWalletContextCurrent(sendContext)) {
                reject(new Error(i18n.t('Wallet or network changed before sending')))
                return
              }
              if ('preimage' in currentSwap && currentSwap.preimage) {
                window.clearTimeout(timeoutId)
                resolve(currentSwap.preimage)
              }
              else {
                timeoutId = window.setTimeout(() => void checkSecret().catch(reject), 1e3)
              }
            }
            void checkSecret().catch(reject)
          })

          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return staleContextResult(i18n.t('Wallet or network changed before sending'))
          staged.tx.meta = { secret }
          staged.tx.status = 'confirmed'
          await upsertTx(staged.tx)
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return staleContextResult(i18n.t('Wallet or network changed before sending'))
          const index = transactions.value.findIndex(tx => tx.hash === staged.tx.hash)
          if (index >= 0)
            transactions.value[index].meta = { secret }
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return staleContextResult(i18n.t('Wallet or network changed before sending'))
          trackSwapCompleted({
            swap_duration_ms: Date.now() - swapStartedAt,
            asset: Asset.NIM,
          })
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return staleContextResult(i18n.t('Wallet or network changed before sending'))
          await run(SQLQuery.DeleteSwapHtlc, [staged.tx.recipient])
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return staleContextResult(i18n.t('Wallet or network changed before sending'))
          await run(SQLQuery.DeleteSwapQuote, [staged.tx.paymentRef])
          if (!remoteSigner.isWalletContextCurrent(sendContext))
            return staleContextResult(i18n.t('Wallet or network changed before sending'))
        }
        catch (error) {
          logger.error('Failed to finish accepted swap bookkeeping', error)
        }
      }

      return {
        outcome: 'submitted',
        tx: staged.tx,
        serialized: staged.serialized!,
      }
    }
    catch (error) {
      if (broadcastPhase === 'accepted' && stagedSend) {
        logger.error('Accepted transaction bookkeeping failed', error)
        return { outcome: 'submitted', tx: stagedSend.tx, serialized: stagedSend.serialized! }
      }
      if (broadcastPhase === 'possible' && stagedSend)
        return unknownResult(stagedSend, error)
      return cleanupRejectedStaged(error instanceof Error ? error.message : String(error))
    }
  }

  const activeAssetTransactions = computed(() => transactions.value.filter(tx => (tx.asset || Asset.NIM) === activeAsset.value))
  const { filteredTransactions, searchQuery, allTransactions } = useTransactionSearch(activeAssetTransactions)

  /**
   * Reload transactions from DB, merging with any in-memory transactions
   * that might not have been persisted yet (e.g. pending transactions).
   * This ensures the in-memory list stays in sync with the database.
   */
  async function refreshFromDb() {
    // `transactions` is exported readonly, so mock injection must happen inside the store.
    // This covers boot hydration (immediate watch below), asset switches and pull-to-refresh.
    if (isMockEnabled) {
      const { getMockTransactions } = await import('@/lib/mock-data')
      transactions.value = getMockTransactions()
      return
    }

    const rawDbTxs = await query<ExternalTransaction[]>(SQLQuery.SelectTransactionsByAsset, [activeAsset.value])
    const dbTxs = await filterDisplayableTxs(rawDbTxs)
    dbTxs.forEach((tx) => {
      tx.invoiced = tx.invoiced ? JSON.parse(tx.invoiced as unknown as string) as { amount: number, currency: string } : undefined
      tx.meta = tx.meta ? JSON.parse(tx.meta as unknown as string) as Record<string, any> : undefined
      tx.executionResult = transactions.value.find(existing => existing.hash === tx.hash && existing.status === tx.status)?.executionResult
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

  async function addReceiptTransaction(tx: UserReceiptTransaction, expectedContext?: WalletContext) {
    const context = expectedContext ?? remoteSigner.getWalletContext()
    // Polygon receipts can arrive before a Nimiq client exists.
    if (context && !remoteSigner.isWalletContextCurrent(context))
      return
    // Drop drains from our own remote-signer HTLCs — see filterDisplayableTxs.
    if (tx.senderType === Nimiq.AccountType.HTLC && await remoteSigner.isOurRemoteSigner(tx.sender)) {
      logger.log(`🚫 addReceiptTransaction skipped own-HTLC drain`, { hash: tx.hash, sender: tx.sender, amount: tx.amount })
      return
    }
    if (context && !remoteSigner.isWalletContextCurrent(context))
      return
    await upsertTx(tx)
    if (context && !remoteSigner.isWalletContextCurrent(context))
      return
    addTransaction(tx)
  }

  async function addPaymentToMerchantTransaction(tx: MerchantTransaction) {
    await upsertTx(tx)
    addTransaction(tx)
  }

  async function addPolygonHistoryTransaction(tx: UserTransaction) {
    await run(UPSERT_POLYGON_HISTORY_TX, getUpsertTxValues(tx))
    const storedTx = await getStoredTransaction(tx.hash)
    if (!storedTx)
      return

    addTransaction(storedTx)
  }

  async function addPolygonSwapTransactionWithRecovery(tx: MerchantTransaction, recoveryAddress: string) {
    await runSet([
      {
        statement: SQLQuery.SetSwapHtlcTxHash,
        values: [tx.hash, recoveryAddress],
      },
      {
        statement: SQLQuery.UpsertTx,
        values: getUpsertTxValues(tx),
      },
    ])
    addTransaction(tx)
  }

  async function replacePolygonTransactionHash(oldHash: string, newHash: string, recoveryAddress?: string) {
    // Merge persisted state before the hash update removes a conflicting replacement row.
    const statements: Parameters<typeof runSet>[0] = [
      { statement: SQLQuery.MergeReplacementTxState, values: [newHash, newHash, newHash, newHash, oldHash] },
      { statement: SQLQuery.UpdateTxHash, values: [newHash, oldHash] },
    ]
    if (recoveryAddress) {
      statements.unshift({
        statement: SQLQuery.ReplaceSwapHtlcTxHash,
        values: [newHash, recoveryAddress, oldHash],
      })
    }
    await runSet(statements)

    const mergedTx = await getStoredTransaction(newHash)
    if (!mergedTx)
      return

    const otherTransactions = transactions.value.filter(tx => tx.hash !== oldHash && tx.hash !== newHash)
    transactions.value = [mergedTx, ...otherTransactions].sort(
      (a, b) => (b.timestamp || Number.MAX_SAFE_INTEGER) - (a.timestamp || Number.MAX_SAFE_INTEGER),
    )
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
    logger.log(`💸 addUnknownPaymentToMerchantTransaction`, { hash: tx.transactionHash, sender: tx.sender, senderType: tx.senderType, recipient: tx.recipient, amount: tx.value, transfer, state: tx.state, executionResult: tx.executionResult ?? null })
    const newTx = {
      transfer,
      amount: tx.value,
      sender: tx.sender,
      senderType: toAccountType(tx.senderType),
      recipient: tx.recipient,
      recipientType: toAccountType(tx.recipientType),
      hash: tx.transactionHash,
      status: tx.state,
      executionResult: tx.executionResult,
      timestamp: tx.timestamp,
      validityStartHeight: tx.validityStartHeight,
      title: 'Payment', // translated at display time
      fee: tx.fee,
      // proofSize: 'raw' in tx.proof ? tx.proof.raw.length / 2 : 0,
      // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
      proofSize: remoteSigner.remoteProofSize,
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
    // Same hash can arrive via multiple paths (incoming-tx listener + recursive HTLC traversal +
    // periodic refresh) — replace any existing entry instead of stacking duplicates.
    const others: ExternalTransaction[] = []
    let replaced: ExternalTransaction | undefined
    for (const existing of transactions.value) {
      if (existing.hash === tx.hash)
        replaced = existing
      else
        others.push(existing)
    }
    if (replaced)
      logger.log(`♻️ addTransaction replacing existing entry`, { hash: tx.hash, transfer: tx.transfer, previousTransfer: replaced.transfer })
    transactions.value = [tx, ...others].sort(
      (a, b) => (b.timestamp || Number.MAX_SAFE_INTEGER) - (a.timestamp || Number.MAX_SAFE_INTEGER),
    )
  }

  async function updateTransactionStatus({ hash, status, timestamp, executionResult }: { hash: string, status: AppTransactionState, timestamp: number | undefined, executionResult?: boolean }) {
    await run(SQLQuery.UpdateTxStatus, [status, timestamp ?? null, hash])
    const index = transactions.value.findIndex(tx => tx.hash === hash)
    if (index >= 0) {
      const nextTransactions = [...transactions.value]
      nextTransactions[index] = {
        ...nextTransactions[index],
        status,
        executionResult: executionResult ?? nextTransactions[index].executionResult,
        timestamp: timestamp ?? nextTransactions[index].timestamp,
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

  async function setPolygonSwapPreimage(txHash: string, secret: string) {
    // A replacement may rename this hash while Fastspot is resolving; never recreate the old row.
    await run(SQLQuery.SetPolygonSwapPreimage, [secret, txHash])
    const storedTx = await getStoredTransaction(txHash)
    if (storedTx && transactions.value.some(tx => tx.hash === txHash))
      addTransaction(storedTx)
    return storedTx
  }

  async function setPolygonSwapHtlcRefunded(txHash: string) {
    // Update only refund metadata so unloaded or stale cache entries cannot overwrite persisted state.
    await run(SQLQuery.SetPolygonTxRefunded, [txHash])
    const storedTx = await getStoredTransaction(txHash)
    if (!storedTx)
      return false

    const loadedIndex = transactions.value.findIndex(tx => tx.hash === txHash)
    if (loadedIndex >= 0) {
      const nextTransactions = [...transactions.value]
      nextTransactions[loadedIndex] = storedTx
      transactions.value = nextTransactions
    }
    return true
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

  // APP-132: Soft-hide a tx (cosmetic, e.g. before recording the screen). Mirrors setSwapHtlcRefunded —
  // flag lives in tx.meta, persisted via upsertTx; transactionsToShow filters it out unless the dev-menu
  // reveal toggle is on. The shallowRef reassignment is required to re-trigger the filter computed.
  async function setTxHidden(hash: string, hidden: boolean) {
    const tx = transactions.value.find(tx => tx.hash === hash)
    if (!tx)
      return
    tx.meta = { ...tx.meta, hidden }
    await upsertTx(tx)
    transactions.value = [...transactions.value]
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
    restorePendingOutgoingTransactions,
    addReceiptTransaction,
    addPaymentToMerchantTransaction,
    addPolygonHistoryTransaction,
    addPolygonSwapTransactionWithRecovery,
    replacePolygonTransactionHash,
    addUnknownPaymentToMerchantTransaction,
    addPaymentTransaction,
    addWithdrawalTransaction,
    addStakingtransaction,
    replaceTransaction,
    updateTransactionStatus,
    updateTransactionTitle,
    updateTransactionCashbackClaimed,
    setSwapHtlcRefunded,
    setPolygonSwapPreimage,
    setPolygonSwapHtlcRefunded,
    setNakaTxRefunded,
    setTxHidden,
    clearTxHistory,
    refreshFromDb,

    // Search for transactions
    transactionsToShow: computed(() => {
      const base = searchQuery.value ? filteredTransactions.value : activeAssetTransactions.value
      if (showHiddenTransactions.value)
        return base
      return base.filter(tx => !tx.meta?.hidden)
    }),
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
      return newTransactions.length
    },

    // A function that returns true if there are more transactions to load
    // FIXME: This is not exactly true, because if there is exactly DEFAULT_LIMIT transactions, it will return true, but there are no more transactions to load
    canLoadMore: () => (isMockEnabled || searchQuery.value) ? false : activeAssetTransactions.value.length % DEFAULT_LIMIT === 0,
  }
})
