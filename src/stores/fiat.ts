import { defineStore, storeToRefs } from 'pinia'
import { ref, toValue } from 'vue'
import { useApp } from './app'
import { useFiatDatabase } from '@/composables/useDatabase'
import { useDevice } from '@/composables/useDevice'
import { useCurrencyPriceApi } from '@/composables/useApi'
import type { AsyncResult } from '@/types'

export const useFiat = defineStore('fiat', () => {
  const { selectedFiat } = storeToRefs(useApp())
  const { getPriceAt, insertPrice } = useFiatDatabase()
  const { locale } = useDevice()
  const { getPriceAt: priceAt } = useCurrencyPriceApi()

  // TODO: add price for new currency if it doesnt exist
  // watch(selectedFiat, () => selectedFiat.value && upsertKV({ key: 'fiatPrice', value: currency.value }))

  function formatCurrency(value: number) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: selectedFiat.value }).format(value)
  }

  // The price of NIM every 10 minutes
  const prices = ref<Record<number /* ts */, number /* value */>>({})

  async function getPriceAtTs(ts: number): AsyncResult<number> {
    const rounded = Math.floor(ts / 600000) * 600
    const cachedPrice = prices.value[rounded]
    if (cachedPrice !== undefined)
      return { data: cachedPrice, error: undefined }

    const { data: price, error } = await getPriceAt(rounded)
    if (price === undefined)
      return { data: undefined, error: error || 'Unexpected error' }

    if (!price.value) {
      const { data: priceFromApi, error: priceAtError } = await priceAt({ currency: selectedFiat.value, timestamp: rounded })
      if (priceFromApi === undefined)
        return { data: undefined, error: priceAtError }
      price.value = priceFromApi.price
      const error = await insertPrice({ currency: selectedFiat.value, ts: rounded, value: priceFromApi.price })
      if (error)
        return { data: undefined, error }
    }

    prices.value[rounded] = toValue(price.value)
    return { data: toValue(price.value), error: undefined }
  }

  return {
    formatCurrency,
    getPriceAt: getPriceAtTs,
  }
})
