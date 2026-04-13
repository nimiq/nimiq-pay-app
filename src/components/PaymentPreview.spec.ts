import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { StepName } from '@/lib/flows/steps.types'
import { MerchantCategory, Rail, Transfer } from '@/types/transactions'

const usdtBalance = ref(0)
const polygonConsensus = ref<'established' | 'connecting'>('established')
const isHtlcActive = ref(true)
const isRemoteOk = ref(true)
const selectedFiat = ref('EUR')
const checkPointsPaymentValidity = vi.fn()
const setToast = vi.fn()
const usePrice = vi.fn()
const getPriceNow = vi.fn()
const getCachedTransferQuote = vi.fn()
const refreshTransferQuote = vi.fn()
const primeHtlcFee = vi.fn()
const getSwapLimits = vi.fn()
const getEthAddress = vi.fn()
const loggerError = vi.fn()

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string, params?: Record<string, string | number>) => Object.entries(params || {}).reduce(
      (message, [key, replacement]) => message.replace(`{${key}}`, String(replacement)),
      value,
    ),
    tc: (value: string) => value,
  },
}))

vi.mock('@/stores/app', () => ({
  Crypto: {
    NIM: 'NIM',
    BTC: 'BTC',
    USDT: 'USDT',
  },
  Fiat: {
    USD: 'USD',
    EUR: 'EUR',
    CRC: 'CRC',
    GMD: 'GMD',
  },
  DECIMALS: {
    NIM: 5,
    BTC: 8,
    USDT: 6,
  },
  useApp: () => ({
    selectedFiat,
  }),
}))

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(),
  },
}))

vi.mock('@ionic/vue', () => ({
  IonButton: defineComponent({
    template: '<button v-bind="$attrs"><slot /></button>',
  }),
  IonToggle: defineComponent({
    template: '<div v-bind="$attrs" data-testid="points-toggle"><slot /></div>',
  }),
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('radix-vue', () => {
  const passthrough = defineComponent({
    template: '<div v-bind="$attrs"><slot /></div>',
  })

  return {
    PopoverArrow: passthrough,
    PopoverContent: passthrough,
    PopoverPortal: passthrough,
    PopoverRoot: passthrough,
    PopoverTrigger: passthrough,
  }
})

vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({
    formatFiat: (amount: number, options?: { currency?: string, short?: boolean }) => `${options?.currency || 'EUR'} ${options?.short ? amount.toFixed(0) : amount.toFixed(2)}`,
    formatCrypto: (amount: number) => `${amount}`,
  }),
}))

vi.mock('@/composables/useApi', () => ({
  useCurrencyPriceApi: () => ({
    getPriceNow,
  }),
}))

vi.mock('@/composables/useFastspotv1', () => ({
  useFastspotApiV1: async () => ({
    getLimits: getSwapLimits,
    SwapAsset: {
      NIM: 'NIM',
      USDT_MATIC: 'USDT_MATIC',
    },
  }),
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice,
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    error: loggerError,
    warn: vi.fn(),
  }),
}))

vi.mock('@/composables/usePointsPayment', () => ({
  PointsState: {
    NotRegistered: 'not-registered',
    NotEligibleForPayment: 'not-eligible',
    InsufficientPoints: 'insufficient',
    Error: 'error',
  },
  usePointsPayment: () => ({
    hasCashback: ref(false),
    message: ref(''),
    pointsState: ref('not-registered'),
    checkPointsPaymentValidity,
    isEligible: ref(false),
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    setToast,
  }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: ref({
      toUserFriendlyAddress: () => 'NQ00 TEST',
      toHex: () => '00',
    }),
    getEthAddress,
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    balance: usdtBalance,
    consensus: polygonConsensus,
    getCachedTransferQuote,
    primeHtlcFee,
    refreshTransferQuote,
  }),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    isHtlcActive,
    isRemoteOk,
    remoteBalance: 0,
  }),
}))

vi.mock('./TransactionAmounts.vue', () => ({
  default: defineComponent({
    props: ['cryptoTotal', 'cryptoCurrency', 'fiatAmount', 'fiatCurrency', 'paymentMethod', 'refunded'],
    template: '<div data-testid="transaction-amounts" :data-crypto-total="cryptoTotal" :data-fiat-amount="fiatAmount" :data-fiat-currency="fiatCurrency"><slot name="invoiced" /><slot name="amount-after" /><slot name="fee" /><slot name="crypto-after" /></div>',
  }),
}))

vi.mock('./PolygonWarning.vue', () => ({
  default: defineComponent({
    props: {
      message: {
        type: String,
        required: true,
      },
    },
    template: '<div data-testid="polygon-warning">{{ message }}</div>',
  }),
}))

async function mountComponent(props: Record<string, unknown> = {}) {
  const { default: PaymentPreview } = await import('./PaymentPreview.vue')

  return mount(PaymentPreview, {
    props: {
      state: {
        [StepName.QRCodeScanner]: {
          amount: 116_440_000,
          asset: Asset.USDT,
          chain: Chain.Polygon,
          fee: 0,
          feeIncludedInAmount: true,
          fiatCurrency: 'EUR',
          fiatFeeAmount: 0.25,
          merchantCategory: MerchantCategory.Shop,
          merchantName: 'The Barn',
          paymentRef: 'payment-ref',
          rail: Rail.Unknown,
          recipient: '0x0000000000000000000000000000000000000001',
          transfer: Transfer.UserPaymentToMerchant,
        },
      },
      ...props,
    },
    global: {
      mocks: {
        $t: (value: string) => value,
      },
      stubs: {
        'Transition': false,
        'i18n-t': {
          template: '<div><slot /></div>',
        },
      },
    },
  })
}

async function mountComponentWithoutPrefilledFiat() {
  const { default: PaymentPreview } = await import('./PaymentPreview.vue')

  return mount(PaymentPreview, {
    props: {
      state: {
        [StepName.QRCodeScanner]: {
          amount: 116_440_000,
          asset: Asset.USDT,
          chain: Chain.Polygon,
          fee: 0,
          merchantCategory: MerchantCategory.Shop,
          paymentRef: '',
          rail: Rail.Unknown,
          recipient: '0x0000000000000000000000000000000000000001',
          transfer: Transfer.UserPayment,
        },
      },
    },
    global: {
      mocks: {
        $t: (value: string) => value,
      },
      stubs: {
        'Transition': false,
        'i18n-t': {
          template: '<div><slot /></div>',
        },
      },
    },
  })
}

describe('paymentPreview', () => {
  beforeEach(() => {
    usdtBalance.value = 500_000_000
    polygonConsensus.value = 'established'
    isHtlcActive.value = true
    isRemoteOk.value = true
    selectedFiat.value = 'EUR'
    checkPointsPaymentValidity.mockClear()
    setToast.mockClear()
    loggerError.mockClear()
    usePrice.mockReset()
    getPriceNow.mockReset()
    getCachedTransferQuote.mockReset()
    getEthAddress.mockReset()
    getEthAddress.mockReturnValue({ data: '0x0000000000000000000000000000000000000002' })
    getSwapLimits.mockReset()
    getSwapLimits.mockResolvedValue({ current: 500_000_000 })
    primeHtlcFee.mockReset()
    primeHtlcFee.mockResolvedValue({
      fee: 4_000_000,
      expiresAt: Date.now() + 20_000,
      gasLimit: '123000',
      gasPrice: '456000000',
      relay: {
        url: 'https://relay.example',
        baseRelayFee: '1',
        pctRelayFee: '2',
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: '3',
      },
    })
    refreshTransferQuote.mockReset()
    getCachedTransferQuote.mockReturnValue(null)
    refreshTransferQuote.mockResolvedValue({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 4_000_000,
      totalDebit: 120_440_000,
      maxSendable: 496_000_000,
      expiresAt: Date.now() + 20_000,
      gasLimit: '123000',
      gasPrice: '456000000',
      relay: {
        url: 'https://relay.example',
      },
    })
    usePrice.mockImplementation((amount: number, options?: { fiatCurrency?: string }) => ({
      getFiatPrice: vi.fn(async () => {}),
      fiat: {
        total: amount === 4_000_000 ? 0.25 : 110,
        currency: options?.fiatCurrency || 'EUR',
      },
    }))
    getPriceNow.mockResolvedValue({
      data: {
        price: 0.9,
        currency: 'EUR',
        time: Math.round(Date.now() / 1e3),
        error: undefined,
      },
      hasError: false,
      error: undefined,
      status: 200,
    })
  })

  it('renders the USDT preview via TransactionAmounts and pay action', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    const ta = wrapper.get('[data-testid="transaction-amounts"]')
    expect(ta.attributes('data-crypto-total')).toBe('120440000')
    expect(ta.attributes('data-fiat-amount')).toBe('110.25')
    expect(ta.attributes('data-fiat-currency')).toBe('EUR')
    expect(wrapper.find('[data-testid="usdt-preview-info"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="usdt-preview-details"]').exists()).toBe(true)
    expect(usePrice).toHaveBeenCalledTimes(1)
    expect(usePrice).toHaveBeenCalledWith(116_440_000, expect.objectContaining({
      fiatCurrency: 'EUR',
    }))
    expect(wrapper.find('[data-testid="polygon-warning"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Pay')
    expect(wrapper.find('[data-testid="points-toggle"]').exists()).toBe(false)
  })

  it('disables the USDT pay action when the quoted fee pushes total debit above balance', async () => {
    usdtBalance.value = 118_000_000

    const wrapper = await mountComponent()
    await flushPromises()

    expect(refreshTransferQuote).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="payment-preview-pay"]').attributes('disabled')).toBeDefined()
  })

  it('renders recipient and total debit details for USDT confirmations', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    const details = wrapper.get('[data-testid="usdt-preview-details"]')
    expect(details.text()).toContain('USDT · Polygon')
    expect(details.text()).toContain('0x0000000000000000000000000000000000000001')
    expect(details.text()).toContain('Total debit')
  })

  it('positions and styles the USDT popover like the atomic swap popover', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    const trigger = wrapper.get('[data-testid="usdt-preview-info"]')
    const details = wrapper.get('[data-testid="usdt-preview-details"]')

    expect(trigger.classes()).toContain('-mr-[1.625rem]')
    expect(details.attributes('align')).toBe('end')
    expect(details.attributes('align-offset')).toBe('-32')
    expect(details.classes()).toContain('max-w-60')
    expect(details.classes()).toContain('rounded')
    expect(details.classes()).not.toContain('rounded-2xl')
    expect(details.classes()).not.toContain('shadow-lg')
  })

  it('calculates fiat amounts for USDT requests that do not provide them', async () => {
    const wrapper = await mountComponentWithoutPrefilledFiat()
    await flushPromises()

    const amountPriceCall = usePrice.mock.calls.find(([amount]) => amount === 116_440_000)
    expect(amountPriceCall).toBeTruthy()
    expect(amountPriceCall?.[1]?.cryptoCurrency.value).toBe('USDT')
    const ta = wrapper.get('[data-testid="transaction-amounts"]')
    expect(ta.attributes('data-crypto-total')).toBe('120440000')
    expect(ta.attributes('data-fiat-amount')).toBe('110.25')
  })

  it('renders a warmed quote immediately while refreshing in the background', async () => {
    getCachedTransferQuote.mockReturnValue({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 4_000_000,
      totalDebit: 120_440_000,
      maxSendable: 496_000_000,
      expiresAt: Date.now() + 20_000,
      gasLimit: '123000',
      gasPrice: '456000000',
      relay: {
        url: 'https://relay.example',
      },
    })

    const wrapper = await mountComponent()

    expect(wrapper.text()).not.toContain('Calculating Polygon fee...')
    expect(wrapper.get('[data-testid="transaction-amounts"]').attributes('data-crypto-total')).toBe('120440000')

    await flushPromises()

    expect(getCachedTransferQuote).toHaveBeenCalled()
    expect(refreshTransferQuote).toHaveBeenCalledTimes(1)
  })

  it('does not show the insufficient USDT message while Polygon fees are still loading', async () => {
    refreshTransferQuote.mockImplementation(() => new Promise(() => {}))

    const wrapper = await mountComponent()

    expect(wrapper.text()).toContain('Calculating Polygon fee...')
    expect(wrapper.text()).not.toContain('You don\'t have enough USDT to cover this payment plus Polygon fees.')
  })

  it('shows a friendly timeout message when Polygon RPC fee quoting fails', async () => {
    const rpcTimeoutError = new Error(
      'server response 408 (request={}, response={}, error=null, info={"requestUrl":"https://tenderly.rpc.polygon.community","responseBody":"[{\\"jsonrpc\\":\\"2.0\\",\\"id\\":12,\\"error\\":{\\"code\\":-32009,\\"message\\":\\"evm timeout\\"}}]","responseStatus":"408"}, code=SERVER_ERROR, version=6.16.0)',
    )
    getCachedTransferQuote.mockReturnValue({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 4_000_000,
      totalDebit: 120_440_000,
      maxSendable: 496_000_000,
      expiresAt: Date.now() + 20_000,
      gasLimit: '123000',
      gasPrice: '456000000',
      relay: {
        url: 'https://relay.example',
      },
    })
    refreshTransferQuote.mockRejectedValue(rpcTimeoutError)

    const wrapper = await mountComponent()
    await flushPromises()

    expect(loggerError).toHaveBeenCalledWith('Failed to refresh Polygon USDT quote', rpcTimeoutError)
    expect(wrapper.text()).toContain('Polygon took too long to calculate the fee. Please try again.')
    expect(wrapper.text()).not.toContain('server response 408')
    expect(wrapper.text()).not.toContain('evm timeout')
  })

  it('replaces a generic Polygon fee flow error toast with the specific quote refresh error', async () => {
    const rpcTimeoutError = new Error(
      'server response 408 (request={}, response={}, error=null, info={"requestUrl":"https://tenderly.rpc.polygon.community","responseBody":"[{\\"jsonrpc\\":\\"2.0\\",\\"id\\":12,\\"error\\":{\\"code\\":-32009,\\"message\\":\\"evm timeout\\"}}]","responseStatus":"408"}, code=SERVER_ERROR, version=6.16.0)',
    )
    refreshTransferQuote.mockRejectedValue(rpcTimeoutError)

    await mountComponent({ errorMsg: 'Could not calculate Polygon fee right now. Please try again.' })
    await flushPromises()

    expect(setToast).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Polygon took too long to calculate the fee. Please try again.',
      type: 'error',
    }))
  })

  it('does not request a normal Polygon transfer quote for USDT Lightning swaps', async () => {
    const wrapper = await mountComponent({
      state: {
        [StepName.QRCodeScanner]: {
          amount: 116_440_000,
          asset: Asset.USDT,
          chain: Chain.Polygon,
          fee: 0,
          feeIncludedInAmount: true,
          merchantCategory: MerchantCategory.Shop,
          merchantName: 'The Barn',
          paymentRef: 'swap-ref',
          rail: Rail.BitcoinLightning,
          recipient: 'lnbc1atomicswapinvoice',
          transfer: Transfer.UserPaymentToAtomicSwap,
          swap: {
            fees: [
              { asset: Asset.USDT, amount: 1_000_000, included: true, source: 'NETWORK' as const },
            ],
          },
        },
      },
    })
    await flushPromises()

    expect(refreshTransferQuote).not.toHaveBeenCalled()
    expect(getCachedTransferQuote).not.toHaveBeenCalled()
    expect(primeHtlcFee).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="payment-preview-pay"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="polygon-warning"]').exists()).toBe(false)
  })

  it('shows HTLC fee in inline text for USDT Lightning swaps (swap fee added when resolved)', async () => {
    const wrapper = await mountComponent({
      state: {
        [StepName.QRCodeScanner]: {
          amount: 116_440_000,
          asset: Asset.USDT,
          chain: Chain.Polygon,
          fee: 0,
          feeIncludedInAmount: true,
          merchantCategory: MerchantCategory.Shop,
          merchantName: 'The Barn',
          paymentRef: 'swap-ref',
          rail: Rail.BitcoinLightning,
          recipient: 'lnbc1atomicswapinvoice',
          transfer: Transfer.UserPaymentToAtomicSwap,
          swap: {
            fees: [
              { asset: Asset.USDT, amount: 1_000_000, included: true, source: 'NETWORK' as const },
            ],
          },
        },
      },
    })
    await flushPromises()

    // The inline fee label renders (uses totalPreviewFeeFiat which includes swapFee when resolved)
    const feeLabel = wrapper.find('[aria-label="Fee included"]')
    expect(feeLabel.exists()).toBe(true)
  })

  it('shows fee breakdown in the popover for USDT Lightning swaps', async () => {
    const wrapper = await mountComponent({
      state: {
        [StepName.QRCodeScanner]: {
          amount: 116_440_000,
          asset: Asset.USDT,
          chain: Chain.Polygon,
          fee: 0,
          feeIncludedInAmount: true,
          merchantCategory: MerchantCategory.Shop,
          merchantName: 'The Barn',
          paymentRef: 'swap-ref',
          rail: Rail.BitcoinLightning,
          recipient: 'lnbc1atomicswapinvoice',
          transfer: Transfer.UserPaymentToAtomicSwap,
          swap: {
            fees: [
              { asset: Asset.USDT, amount: 1_000_000, included: true, source: 'NETWORK' as const },
            ],
          },
        },
      },
    })
    await flushPromises()

    const details = wrapper.get('[data-testid="swap-preview-details"]')
    // The popover renders the swap description and fee breakdown structure
    expect(details.text()).toContain('When paying with BTC Lightning, USDT are swapped to BTC.')
    expect(details.text()).toContain('This conversion and the operation of a BTC Lightning channel require fees.')
  })

  it('shows the remaining swap allowance for over-limit USDT Lightning swaps', async () => {
    getSwapLimits.mockResolvedValue({ current: 100_000_000 })
    usePrice.mockImplementation((amount: number, options?: { fiatCurrency?: string, cryptoCurrency?: { value: string } | string }) => ({
      getFiatPrice: vi.fn(async () => {}),
      fiat: {
        total: amount / 1_000_000,
        currency: options?.fiatCurrency || 'EUR',
        formatted: `${options?.fiatCurrency || 'EUR'} ${(amount / 1_000_000).toFixed(2)}`,
      },
      crypto: {
        currency: options?.cryptoCurrency || 'USDT',
      },
    }))

    await mountComponent({
      state: {
        [StepName.QRCodeScanner]: {
          amount: 116_440_000,
          asset: Asset.USDT,
          chain: Chain.Polygon,
          fee: 0,
          feeIncludedInAmount: true,
          merchantCategory: MerchantCategory.Shop,
          merchantName: 'The Barn',
          paymentRef: 'swap-ref',
          rail: Rail.BitcoinLightning,
          recipient: 'lnbc1limitinvoice',
          transfer: Transfer.UserPaymentToAtomicSwap,
          swap: {
            fees: [
              { asset: Asset.USDT, amount: 1_000_000, included: true, source: 'NETWORK' as const },
            ],
          },
        },
      },
    })
    // Settle chained computedAsync evaluations (htlcFeeSnapshot, swapAddressLimits,
    // remainingFiatLimits) — each needs a microtask flush + Vue reactivity tick.
    await flushPromises()
    await nextTick()
    await flushPromises()
    const remainingLimitPriceCall = usePrice.mock.calls.find(([amount]) => amount === 99_000_000)
    expect(remainingLimitPriceCall?.[1]?.cryptoCurrency.value).toBe('USDT')
  })
})
