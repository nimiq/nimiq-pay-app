import type { PlainAccount, PlainTransactionDetails } from '@nimiq/core'
import type { RemoteSigner } from '@/lib/sql-queries'
import type { RemoteSignerDiscoveryResult, ValidatedRemoteSigner, WalletContext } from '@/stores/remote-signer'
import type { TransactionSendResult } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { trackSyncSlow } from '@/lib/analytics'
import { isMockEnabled } from '@/lib/mock-mode'
import { HTLC_EXTENSIONS_WALKED_KV_KEY, HTLC_HISTORY_CHECKED_KV_KEY, SQLQuery } from '@/lib/sql-queries'
import { promiseWithTimeout } from '@/lib/utils'
import { kv } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { parseAddress, useRemoteSigner } from '@/stores/remote-signer'
import { useSyncBalances } from '@/stores/sync/balances'
import { useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const logger = useLogger('useSync')
const STRAY_HTLC_LOOKUP_TIMEOUT_MS = 30_000
const STRAY_HTLC_BATCH_SIZE = 20
const VERIFY_SLOW_MS = 2 * 60 * 1e3
const VERIFY_WEDGED_MS = 5 * 60 * 1e3

export type TargetedRemoteSignerRecoveryResult
  = | { status: 'submitted', transactionHash: string }
    | { status: 'unknown', transactionHash: string }
    | { status: 'deferred', reason: 'wallet-busy' | 'history-incomplete' | 'outgoing-transaction' | 'no-consensus' }
    | { status: 'rejected', reason: string }

function hasOutgoingTransactionForExactTarget(
  transactions: PlainTransactionDetails[],
  targetAddress: string,
) {
  // Confirmed transfers are complete; they must not block recovery of the remaining balance.
  return transactions.some(transaction =>
    transaction.sender === targetAddress
    && transaction.executionResult !== false
    && ['new', 'pending', 'included'].includes(transaction.state),
  )
}

export const useSyncRemoteSigners = defineStore('sync-remote-signers', () => {
  const { getBalance } = useNimiqNetwork()
  const { consensus, headTimestamp } = storeToRefs(useNimiqNetwork())
  const { isSendingTx } = storeToRefs(useLocks())
  const { pendingRemoteDrainTxs, pendingTransactions, pendingHtlcCreationTransactions, isTransactionPending, isVerifyingRemoteSignersDb, htlcHistoryChecked, htlcExtensionsWalked } = storeToRefs(useSyncState())
  const { loadHtlcHistoryFlags } = useSyncState()
  const { updateBalances } = useSyncBalances()
  const { sendTx } = useTransactions()
  const remoteSignerStore = useRemoteSigner()
  const {
    discoverRemoteSignersFromBlockchain,
    scanLocalHtlcCreations,
    getAllRemoteSigners,
    getAllTransactionsForAddress,
    getWalletContext,
    isCosignerAddress,
    isWalletContextCurrent,
    registerValidatedRemoteSigner,
  } = remoteSignerStore

  /**
   * Sends all the funds from the remote signer to the local signer.
   */
  async function drainRemoteSigner(
    // proofSize is only needed before the timeout, for the cosigned reclaim.
    { address, end, proofSize = 0 }: Pick<RemoteSigner, 'address' | 'end'> & Partial<Pick<RemoteSigner, 'proofSize'>>,
    expectedContext?: WalletContext,
  ): Promise<TransactionSendResult | undefined> {
    const context = expectedContext ?? remoteSignerStore.getWalletContext()
    if (!context) {
      return {
        outcome: 'rejected',
        error: i18n.t('Nimiq network unavailable'),
      }
    }
    if (!remoteSignerStore.isWalletContextCurrent(context)) {
      return {
        outcome: 'rejected',
        error: i18n.t('Wallet or network changed before sending'),
      }
    }

    const { data: balance, error } = await useNimiqNetwork().getBalance(address)
    if (error) {
      logger.error(`Error while draining remote signer. ${error}`, { address: address.toUserFriendlyAddress() })
      const errorMessage = (error as unknown) instanceof Error ? (error as unknown as Error).message : String(error)
      return { outcome: 'rejected', error: errorMessage }
    }
    if (!remoteSignerStore.isWalletContextCurrent(context)) {
      return {
        outcome: 'rejected',
        error: i18n.t('Wallet or network changed before sending'),
      }
    }
    if (balance === 0) {
      logger.log('Remote signer is empty, updating balance', { address: address.toUserFriendlyAddress })
      await remoteSignerStore.updateRemoteSignerBalance(balance, address, context)
      return undefined
    }

    const afterTimeout = end < headTimestamp.value
    const result = afterTimeout
      ? await sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: balance, sender: address }, context)
      : await sendTx({ transfer: Transfer.RemoteToLocalImmediateReclaim, amount: balance, sender: address, proofSize }, context)
    if (result.outcome === 'rejected')
      logger.error(`Error while draining remote signer. ${result.error}`, { address: address.toUserFriendlyAddress(), amount: balance })
    else
      logger.log('Draining remote signer', { address: address.toUserFriendlyAddress(), amount: balance })
    return result
  }

  async function recoverRemoteSigner(
    candidate: Pick<ValidatedRemoteSigner, 'address'>,
    timeout?: number,
  ): Promise<TargetedRemoteSignerRecoveryResult> {
    const context = getWalletContext()
    if (!context)
      return { status: 'rejected', reason: 'Wallet or network unavailable' }

    let signer: Parameters<typeof drainRemoteSigner>[0]
    // Past timeout only our key can move it, so skip the cosigner metadata, which may be unavailable.
    if (timeout !== undefined && timeout < headTimestamp.value) {
      // Without consensus headTimestamp is the device clock, which can claim a timeout chain time hasn't reached.
      if (consensus.value !== 'established')
        return { status: 'deferred', reason: 'no-consensus' }
      signer = { address: Nimiq.Address.fromString(candidate.address), end: timeout }
    }
    else {
      try {
        signer = (await registerValidatedRemoteSigner(candidate)).signer
      }
      catch (error) {
        return {
          status: 'rejected',
          reason: error instanceof Error ? error.message : String(error),
        }
      }
    }
    if (!isWalletContextCurrent(context)) {
      return {
        status: 'rejected',
        reason: 'Wallet or network changed during recovery',
      }
    }
    if (isTransactionPending.value || isSendingTx.value)
      return { status: 'deferred', reason: 'wallet-busy' }

    const history = await getAllTransactionsForAddress(signer.address)
    if (!isWalletContextCurrent(context)) {
      return {
        status: 'rejected',
        reason: 'Wallet or network changed during recovery',
      }
    }
    if (!history.complete)
      return { status: 'deferred', reason: 'history-incomplete' }
    if (hasOutgoingTransactionForExactTarget(history.transactions, candidate.address))
      return { status: 'deferred', reason: 'outgoing-transaction' }

    const result = await drainRemoteSigner(signer, context)
    if (result?.outcome === 'submitted')
      return { status: 'submitted', transactionHash: result.tx.hash }
    if (result?.outcome === 'unknown')
      return { status: 'unknown', transactionHash: result.stagedHash }
    if (!isWalletContextCurrent(context)) {
      return {
        status: 'rejected',
        reason: 'Wallet or network changed during recovery',
      }
    }
    if (!result) {
      return {
        status: 'rejected',
        reason: 'No recoverable balance found for this HTLC',
      }
    }
    return { status: 'rejected', reason: result.error }
  }

  /**
   * Drains one funded HTLC of ours that is not the active signer, found from chain data alone.
   * Runs even when discovery is incomplete: a drain into our own wallet is safe whatever else exists,
   * and one failed cosigner lookup among hundreds of old HTLCs must not strand funds.
   * 'clean' means full history, including HTLC extensions, and every account lookup showed no such HTLC.
   */
  async function recoverStrayFundedHtlc(
    discovery: Pick<RemoteSignerDiscoveryResult, 'createdHtlcs' | 'historyComplete'>,
    context: WalletContext,
  ): Promise<'recovering' | 'clean' | 'unclear'> {
    const storedAddresses = (await getAllRemoteSigners()).map(signer => signer.address.toUserFriendlyAddress())
    if (!isWalletContextCurrent(context))
      return 'unclear'
    const addresses = [...new Set([...discovery.createdHtlcs, ...storedAddresses])]
    let complete = discovery.historyComplete
    if (addresses.length === 0)
      return complete ? 'clean' : 'unclear'

    try {
      await promiseWithTimeout(context.client.waitForConsensusEstablished(), STRAY_HTLC_LOOKUP_TIMEOUT_MS)
    }
    catch {
      logger.log('Consensus unavailable. Delaying stray HTLC sweep')
      return 'unclear'
    }
    if (!isWalletContextCurrent(context))
      return 'unclear'

    // Extensions are created by an HTLC, not the local wallet, so local history misses them and a fresh
    // database has not stored them yet. Follow HTLC history until the gate opens; the account lookup
    // below decides which ones are ours.
    if (!(await loadHtlcHistoryFlags()).walked) {
      const known = new Set(addresses)
      for (let index = 0; index < addresses.length; index++) {
        const history = await getAllTransactionsForAddress(Nimiq.Address.fromString(addresses[index]))
        if (!isWalletContextCurrent(context))
          return 'unclear'
        if (!history.complete)
          complete = false
        for (const transaction of history.transactions) {
          if (transaction.sender === addresses[index] && transaction.recipientType === 'htlc' && !known.has(transaction.recipient)) {
            known.add(transaction.recipient)
            addresses.push(transaction.recipient)
          }
        }
      }
    }

    const funded: { address: string, timeout: number }[] = []
    for (let offset = 0; offset < addresses.length; offset += STRAY_HTLC_BATCH_SIZE) {
      const batch = addresses.slice(offset, offset + STRAY_HTLC_BATCH_SIZE)
      let accounts: PlainAccount[]
      try {
        accounts = await promiseWithTimeout(
          context.client.getAccounts(batch.map(address => Nimiq.Address.fromString(address))),
          STRAY_HTLC_LOOKUP_TIMEOUT_MS,
        )
      }
      catch (error) {
        logger.error('Error getting accounts for stray HTLC sweep', error)
        complete = false
        continue
      }
      if (!isWalletContextCurrent(context))
        return 'unclear'
      accounts.forEach((account, index) => {
        if (account.type === 'htlc'
          && account.balance > 0
          && account.sender === context.owner
          && isCosignerAddress(account.recipient)) {
          funded.push({ address: batch[index], timeout: account.timeout })
        }
      })
    }

    const activeAddress = remoteSignerStore.remoteAddress?.toUserFriendlyAddress()
    // Our own creation stays inactive until its inclusion is handled; draining it would loop.
    const creating = new Set(pendingHtlcCreationTransactions.value.map(transaction => transaction.recipient))
    // Without a funded active signer (e.g. the cosigner reports a newer, empty HTLC), every funded one is
    // drained: activation needs cosigner metadata that may never resolve, and draining into the wallet is safe.
    const strays = funded.filter(htlc => htlc.address !== activeAddress && !creating.has(htlc.address))
    if (strays.length === 0)
      // Any other funded HTLC, even our own creation still settling, means a split is live.
      return complete && funded.every(htlc => htlc.address === activeAddress) ? 'clean' : 'unclear'

    // One unrecoverable stray must not block the others.
    for (const target of strays.sort((a, b) => a.timeout - b.timeout)) {
      // An activation landing mid-sweep may have made a stray the real signer.
      if (isTransactionPending.value || isSendingTx.value || !isWalletContextCurrent(context)
        || remoteSignerStore.remoteAddress?.toUserFriendlyAddress() !== activeAddress) {
        return 'unclear'
      }
      logger.log('🧲 Recovering funded HTLC that is not the active signer', { target, activeAddress, funded: funded.length })
      const result = await recoverRemoteSigner({ address: target.address }, target.timeout)
      logger.log('🧲 Stray HTLC recovery result', { address: target.address, result })
      if (result.status === 'submitted' || result.status === 'unknown')
        return 'recovering'
    }
    return 'unclear'
  }

  async function ensureSingleRemoteActive(context: WalletContext) {
    const remoteSigners = await useConn().query<RemoteSigner[]>(SQLQuery.GetActiveRemoteSigner).then(parseAddress)
    if (!remoteSignerStore.isWalletContextCurrent(context))
      return false
    if (remoteSigners.length <= 1)
      return false

    logger.log('😵‍💫 There are multiple active remote signers. Checking balances...', { remoteSigners })

    const remoteSignersWithBalance: RemoteSigner[] = []
    for (const remoteSigner of remoteSigners) {
      const { data: balance, error } = await getBalance(remoteSigner.address)
      if (!remoteSignerStore.isWalletContextCurrent(context))
        return false
      if (error) {
        logger.error('Error while getting balance in ensureSingleRemoteActive', error)
        continue
      }
      if (balance > 0)
        remoteSignersWithBalance.push(remoteSigner)
    }

    if (remoteSignersWithBalance.length === 1) {
      logger.log('🫥 There is one remote signers with a balance greater than zero. Setting the one with balance as active', remoteSignersWithBalance[0].address.toUserFriendlyAddress())
      await useRemoteSigner().updateRemoteSigner({
        ...remoteSignersWithBalance[0],
        active: true,
      }, context)
    }
    else {
      logger.log('😱 There are multiple active remote signers with a balance greater than zero. Draining them', remoteSignersWithBalance.map((x) => {
        return { ...x, address: x.address.toUserFriendlyAddress() }
      }))
      return await drainFirstRecoverableSigner(remoteSignersWithBalance, context)
    }

    await updateBalances()
    return false
  }

  /**
   * This function ensures that there is only one active remote signer with a balance greater than zero.
   */
  async function ensureSingleRemoteSignerWithBalance(context: WalletContext) {
    const remoteSigners = await useConn().query<RemoteSigner[]>(SQLQuery.GetRemoteSignerWithBalance).then(parseAddress)
    if (!remoteSignerStore.isWalletContextCurrent(context))
      return false
    if (remoteSigners.length === 0)
      return false

    if (remoteSigners.length === 1) {
      const { active, balance, address, start, end, proofSize, publicKey } = remoteSigners[0]
      const { data: newBalance, error } = await getBalance(address)
      if (!remoteSignerStore.isWalletContextCurrent(context))
        return false
      if (error) {
        logger.error('Error while getting balance in ensureSingleRemoteSignerWithBalance', error)
        return false
      }
      if (newBalance !== balance) {
        logger.error('Balance in db is different from balance in blockchain in ensureSingleRemoteSignerWithBalance', { balance, newBalance })
        await remoteSignerStore.updateRemoteSignerBalance(newBalance, address, context)
        return false
      }
      if (newBalance > 0 && !active) {
        logger.log('🫥 There is one remote signers with a balance greater than zero, but it is not the active one. Setting the one with balance as active')
        await useRemoteSigner().updateRemoteSigner({
          active: true,
          balance,
          address,
          publicKey,
          start,
          end,
          proofSize,
        }, context)
        await updateBalances()
      }
      return false
    }

    logger.log('😱 There are multiple remote signers with a balance greater than zero. Initiating transactions to transfer funds to the local wallet', remoteSigners.map((x) => {
      return { ...x, address: x.address.toUserFriendlyAddress() }
    }))
    return await drainFirstRecoverableSigner(remoteSigners, context)
  }

  async function drainFirstRecoverableSigner(signers: RemoteSigner[], context: WalletContext) {
    if (!remoteSignerStore.isWalletContextCurrent(context))
      return false
    const recoverable = signers
      .filter(signer => signer.start < headTimestamp.value)
      .sort((a, b) => Number(a.active) - Number(b.active) || a.start - b.start)
    if (recoverable.length === 0) {
      logger.log('🫠 There are multiple remote signers with a balance greater than zero, but cannot be drained yet... Delaying draining')
      return false
    }
    const result = await drainRemoteSigner(recoverable[0], context)
    return result?.outcome === 'submitted' || result?.outcome === 'unknown'
  }

  async function verifyRemoteSignersDb({ discoveryResult }: { discoveryResult?: RemoteSignerDiscoveryResult } = {}) {
    // No client in mock mode — discoverRemoteSignersFromBlockchain would await it forever
    // and wedge pull-to-refresh.
    if (isMockEnabled)
      return

    if (isVerifyingRemoteSignersDb.value) {
      logger.log('Remote signer DB verification already running. Skipping duplicate run')
      return
    }
    if (isTransactionPending.value || isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying remote signer DB verification', { pendingRemoteDrainTxs: pendingRemoteDrainTxs.value, pendingTransactions: pendingTransactions.value, pendingHtlcCreationTransactions: pendingHtlcCreationTransactions.value })
      return
    }

    isVerifyingRemoteSignersDb.value = true
    const startedAt = Date.now()
    // A run that never settles blocks reconciliation silently, so report it while it is still running.
    const wedgedTimeout = setTimeout(() => trackSyncSlow({ duration_ms: Date.now() - startedAt, finished: false }), VERIFY_WEDGED_MS)
    let result: RemoteSignerDiscoveryResult | undefined
    try {
      // History alone finds funded HTLCs in seconds; slow cosigner validation runs after the sweep.
      const scan = discoveryResult ? undefined : await scanLocalHtlcCreations()
      const sweepInput = discoveryResult ?? (scan && { createdHtlcs: scan.creations.map(transaction => transaction.recipient), historyComplete: scan.historyComplete })
      // The scan's own context: a wallet switch since then must not sweep (and mark clean) the wrong wallet.
      const sweepContext = scan?.context ?? remoteSignerStore.getWalletContext()
      const sweep = sweepContext && sweepInput
        ? await recoverStrayFundedHtlc(sweepInput, sweepContext).catch((error) => {
          // A failed sweep proves nothing; discovery and reconciliation below still run.
            logger.error('Error while sweeping for stray funded HTLCs', error)
            return 'unclear' as const
          })
        : 'unclear'
      // A clean sweep before the walk was recorded followed every extension, so it settles both.
      if (sweep === 'clean' && !htlcExtensionsWalked.value && sweepContext && isWalletContextCurrent(sweepContext)) {
        try {
          await kv().setItem(HTLC_HISTORY_CHECKED_KV_KEY, '1')
          await kv().setItem(HTLC_EXTENSIONS_WALKED_KV_KEY, '1')
          htlcHistoryChecked.value = true
          htlcExtensionsWalked.value = true
        }
        catch (error) {
          // Unrecorded, the next clean sweep records it; discovery and reconciliation still run.
          logger.error('Failed to record the HTLC history check', error)
        }
      }
      if (sweep === 'recovering') {
        logger.log('Stray HTLC recovery started. Skipping remaining checks until it settles')
        return
      }
      // Discovery scans again: an HTLC created while the sweep ran would be missing from the earlier scan.
      result = discoveryResult ?? await discoverRemoteSignersFromBlockchain()
      // Unseen HTLCs can change which signer should stay active or be reclaimed.
      if (!result.localComplete) {
        logger.log('Remote signer discovery incomplete. Delaying reconciliation', result.errors)
        return
      }
      await useRemoteSigner().updateSignersTableBalance()
      const reconciliationContext = remoteSignerStore.getWalletContext()
      if (!reconciliationContext)
        return
      const recoveryStarted = await ensureSingleRemoteActive(reconciliationContext)
      if (recoveryStarted || isTransactionPending.value || isSendingTx.value) {
        logger.log('Remote signer DB verification started recovery transactions. Skipping remaining checks until they settle')
        return
      }
      await ensureSingleRemoteSignerWithBalance(reconciliationContext)
    }
    finally {
      isVerifyingRemoteSignersDb.value = false
      clearTimeout(wedgedTimeout)
      const durationMs = Date.now() - startedAt
      if (durationMs > VERIFY_SLOW_MS || (result && !result.localComplete)) {
        trackSyncSlow({
          duration_ms: durationMs,
          finished: true,
          discovery_complete: result?.localComplete,
          error_count: result?.errors.length,
        })
      }
    }
  }

  return {
    drainRemoteSigner,
    recoverRemoteSigner,
    verifyRemoteSignersDb,
  }
})
