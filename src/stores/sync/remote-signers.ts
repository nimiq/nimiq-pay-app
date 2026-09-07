import type { PlainTransactionDetails } from '@nimiq/core'
import type { RemoteSigner } from '@/lib/sql-queries'
import type { RemoteSignerDiscoveryResult, RemoteSignerValidationDetails, ValidatedRemoteSigner, WalletContext } from '@/stores/remote-signer'
import type { TransactionSendResult } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isMockEnabled } from '@/lib/mock-mode'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from '@/stores/conn'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { parseAddress, useRemoteSigner } from '@/stores/remote-signer'
import { useSyncBalances } from '@/stores/sync/balances'
import { useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const logger = useLogger('useSync')

export type TargetedRemoteSignerRecoveryResult
  = | { status: 'submitted', transactionHash: string }
    | { status: 'unknown', transactionHash: string }
    | { status: 'deferred', reason: 'wallet-busy' | 'history-incomplete' | 'outgoing-transaction' }
    | { status: 'rejected', reason: string }

function hasOutgoingTransactionForExactTarget(
  transactions: PlainTransactionDetails[],
  targetAddress: string,
) {
  return transactions.some(transaction =>
    transaction.sender === targetAddress
    && transaction.executionResult !== false
    && ['new', 'pending', 'included', 'confirmed'].includes(transaction.state),
  )
}

export const useSyncRemoteSigners = defineStore('sync-remote-signers', () => {
  const { getBalance } = useNimiqNetwork()
  const { headTimestamp } = storeToRefs(useNimiqNetwork())
  const { isSendingTx } = storeToRefs(useLocks())
  const { pendingRemoteDrainTxs, pendingTransactions, pendingHtlcCreationTransactions, isTransactionPending, isVerifyingRemoteSignersDb } = storeToRefs(useSyncState())
  const { updateBalances } = useSyncBalances()
  const { sendTx } = useTransactions()
  const remoteSignerStore = useRemoteSigner()
  const {
    discoverRemoteSignersFromBlockchain,
    getAllTransactionsForAddress,
    getWalletContext,
    isWalletContextCurrent,
    registerValidatedRemoteSigner,
  } = remoteSignerStore

  /**
   * Sends all the funds from the remote signer to the local signer.
   */
  async function drainRemoteSigner(
    { address, end, proofSize }: RemoteSigner,
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
    candidate: ValidatedRemoteSigner,
  ): Promise<TargetedRemoteSignerRecoveryResult> {
    const context = getWalletContext()
    if (!context)
      return { status: 'rejected', reason: 'Wallet or network unavailable' }

    let target: RemoteSignerValidationDetails
    try {
      target = await registerValidatedRemoteSigner(candidate)
    }
    catch (error) {
      return {
        status: 'rejected',
        reason: error instanceof Error ? error.message : String(error),
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

    const history = await getAllTransactionsForAddress(target.signer.address)
    if (!isWalletContextCurrent(context)) {
      return {
        status: 'rejected',
        reason: 'Wallet or network changed during recovery',
      }
    }
    if (!history.complete)
      return { status: 'deferred', reason: 'history-incomplete' }
    if (hasOutgoingTransactionForExactTarget(history.transactions, target.address))
      return { status: 'deferred', reason: 'outgoing-transaction' }

    const result = await drainRemoteSigner(target.signer, context)
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
    try {
      const result = discoveryResult ?? await discoverRemoteSignersFromBlockchain()
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
    }
  }

  return {
    drainRemoteSigner,
    recoverRemoteSigner,
    verifyRemoteSignersDb,
  }
})
