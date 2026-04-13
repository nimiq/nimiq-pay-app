<script setup lang="ts">
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useTransactions } from '@/stores/transactions'
import TransactionItem from './TransactionItem.vue'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

defineEmits(stepEmits)

const { loadMoreTxs, canLoadMore } = useTransactions()
const { transactionsToShow: storeTransactions } = storeToRefs(useTransactions())
const { showAnimations } = storeToRefs(useApp())

// Need to use computed to force reactivity with RecycleScroller
const transactions = computed(() => [...storeTransactions.value])

const itemHeight = 42 /* Height */ + 24 /* padding-y */
</script>

<template>
  <div class="flex flex-col w-full">
    <RecycleScroller
      v-slot="{ item }"
      :items="transactions"
      :item-size="itemHeight"
      key-field="hash"
      @scroll-end="() => canLoadMore() && loadMoreTxs()"
    >
      <motion.div
        :initial="{ opacity: 0, x: -20 }"
        :animate="{ opacity: 1, x: 0 }"
        :transition="{ duration: showAnimations ? 0.3 : 0 }"
      >
        <TransactionItem :tx="item" @click="initializeFlow(FlowName.ViewTransactionDetail, { initialState: { transactionList: item } })" />
      </motion.div>
    </RecycleScroller>
  </div>
</template>
