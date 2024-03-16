<script lang="ts" setup>
import { computedAsync } from '@vueuse/core'
import { Crypto } from '@/stores/app'
import { useCurrencyPriceApi } from '@/composables/useApi'
import PriceChangeIcon from '@/components/icons/price-change.vue'

const { getPriceAt, getPriceNow } = useCurrencyPriceApi()

const currency = Crypto.NIM
const yesterday = Date.now() - 60 * 60 * 24 * 1000
const priceChange = computedAsync(async () => {
  const { data: priceYesterday, hasError: yesterdayError } = await getPriceAt({ currency, timestamp: yesterday })
  if (yesterdayError)
    return 0
  const { data: priceNow, hasError: nowError } = await getPriceNow({ currency })
  if (nowError)
    return 0
  if (!priceYesterday.price || !priceNow.price)
    return 0
  const priceChange = (priceNow.price - priceYesterday.price) / priceYesterday.price * 100

  return Number.isFinite(priceChange) ? Math.round(priceChange * 10) / 10 : 0
})
</script>

<template>
  <div v-if="priceChange" class="flex items-center justify-center gap-x-1">
    <PriceChangeIcon class="h-3 text-space/50" :is-down="priceChange < 0" />
    <span class="whitespace-nowrap">
      {{ priceChange.toFixed(1) }}%
    </span>
  </div>
</template>
