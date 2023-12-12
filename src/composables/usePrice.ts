import { storeToRefs } from 'pinia'
import { type MaybeRef, computed, onMounted, reactive, ref, toRef, toValue, watch } from 'vue'
import { Crypto, Fiat, useApp } from '../stores/app'
import { usePriceDb } from '@/composables/usePriceDb'
import type { FormatCryptoOptions, FormatFiatOptions } from '@/composables/useCurrencyFormatter'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useNimiqNetwork } from '@/stores/nimiq-network'

export enum PriceStatus {
  Initial = 'Initial',
  Loading = 'Loading',
  LoadingWithFallback = 'LoadingWithFallback',
  Error = 'Error',
  Success = 'Success',
}

interface UsePriceNow {
  timestamp?: undefined
  reactiveToNetwork?: boolean
}

interface UsePriceAt {
  timestamp: number
  reactiveToNetwork: undefined
}

type UsePriceTime = UsePriceNow | UsePriceAt

type UsePriceOption = UsePriceTime & {
  // @default selectedFiat
  fiatCurrency?: MaybeRef<Fiat>

  // @default NIM
  cryptoCurrency?: MaybeRef<Crypto>

  // The formatter options to use when formatting the price
  formatter?: Pick<FormatFiatOptions, 'short' | 'locale' | 'isPayment'> | Pick<FormatCryptoOptions, 'locale'>

  // Reactive
  reactive?: boolean

  // Fetch the price immediately
  // @default true
  immediate?: boolean
}

const toNim = (amount: number) => amount / 1e5

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

  const checkpoint = Math.floor(timestamp / 600000) * 600

  const priceFn = (currency: Fiat | Crypto) => options.timestamp ? getPriceAt({ currency, timestamp: checkpoint }) : getPriceNow({ currency })

  const priceDb = ref<number>()
  const { data: priceCryptoUsd, fetch: fetchCryptoUsdPrice, error: errorCryptoUsdApi } = useFetch(() => priceFn(toValue(cryptoCurrency)))
  const { data: priceFiatUsd, fetch: fetchFiatUsdPrice, error: errorFiatUsdApi } = useFetch(
    () => toValue(fiatCurrency) === Fiat.USD ? Promise.resolve({ data: { price: 1 }, error: undefined }) : priceFn(Fiat.USD),
  )

  watch([errorCryptoUsdApi, errorFiatUsdApi], console.error) // TODO Handle error

  const price = computed(() => priceDb.value || (priceCryptoUsd.value?.price || -1) * (priceFiatUsd.value?.price || -1))

  const fiatTotal = computed(() => price.value * amountInNim.value)
  const fiat = reactive({
    total: fiatTotal,
    usd: computed(() => fiatTotal.value * (priceFiatUsd.value?.price || -1)),
    currency: fiatCurrency,
    formatted: computed(() => formatFiat(fiatTotal.value, { currency: fiatCurrency, ...options.formatter })),
  })

  const crypto = reactive({
    total: amountInNim,
    totalLuna: amountInLuna,
    usd: computed(() => amountInNim.value * (priceCryptoUsd.value?.price || -1)),
    currency: cryptoCurrency,
    formatted: computed(() => formatCrypto(amountInLuna.value, { currency: cryptoCurrency, ...options.formatter })),
  })

  // A value as fallback which is the nearest oldest price we have in the database
  const closestPreviousPrice = ref<number>()
  const closestPreviousFiatPrice = reactive({
    total: computed(() => closestPreviousPrice.value ? closestPreviousPrice.value * amountInNim.value : undefined),
    usd: computed(() => closestPreviousPrice.value ? closestPreviousPrice.value * amountInNim.value / (priceFiatUsd.value?.price || -1) : undefined),
    currency: fiatCurrency,
    formatted: computed(() => closestPreviousPrice.value ? formatFiat(closestPreviousPrice.value * amountInNim.value, { currency: fiatCurrency, ...options.formatter }) : undefined),
  })

  async function getPricesFromDb() {
    const price = getPriceDb({ checkpoint, fiat: fiatCurrency, crypto: cryptoCurrency })
    const fallbackPrice = getClosestPreviousPrice({ checkpoint, fiat: fiatCurrency, crypto: cryptoCurrency })

    const [priceData, fallbackPriceData] = await Promise.all([price, fallbackPrice])

    if (priceData) {
      priceDb.value = priceData.price
      state.value = PriceStatus.Success
      return true
    }

    if (fallbackPriceData) {
      closestPreviousPrice.value = fallbackPriceData?.price
      state.value = PriceStatus.LoadingWithFallback
    }
  }

  async function getFiatPrice() {
    state.value = PriceStatus.Loading

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

    state.value = PriceStatus.Success

    // If the write to the database fails, we don't care
    await insertPrice({ fiat: fiatCurrency, checkpoint, price: price.value, crypto: cryptoCurrency })
  }

  if (reactiveToNetwork)
    watch(height, getFiatPrice)

  onMounted(() => {
    if (immediate)
      getFiatPrice()
  })

  return {
    getFiatPrice,

    loading: computed(() => state.value === PriceStatus.Loading || state.value === PriceStatus.LoadingWithFallback),

    price,

    fiat,
    closestPreviousFiatPrice,
    crypto,
  }
}
