import type { PlainTransactionDetails } from '@nimiq/core'
import type { Ref } from 'vue'
import type { FundsBlockReason } from '@/lib/analytics'
import type { RecoverablePlainTransactionDetails, TransactionSentByUser } from '@/types/transactions'
import { computedAsync } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { trackFundsBlocked } from '@/lib/analytics'
import { HTLC_EXTENSIONS_WALKED_KV_KEY, HTLC_HISTORY_CHECKED_KV_KEY } from '@/lib/sql-queries'
import { kv } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'

const MAX_BLOCK_HEIGHT_MISMATCH = Nimiq.Policy.BLOCKS_PER_BATCH
// HTLC start/end and the head timestamp are in ms; one block per second turns 120 batches into ms.
export const MAX_MS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = 120 * Nimiq.Policy.BLOCKS_PER_BATCH * 1000
// Payments need an HTLC, so a fresh database never holds local funds longer than this.
export const HTLC_HISTORY_CHECK_HOLD_MS = 10 * 60 * 1000

export function upsertPlainPendingByHash(collection: RecoverablePlainTransactionDetails[], transaction: RecoverablePlainTransactionDetails) {
  const index = collection.findIndex(tx => tx.transactionHash === transaction.transactionHash)
  if (index >= 0)
    collection.splice(index, 1, transaction)
  else
    collection.push(transaction)
}

export const useSyncState = defineStore('sync-state', () => {
  const { height: localHeight, lastMacroBlockHeight, headTimestamp } = storeToRefs(useNimiqNetwork())
  const { remoteHeight, end, start } = storeToRefs(useRemoteSigner())

  // Whether the remote wallet is synced with the local wallet or not.
  // We allow a difference of MAX_BLOCK_HEIGHT_MISMATCH blocks between the two wallets.
  const nodesAreSynced = computedAsync(() => remoteHeight.value > (localHeight.value - MAX_BLOCK_HEIGHT_MISMATCH) && remoteHeight.value < (localHeight.value + MAX_BLOCK_HEIGHT_MISMATCH), false)

  // True once the head timestamp is within the lookahead of the HTLC validity mid-point.
  const htlcCanBeExtended = computed(() => {
    if (end.value > 0 && start.value > 0)
      return (end.value - (end.value - start.value) / 2) < (headTimestamp.value + MAX_MS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA)
    return false
  })

  // Since macro blocks take a while, only show if < 50 blocks left.
  const blocksUntilNextMacroBlock = computed(() => {
    const blocksLeft = lastMacroBlockHeight.value > 0 ? lastMacroBlockHeight.value + Nimiq.Policy.BLOCKS_PER_BATCH - localHeight.value : 0
    return blocksLeft < 50 ? blocksLeft : 0
  })

  const pendingTransactions: Ref<RecoverablePlainTransactionDetails[]> = ref([])
  const pendingPaymentTransactions: Ref<PlainTransactionDetails[]> = ref([])
  const pendingRemoteDrainTxs: Ref<TransactionSentByUser[]> = ref([])
  const pendingHtlcCreationTransactions: Ref<RecoverablePlainTransactionDetails[]> = ref([])
  // Included creations remain tracked for reorgs, but their funds are already usable.
  const hasPendingHtlcCreation = computed(() => pendingHtlcCreationTransactions.value.some(
    transaction => transaction.state !== 'included' && transaction.state !== 'confirmed',
  ))
  const isTransactionPending = computed(() => pendingTransactions.value.length > 0
    || pendingRemoteDrainTxs.value.length > 0
    || hasPendingHtlcCreation.value)
  const isVerifyingRemoteSignersDb = ref(false)
  const isUpdatingBalancesNow = ref(false)
  const shouldUpdateBalancesAgain = ref(false)
  const walletContextGeneration = ref(0)
  const logger = useLogger('sync-state')
  // Undefined until read from this wallet's DB; sync can start before syncWallets loads it.
  const htlcHistoryChecked = shallowRef<boolean>()
  const htlcExtensionsWalked = shallowRef<boolean>()
  const htlcCheckHoldStartedAt = shallowRef<number>()
  const lastFundsBlockReason = shallowRef<FundsBlockReason>()
  // handleFunds runs on every head, so a lasting block would repeat each second; once per reason per wallet.
  const reportedFundsBlocks = new Set<FundsBlockReason>()
  let walletContext: { address: string, network: string } | undefined

  function setWalletContext(address: string, network: string) {
    walletContextGeneration.value += 1
    if (
      !walletContext
      || walletContext.address !== address
      || walletContext.network !== network
    ) {
      pendingTransactions.value = []
      pendingPaymentTransactions.value = []
      pendingRemoteDrainTxs.value = []
      pendingHtlcCreationTransactions.value = []
      reportedFundsBlocks.clear()
      lastFundsBlockReason.value = undefined
    }
    walletContext = { address, network }
    return walletContextGeneration.value
  }

  // Logout and restore reload the page and purgeRemoteSigners resets these, so a cached value is never stale.
  async function loadHtlcHistoryFlags() {
    if (htlcHistoryChecked.value === undefined || htlcExtensionsWalked.value === undefined) {
      try {
        const [checked, walked] = await Promise.all([kv().getItem(HTLC_HISTORY_CHECKED_KV_KEY), kv().getItem(HTLC_EXTENSIONS_WALKED_KV_KEY)])
        htlcHistoryChecked.value ??= checked === '1'
        htlcExtensionsWalked.value ??= walked === '1'
      }
      catch (error) {
        // Unloaded reads as unchecked, which keeps the hold: the safe side.
        logger.error('Failed to load the HTLC history check state', error)
      }
    }
    return { checked: htlcHistoryChecked.value, walked: htlcExtensionsWalked.value }
  }

  function reportFundsBlocked(reason: FundsBlockReason, props?: Record<string, unknown>) {
    lastFundsBlockReason.value = reason
    if (reportedFundsBlocks.has(reason))
      return
    reportedFundsBlocks.add(reason)
    trackFundsBlocked(reason, props)
  }

  // Touch the local-wallet store here so sync-state stays tied to wallet lifetime in Pinia devtools.
  useLocalWallet()

  return {
    pendingTransactions,
    pendingPaymentTransactions,
    pendingRemoteDrainTxs,
    pendingHtlcCreationTransactions,
    isTransactionPending,
    hasPendingHtlcCreation,
    isVerifyingRemoteSignersDb,
    isUpdatingBalancesNow,
    shouldUpdateBalancesAgain,
    walletContextGeneration,
    htlcHistoryChecked,
    htlcExtensionsWalked,
    htlcCheckHoldStartedAt,
    lastFundsBlockReason,
    reportFundsBlocked,
    setWalletContext,
    loadHtlcHistoryFlags,
    nodesAreSynced,
    htlcCanBeExtended,
    blocksUntilNextMacroBlock,
  }
})
