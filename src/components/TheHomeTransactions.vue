<script setup lang="ts">
import type { InfiniteScrollCustomEvent } from '@ionic/vue'
import type { ExternalTransaction } from '@/types/transactions'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { alertController, IonInfiniteScroll, IonInfiniteScrollContent, IonSkeletonText } from '@ionic/vue'
import { vOnLongPress } from '@vueuse/components'
import { refDebounced } from '@vueuse/core'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import TransactionItem from '@/components/TransactionItem.vue'
import { i18n } from '@/i18n/i18n-setup'
import { debounceDelay, debounceMaxWait } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useTransactions } from '@/stores/transactions'

const { isUpdatingTransactions, isConsensusNeeded } = storeToRefs(useLocks())
const { showAnimations, isNimiqAsset, activeAsset } = storeToRefs(useApp())
const { transactionsToShow: transactions } = storeToRefs(useTransactions())
const { loadMoreTxs, canLoadMore, setTxHidden } = useTransactions()
const { consensus } = storeToRefs(useNimiqNetwork())
const { hasLoadedHistory: hasLoadedPolygonHistory } = storeToRefs(usePolygonUsdt())

const SKELETON_COUNT = 4

const showSingleTxSkeleton = computed(() => isConsensusNeeded.value && consensus.value !== 'established')
const showSingleTxSkeletonDebounced = refDebounced(showSingleTxSkeleton, debounceDelay, { maxWait: debounceMaxWait })
const showTransactionsSkeleton = computed(() => isUpdatingTransactions.value && (isNimiqAsset.value || !hasLoadedPolygonHistory.value))
const isExhausted = ref(false)
const hasMore = computed(() => !isExhausted.value && canLoadMore())
watch(activeAsset, () => isExhausted.value = false)

async function onInfiniteScroll(event: InfiniteScrollCustomEvent) {
  const added = await loadMoreTxs()
  if (added === 0)
    isExhausted.value = true
  event.target.complete()
}

const longPressFired = ref(false)

async function onLongPressTrigger(tx: ExternalTransaction) {
  longPressFired.value = true
  // Fire-and-forget: awaiting the bridge stalls the dialog from showing.
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
  const isHidden = !!tx.meta?.hidden
  const alert = await alertController.create({
    header: isHidden ? i18n.t('Unhide transaction?') : i18n.t('Hide transaction?'),
    message: isHidden
      ? i18n.t('This transaction will reappear in your history.')
      : i18n.t('This transaction will be hidden from your history. You can reveal it later from the dev menu.'),
    buttons: [
      { text: i18n.t('Cancel'), role: 'cancel' },
      { text: isHidden ? i18n.t('Unhide') : i18n.t('Hide'), role: 'confirm' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'confirm')
    return
  await setTxHidden(tx.hash, !isHidden)
}

// Skip the trailing click that follows pointerup when a long-press just fired,
// so we don't push ViewTransactionDetail on top of (or under) the confirm alert.
function onRowClick(tx: ExternalTransaction) {
  if (longPressFired.value) {
    longPressFired.value = false
    return
  }
  initializeFlow(FlowName.ViewTransactionDetail, { initialState: { transactionList: tx } })
}
</script>

<template>
  <button v-if="showSingleTxSkeletonDebounced" class="ion-activatable ripple-parent text-[15px] w-full overflow-hidden relative flex items-center gap-x-3 py-3 font-semibold rounded">
    <IonSkeletonText animated class="w-8 h-8 rounded-full" />
    <div class="flex flex-col items-start">
      <IonSkeletonText animated class="w-28 h-4" />
      <IonSkeletonText animated class="w-20 h-3" />
    </div>
    <div class="ml-auto flex flex-col items-end">
      <IonSkeletonText animated class="w-16 h-4" />
      <IonSkeletonText animated class="w-20 h-3" />
    </div>
  </button>
  <template v-if="transactions.length">
    <motion.ol
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :transition="{ duration: showAnimations ? 0.4 : 0 }"
    >
      <motion.li
        v-for="(tx, index) in transactions"
        :key="tx.hash"
        :data-hash="tx.hash"
        :initial="{ opacity: 0, x: -20 }"
        :animate="{ opacity: 1, x: 0 }"
        :transition="{ duration: showAnimations ? 0.3 : 0, delay: showAnimations ? Math.min(index, SKELETON_COUNT) * 0.1 : 0 }"
      >
        <TransactionItem
          v-on-long-press="[() => onLongPressTrigger(tx), { delay: 5000 }]"
          :tx="tx"
          @click="onRowClick(tx)"
        />
      </motion.li>
    </motion.ol>

    <IonInfiniteScroll :disabled="!hasMore" @ion-infinite="onInfiniteScroll">
      <IonInfiniteScrollContent />
    </IonInfiniteScroll>
  </template>

  <ol v-else-if="showTransactionsSkeleton" class="mt-8">
    <li v-for="i in SKELETON_COUNT" :key="i">
      <button class="ion-activatable ripple-parent text-[15px] w-full overflow-hidden relative flex items-center gap-x-3 py-3 font-semibold rounded">
        <IonSkeletonText animated class="w-8 h-8 rounded-full" />
        <div class="flex flex-col items-start">
          <IonSkeletonText animated class="w-28 h-4" />
          <IonSkeletonText animated class="w-20 h-3" />
        </div>
        <div class="ml-auto flex flex-col items-end">
          <IonSkeletonText animated class="w-16 h-4" />
          <IonSkeletonText animated class="w-20 h-3" />
        </div>
      </button>
    </li>
  </ol>
</template>

<style scoped>
ion-skeleton-text {
  --border-radius: 3px;
  --background: rgba(31, 35, 72, .1);
}
</style>
