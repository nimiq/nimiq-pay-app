import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { Asset } from '@/lib/assets'
import { StepName } from '@/lib/flows/steps.types'
import { Transfer } from '@/types/transactions'

const remoteBalance = ref(0)
const isRemoteOk = ref(true)
const usdtBalance = ref(0)
const polygonConsensus = ref<'connecting' | 'established'>('established')
const height = ref(100)
const cryptoUsdPrice = ref({ price: 1, currency: 'USD' })
const fiatUsdPrice = ref({ price: 1, currency: 'USD' })
const usdtQuote = ref<{ fee: number, totalDebit: number } | null>(null)
const usdtQuoteError = ref('')
const usdtQuoteLoading = ref(false)
let useFetchCall = 0

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    remoteBalance,
    isRemoteOk,
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    balance: usdtBalance,
    consensus: polygonConsensus,
    getCachedTransferQuote: () => null,
    refreshTransferQuote: () => Promise.resolve(null),
  }),
}))

vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({
    height,
  }),
}))

vi.mock('@/stores/app', () => ({
  Crypto: {
    NIM: 'NIM',
    BTC: 'BTC',
    USDT: 'USDT',
  },
  DECIMALS: {
    NIM: 5,
    BTC: 8,
    USDT: 6,
  },
  useApp: () => ({
    selectedFiat: ref('USD'),
    activeAsset: ref(Asset.NIM),
    isNimiqAsset: ref(true),
  }),
}))

vi.mock('@/composables/useApi', () => ({
  useFetch: () => ({
    data: useFetchCall++ === 0 ? cryptoUsdPrice : fiatUsdPrice,
    fetch: vi.fn(),
    state: ref('idle'),
    error: ref(undefined),
  }),
  useCurrencyPriceApi: () => ({
    getPriceNow: () => Promise.resolve({ data: { price: 1 }, hasError: false, error: undefined, status: 200 }),
  }),
}))

vi.mock('@/composables/useUsdtQuoteRefresh', () => ({
  useUsdtQuoteRefresh: () => ({
    quote: usdtQuote,
    error: usdtQuoteError,
    quoteLoading: usdtQuoteLoading,
    feeText: ref(''),
    refresh: vi.fn(),
    scheduleRefresh: vi.fn(),
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@nimiq/vue3-components', () => ({
  FiatAmount: defineComponent({
    props: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
    },
    template: '<span data-testid="fiat-amount">{{ currency }} {{ amount }}</span>',
  }),
}))

vi.mock('@/components/AmountInput.vue', () => ({
  default: defineComponent({
    props: {
      modelValue: { type: Number, default: 0 },
      decimals: { type: Number, default: 6 },
      suffix: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    template: '<button data-testid="amount-input" :data-decimals="decimals" :data-suffix="suffix" @click="$emit(\'update:modelValue\', 1000000)" />',
  }),
}))

vi.mock('@/components/CryptoAmount.vue', () => ({
  default: defineComponent({
    props: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'NIM' },
    },
    template: '<div data-testid="crypto-amount">{{ currency }} {{ amount }}</div>',
  }),
}))

vi.mock('@/components/PolygonWarning.vue', () => ({
  default: defineComponent({
    props: { message: String, tooltipMessage: String },
    template: '<div data-testid="polygon-warning">{{ message }}</div>',
  }),
}))

vi.mock('@/components/icons/loading-spinner.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="loading-spinner" />',
  }),
}))

interface MountOptions {
  merchantName?: string
  asset?: Asset
}

async function mountComponent(options: MountOptions = {}) {
  const { merchantName, asset } = options
  useFetchCall = 0
  const state = {
    [StepName.QRCodeScanner]: {
      amount: 0,
      fee: 0,
      recipient: 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000',
      transfer: Transfer.UserPayment,
      ...(merchantName !== undefined ? { merchantName } : {}),
      ...(asset !== undefined ? { asset } : {}),
    },
  }

  const { default: PaymentAmountInput } = await import('./PaymentAmountInput.vue')
  return mount(PaymentAmountInput, {
    props: { state },
    global: {
      plugins: [createPinia()],
      mocks: {
        $t: (key: string) => key,
      },
      stubs: {
        'IonButton': defineComponent({
          props: { expand: String, disabled: { type: Boolean, default: false } },
          template: '<button data-testid="payment-amount-input-pay" :disabled="disabled"><slot /></button>',
        }),
        'i18n-t': defineComponent({
          props: { keypath: { type: String, default: '' } },
          template: '<span data-testid="i18n-t">{{ keypath }}<slot name="fee" /></span>',
        }),
      },
    },
  })
}

describe('paymentAmountInput', () => {
  beforeEach(() => {
    remoteBalance.value = 0
    isRemoteOk.value = true
    usdtBalance.value = 0
    polygonConsensus.value = 'established'
    height.value = 100
    cryptoUsdPrice.value = { price: 1, currency: 'USD' }
    fiatUsdPrice.value = { price: 1, currency: 'USD' }
    usdtQuote.value = null
    usdtQuoteError.value = ''
    usdtQuoteLoading.value = false
  })

  it('does not render merchant name in component body (shown in flow header instead)', async () => {
    const wrapper = await mountComponent({ merchantName: 'Coffee Shop' })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Coffee Shop')
  })

  it('displays "Set an amount" subtitle', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Set an amount')
  })

  it('has a PAY button that is initially disabled (amount is 0)', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    const button = wrapper.find('[data-testid="payment-amount-input-pay"]')
    expect(button.exists()).toBe(true)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not show PolygonWarning for NIM payments', async () => {
    const wrapper = await mountComponent({ asset: Asset.NIM })
    await flushPromises()

    expect(wrapper.find('[data-testid="polygon-warning"]').exists()).toBe(false)
  })

  it('shows PolygonWarning for USDT payments', async () => {
    const wrapper = await mountComponent({ asset: Asset.USDT })
    await flushPromises()

    expect(wrapper.find('[data-testid="polygon-warning"]').exists()).toBe(true)
  })

  it('uses the active crypto ticker as the input suffix for NIM requests', async () => {
    const wrapper = await mountComponent({ asset: Asset.NIM })
    await flushPromises()

    expect(wrapper.get('[data-testid="amount-input"]').attributes('data-suffix')).toBe('NIM')
    expect(wrapper.get('[data-testid="amount-input"]').attributes('data-decimals')).toBe('5')
  })

  it('shows fiat equivalence instead of the crypto helper for NIM requests', async () => {
    remoteBalance.value = 2_000_000
    cryptoUsdPrice.value = { price: 2, currency: 'USD' }

    const wrapper = await mountComponent({ asset: Asset.NIM })
    await flushPromises()
    await wrapper.get('[data-testid="amount-input"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="crypto-amount"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('USD 20')
  })

  it('allows continuing for NIM amount entry even when the remote signer is unavailable', async () => {
    remoteBalance.value = 1_000_000
    isRemoteOk.value = false

    const wrapper = await mountComponent({ asset: Asset.NIM })
    await flushPromises()
    await wrapper.get('[data-testid="amount-input"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('[data-testid="payment-amount-input-pay"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the entered USDT transfer amount as the emitted base-unit value', async () => {
    usdtBalance.value = 10_000_000
    cryptoUsdPrice.value = { price: 2.0001, currency: 'USD' }
    usdtQuote.value = { fee: 250_000, totalDebit: 1_250_000 }

    const wrapper = await mountComponent({ asset: Asset.USDT })
    await flushPromises()
    await wrapper.get('[data-testid="amount-input"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="payment-amount-input-pay"]').trigger('click')

    expect(wrapper.emitted('done')?.[0]).toEqual([1_000_000])
    expect(wrapper.text()).toContain('USD 2.51')
    expect(wrapper.text()).toContain('USD 0.51')
  })

  it('does not block valid crypto entry when price data is missing', async () => {
    remoteBalance.value = 2_000_000
    cryptoUsdPrice.value = { price: 0, currency: 'USD' }

    const wrapper = await mountComponent({ asset: Asset.NIM })
    await flushPromises()
    await wrapper.get('[data-testid="amount-input"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('[data-testid="payment-amount-input-pay"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('still compares USDT balance against the quoted total debit', async () => {
    usdtBalance.value = 1_100_000
    usdtQuote.value = { fee: 250_000, totalDebit: 1_250_000 }

    const wrapper = await mountComponent({ asset: Asset.USDT })
    await flushPromises()
    await wrapper.get('[data-testid="amount-input"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('[data-testid="payment-amount-input-pay"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('You don\'t have enough USDT to cover this payment plus Polygon fees.')
  })
})
