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
    selectedFiat: ref('usd'),
    activeAsset: ref(Asset.NIM),
    isNimiqAsset: ref(true),
  }),
}))

vi.mock('@/composables/useApi', () => ({
  useFetch: () => ({
    data: ref({ price: 1, currency: 'USD' }),
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
    quote: ref(null),
    error: ref(''),
    quoteLoading: ref(false),
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

vi.mock('@/components/AmountInput.vue', () => ({
  default: defineComponent({
    props: { modelValue: { type: Number, default: 0 }, decimals: { type: Number, default: 6 } },
    emits: ['update:modelValue'],
    template: '<button data-testid="amount-input" @click="$emit(\'update:modelValue\', 1000000)" />',
  }),
}))

vi.mock('@/components/CryptoAmount.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="crypto-amount" />',
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
        IonButton: defineComponent({
          props: { expand: String, disabled: { type: Boolean, default: false } },
          template: '<button data-testid="payment-amount-input-pay" :disabled="disabled"><slot /></button>',
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

  it('allows continuing for NIM amount entry even when the remote signer is unavailable', async () => {
    remoteBalance.value = 1_000_000
    isRemoteOk.value = false

    const wrapper = await mountComponent({ asset: Asset.NIM })
    await flushPromises()
    await wrapper.get('[data-testid="amount-input"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('[data-testid="payment-amount-input-pay"]').element as HTMLButtonElement).disabled).toBe(false)
  })
})
