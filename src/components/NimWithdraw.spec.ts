import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { StepName } from '@/lib/flows/steps.types'
import { Transfer } from '@/types/transactions'

const withdrawalAddress = ref('')
const withdrawalDenomination = ref<'fiat' | 'crypto'>('fiat')
const selectedFiat = ref('EUR')
const isNimiqAsset = ref(false)
const usdtBalance = ref(0)
const polygonConsensus = ref<'established' | 'connecting'>('established')
const remoteBalance = ref(0)
const transferFeeSnapshot = ref<any>(null)
const priceData = ref<{ price: number } | null>({ price: 1 })
const getCachedTransferQuote = vi.fn()
const refreshTransferQuote = vi.fn()
const primeTransferFee = vi.fn()
const addNewWithdrawalAddress = vi.fn()

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string, params?: Record<string, string | number>) => Object.entries(params || {}).reduce(
      (message, [key, replacement]) => message.replace(`{${key}}`, String(replacement)),
      value,
    ),
  },
}))

vi.mock('@ionic/vue', () => ({
  IonButton: defineComponent({
    template: '<button v-bind="$attrs"><slot /></button>',
  }),
}))

vi.mock('@nimiq/utils', () => ({
  ValidationUtils: {
    isValidAddress: () => false,
  },
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/stores/app', () => ({
  Crypto: {
    NIM: 'NIM',
    USDT: 'USDT',
  },
  DECIMALS: {
    NIM: 5,
    USDT: 6,
  },
  useApp: () => ({
    withdrawalAddress,
    withdrawalDenomination,
    selectedFiat,
    isNimiqAsset,
    activeAsset: computed(() => isNimiqAsset.value ? 'NIM' : 'USDT'),
    addNewWithdrawalAddress,
    getAlias: () => undefined,
  }),
}))

vi.mock('@/stores/locks', () => ({
  useLocks: () => ({
    isScannerActive: ref(false),
  }),
}))

vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({
    height: ref(1),
    consensus: ref('established'),
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    balance: usdtBalance,
    consensus: polygonConsensus,
    transferFeeSnapshot,
    getCachedTransferQuote,
    refreshTransferQuote,
    primeTransferFee,
  }),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    isRemoteOk: ref(true),
    isHtlcActive: ref(true),
    remoteBalance,
    hasHtlcExpired: ref(false),
  }),
}))

vi.mock('@/composables/useApi', () => ({
  useCurrencyPriceApi: () => ({
    getPriceNow: vi.fn(async () => ({ price: 1 })),
  }),
  // Snapshot priceData per useFetch() call so each mount gets its own ref;
  // prevents stale wrappers from prior tests reacting to module-shared state.
  useFetch: () => ({
    data: ref(priceData.value),
    fetch: vi.fn(),
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    error: vi.fn(),
  }),
}))

vi.mock('@/lib/assets', () => ({
  assetToCrypto: (asset: string) => asset,
  formatUsdtAmount: (amount: number) => `${(amount / 1e6).toFixed(2)} USDT`,
  formatUsdtPreviewAmount: (amount: number) => `${(Math.ceil(amount / 10_000) / 100).toFixed(2)} USDT`,
}))

vi.mock('@/lib/flows', () => ({
  initializeFlow: vi.fn(),
}))

vi.mock('@/components/AmountInput.vue', () => ({
  default: defineComponent({
    props: {
      modelValue: {
        type: Number,
        required: true,
      },
    },
    emits: ['update:modelValue'],
    template: '<input data-testid="amount-input" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))">',
  }),
}))

vi.mock('@/components/CryptoAmount.vue', () => ({
  default: defineComponent({
    props: {
      amount: {
        type: Number,
        required: true,
      },
      currency: {
        type: String,
        required: true,
      },
    },
    template: '<span>{{ amount }} {{ currency }}</span>',
  }),
}))

vi.mock('@/components/ShortAddressDisplay.vue', () => ({
  default: defineComponent({
    props: {
      address: {
        type: String,
        required: true,
      },
    },
    template: '<span>{{ address }}</span>',
  }),
}))

vi.mock('@/components/icons/loading-spinner.vue', () => ({
  default: defineComponent({
    template: '<span>Loading</span>',
  }),
}))

vi.mock('@/components/icons/nimiq-logo.vue', () => ({
  default: defineComponent({
    template: '<span data-testid="nim-logo">NIM</span>',
  }),
}))

vi.mock('@/components/icons/usdt-logo.vue', () => ({
  default: defineComponent({
    template: '<span data-testid="usdt-logo">USDT</span>',
  }),
}))

vi.mock('@/components/icons/triangle.vue', () => ({
  default: defineComponent({
    template: '<span>triangle</span>',
  }),
}))

vi.mock('@/components/icons/swap-vertical.vue', () => ({
  default: defineComponent({
    template: '<span data-testid="swap-icon" />',
  }),
}))

vi.mock('@nimiq/vue3-components', () => ({
  FiatAmount: defineComponent({
    props: {
      amount: {
        type: Number,
        required: true,
      },
    },
    template: '<span>{{ amount }}</span>',
  }),
}))

async function mountComponent(
  address = '0x0000000000000000000000000000000000000001',
  props: Record<string, unknown> = {},
) {
  const { default: NimWithdraw } = await import('./NimWithdraw.vue')

  // Component derives `selected` from the `withdrawalAddress` store ref (APP-91);
  // seed it here so tests that supply an address don't have to do it manually.
  // Empty `address` is treated as "leave the store value alone" so tests can pre-seed
  // a persisted address (e.g. a stale NIM address while USDT is active) before mounting.
  if (address)
    withdrawalAddress.value = address

  return mount(NimWithdraw, {
    props: {
      state: {
        [StepName.NimAddressInput]: address,
      },
      ...props,
    },
    global: {
      mocks: {
        $t: (value: string, params?: Record<string, string | number>) => Object.entries(params || {}).reduce(
          (message, [key, replacement]) => message.replace(`{${key}}`, String(replacement)),
          value,
        ),
      },
      stubs: {
        Transition: false,
      },
    },
  })
}

describe('nimWithdraw', () => {
  // Module-level reactive refs are shared across tests; without auto-unmount, stale
  // wrappers keep firing autoRefresh watchers when `withdrawalAddress` is reset/seeded
  // in the next test, polluting spy call counts.
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    withdrawalAddress.value = ''
    withdrawalDenomination.value = 'fiat'
    selectedFiat.value = 'EUR'
    isNimiqAsset.value = false
    usdtBalance.value = 500_000_000
    polygonConsensus.value = 'established'
    remoteBalance.value = 0
    priceData.value = { price: 1 }
    addNewWithdrawalAddress.mockReset()
    getCachedTransferQuote.mockReset()
    refreshTransferQuote.mockReset()
    primeTransferFee.mockReset()
    getCachedTransferQuote.mockReturnValue(null)
    transferFeeSnapshot.value = {
      fee: 4_000_000,
      expiresAt: Date.now() + 20_000,
      gasLimit: '123000',
      gasPrice: '456000000',
      relay: {
        url: 'https://relay.example',
      },
    }
    primeTransferFee.mockResolvedValue(transferFeeSnapshot.value)
    refreshTransferQuote.mockImplementation(async request => ({
      amount: request.amount,
      recipient: request.recipient,
      transfer: request.transfer,
      fee: 4_000_000,
      totalDebit: request.amount + 4_000_000,
      maxSendable: 496_000_000,
      expiresAt: Date.now() + 20_000,
      gasLimit: '123000',
      gasPrice: '456000000',
      relay: {
        url: 'https://relay.example',
      },
    }))
  })

  it('disables USDT withdraw when the quoted fee pushes total debit above balance', async () => {
    usdtBalance.value = 118_000_000

    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="amount-input"]').setValue('116440000')
    await flushPromises()

    expect(refreshTransferQuote).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="nim-withdraw-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('You don\'t have enough USDT to cover this withdrawal plus Polygon fees.')
  })

  it('does not render the USDT network recipient card', async () => {
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="amount-input"]').setValue('116440000')
    await flushPromises()

    expect(wrapper.text()).not.toContain('USDT · Polygon')
    expect(wrapper.text()).not.toContain('Polygon fee')
    expect(wrapper.text()).not.toContain('Total debit')
  })

  it('shows the selected asset logo in the empty address selector', async () => {
    isNimiqAsset.value = true
    const nimWrapper = await mountComponent('')

    expect(nimWrapper.find('[data-testid="nim-logo"]').exists()).toBe(true)
    expect(nimWrapper.find('[data-testid="usdt-logo"]').exists()).toBe(false)

    isNimiqAsset.value = false
    const usdtWrapper = await mountComponent('')

    expect(usdtWrapper.find('[data-testid="usdt-logo"]').exists()).toBe(true)
    expect(usdtWrapper.find('[data-testid="nim-logo"]').exists()).toBe(false)
  })

  it('shows the USDT total with fee included once the quote is available', async () => {
    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="amount-input"]').setValue('116440000')
    await flushPromises()

    expect(wrapper.get('[data-testid="nim-withdraw-usdt-amount"]').text()).toBe('120.44 USDT')
    expect(wrapper.text()).toContain('incl. 4.00 USDT fees')
  })

  it('shows a helper while the USDT fee is still loading', async () => {
    refreshTransferQuote.mockImplementation(() => new Promise(() => {}))

    const wrapper = await mountComponent()
    await wrapper.get('[data-testid="amount-input"]').setValue('116440000')
    await flushPromises()

    expect(wrapper.get('[data-testid="nim-withdraw-usdt-amount"]').text()).toBe('116.44 USDT')
    expect(wrapper.get('[data-testid="nim-withdraw-quote-helper"]').text()).toBe('Calculating fees...')
  })

  it('asks for an address before trying to calculate Polygon fees', async () => {
    const wrapper = await mountComponent('')
    await wrapper.get('[data-testid="amount-input"]').setValue('1000000')
    await flushPromises()

    expect(wrapper.get('[data-testid="nim-withdraw-quote-helper"]').text()).toBe('Select an address to calculate Polygon fee.')
    expect(wrapper.text()).not.toContain('You don\'t have enough USDT to cover this withdrawal plus Polygon fees.')
  })

  it('prefers the quote refresh error over a generic Polygon fee flow error', async () => {
    refreshTransferQuote.mockRejectedValue(new Error(
      'server response 408 (request={}, response={}, error=null, info={"requestUrl":"https://tenderly.rpc.polygon.community","responseBody":"[{\\"jsonrpc\\":\\"2.0\\",\\"id\\":12,\\"error\\":{\\"code\\":-32009,\\"message\\":\\"evm timeout\\"}}]","responseStatus":"408"}, code=SERVER_ERROR, version=6.16.0)',
    ))

    const wrapper = await mountComponent(
      '0x0000000000000000000000000000000000000001',
      { errorMsg: 'Could not calculate Polygon fee right now. Please try again.' },
    )
    await wrapper.get('[data-testid="amount-input"]').setValue('1000000')
    await flushPromises()

    expect(wrapper.text()).toContain('Polygon took too long to calculate the fee. Please try again.')
    expect(wrapper.text()).not.toContain('Could not calculate Polygon fee right now. Please try again.')
  })

  it('ignores a persisted NIM withdrawal address when USDT is active', async () => {
    withdrawalAddress.value = 'NQ48JPHQ7DL8QF5U7RNVYTN5T8XX36QH7A7L'

    const wrapper = await mountComponent('')

    expect(wrapper.text()).toContain('Select an address…')
    expect(wrapper.text()).not.toContain('NQ48JPHQ7DL8QF5U7RNVYTN5T8XX36QH7A7L')
  })

  it('uses the spendable USDT balance when the user taps All', async () => {
    const wrapper = await mountComponent()

    await wrapper.get('[data-testid="nim-withdraw-max"]').trigger('click')
    await flushPromises()

    expect(refreshTransferQuote.mock.lastCall?.[0]).toEqual({
      amount: 496_000_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPayment,
    })
    expect(wrapper.get('[data-testid="nim-withdraw-usdt-amount"]').text()).toBe('500.00 USDT')
    expect(wrapper.get('[data-testid="nim-withdraw-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('shows an em-dash placeholder before the price has loaded', async () => {
    priceData.value = null

    const wrapper = await mountComponent()
    await flushPromises()

    const amountText = wrapper.get('[data-testid="nim-withdraw-usdt-amount"]').text()
    expect(amountText).not.toContain('NaN')
    expect(amountText).toBe('—')
  })

  it('does not refetch the Polygon fee on every amount edit', async () => {
    getCachedTransferQuote.mockReturnValue({
      amount: 10_000_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPayment,
      fee: 4_000_000,
      totalDebit: 14_000_000,
      maxSendable: 496_000_000,
      expiresAt: Date.now() + 20_000,
      gasLimit: '123000',
      gasPrice: '456000000',
      relay: {
        url: 'https://relay.example',
      },
    })

    const wrapper = await mountComponent()

    await wrapper.get('[data-testid="amount-input"]').setValue('10000000')
    await flushPromises()
    await wrapper.get('[data-testid="amount-input"]').setValue('20000000')
    await flushPromises()

    expect(getCachedTransferQuote).toHaveBeenCalled()
    expect(refreshTransferQuote).toHaveBeenCalledTimes(1)
  })

  it('switches the amount denomination between fiat and crypto (APP-169)', async () => {
    isNimiqAsset.value = true
    remoteBalance.value = 100_000_000

    const wrapper = await mountComponent('')

    // Enter 5 in fiat minor units (6 decimals) → 5 NIM at price 1 → 500000 luna
    await wrapper.get('[data-testid="amount-input"]').setValue('5000000')
    await flushPromises()

    await wrapper.get('[data-testid="nim-withdraw-denomination-toggle"]').trigger('click')
    await flushPromises()

    // Big input now holds the NIM amount in luna (5 NIM = 500000 luna)
    expect((wrapper.get('[data-testid="amount-input"]').element as HTMLInputElement).value).toBe('500000')

    // Toggling back restores the fiat value
    await wrapper.get('[data-testid="nim-withdraw-denomination-toggle"]').trigger('click')
    await flushPromises()
    expect((wrapper.get('[data-testid="amount-input"]').element as HTMLInputElement).value).toBe('5000000')
  })

  it('remembers the amount denomination when the withdraw screen is reopened', async () => {
    isNimiqAsset.value = true

    const wrapper = await mountComponent('')
    await wrapper.get('[data-testid="nim-withdraw-denomination-toggle"]').trigger('click')

    expect(withdrawalDenomination.value).toBe('crypto')

    wrapper.unmount()
    const reopenedWrapper = await mountComponent('')

    expect(reopenedWrapper.get('[data-testid="nim-withdraw-denomination-toggle"]').attributes('aria-label')).toBe('Enter amount in EUR')
  })

  it('fills the exact NIM balance (no dust) when tapping All in crypto mode (APP-169)', async () => {
    isNimiqAsset.value = true
    remoteBalance.value = 123_456_789

    const wrapper = await mountComponent('')

    // Enter crypto mode, then tap All
    await wrapper.get('[data-testid="nim-withdraw-denomination-toggle"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="nim-withdraw-max"]').trigger('click')
    await flushPromises()

    // Exact integer luna balance, not a floored fiat round-trip
    expect((wrapper.get('[data-testid="amount-input"]').element as HTMLInputElement).value).toBe('123456789')
  })
})
