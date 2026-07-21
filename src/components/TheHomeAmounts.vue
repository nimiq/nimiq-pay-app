<script setup lang="ts">
import { IonSkeletonText } from '@ionic/vue'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { PopoverAnchor, PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import TopUpIcon from '@/components/icons/top-up.vue'
import PriceChange from '@/components/PriceChange.vue'
import RollingNumber from '@/components/RollingNumber.vue'
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
const { handleFunds } = useSync()
const { showAnimations, activeAsset, hasDismissedPendingNimHint } = storeToRefs(useApp())
const { localBalance, pendingNimSince } = storeToRefs(useLocalWallet())
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

const PENDING_NIM_HINT_DELAY = 2 * 24 * 60 * 60 * 1000
const pendingNimHintOpen = shallowRef(false)

watch([pendingNim, pendingNimSince, hasDismissedPendingNimHint], ([amount, since, dismissed], _, onCleanup) => {
  pendingNimHintOpen.value = false
  if (amount === 0 || since === 0 || dismissed)
    return

  const remainingDelay = since + PENDING_NIM_HINT_DELAY - Date.now()
  if (remainingDelay <= 0) {
    pendingNimHintOpen.value = true
    return
  }

  const timeout = setTimeout(() => pendingNimHintOpen.value = true, remainingDelay)
  onCleanup(() => clearTimeout(timeout))
}, { immediate: true })

function dismissPendingNimHint() {
  hasDismissedPendingNimHint.value = true
  pendingNimHintOpen.value = false
}

function handlePendingNimHintOpen(open: boolean) {
  if (!open && pendingNimHintOpen.value) {
    dismissPendingNimHint()
    return
  }
  pendingNimHintOpen.value = open
}

function handlePendingNimClick() {
  dismissPendingNimHint()
  handleFunds(true)
}
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
      <RollingNumber class="text-5xl font-normal text-space" :value="fiat.total" :currency="fiat.currency" :animate="showAnimations" />
      <div class="text-space/60 flex gap-x-4 font-semibold">
        <CryptoAmount :amount="crypto.totalUnits" :currency="crypto.currency" :min-decimals="minimumCryptoDecimals" />
        <PriceChange :currency="crypto.currency" />
      </div>
    </div>
    <!--
      Tour hook (APP-177): tapping the pending line force-secures the locally-staged NIM into the
      HTLC right now, bypassing the htlcThreshold auto-deposit gate. Disabled/dimmed while a NIM HTLC
      tx is already in flight (isNimHtlcTransition). The future onboarding tour targets
      [data-tour="pending-topup"] and calls this same handleFunds(true) path.
    -->
    <PopoverRoot :open="pendingNimHintOpen" @update:open="handlePendingNimHintOpen">
      <Transition name="pending">
        <PopoverAnchor v-if="pendingNim > 0" as-child>
          <button
            type="button"
            data-tour="pending-topup"
            :disabled="isNimHtlcTransition"
            class="text-space/40 flex items-center gap-x-1.5 text-sm font-semibold cursor-pointer select-none transition-opacity active:opacity-60 disabled:opacity-50 disabled:cursor-default"
            @click="handlePendingNimClick"
          >
            <motion.div
              :animate="showAnimations && !isNimHtlcTransition ? { y: [0, -2, 0] } : {}"
              :transition="{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }"
              class="shrink-0"
            >
              <TopUpIcon class="w-3.5 h-3.5" />
            </motion.div>
            <span>+<CryptoAmount :amount="pendingNim" :currency="Crypto.NIM" />&nbsp;{{ $t('pending') }}</span>
          </button>
        </PopoverAnchor>
      </Transition>
      <PopoverPortal v-if="pendingNim > 0">
        <PopoverContent
          side="bottom"
          align="center"
          :side-offset="10"
          :collision-padding="16"
          :style="{ zIndex: 50, background: 'var(--radial-gradient-blue)' }"
          class="pending-nim-hint text-white w-[calc(100vw-2rem)] max-w-72 px-4 py-3 rounded-xl text-center"
          @open-auto-focus.prevent
        >
          <p class="text-white text-sm font-semibold leading-5 text-balance">
            {{ $t('Tap your pending NIM to add it to your available balance.') }}
          </p>
          <PopoverClose as-child>
            <button
              type="button"
              data-testid="pending-nim-hint-dismiss"
              class="text-white mt-4 rounded-full px-6 py-1 text-sm font-bold transition-colors duration-200 focus-visible:outline-none ring-2 ring-white/50"
              @click="dismissPendingNimHint"
            >
              {{ $t('Got it') }}
            </button>
          </PopoverClose>
          <PopoverArrow class="fill-space" :height="8" :width="14" />
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
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

.pending-nim-hint[data-state="open"] {
  animation: pending-nim-hint-in 180ms var(--nq-ease, ease-out);
}

.pending-nim-hint[data-state="closed"] {
  animation: pending-nim-hint-out 150ms ease-in;
}

@keyframes pending-nim-hint-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(.98);
  }
}

@keyframes pending-nim-hint-out {
  to {
    opacity: 0;
    transform: translateY(-2px) scale(.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pending-enter-active,
  .pending-leave-active,
  .pending-nim-hint[data-state="open"],
  .pending-nim-hint[data-state="closed"] {
    transition: none;
    animation: none;
  }
}
</style>
