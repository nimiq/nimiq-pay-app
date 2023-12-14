<script setup lang="ts">
import type { PropType } from 'vue'
import CategoryIcon from './icons/categories/CategoryIcon.vue'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { isPaymentTx } from '@/types/transactions'
import type { ExternalTransaction } from '@/types/transactions'
import { usePrice } from '@/composables/usePrice'

const props = defineProps({
  tx: {
    type: Object as PropType<ExternalTransaction>,
    required: true,
  },
})

const { formatted } = useRelativeTime({ timestamp: props.tx.timestamp })
const { fiat, crypto } = usePrice(props.tx.amount, { formatter: { isPayment: isPaymentTx(props.tx) } })
</script>

<template>
  <button class="w-full flex items-center text-[15px] gap-x-3 font-semibold py-3">
    <CategoryIcon :category="tx.shopCategory" />
    <div class="flex flex-col items-start gap-1">
      <h3>{{ tx.title }}</h3>
      <time class="leading-none text-space/50 tabular-nums">{{ formatted }}</time>
    </div>
    <div class="flex flex-col items-end gap-1.5 ml-auto">
      <span class="leading-none">{{ fiat.formatted }}</span>
      <time class="leading-none text-space/50 tabular-nums">{{ crypto.formatted }}</time>
    </div>
  </button>
</template>
