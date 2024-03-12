<script setup lang="ts">
import { useSlots } from 'vue'
import CryptoCityLogo from './icons/cryptocity-logo.vue'
import { PaymentMethod } from '@/types/transactions'

defineProps<{
  cryptoTotal: number
  fiatFormatted: string
  paymentMethod: PaymentMethod
}>()

const slots = useSlots()
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full gap-y-2">
    <span class="text-5xl text-center uppercase">
      {{ fiatFormatted }}

      <!-- TODO: The info icon should be maybe just a slot for the payment preview -->
      <!-- <InfoIcon class="w-4 h-4 stroke-2 opacity-40" /> -->
    </span>

    <div class="flex items-center justify-center gap-x-2.5 text-lg leading-8 font-semibold text-space/60">
      <span v-if="slots.fee">
        <slot name="fee" />
      </span>

      <div v-if="slots.fee" class="rounded-full bg-space/50 w-1 h-1" />

      <span v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-center">
        <CryptoCityLogo class="mr-1 h-4" />
        {{ cryptoTotal.toLocaleString() }}
      </span>
      <span v-else class="uppercase">
        <!-- paymentMethod should only be 'nim' here, and does thus not need to be translated -->
        {{ cryptoTotal.toLocaleString() }} {{ paymentMethod }}
      </span>
    </div>
  </div>
</template>
