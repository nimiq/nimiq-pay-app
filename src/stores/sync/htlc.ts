import type { Client, PlainAccount, PlainTransactionDetails } from '@nimiq/core'
import type { WalletContext } from '@/stores/remote-signer'
import type { SwapHtlc } from '@/types/swapHtlcs'
import type { RecoverablePlainTransactionDetails } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { SQLQuery } from '@/lib/sql-queries'
import { getLegacyHtlcValidityStartHeight, promiseWithTimeout } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { NO_ACCOUNT_ERROR, useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { upsertPlainPendingByHash, useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const logger = useLogger('useSync')
const { setToast } = useToast()
const HTLC_LOOKUP_TIMEOUT_MS = 30_000

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
  const { isTransactionPending, nodesAreSynced, pendingRemoteDrainTxs, pendingTransactions, pendingHtlcCreationTransactions, htlcCanBeExtended, walletContextGeneration } = storeToRefs(useSyncState())

  /**
   * If the local wallet gets some funds, move them to the remote wallet immediately.
   */
  async function handleFunds(bypassThreshold = false) {
    if (localBalance.value === 0)
      return
    if (isTransactionPending.value || isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying handleFunds', { pendingRemoteDrainTxs: pendingRemoteDrainTxs.value, pendingTransactions: pendingTransactions.value, pendingHtlcCreationTransactions: pendingHtlcCreationTransactions.value })
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
        return
      }
      remoteBalanceOnChain = data ?? 0
    }

    logger.log(`Local balance: ${localBalance.value / 1e5} NIM. Remote balance: ${remoteBalanceOnChain / 1e5} NIM. ${remoteBalanceOnChain === 0 ? 'Creating new HTLC' : 'Liquidating HTLC'}`)
    logger.log({ isHtlcActive: isHtlcActive.value, isRemoteOk: isRemoteOk.value, isHtlcPending: isHtlcPending.value })

    if (remoteBalanceOnChain === 0 && !isHtlcPending.value) {
      isProcessingRemote.value = true
      const result = await sendTx({ transfer: Transfer.LocalToRemote })
      if (result.outcome === 'rejected') {
        isProcessingRemote.value = false
        if (result.reason === 'busy') {
          logger.log('Delaying deposit until the pending transaction resolves')
          return
        }
        setToast({ message: i18n.t('Error while creating deposit'), type: 'error', duration: 5000 })
        logger.error('Error while creating HTLC', result.error)
      }
      return
    }

    if (!nodesAreSynced.value)
      return

    if (isHtlcActive.value && isRemoteOk.value) {
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
      isProcessingRemote.value = true
      const result = await sendTx({ transfer: Transfer.RemoteToLocal })
      if (result.outcome === 'rejected') {
        isProcessingRemote.value = false
        if (result.reason === 'busy') {
          logger.log('Delaying deposit until the pending transaction resolves')
          return
        }
        setToast({ message: i18n.t('Error while topping up deposit'), type: 'error', duration: 5000 })
        logger.error('Error while liquidating HTLC', result.error, liquidationContext)
      }
      return
    }

    logger.log(`Delaying deposit. isHtlcActive: ${isHtlcActive.value}, isRemoteOk: ${isRemoteOk.value}, isHtlcPending: ${isHtlcPending.value}`)
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
          HTLC_LOOKUP_TIMEOUT_MS,
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

    if (mode !== 'terminal')
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
        const recoveredHeight = row && getLegacyHtlcValidityStartHeight(row, networkId.value)
        if (typeof recoveredHeight === 'number' && !await backfillPendingHtlcValidityStartHeight(pending, recoveredHeight, context)) {
          if (!isHtlcContextCurrent(context))
            return
          continue
        }
      }
      let transaction: PlainTransactionDetails | undefined
      try {
        transaction = await promiseWithTimeout(context.client.getTransaction(pending.transactionHash), HTLC_LOOKUP_TIMEOUT_MS)
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
          if (transaction.state === 'included' || transaction.recipient) {
            await activateRemoteSignerFromTransaction(transaction, currentWalletContext)
          }
          if (!isHtlcContextCurrent(context))
            return
          await updateTransactionStatus({ hash: pending.transactionHash, status: transaction.state, timestamp: transaction.timestamp })
          if (!removePendingHtlcCreation(pending.transactionHash, context))
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
        try {
          // Creation is not accepted yet, so keep any funded predecessor as active signer.
          const currentWalletContext = getCurrentWalletContext(context)
          if (!currentWalletContext)
            return
          const rollbackCompleted = await rollbackActiveHtlcCreation(transaction, pending, currentWalletContext, 'nonterminal')
          if (!rollbackCompleted)
            continue
          if (!isHtlcContextCurrent(context))
            return
          if (pending.state !== transaction.state)
            await updateTransactionStatus({ hash: pending.transactionHash, status: transaction.state, timestamp: transaction.timestamp })
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

        try {
          const account = await client.value!.getAccount(htlc.address) as PlainAccount
          if (!account.balance) {
            logger.log('Swap HTLC is empty, deleting from db', htlc)
            await conn.run(SQLQuery.DeleteSwapHtlc, [htlc.address])
            continue
          }

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
            localHeight.value,
            networkId.value,
          )
          const { privateKey, publicKey } = localWallet.value
          const sig = Nimiq.Signature.create(privateKey, publicKey, refundTx.serializeContent())
          const sigProof = Nimiq.SignatureProof.singleSig(publicKey, sig).serialize()
          const proof = new Nimiq.SerialBuffer(1 + sigProof.length)
          proof.writeUint8(/* TIMEOUT_RESOLVE */ 2)
          proof.write(sigProof)
          refundTx.proof = proof
          const txDetails = await client.value!.sendTransaction(refundTx)
          if (txDetails.state !== 'invalidated')
            useTransactions().setSwapHtlcRefunded(htlc.address)
          else
            logger.error('Error while sending refund swap HTLC tx', txDetails)
        }
        catch (error) {
          logger.error('Error while refunding swap HTLC', error)
        }
      }
      conn.run(SQLQuery.DeleteExpiredSwapQuotes, [heightTimestamp])
    }
    finally {
      htlcCheckLock.value = false
    }
  }

  async function handleExpiredPolygonSwapHtlc(htlc: SwapHtlc, polygonUsdt: ReturnType<typeof import('@/stores/polygon-usdt').usePolygonUsdt>) {
    // Pre-migration rows have no on-chain HTLC ID; can't broadcast refund. Fall back to
    // the original cosmetic-only behavior so the UI still moves the tx out of "pending".
    if (!htlc.htlc_id) {
      await useConn().run(SQLQuery.DeleteSwapHtlc, [htlc.address])
      await useTransactions().updateTransactionStatus({ hash: htlc.address, status: 'expired', timestamp: undefined })
      return
    }

    try {
      const result = await polygonUsdt.refundPolygonSwapHtlc(htlc)
      if (!result.refunded && result.preimage) {
        logger.log('Skipping Polygon refund — Lightning preimage arrived late', htlc)
        await polygonUsdt.updateSingleTransaction(htlc.address)
      }
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
