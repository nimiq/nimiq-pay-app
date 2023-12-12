<script setup lang="ts">
import type { PropType } from 'vue'
import { computed, useSlots } from 'vue'
import { computedAsync } from '@vueuse/core'
import { useFiat } from '@/stores/fiat'
import type { ExternalTransaction } from '@/types/transactions'
import type { PaymentRequestData } from '@/types/steps'

const props = defineProps({ tx: { type: Object as PropType<ExternalTransaction> }, payment: { type: Object as PropType<PaymentRequestData> } })

const { getPriceAt, formatFiat } = useFiat()

const amount = computed(() => props.tx?.amount || props.payment?.amount || 0)
const timestamp = computed(() => props.tx?.timestamp || Date.now())

const nimAmount = computed(() => amount.value / 1e5)
// TODO Check error from API
const fiatAmount = computedAsync(async () => (await getPriceAt(timestamp.value)).data! * nimAmount.value)

const slots = useSlots()
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full gap-y-2">
    <div class="flex items-center justify-center gap-x-2">
      <span class="text-3xl uppercase text-space/60">{{ formatFiat(fiatAmount) }}</span>
      <!-- TODO: The info icon should be maybe just a slot for the payment preview -->
      <!-- <InfoIcon class="w-4 h-4 stroke-2 opacity-40" /> -->
    </div>
    <p class="text-5xl text-center">
      {{ nimAmount }} NIM
    </p>
    <p v-if="slots.fee" class="mt-2 text-base font-semibold text-space/60">
      <slot name="fee" />
    </p>
  </div>
</template>
