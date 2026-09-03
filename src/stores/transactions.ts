import type { Transaction as NimiqTransaction, PlainTransactionDetails } from '@nimiq/core'
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
import { trackSwapCompleted, trackSwapFailed } from '@/lib/analytics'
import { Asset, Chain } from '@/lib/assets'
import { isMockEnabled } from '@/lib/mock-mode'
import { DEFAULT_LIMIT, SQLQuery } from '@/lib/sql-queries'
import { getSignedTx, toAccountType } from '@/lib/tx'
import { promiseWithTimeout } from '@/lib/utils'
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
const BROADCAST_TIMEOUT_MS = 30_000

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
  const { client, networkId } = storeToRefs(useNimiqNetwork())
  const { activeAsset, showHiddenTransactions } = storeToRefs(useApp())

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
        tx.validityStartHeight ?? null,
      ],
    )
  }

  async function clearTxHistory() {
    await run(SQLQuery.ClearTxHistory)
    // Also reset Polygon history scan state so the next sync re-scans all blocks
    const { usePolygonUsdt } = await import('@/stores/polygon-usdt')
    await usePolygonUsdt().resetHistoryState()
  }

  async function sendTx(partialTx: PartialSendTxArgs): AsyncResult<{ tx: TransactionSentByUser, serialized: string }, string> {
    if (isSendingTx.value) {
      logger.error('A transaction is already in progress')
      return { data: undefined, error: i18n.t('A transaction is already in progress') }
    }
    isSendingTx.value = true
    try {
      return await _sendTx(partialTx)
    }
    finally {
      isSendingTx.value = false
    }
  }

  async function _sendTx(partialTx: PartialSendTxArgs): AsyncResult<{ tx: TransactionSentByUser, serialized: string }, string> {
    const localWallet = useLocalWallet()
    const sync = useSync()
    const createsHtlc = partialTx.transfer === Transfer.LocalToRemote || partialTx.transfer === Transfer.ExtendRemote
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
    // Require consensus for all transactions that involve the local wallet
    if (partialTx.transfer === Transfer.LocalToRemote || partialTx.transfer === Transfer.ExtendRemote || partialTx.transfer === Transfer.RemoteToLocalAfterTimeout || partialTx.transfer === Transfer.RemoteToLocalImmediateReclaim)
      client.value!.waitForConsensusEstablished()

    function buildPendingTransaction(transaction: NimiqTransaction) {
      const plain = transaction.toPlain()
      const { fee, transactionHash: hash, recipient, sender, value: amount } = plain
      const raw = Nimiq.BufferUtils.toHex(transaction.serializeContent())
      const message = partialTx.transfer === Transfer.UserPaymentToMerchant || partialTx.transfer === Transfer.UserPaymentToAtomicSwap ? partialTx.message : ''
      const tx = { ...partialTx, fee, recipient, recipientType: transaction.recipientType, status: 'pending', hash, sender, senderType: transaction.senderType, amount, raw, message, proofSize: transaction.proof.length, validityStartHeight: plain.validityStartHeight, asset: Asset.NIM, chain: Chain.Nimiq } as TransactionSentByUser
      if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
        tx.paymentMethod = PaymentMethod.NIM
      if (!tx.timestamp)
        tx.timestamp = Date.now()
      return { plain, tx }
    }

    let stagedHtlcCreation: (ReturnType<typeof buildPendingTransaction> & { serialized: string }) | undefined
    function trackPendingHtlcCreation(transaction: PlainTransactionDetails) {
      const index = sync.pendingHtlcCreationTransactions.findIndex(tx => tx.transactionHash === transaction.transactionHash)
      if (index >= 0)
        sync.pendingHtlcCreationTransactions.splice(index, 1, transaction)
      else
        sync.pendingHtlcCreationTransactions.push(transaction)
    }

    async function stageHtlcCreation(transaction: NimiqTransaction) {
      // Finish durable recovery writes before any path can broadcast the HTLC creation.
      const staged = buildPendingTransaction(transaction)
      const htlcData = staged.plain.data
      await remoteSigner.upsertInactiveRemoteSigner({
        active: false,
        balance: 0,
        publicKey: remoteSigner.remotePublicKey!,
        start: await remoteSigner.blockHeightToTimestamp(staged.plain.validityStartHeight),
        address: Nimiq.Address.fromUserFriendlyAddress(staged.plain.recipient),
        end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
        proofSize: remoteSigner.remoteProofSize,
      })
      await upsertTx(staged.tx)
      trackPendingHtlcCreation(staged.plain as PlainTransactionDetails)
      stagedHtlcCreation = { ...staged, serialized: transaction.toHex() }
    }

    function retainUnknownStagedHtlc() {
      if (!stagedHtlcCreation)
        return
      // Once the cosigner sees an extension it may broadcast it, even if its response is lost.
      logger.warn('HTLC extension outcome unknown; retaining recovery state', stagedHtlcCreation.plain.transactionHash)
      return { data: { tx: stagedHtlcCreation.tx, serialized: stagedHtlcCreation.serialized }, error: undefined }
    }

    let res: Awaited<ReturnType<typeof getSignedTx>>
    try {
      res = await getSignedTx(partialTx, partialTx.transfer === Transfer.ExtendRemote
        ? { beforeRemoteBroadcast: stageHtlcCreation }
        : undefined)
    }
    catch (error) {
      const stagedResult = retainUnknownStagedHtlc()
      if (stagedResult)
        return stagedResult
      throw error
    }
    if (res.error) {
      logger.error('Error while signing transaction', res.error, {
        transfer: partialTx.transfer,
        remoteAddress: remoteSigner.remoteAddress?.toUserFriendlyAddress(),
        remoteBalance: remoteSigner.remoteBalance,
        remoteHeight: remoteSigner.remoteHeight,
        remotePublicKey: remoteSigner.remotePublicKey,
        remoteProofSize: remoteSigner.remoteProofSize,
        localAddress: localWallet.localAddress.toUserFriendlyAddress(),
        localBalance: localWallet.localBalance,
      })
      const stagedResult = retainUnknownStagedHtlc()
      if (stagedResult)
        return stagedResult
      return res
    }
    const { signedTx, swap, txSent } = res.data!
    const signedHash = signedTx.hash()
    // TODO: check if tx is valid before continuing
    logger.log('✈️ Signed transaction', { signedTx: signedTx.toPlain(), swap, txSent })
    if (stagedHtlcCreation && signedHash !== stagedHtlcCreation.plain.transactionHash) {
      // Keep recovery tied to the exact transaction persisted before the cosigner request.
      logger.error('Cosigner changed staged HTLC transaction', {
        stagedHash: stagedHtlcCreation.plain.transactionHash,
        returnedHash: signedHash,
      })
      return retainUnknownStagedHtlc()!
    }

    let patchedSwap: Promise<Swap> | undefined
    let swapStartedAt = 0
    if (swap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
      swapStartedAt = Date.now()
      // Signal the signed transaction to Fastspot as early as possible
      logger.log('Signaling signed transaction to Fastspot', { swap })
      const { provideFundingProof } = await useFastspotApiV2()
      patchedSwap = provideFundingProof(
        partialTx.paymentRef!,
        swap!.contracts.NIM!.id,
        signedTx.toHex(),
      )

      // Enter the swap HTLC into the database, to make sure we have it in case we need to refund it later.
      // NIM rows reclaim by HTLC address (TIMEOUT_RESOLVE proof), so htlc_id is null — only Polygon needs it.
      await run(
        SQLQuery.InsertSwapHtlc,
        [
          signedTx.recipient.toUserFriendlyAddress(),
          Number(signedTx.value),
          (swap.contracts.NIM!.htlc as NimHtlcDetails).timeoutTime,
          swap.id,
          swap.status,
          null,
        ],
      )
    }

    // Check if the tx is already in the transaction list
    if (transactions.value.some(tx => tx.hash === signedHash)) {
      logger.error('Transaction already sent', signedTx)
      return { data: undefined, error: i18n.t('Transaction already sent') }
    }

    if (signedTx.networkId !== networkId.value) {
      logger.error('Transaction invalid for PoS network', { networkId: signedTx.networkId, expectedNetworkId: networkId.value, signedTx })
      return { data: undefined, error: i18n.t('Transaction invalid for PoS network') }
    }

    if (createsHtlc && !stagedHtlcCreation) {
      // Persist recovery anchors before broadcast in case the RPC result is lost.
      await stageHtlcCreation(signedTx)
    }
    const { plain, tx } = stagedHtlcCreation || buildPendingTransaction(signedTx)
    const { transactionHash: hash } = plain

    // The cosigner may already have broadcast this transaction; reuse observed details first.
    let details = sync.pendingPaymentTransactions.find(tx => tx.transactionHash === hash)
    if (!details && !txSent) {
      logger.error('Transaction not sent by the cosigner, sending again', plain)
      await client.value!.waitForConsensusEstablished()
      try {
        details = await promiseWithTimeout(client.value!.sendTransaction(signedTx), BROADCAST_TIMEOUT_MS)
      }
      catch (error) {
        if (!createsHtlc)
          throw error
        const errorName = error instanceof Error ? error.name : typeof error
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('HTLC creation broadcast result unknown; retaining recovery state', hash, errorName, errorMessage)
        // An RPC failure cannot prove rejection, so keep the pending HTLC recoverable.
        trackPendingHtlcCreation(plain as PlainTransactionDetails)
        return { data: { tx, serialized: signedTx.toHex() }, error: undefined }
      }
    }

    if (details?.state === 'invalidated' || details?.executionResult === false) {
      logger.error('Transaction invalid', details)
      if (createsHtlc)
        await updateTransactionStatus({ hash, status: 'failed', timestamp: details.timestamp })

      if (swap && partialTx.transfer === Transfer.UserPaymentToAtomicSwap) {
        const serverSwap = await patchedSwap?.catch(() => undefined)
        if (!serverSwap || !serverSwap.preimage)
          await run(SQLQuery.DeleteSwapHtlc, [signedTx.recipient.toUserFriendlyAddress()])
        trackSwapFailed({
          error_reason: 'Transaction invalidated by mempool',
          asset: Asset.NIM,
        })
      }

      return { data: undefined, error: i18n.t('Transaction invalid') }
    }

    if (createsHtlc) {
      if (details?.state === 'included' || details?.state === 'confirmed') {
        // Inclusion is authoritative enough to use the signer; pending results can still fail.
        await remoteSigner.activateRemoteSignerFromTransaction(details)
      }
      else if (!details && !txSent) {
        logger.error('Transaction details are undefined, cannot update remote signer', partialTx)
      }

      trackPendingHtlcCreation((details || plain) as PlainTransactionDetails)
    }

    logger.log('✈️ Sent transaction', plain)
    logger.log(`✈️ Sent transaction`, tx)

    // HTLC creations were already persisted before broadcast.
    if (!createsHtlc)
      await upsertTx(tx)

    if (isExternalTx(tx))
      // Not using unshift to keep reactivity
      transactions.value = [tx, ...transactions.value]

    if (tx.transfer === Transfer.RemoteToLocal || tx.transfer === Transfer.RemoteToLocalAfterTimeout || tx.transfer === Transfer.RemoteToLocalImmediateReclaim) {
      // Only clear the active signer if this transaction drained the active signer.
      const activeRemoteAddress = remoteSigner.remoteAddress
      const senderAddress = Nimiq.Address.fromUserFriendlyAddress(tx.sender)
      if (activeRemoteAddress?.equals(senderAddress))
        await remoteSigner.updateRemoteSigner(undefined)
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

      trackSwapCompleted({
        swap_duration_ms: Date.now() - swapStartedAt,
        asset: Asset.NIM,
      })

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
    // Drop drains from our own remote-signer HTLCs — see filterDisplayableTxs.
    if (tx.senderType === Nimiq.AccountType.HTLC && await remoteSigner.isOurRemoteSigner(tx.sender)) {
      logger.log(`🚫 addReceiptTransaction skipped own-HTLC drain`, { hash: tx.hash, sender: tx.sender, amount: tx.amount })
      return
    }
    await upsertTx(tx)
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
    logger.log(`💸 addUnknownPaymentToMerchantTransaction`, { hash: tx.transactionHash, sender: tx.sender, senderType: tx.senderType, recipient: tx.recipient, amount: tx.value, transfer })
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

  // Polygon swap rows key by tx hash because tx.recipient is the shared HTLC contract address.
  async function setPolygonSwapHtlcRefunded(txHash: string) {
    const tx = transactions.value.find(tx => tx.hash === txHash)
    if (!tx)
      return
    tx.meta = {
      ...tx.meta,
      refunded: true,
    }
    await upsertTx(tx)
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
