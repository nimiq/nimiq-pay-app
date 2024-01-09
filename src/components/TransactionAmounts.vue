<script setup lang="ts">
import { type PropType, computed, onMounted, toValue, useSlots } from 'vue'
import CryptoCityLogo from './icons/cryptocity-logo.vue'
import { type ExternalTransaction, Transfer } from '@/types/transactions'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { usePrice } from '@/composables/usePrice'
import { PaymentMethod } from '@/types/database'

const props = defineProps({ tx: { type: Object as PropType<ExternalTransaction> }, payment: { type: Object as PropType<PaymentRequestData> } })

onMounted(() => {
  if (!props.tx && !props.payment)
    throw new Error('TransactionAmounts: Missing tx or payment prop') // no translation as not user-facing
})

const amount = computed<number>(() => toValue(props.tx)?.amount || props.payment?.amount || 0)
const tx = computed(() => toValue(props.tx))
const { fiat, crypto } = usePrice(amount, tx.value ? ({ timestamp: tx.value.timestamp }) : undefined)
const slots = useSlots()
const paymentMethod = computed(() => {
  if (tx.value?.transfer === Transfer.UserPaymentToMerchant)
    return tx.value.paymentMethod || PaymentMethod.NIM

  return PaymentMethod.NIM
})
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full gap-y-2">
    <div class="flex items-center justify-center gap-x-2">
      <span class="text-3xl uppercase text-space/60">{{ fiat.formatted }}</span>
      <!-- TODO: The info icon should be maybe just a slot for the payment preview -->
      <!-- <InfoIcon class="w-4 h-4 stroke-2 opacity-40" /> -->
    </div>

    <span v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-5xl text-center">
      <CryptoCityLogo class="mr-1 h-9" />
      {{ crypto.total }}
    </span>
    <span v-else class="text-5xl text-center uppercase">{{ crypto.total }} {{ paymentMethod }}</span>

    <p v-if="slots.fee" class="mt-2 text-base font-semibold text-space/60">
      <slot name="fee" />
    </p>
  </div>
</template>
