import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref, toValue } from 'vue'

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: <T extends object>(store: T) => store,
  }
})

vi.mock('@/stores/app', () => {
  const selectedFiat = ref('USD')
  return {
    Crypto: {
      NIM: 'NIM',
      USDT: 'USDT',
    },
    DECIMALS: {
      NIM: 5,
      USDT: 6,
    },
    Fiat: {
      USD: 'USD',
    },
    useApp: () => ({
      selectedFiat,
    }),
  }
})

vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({
    height: ref(0),
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    error: vi.fn(),
  }),
}))

vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({
    formatFiat: (amount: number) => `USD ${amount}`,
    formatCrypto: (amount: number) => `${amount}`,
  }),
}))

vi.mock('@/composables/usePriceDb', () => ({
  usePriceDb: () => ({
    getPriceDb: vi.fn().mockResolvedValue(undefined),
    insertPrice: vi.fn().mockResolvedValue(undefined),
    getClosestPreviousPrice: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/composables/useTime', () => ({
  toMs: (value: number) => value,
}))

vi.mock('@/composables/useApi', () => ({
  useCurrencyPriceApi: () => ({
    getPriceNow: async ({ currency }: { currency: string }) => {
      const resolvedCurrency = toValue(currency)
      return {
        data: {
          price: resolvedCurrency === 'NIM' ? 2 : 1,
          currency: resolvedCurrency,
          time: 0,
          error: undefined,
        },
        hasError: false,
        error: undefined,
        status: 200,
      }
    },
    getPriceAt: async ({ currency }: { currency: string }) => {
      const resolvedCurrency = toValue(currency)
      return {
        data: {
          price: resolvedCurrency === 'NIM' ? 2 : 1,
          currency: resolvedCurrency,
          time: 0,
          error: undefined,
        },
        hasError: false,
        error: undefined,
        status: 200,
      }
    },
  }),
  useFetch: (request: () => Promise<{ data: { price: number } }>) => {
    const data = ref<any>()
    const error = ref()
    const fetch = async () => {
      const result = await request()
      data.value = result.data
      return result
    }
    return { data, error, fetch }
  },
}))

describe('usePrice', () => {
  it('refreshes the fiat total when the crypto asset changes', async () => {
    const { usePrice } = await import('./usePrice')
    const { Crypto } = await import('@/stores/app')

    const amountInUnits = ref(100000)
    const cryptoCurrency = ref(Crypto.NIM)
    const { fiat } = usePrice(amountInUnits, { cryptoCurrency })

    await flushPromises()
    expect(fiat.total).toBe(2)

    cryptoCurrency.value = Crypto.USDT
    amountInUnits.value = 1000000

    await flushPromises()
    expect(fiat.total).toBe(1)
  })
})
