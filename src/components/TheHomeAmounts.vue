<script setup lang="ts">
import { IonSkeletonText } from '@ionic/vue'
import { FiatAmount } from '@nimiq/vue3-components'
import { animate, useMotionValue } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import TopUpIcon from '@/components/icons/top-up.vue'
import PriceChange from '@/components/PriceChange.vue'
import { usePrice } from '@/composables/usePrice'
import { Asset, assetToCrypto } from '@/lib/assets'
import { Crypto, useApp } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'

const { remoteBalance: balance, homeBalanceState, lastKnownRemoteBalance } = storeToRefs(useRemoteSigner())
const { balance: usdtBalance, lastKnownBalance: lastKnownUsdtBalance, homeBalanceState: usdtHomeBalanceState } = storeToRefs(usePolygonUsdt())
const { isTransactionPending } = storeToRefs(useSync())
const { showAnimations, activeAsset } = storeToRefs(useApp())
const { localBalance } = storeToRefs(useLocalWallet())
const { isProcessingRemote } = storeToRefs(useLocks())

// During HTLC create/extend/recreate the on-chain NIM balance is transiently 0 and the
// signer can be cleared (homeBalanceState 'loading'). Spend-to-zero never sets these flags.
const isNimHtlcTransition = computed(() =>
  activeAsset.value === Asset.NIM
  && (isProcessingRemote.value || isTransactionPending.value || homeBalanceState.value === 'loading'),
)

// NIM staged in the local wallet, waiting to reach the HTLC threshold before being secured.
// Shown as a subordinate "topping up" line, never added to the spendable balance above.
const pendingNim = computed(() => activeAsset.value === Asset.NIM ? localBalance.value : 0)

const displayedBalance = computed(() => {
  if (activeAsset.value === Asset.USDT) {
    // Pre-consensus the canonical balance is always 0; fall back to the KV-cached value.
    return usdtBalance.value === 0 && usdtHomeBalanceState.value === 'loading' ? lastKnownUsdtBalance.value : usdtBalance.value
  }
  // While funds sit in the local wallet they've left the HTLC (e.g. drained to recreate it) and
  // are shown in the pending line. Show the real (possibly 0) remote balance rather than the
  // optimistic last-known one so the same funds aren't counted in both the balance and pending.
  if (balance.value === 0 && isNimHtlcTransition.value && pendingNim.value === 0)
    return lastKnownRemoteBalance.value
  return balance.value
})
const displayedBalanceState = computed(() => activeAsset.value === Asset.USDT ? usdtHomeBalanceState.value : homeBalanceState.value)
const minimumCryptoDecimals = computed(() => activeAsset.value === Asset.USDT ? 2 : 0)
const { fiat, crypto } = usePrice(displayedBalance, {
  cryptoCurrency: computed(() => assetToCrypto(activeAsset.value)),
})

// Skeleton when there's no balance number to show: still loading/transitioning, or the balance is
// 0 while NIM funds are pending (they're mid-flight into the HTLC, so the real balance isn't known
// yet). The pending line stays visible alongside the skeleton.
const showSkeleton = computed(() =>
  displayedBalance.value === 0
  && (displayedBalanceState.value === 'loading' || isNimHtlcTransition.value || pendingNim.value > 0),
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
  <div class="w-full flex flex-col items-center gap-y-2">
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
    <Transition name="pending">
      <div v-if="pendingNim > 0" class="text-space/40 flex items-center gap-x-1.5 text-sm font-semibold">
        <TopUpIcon class="w-3.5 h-3.5 shrink-0" />
        <span>+<CryptoAmount :amount="pendingNim" :currency="Crypto.NIM" />&nbsp;{{ $t('pending') }}</span>
      </div>
    </Transition>
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

.pending-enter-active,
.pending-leave-active {
  transition: opacity 0.25s var(--nq-ease, ease-out), transform 0.25s var(--nq-ease, ease-out);
}

.pending-enter-from,
.pending-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .pending-enter-active,
  .pending-leave-active {
    transition: none;
  }
}
</style>
