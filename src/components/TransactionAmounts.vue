<script setup lang="ts">
import { FiatAmount } from '@nimiq/vue3-components'
import { useSlots } from 'vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { Crypto } from '@/stores/app'
import { PaymentMethod } from '@/types/transactions'
import CryptoCityLogo from './icons/cryptocity-logo.vue'
import InvoiceIcon from './icons/invoice.vue'

defineProps<{
  cryptoTotal: number
  fiatAmount?: number
  fiatCurrency?: string
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
      <div
        class="border-space/15 text-space/60 flex items-center py-1.5 pr-3 pl-2 text-lg font-semibold leading-none rounded-e-full border-t-2 border-r-2 border-b-2"
      >
        <slot name="invoiced" />
      </div>
    </div>

    <Transition name="slide-down-fade">
      <span v-if="fiatAmount && fiatCurrency" class="flex items-center gap-2 text-center uppercase">
        <FiatAmount
          class="text-5xl" :class="{ 'line-through': refunded }" :amount="fiatAmount"
          :currency="fiatCurrency"
        />
        <slot name="amount-after" />
      </span>
    </Transition>

    <div
      class="text-space/60 flex justify-center items-center gap-x-2.5 text-lg font-semibold leading-8"
      :class="{ 'line-through': refunded }"
    >
      <span v-if="slots.fee">
        <slot name="fee" />
      </span>

      <div v-if="slots.fee" class="bg-space/50 w-1 h-1 rounded-full" />

      <div class="uppercase transition-all duration-300 delay-50" :class="(fiatAmount && fiatCurrency) ? '' : 'text-5xl text-space font-normal'">
        <span v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-center">
          <CryptoCityLogo class="h-4 mr-1" />
          {{ formatCrypto(cryptoTotal) }}
        </span>
        <span v-else>
          <!-- paymentMethod should only be 'nim' here, and does thus not need to be translated -->
          <CryptoAmount :amount="cryptoTotal" :currency="Crypto.NIM" />
        </span>
      </div>
    </div>
  </div>
</template>
