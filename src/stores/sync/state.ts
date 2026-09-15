import type { PlainTransactionDetails } from '@nimiq/core'
import type { Ref } from 'vue'
import type { RecoverablePlainTransactionDetails, TransactionSentByUser } from '@/types/transactions'
import { computedAsync } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'

const MAX_BLOCK_HEIGHT_MISMATCH = Nimiq.Policy.BLOCKS_PER_BATCH
export const HTLC_AUTO_EXTEND_LOOKAHEAD_BLOCKS = 120 * Nimiq.Policy.BLOCKS_PER_BATCH
export const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = HTLC_AUTO_EXTEND_LOOKAHEAD_BLOCKS

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
    }
    walletContext = { address, network }
    return walletContextGeneration.value
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
    setWalletContext,
    nodesAreSynced,
    htlcCanBeExtended,
    blocksUntilNextMacroBlock,
  }
})
