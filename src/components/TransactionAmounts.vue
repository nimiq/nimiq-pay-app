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
  paymentMethod?: PaymentMethod
  refunded?: boolean
}>()

const slots = useSlots()
const { formatCrypto } = useCurrencyFormatter()
</script>

<template>
  <div class="w-full flex flex-col justify-center items-center gap-y-2">
    <div v-if="slots.invoiced" class="flex mb-1 rounded-full">
      <div class="border-space/15 text-space/40 flex items-center py-1.5 pr-2 pl-3 rounded-s-full border-2">
        <InvoiceIcon />
      </div>
      <div class="border-space/15 text-space/60 flex items-center py-1.5 pr-3 pl-2 text-lg font-semibold leading-none rounded-e-full border-t-2 border-r-2 border-b-2">
        <slot name="invoiced" />
      </div>
    </div>

    <span class="flex items-center gap-2 text-center uppercase">
      <span class="text-5xl" :class="{ 'line-through': refunded }">{{ fiatFormatted }}</span>
      <slot name="amount-after" />
    </span>

    <div class="text-space/60 flex justify-center items-center gap-x-2.5 text-lg font-semibold leading-8" :class="{ 'line-through': refunded }">
      <span v-if="slots.fee">
        <slot name="fee" />
      </span>

      <div v-if="slots.fee" class="bg-space/50 w-1 h-1 rounded-full" />

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
