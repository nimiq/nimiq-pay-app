<script setup lang="ts">
import { IonSkeletonText } from '@ionic/vue'
import { FiatAmount } from '@nimiq/vue3-components'
import { animate, useMotionValue } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import PriceChange from '@/components/PriceChange.vue'
import { usePrice } from '@/composables/usePrice'
import { Asset, assetToCrypto } from '@/lib/assets'
import { useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'

const { remoteBalance: balance } = storeToRefs(useRemoteSigner())
const { homeBalanceState } = storeToRefs(useRemoteSigner())
const { balance: usdtBalance, homeBalanceState: usdtHomeBalanceState } = storeToRefs(usePolygonUsdt())
const { isTransactionPending } = storeToRefs(useSync())
const { showAnimations, activeAsset } = storeToRefs(useApp())
const { isProcessingRemote } = storeToRefs(useLocks())
const displayedBalance = computed(() => activeAsset.value === Asset.USDT ? usdtBalance.value : balance.value)
const displayedBalanceState = computed(() => activeAsset.value === Asset.USDT ? usdtHomeBalanceState.value : homeBalanceState.value)
const minimumCryptoDecimals = computed(() => activeAsset.value === Asset.USDT ? 2 : 0)
const { fiat, crypto } = usePrice(displayedBalance, {
  cryptoCurrency: computed(() => assetToCrypto(activeAsset.value)),
})

/**
 * Show skeleton if:
 *  - The home balance is still unresolved
 *  - There is a pending HTLC-related transaction
 *  - The remote wallet is currently being processed
 */
const showSkeleton = computed(() =>
  displayedBalanceState.value === 'loading'
  || (displayedBalance.value === 0 && isTransactionPending.value)
  || isProcessingRemote.value,
)

const animatedAmount = ref(0)
const countMotionValue = useMotionValue(0)

countMotionValue.on('change', (value) => {
  animatedAmount.value = Math.max(0, value)
})

watch([() => fiat.total, showSkeleton], ([newTotal, showSkeleton]) => {
  if (!showSkeleton && newTotal !== undefined) {
    if (!showAnimations.value) {
      animatedAmount.value = newTotal
      countMotionValue.set(newTotal)
    }
    else {
      animate(countMotionValue, newTotal, {
        duration: 1,
        ease: 'easeOut',
      })
    }
  }
}, { immediate: true })

// Reset animation when showing skeleton
watch(showSkeleton, (isShowing) => {
  if (isShowing) {
    countMotionValue.set(0)
    animatedAmount.value = 0
  }
})
</script>

<template>
  <div class="w-full flex flex-col items-center gap-y-8">
    <div v-if="showSkeleton" class="max-w-[80%] w-48 flex flex-col items-center gap-y-2">
      <IonSkeletonText animated class="w-full h-11" />
      <div class="w-full h-5 flex gap-x-4 px-2">
        <IonSkeletonText animated class="small w-3/5" />
        <IonSkeletonText animated class="small w-2/5" />
      </div>
    </div>
    <div v-else class="flex flex-col items-center gap-y-2">
      <FiatAmount class="text-5xl font-normal text-space" :amount="animatedAmount" :currency="fiat.currency" :hide-decimals="false" :max-relative-deviation="1" />
      <div class="text-space/60 flex gap-x-4 font-semibold">
        <CryptoAmount :amount="crypto.totalUnits" :currency="crypto.currency" :min-decimals="minimumCryptoDecimals" />
        <PriceChange :currency="crypto.currency" />
      </div>
    </div>
  </div>
</template>

<style scoped>
ion-skeleton-text {
  --border-radius: 6px;
  --background: rgba(31, 35, 72, .1);
}

ion-skeleton-text.small {
  --border-radius: 3px;
}
</style>
