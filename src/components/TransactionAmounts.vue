<script setup lang="ts">
import type { PropType } from 'vue'
import { computed, onMounted, toValue, useSlots } from 'vue'
import type { ExternalTransaction } from '@/types/transactions'
import type { PaymentRequestData } from '@/types/steps'
import { usePrice } from '@/composables/usePrice'

const props = defineProps({ tx: { type: Object as PropType<ExternalTransaction> }, payment: { type: Object as PropType<PaymentRequestData> } })

onMounted(() => {
  if (!props.tx && !props.payment)
    throw new Error('TransactionAmounts: Missing tx or payment prop')
})

const amount = computed<number>(() => toValue(props.tx)?.amount || props.payment?.amount || 0)
const tx = computed(() => toValue(props.tx))
const { fiat, crypto } = usePrice(amount, tx.value ? ({ timestamp: tx.value.timestamp }) : undefined)
const slots = useSlots()
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full gap-y-2">
    <div class="flex items-center justify-center gap-x-2">
      <span class="text-3xl uppercase text-space/60">{{ fiat.formatted }}</span>
      <!-- TODO: The info icon should be maybe just a slot for the payment preview -->
      <!-- <InfoIcon class="w-4 h-4 stroke-2 opacity-40" /> -->
    </div>
    <span class="text-5xl text-center">{{ crypto.formatted }}</span>
    <p v-if="slots.fee" class="mt-2 text-base font-semibold text-space/60">
      <slot name="fee" />
    </p>
  </div>
</template>
