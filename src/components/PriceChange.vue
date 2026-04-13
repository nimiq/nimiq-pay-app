<script lang="ts" setup>
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import PriceChangeIcon from '@/components/icons/price-change.vue'
import { useCurrencyPriceApi } from '@/composables/useApi'
import { Crypto, Fiat, useApp } from '@/stores/app'

const { currency = Crypto.NIM } = defineProps<{
  currency?: Crypto
}>()

const { selectedFiat } = storeToRefs(useApp())
const { getPriceAt, getPriceNow } = useCurrencyPriceApi()

const priceChange = computedAsync(async () => {
  // Read reactive dependencies before any await so they are tracked
  const fiat = selectedFiat.value
  const yesterday = Date.now() - 60 * 60 * 24 * 1000

  const needsFiat = fiat !== Fiat.USD
  const [cryptoYesterdayRes, cryptoNowRes, fiatYesterdayRes, fiatNowRes] = await Promise.all([
    getPriceAt({ currency, timestamp: yesterday }),
    getPriceNow({ currency }),
    needsFiat ? getPriceAt({ currency: fiat, timestamp: yesterday }) : null,
    needsFiat ? getPriceNow({ currency: fiat }) : null,
  ])
  if (cryptoYesterdayRes.hasError || cryptoNowRes.hasError)
    return null
  if (!cryptoYesterdayRes.data.price || !cryptoNowRes.data.price)
    return null

  let priceYesterday = cryptoYesterdayRes.data.price
  let priceNow = cryptoNowRes.data.price

  if (needsFiat) {
    if (fiatYesterdayRes!.hasError || fiatNowRes!.hasError)
      return null
    if (!fiatYesterdayRes!.data.price || !fiatNowRes!.data.price)
      return null

    priceYesterday = cryptoYesterdayRes.data.price * fiatYesterdayRes!.data.price
    priceNow = cryptoNowRes.data.price * fiatNowRes!.data.price
  }

  const priceChange = (priceNow - priceYesterday) / priceYesterday * 100

  return Number.isFinite(priceChange) ? Math.round(priceChange * 10) / 10 : 0
})
</script>

<template>
  <div v-if="priceChange != null" class="flex justify-center items-center gap-x-1">
    <PriceChangeIcon class="text-space/50 h-3" :is-down="priceChange < 0" />
    <span class="whitespace-nowrap">
      {{ priceChange < 0 ? '' : '+' }}{{ priceChange.toFixed(1) }}%
    </span>
  </div>
</template>
