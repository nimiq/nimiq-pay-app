<script setup lang="ts">
import { IonSkeletonText } from '@ionic/vue'
import { refDebounced } from '@vueuse/core'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import TransactionItem from '@/components/TransactionItem.vue'
import { debounceDelay, debounceMaxWait } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useTransactions } from '@/stores/transactions'

const { isUpdatingTransactions, isConsensusNeeded } = storeToRefs(useLocks())
const { showAnimations } = storeToRefs(useApp())
const { transactions } = storeToRefs(useTransactions())
const { consensus } = storeToRefs(useNimiqNetwork())

const MAX_TRANSACTIONS = 3
const showSingleTxSkeleton = computed(() => isConsensusNeeded.value && consensus.value !== 'established')
const showSingleTxSkeletonDebounced = refDebounced(showSingleTxSkeleton, debounceDelay, { maxWait: debounceMaxWait })
const maxTransactions = computed(() => showSingleTxSkeletonDebounced.value ? MAX_TRANSACTIONS - 1 : MAX_TRANSACTIONS)
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
  <motion.ol
    v-if="transactions.length"
    :initial="{ opacity: 0 }"
    :animate="{ opacity: 1 }"
    :transition="{ duration: showAnimations ? 0.4 : 0 }"
  >
    <motion.li
      v-for="(tx, index) in transactions.slice(0, maxTransactions)"
      :key="tx.hash"
      :data-hash="tx.hash"
      :initial="{ opacity: 0, x: -20 }"
      :animate="{ opacity: 1, x: 0 }"
      :transition="{ duration: showAnimations ? 0.3 : 0, delay: showAnimations ? index * 0.1 : 0 }"
      :while-hover="{ x: 5, scale: 1.01 }"
    >
      <TransactionItem :tx="tx" @click="initializeFlow(FlowName.ViewTransactionDetail, { initialState: { transactionList: tx } })" />
    </motion.li>
  </motion.ol>

  <ol v-else-if="isUpdatingTransactions" class="mt-8">
    <li v-for="i in maxTransactions" :key="i">
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
