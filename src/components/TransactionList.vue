<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import TransactionItem from './TransactionItem.vue'
import { useTransactions } from '@/stores/transactions'
import { stepEmits } from '@/types/steps'

const props = defineProps({
  max: {
    type: Number,
    default: () => Number.POSITIVE_INFINITY,
  },
})
defineEmits(stepEmits)

const { externalTransactions } = storeToRefs(useTransactions())
const transactions = computed(() => externalTransactions.value.slice(0, props.max))
const { list, containerProps, wrapperProps } = useVirtualList(transactions, { itemHeight: 37 })
</script>

<template>
  <div v-bind="containerProps">
    <ol v-if="transactions.length" ref="wrapperProps">
      <li v-for="transaction in list" :key="transaction.index">
        <button class="w-full" @click="$emit('select', transaction.data)">
          <TransactionItem :tx="transaction.data" />
        </button>
      </li>
    </ol>
  </div>
  <slot name="bottom" :list-size="externalTransactions.length" />
</template>
