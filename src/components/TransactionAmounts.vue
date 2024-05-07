<script setup lang="ts">
import { useSlots } from 'vue'
import CryptoCityLogo from './icons/cryptocity-logo.vue'
import InvoiceIcon from './icons/invoice.vue'
import { PaymentMethod } from '@/types/transactions'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { Crypto } from '@/stores/app'

defineProps<{
  cryptoTotal: number
  fiatFormatted: string
  paymentMethod: PaymentMethod
  refunded?: boolean
}>()

const slots = useSlots()
const { formatCrypto } = useCurrencyFormatter()
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full gap-y-2">
    <div v-if="slots.invoiced" class="flex mb-1 rounded-full">
      <div class="pl-3 pr-2 py-1.5 text-space/40 border-2 border-space/15 rounded-s-full flex items-center">
        <InvoiceIcon />
      </div>
      <div class="pl-2 pr-3 py-1.5 text-lg leading-none font-semibold text-space/60 border-t-2 border-r-2 border-b-2 rounded-e-full border-space/15 flex items-center">
        <slot name="invoiced" />
      </div>
    </div>

    <span class="text-5xl text-center uppercase" :class="{ 'line-through': refunded }">
      {{ fiatFormatted }}

      <!-- TODO: The info icon should be maybe just a slot for the payment preview -->
      <!-- <InfoIcon class="w-4 h-4 stroke-2 opacity-40" /> -->
    </span>

    <div class="flex items-center justify-center gap-x-2.5 text-lg leading-8 font-semibold text-space/60" :class="{ 'line-through': refunded }">
      <span v-if="slots.fee">
        <slot name="fee" />
      </span>

      <div v-if="slots.fee" class="w-1 h-1 rounded-full bg-space/50" />

      <span v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-center">
        <CryptoCityLogo class="h-4 mr-1" />
        {{ formatCrypto(cryptoTotal) }}
      </span>
      <span v-else class="uppercase">
        <!-- paymentMethod should only be 'nim' here, and does thus not need to be translated -->
        {{ formatCrypto(cryptoTotal, { currency: Crypto.NIM }) }}
      </span>
    </div>
  </div>
</template>
