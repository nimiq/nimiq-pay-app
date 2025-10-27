import { useMutationObserver } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLocks = defineStore('locks', () => {
  const isNetworkReconnecting = ref(false)
  const isAppStarting = ref(true)
  const isProcessingRemote = ref(false)
  const isSendingTx = ref(false)
  const isSyncingWallets = ref(false)
  const isUpdatingTransactions = ref(false)
  const headChangePendingDrainLock = ref(false)
  const headChangeUpdatesLock = ref(false)
  const htlcCheckLock = ref(false)
  const isConsensusNeeded = ref(false)
  const isAppInBackground = ref(false)
  const isScannerActive = ref(false)
  const isNakaCardActivating = ref(false)

  useMutationObserver(document.body, (mutations) => {
    // If any mutation adds the class, set isScannerActive to true
    isScannerActive.value = mutations.some(mutation => (mutation.target as HTMLElement).classList.contains('native-qr-scanner-modal-open'))
  }, { attributeFilter: ['class'] })

  return {
    isNetworkReconnecting,
    isAppStarting,
    isProcessingRemote,
    isSendingTx,
    isSyncingWallets,
    isUpdatingTransactions,
    headChangePendingDrainLock,
    headChangeUpdatesLock,
    htlcCheckLock,
    isConsensusNeeded,
    isAppInBackground,
    isScannerActive,
    isNakaCardActivating,
  }
})
