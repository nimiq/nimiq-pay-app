<script setup lang="ts">
import TransactionItem from '@/components/TransactionItem.vue'
import { useSync } from '@/composables/useSync'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useTransactions } from '@/stores/transactions'
import { IonSkeletonText } from '@ionic/vue'
import { storeToRefs } from 'pinia'

const { isUpdatingTransactions } = useSync()
const { transactions } = storeToRefs(useTransactions())
</script>

<template>
  <ol v-if="transactions.length">
    <li v-for="tx in transactions.slice(0, 3)" :key="tx.hash" :data-hash="tx.hash">
      <TransactionItem :tx="tx" @click="initializeFlow(FlowName.ViewTransactionDetail, { transactionList: tx })" />
    </li>
  </ol>
  <ol v-else-if="isUpdatingTransactions" class="mt-8">
    <li v-for="i in 3" :key="i">
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
