import type { PlainTransactionDetails } from '@nimiq/core'
import type { Ref } from 'vue'
import type { TransactionSentByUser } from '@/types/transactions'
import { computedAsync } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'

const MAX_BLOCK_HEIGHT_MISMATCH = Nimiq.Policy.BLOCKS_PER_BATCH
export const HTLC_AUTO_EXTEND_LOOKAHEAD_BLOCKS = 120 * Nimiq.Policy.BLOCKS_PER_BATCH
export const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = HTLC_AUTO_EXTEND_LOOKAHEAD_BLOCKS

export const useSyncState = defineStore('sync-state', () => {
  const { height: localHeight, lastMacroBlockHeight, headTimestamp } = storeToRefs(useNimiqNetwork())
  const { remoteHeight, end, start } = storeToRefs(useRemoteSigner())

  // Whether the remote wallet is synced with the local wallet or not.
  // We allow a difference of MAX_BLOCK_HEIGHT_MISMATCH blocks between the two wallets.
  const nodesAreSynced = computedAsync(() => remoteHeight.value > (localHeight.value - MAX_BLOCK_HEIGHT_MISMATCH) && remoteHeight.value < (localHeight.value + MAX_BLOCK_HEIGHT_MISMATCH), false)

  // Checks if the sum of current block and CONSTANT is greater than the middle block of the HTLC validity.
  const htlcCanBeExtended = computed(() => {
    if (end.value > 0 && start.value > 0)
      return (end.value - (end.value - start.value) / 2) < (headTimestamp.value + HTLC_AUTO_EXTEND_LOOKAHEAD_BLOCKS)
    return false
  })

  // Since macro blocks take a while, only show if < 50 blocks left.
  const blocksUntilNextMacroBlock = computed(() => {
    const blocksLeft = lastMacroBlockHeight.value > 0 ? lastMacroBlockHeight.value + Nimiq.Policy.BLOCKS_PER_BATCH - localHeight.value : 0
    return blocksLeft < 50 ? blocksLeft : 0
  })

  const pendingTransactions: Ref<PlainTransactionDetails[]> = ref([])
  const pendingPaymentTransactions: Ref<PlainTransactionDetails[]> = ref([])
  const pendingRemoteDrainTxs: Ref<TransactionSentByUser[]> = ref([])
  const pendingHtlcCreationTransactions: Ref<PlainTransactionDetails[]> = ref([])
  const isTransactionPending = computed(() => pendingTransactions.value.length > 0 || pendingRemoteDrainTxs.value.length > 0 || pendingHtlcCreationTransactions.value.length > 0)
  const isVerifyingRemoteSignersDb = ref(false)
  const isUpdatingBalancesNow = ref(false)
  const shouldUpdateBalancesAgain = ref(false)

  // Touch the local-wallet store here so sync-state stays tied to wallet lifetime in Pinia devtools.
  useLocalWallet()

  return {
    pendingTransactions,
    pendingPaymentTransactions,
    pendingRemoteDrainTxs,
    pendingHtlcCreationTransactions,
    isTransactionPending,
    isVerifyingRemoteSignersDb,
    isUpdatingBalancesNow,
    shouldUpdateBalancesAgain,
    nodesAreSynced,
    htlcCanBeExtended,
    blocksUntilNextMacroBlock,
  }
})
