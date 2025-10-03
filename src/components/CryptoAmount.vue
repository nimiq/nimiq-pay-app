<script setup lang="ts">
import type { Crypto } from '@/stores/app'
import { Amount } from '@nimiq/vue3-components'
import { computed } from 'vue'
import { calculateDisplayedDecimals } from '@/lib/utils'
import { DECIMALS } from '@/stores/app'

const { amount, currency, minDecimals } = defineProps({
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String as () => Crypto,
    required: true,
  },
  minDecimals: {
    type: Number,
    required: false,
    default: 0,
  },
})

const decimals = computed(() => {
  if (amount === 0)
    return 0
  return Math.max(minDecimals, calculateDisplayedDecimals(amount, currency))
})
</script>

<template>
  <Amount
    :decimals="decimals"
    :amount="amount || 0"
    :currency="currency"
    :currency-decimals="DECIMALS[currency]"
  />
</template>
