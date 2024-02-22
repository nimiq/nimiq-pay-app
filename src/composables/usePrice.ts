import { storeToRefs } from 'pinia'
import { type MaybeRef, computed, onMounted, reactive, ref, toRef, toValue, watch } from 'vue'
import { Crypto, Fiat, useApp } from '../stores/app'
import { toMs } from './useTime'
import { usePriceDb } from '@/composables/usePriceDb'
import { type FormatCryptoOptions, type FormatFiatOptions, useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useNimiqNetwork } from '@/stores/nimiq-network'

enum PriceStatus {
  Initial = 'initial',
  Loading = 'loading',
  Error = 'error',

  // Using the closest previous price from the database as a fallback meanwhile the latest price is being loaded from the API
  ClosestPrice = 'closest_price',

  // Using the right price from the database
  Loaded = 'loaded',
}

interface UsePriceNow {
  timestamp?: undefined
  reactiveToNetwork?: boolean
}

interface UsePriceAt {
  timestamp?: number
  reactiveToNetwork?: undefined
}

type UsePriceTime = UsePriceNow | UsePriceAt

type UsePriceOption = UsePriceTime & {
  // @default selectedFiat
  fiatCurrency?: MaybeRef<Fiat>

  // @default NIM
  cryptoCurrency?: MaybeRef<Crypto>

  // The formatter options to use when formatting the price
  formatter?: Pick<FormatFiatOptions, 'short' | 'locale' | 'isPayment'> | Pick<FormatCryptoOptions, 'locale'>

  // Fetch the price immediately
  // @default true
  immediate?: boolean
}

export const toNim = (amount: number) => amount / 1e5

/**
 * Retrieves and formats the price for a specified amount of LUNA. This function first attempts to fetch the price
 * from the database. If the price is not available in the database, it then fetches it from the API. The price can
 * be obtained either for the current moment or for a specific historical timestamp. Prices are fetched at 10-minute
 * intervals (checkpoints), which means that for a given timestamp, the function calculates the nearest past
 * checkpoint and fetches the price for that time. The function provides the price in both the chosen cryptocurrency
 * and fiat currency. Additionally, it offers a fallback mechanism where the nearest previous price from the database
 * is used as a temporary value while the latest price is being loaded from the API.
 */
export function usePrice(_amountInLuna: MaybeRef<number>, options: UsePriceOption = {}) {
  const { selectedFiat } = storeToRefs(useApp())
  const { fiatCurrency = selectedFiat, timestamp = Date.now(), cryptoCurrency = Crypto.NIM, immediate = true } = options
  const { reactiveToNetwork } = options.timestamp ? { reactiveToNetwork: false } : { reactiveToNetwork: options.reactiveToNetwork ?? true }

  const { getPriceDb, insertPrice, getClosestPreviousPrice } = usePriceDb()
  const { formatFiat, formatCrypto } = useCurrencyFormatter()
  const { getPriceAt, getPriceNow } = useCurrencyPriceApi()
  const { height } = storeToRefs(useNimiqNetwork())

  const state = ref<PriceStatus>(PriceStatus.Initial)

  const amountInLuna = toRef(_amountInLuna)
  const amountInNim = computed(() => toNim(amountInLuna.value))

  const checkpoint = toMs(Math.floor(timestamp / 600000) * 600)

  const priceFn = (currency: MaybeRef<Fiat | Crypto>) => options.timestamp ? getPriceAt({ currency, timestamp: checkpoint }) : getPriceNow({ currency })

  const priceDb = ref<number>()
  const { data: priceCryptoUsd, fetch: fetchCryptoUsdPrice, error: errorCryptoUsdApi } = useFetch(() => priceFn(cryptoCurrency), { immediate: false })

  const defaultUsdValue: Awaited<ReturnType<typeof priceFn>> = { data: { price: 1, currency: Fiat.USD, time: Math.round(Date.now() / 1e3), error: undefined }, hasError: false, error: undefined, status: 200 }
  const { data: priceFiatUsd, fetch: fetchFiatUsdPrice, error: errorFiatUsdApi } = useFetch(
    () => toValue(fiatCurrency) === Fiat.USD ? Promise.resolve(defaultUsdValue) : priceFn(fiatCurrency),
    { immediate: false },
  )

  watch([errorCryptoUsdApi, errorFiatUsdApi], console.error) // TODO Handle error

  const price = computed(() => priceDb.value || (priceCryptoUsd.value?.price || 0) * (priceFiatUsd.value?.price || 0))

  // A value as fallback which is the nearest oldest price we have in the database
  const closestPreviousPrice = ref<number>()

  const usingClosestPreviousPrice = computed(() => state.value === PriceStatus.ClosestPrice)
  const fiatTotal = computed(() => usingClosestPreviousPrice.value ? (closestPreviousPrice.value || 0) * amountInNim.value : price.value * amountInNim.value)
  const fiat = reactive({
    total: fiatTotal,
    usd: computed(() => fiatTotal.value * (priceFiatUsd.value?.price || 0)),
    usingClosestPreviousPrice,
    currency: fiatCurrency,
    formatted: computed(() => formatFiat(fiatTotal.value, { currency: fiatCurrency, ...options.formatter })),
  })

  const crypto = reactive({
    total: amountInNim,
    totalLuna: amountInLuna,
    usd: computed(() => amountInNim.value * (priceCryptoUsd.value?.price || 0)),
    currency: cryptoCurrency,
    formatted: computed(() => formatCrypto(amountInLuna.value, { currency: cryptoCurrency, ...options.formatter })),
  })

  async function getPricesFromDb() {
    const price = getPriceDb({ checkpoint, fiat: fiatCurrency, crypto: cryptoCurrency })
    const fallbackPrice = getClosestPreviousPrice({ checkpoint, fiat: fiatCurrency, crypto: cryptoCurrency })

    const [priceData, fallbackPriceData] = await Promise.all([price, fallbackPrice])

    if (priceData) {
      priceDb.value = toValue(priceData.price)
      state.value = PriceStatus.Loaded
      return true
    }

    if (fallbackPriceData) {
      closestPreviousPrice.value = toValue(fallbackPriceData?.price)
      state.value = PriceStatus.ClosestPrice
    }
    return false
  }

  async function getFiatPrice() {
    state.value = closestPreviousPrice.value ? PriceStatus.ClosestPrice : PriceStatus.Loading

    // First check if we have the price in the database
    const hasPrice = await getPricesFromDb()
    if (hasPrice)
      return

    // If not, fetch it from the API
    const promises = await Promise.allSettled([fetchCryptoUsdPrice(), fetchFiatUsdPrice()])
    const rejected = promises.filter(p => p.status === 'rejected')
    if (rejected.length) {
      const reasons = rejected.map(p => (p as PromiseRejectedResult).reason)
      console.error(reasons)
      state.value = PriceStatus.Error
      return
    }

    state.value = PriceStatus.Loaded

    if (price.value !== 0)
      // If the write to the database fails, we don't care
      await insertPrice({ fiat: fiatCurrency, checkpoint, price, crypto: cryptoCurrency })
  }

  if (reactiveToNetwork)
    watch(height, getFiatPrice)

  // Update if the fiat changes
  watch(selectedFiat, () => {
    priceDb.value = 0
    getFiatPrice()
  })

  onMounted(() => {
    if (immediate)
      getFiatPrice()
  })

  return {
    getFiatPrice,
    state,

    price: {
      nim: price,
      luna: computed(() => price.value * 1e5),
    },

    fiat,
    crypto,
  }
}
