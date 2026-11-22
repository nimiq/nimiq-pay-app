import { defineStore, storeToRefs } from 'pinia'
import { useSyncBalances } from '@/stores/sync/balances'
import { useSyncHtlc } from '@/stores/sync/htlc'
import { useSyncLifecycle } from '@/stores/sync/lifecycle'
import { useSyncRemoteSigners } from '@/stores/sync/remote-signers'
import {
  HTLC_HISTORY_CHECK_HOLD_MS,
  MAX_MS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA,
  useSyncState,
} from '@/stores/sync/state'
import { useSyncTransactions } from '@/stores/sync/transactions'

export {
  HTLC_HISTORY_CHECK_HOLD_MS,
  MAX_MS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA,
}

export const useSync = defineStore('sync', () => {
  const syncState = useSyncState()
  const { updateBalances } = useSyncBalances()
  const { handleFunds } = useSyncHtlc()
  const { syncWallets } = useSyncLifecycle()
  const { recoverRemoteSigner, verifyRemoteSignersDb } = useSyncRemoteSigners()
  const { updateSingleTransaction, updateTransactionHistory } = useSyncTransactions()
  const {
    pendingTransactions,
    pendingPaymentTransactions,
    isTransactionPending,
    hasPendingHtlcCreation,
    nodesAreSynced,
    pendingHtlcCreationTransactions,
    htlcCanBeExtended,
    blocksUntilNextMacroBlock,
    htlcHistoryChecked,
    htlcCheckHoldStartedAt,
    lastFundsBlockReason,
  } = storeToRefs(syncState)

  return {
    syncWallets,
    updateBalances,
    updateSingleTransaction,
    updateTransactionHistory,
    pendingTransactions,
    pendingPaymentTransactions,
    isTransactionPending,
    hasPendingHtlcCreation,
    nodesAreSynced,
    pendingHtlcCreationTransactions,
    htlcCanBeExtended,
    blocksUntilNextMacroBlock,
    htlcHistoryChecked,
    htlcCheckHoldStartedAt,
    lastFundsBlockReason,
    handleFunds,
    recoverRemoteSigner,
    verifyRemoteSignersDb,
  }
})
