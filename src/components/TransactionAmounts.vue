<script setup lang="ts">
import { useSlots } from 'vue'
import CryptoCityLogo from './icons/cryptocity-logo.vue'
import { PaymentMethod } from '@/types/database'

defineProps<{
  cryptoTotal: number
  fiatFormatted: string
  paymentMethod: PaymentMethod
}>()

const slots = useSlots()
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full gap-y-2">
    <div class="flex items-center justify-center gap-x-2">
      <span class="text-3xl uppercase text-space/60">{{ fiatFormatted }}</span>
      <!-- TODO: The info icon should be maybe just a slot for the payment preview -->
      <!-- <InfoIcon class="w-4 h-4 stroke-2 opacity-40" /> -->
    </div>

    <span v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-5xl text-center">
      <CryptoCityLogo class="mr-1 h-9" />
      {{ cryptoTotal.toLocaleString() }}
    </span>
    <span v-else class="text-5xl text-center uppercase">{{ cryptoTotal.toLocaleString() }} {{ paymentMethod }}</span>

    <p v-if="slots.fee" class="mt-2 text-base font-semibold text-space/60">
      <slot name="fee" />
    </p>
  </div>
</template>
