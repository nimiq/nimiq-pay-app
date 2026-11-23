import type { MaybeRef } from 'vue'
import type { FormatCryptoOptions, FormatFiatOptions } from '@/composables/useCurrencyFormatter'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, toRef, toValue, watch } from 'vue'
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useLogger } from '@/composables/useLogger'
import { usePriceDb } from '@/composables/usePriceDb'
import { toMs } from '@/composables/useTime'
import { isMockEnabled } from '@/lib/mock-mode'
import { Crypto, DECIMALS, Fiat, useApp } from '@/stores/app'
import { useNimiqNetwork } from '@/stores/nimiq-network'

const logger = useLogger('usePrice')

enum PriceStatus {
  Initial = 'initial',
  Loading = 'loading',
  Error = 'error',

  ClosestPrice = 'closest_price',

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
  fiatCurrency?: MaybeRef<Fiat>

  cryptoCurrency?: MaybeRef<Crypto>

  formatter?: Pick<FormatFiatOptions, 'short' | 'locale' | 'isPayment'> | Pick<FormatCryptoOptions, 'locale'>

  immediate?: boolean
}

export const toCoins = (amount: number, asset: Crypto) => amount / 10 ** DECIMALS[asset]

export function usePrice(_amountInUnits: MaybeRef<number>, options: UsePriceOption = {}) {
  const { selectedFiat } = storeToRefs(useApp())
  const { fiatCurrency = selectedFiat, timestamp = Date.now(), cryptoCurrency = Crypto.NIM, immediate = true } = options
  const reactiveToNetwork = options.timestamp ? false : (options.reactiveToNetwork ?? true)

  const { getPriceDb, insertPrice, getClosestPreviousPrice } = usePriceDb()
  const { formatFiat, formatCrypto } = useCurrencyFormatter()
  const { getPriceAt, getPriceNow } = useCurrencyPriceApi()
  const { height } = storeToRefs(useNimiqNetwork())

  const state = ref<PriceStatus>(PriceStatus.Initial)

  const amountInUnits = toRef(_amountInUnits)
  const amountInCoins = computed(() => toCoins(amountInUnits.value, toValue(cryptoCurrency)))

  const checkpoint = Math.floor(toMs(timestamp) / 1000 / 60 / 10) * 1000 * 60 * 10

  const priceFn = (currency: MaybeRef<Fiat | Crypto>) => options.timestamp ? getPriceAt({ currency, timestamp: checkpoint }) : getPriceNow({ currency })

  const priceDb = ref<number>()
  const { data: priceCryptoUsd, fetch: fetchCryptoUsdPrice, error: errorCryptoUsdApi } = useFetch(() => priceFn(cryptoCurrency), { immediate: false })

  const defaultUsdValue: Awaited<ReturnType<typeof priceFn>> = { data: { price: 1, currency: Fiat.USD, time: Math.round(Date.now() / 1e3), error: undefined }, hasError: false, error: undefined, status: 200 }
  const { data: priceFiatUsd, fetch: fetchFiatUsdPrice, error: errorFiatUsdApi } = useFetch(
    () => toValue(fiatCurrency) === Fiat.USD ? Promise.resolve(defaultUsdValue) : priceFn(fiatCurrency),
    { immediate: false },
  )

  watch([errorCryptoUsdApi, errorFiatUsdApi], logger.error)

  const price = computed(() => priceDb.value || (priceCryptoUsd.value?.price || 0) * (priceFiatUsd.value?.price || 0))

  const closestPreviousPrice = ref<number>()

  const usingClosestPreviousPrice = computed(() => state.value === PriceStatus.ClosestPrice)
  const fiatTotal = computed(() => usingClosestPreviousPrice.value
    ? (closestPreviousPrice.value || 0) * amountInCoins.value
    : price.value * amountInCoins.value)
  const fiat = reactive({
    total: fiatTotal,
    usd: computed(() => fiatTotal.value * (priceFiatUsd.value?.price || 0)),
    usingClosestPreviousPrice,
    currency: fiatCurrency,
    formatted: computed(() => formatFiat(fiatTotal.value, { currency: fiatCurrency, ...options.formatter })),
  })

  const crypto = reactive({
    total: amountInCoins,
    totalUnits: amountInUnits,
    usd: computed(() => amountInCoins.value * (priceCryptoUsd.value?.price || 0)),
    currency: cryptoCurrency,
    formatted: computed(() => formatCrypto(amountInUnits.value, { currency: cryptoCurrency, ...options.formatter })),
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
    if (isMockEnabled) {
      const { getMockPrice } = await import('@/lib/mock-data')
      priceDb.value = getMockPrice(toValue(cryptoCurrency), toValue(fiatCurrency))
      state.value = PriceStatus.Loaded
      return
    }

    state.value = closestPreviousPrice.value ? PriceStatus.ClosestPrice : PriceStatus.Loading

    const hasPrice = await getPricesFromDb()
    if (hasPrice)
      return

    const promises = await Promise.allSettled([fetchCryptoUsdPrice(), fetchFiatUsdPrice()])
    const rejected = promises.filter(p => p.status === 'rejected')
    if (rejected.length) {
      const reasons = rejected.map(p => (p as PromiseRejectedResult).reason)
      logger.error(reasons)
      state.value = PriceStatus.Error
      return
    }

    if (!priceCryptoUsd.value?.price || !priceFiatUsd.value?.price) {
      logger.error('Prices failed to set from API:', priceCryptoUsd.value?.price, priceFiatUsd.value?.price)
      state.value = closestPreviousPrice.value ? PriceStatus.ClosestPrice : PriceStatus.Error
      return
    }

    state.value = PriceStatus.Loaded

    if (price.value !== 0)
      await insertPrice({ fiat: fiatCurrency, checkpoint, price, crypto: cryptoCurrency }).catch(error => logger.error('Caching price failed:', error))
  }

  if (reactiveToNetwork) {
    watch(height, () => {
      if (height.value % 60 === 0)
        getFiatPrice()
    })
  }

  watch(
    [() => toValue(fiatCurrency), () => toValue(cryptoCurrency)],
    () => {
      priceDb.value = undefined
      closestPreviousPrice.value = undefined
      getFiatPrice()
    },
  )

  if (immediate)
    getFiatPrice()

  return {
    getFiatPrice,
    state,

    price: {
      nim: price,
      luna: computed(() => price.value / 1e5),
    },

    fiat,
    crypto,
  }
}
