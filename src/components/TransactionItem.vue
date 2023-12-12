<script setup lang="ts">
import type { PropType } from 'vue'
import CategoryIcon from './icons/categories/CategoryIcon.vue'
import { useTimeAgo } from '@/composables/useTimeAgo'
import { isPaymentTx } from '@/types/transactions'
import type { ExternalTransaction } from '@/types/transactions'
import { usePrice } from '@/composables/usePrice'

const props = defineProps({
  tx: {
    type: Object as PropType<ExternalTransaction>,
    required: true,
  },
})

const { formatRelativeTime } = useTimeAgo()
const { fiat, crypto } = usePrice(props.tx.amount, { formatter: { isPayment: isPaymentTx(props.tx) } })
</script>

<template>
  <div class="flex items-center text-[15px] gap-x-3 font-semibold">
    <CategoryIcon :category="tx.shopCategory" />
    <div class="flex flex-col items-start gap-1">
      <h3>{{ tx.title }}</h3>
      <span class="text-space/50">
        {{ formatRelativeTime(tx.timestamp) }}
      </span>
    </div>
    <div class="flex flex-col items-end gap-1 ml-auto">
      <span>{{ fiat.formatted }}</span>
      <span class="text-space/50">{{ crypto.formatted }}</span>
    </div>
  </div>
</template>
