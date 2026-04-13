<script setup lang="ts">
import type { VNode } from 'vue'
import { FiatAmount } from '@nimiq/vue3-components'
import { Comment, computed, Text, useSlots } from 'vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { Crypto } from '@/stores/app'
import { PaymentMethod } from '@/types/transactions'
import CryptoCityLogo from './icons/cryptocity-logo.vue'
import InvoiceIcon from './icons/invoice.vue'

defineProps<{
  cryptoTotal: number
  cryptoCurrency?: Crypto
  fiatAmount?: number
  fiatCurrency?: string
  paymentMethod?: PaymentMethod
  refunded?: boolean
}>()

const slots = useSlots()
const { formatCrypto } = useCurrencyFormatter()

function slotHasContent(nodes?: VNode[]): boolean {
  if (!nodes)
    return false

  return nodes.some((node) => {
    if (node.type === Comment)
      return false

    if (node.type === Text)
      return String(node.children ?? '').trim().length > 0

    if (Array.isArray(node.children))
      return slotHasContent(node.children as VNode[])

    return true
  })
}

// Parent components can always provide a slot, even when nested `v-if`s render nothing.
// Check the rendered slot output so separator dots only appear next to visible content.
const isInvoicedVisible = computed(() => slotHasContent(slots.invoiced?.()))
const isFeeVisible = computed(() => slotHasContent(slots.fee?.()))
const isCryptoAfterVisible = computed(() => slotHasContent(slots['crypto-after']?.()))
</script>

<template>
  <div class="w-full flex flex-col justify-center items-center gap-y-2">
    <div v-if="isInvoicedVisible" class="flex mb-1 rounded-full">
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
          class="text-5xl font-bold" :class="{ 'line-through': refunded }" :amount="fiatAmount"
          :currency="fiatCurrency"
        />
        <slot name="amount-after" />
      </span>
    </Transition>

    <div
      class="text-space/60 flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 text-lg font-semibold leading-8"
      :class="{ 'line-through': refunded }"
    >
      <span v-if="isFeeVisible">
        <slot name="fee" />
      </span>

      <div v-if="isFeeVisible" data-testid="separator-dot" class="bg-space/50 w-1 h-1 rounded-full" />

      <div class="uppercase transition-all duration-300 delay-50" :class="(fiatAmount && fiatCurrency) ? '' : 'text-5xl text-space font-normal'">
        <span v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-center">
          <CryptoCityLogo class="h-4 mr-1" />
          {{ formatCrypto(cryptoTotal) }}
        </span>
        <span v-else>
          <CryptoAmount :amount="cryptoTotal" :currency="cryptoCurrency || Crypto.NIM" />
        </span>
      </div>

      <div v-if="isCryptoAfterVisible" data-testid="separator-dot" class="bg-space/50 w-1 h-1 rounded-full" />
      <span v-if="isCryptoAfterVisible">
        <slot name="crypto-after" />
      </span>
    </div>
  </div>
</template>
