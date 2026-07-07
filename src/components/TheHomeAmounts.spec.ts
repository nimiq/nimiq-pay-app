import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, reactive, ref } from 'vue'
import { Asset } from '@/lib/assets'

const remoteBalance = ref(0)
const lastKnownRemoteBalance = ref(0)
const homeBalanceState = ref<'loading' | 'resolved-empty' | 'resolved-remote'>('loading')
const usdtBalance = ref(0)
const lastKnownUsdtBalance = ref(0)
const usdtHomeBalanceState = ref<'loading' | 'resolved-empty' | 'resolved-balance'>('loading')
const isTransactionPending = ref(false)
const showAnimations = ref(false)
const isProcessingRemote = ref(false)
const activeAsset = ref<Asset>(Asset.NIM)
const localBalance = ref(0)

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    remoteBalance,
    lastKnownRemoteBalance,
    homeBalanceState,
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    balance: usdtBalance,
    lastKnownBalance: lastKnownUsdtBalance,
    homeBalanceState: usdtHomeBalanceState,
  }),
}))

vi.mock('@/stores/sync', () => ({
  useSync: () => ({
    isTransactionPending,
  }),
}))

vi.mock('@/stores/app', () => ({
  Crypto: {
    NIM: 'NIM',
    USDT: 'USDT',
  },
  useApp: () => ({
    showAnimations,
    activeAsset,
  }),
}))

vi.mock('@/stores/locks', () => ({
  useLocks: () => ({
    isProcessingRemote,
  }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localBalance,
  }),
}))

vi.mock('@/components/icons/top-up.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="top-up-icon" />',
  }),
}))

vi.mock('@/components/CryptoAmount.vue', () => ({
  default: defineComponent({
    props: {
      minDecimals: {
        type: Number,
        required: false,
        default: 0,
      },
    },
    template: '<div data-testid="crypto-amount" :data-min-decimals="minDecimals" />',
  }),
}))

vi.mock('@/components/PriceChange.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="price-change" />',
  }),
}))

vi.mock('@/components/RollingNumber.vue', () => ({
  default: defineComponent({
    props: {
      value: {
        type: Number,
        required: true,
      },
    },
    template: '<div data-testid="fiat-amount">{{ value }}</div>',
  }),
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice: (balance: { value: number }, options?: { cryptoCurrency?: string }) => ({
    fiat: reactive({
      total: computed(() => balance.value),
      currency: 'USD',
    }),
    crypto: reactive({
      totalUnits: computed(() => balance.value),
      currency: options?.cryptoCurrency || 'NIM',
    }),
  }),
}))

async function mountComponent() {
  const { default: TheHomeAmounts } = await import('./TheHomeAmounts.vue')
  return mount(TheHomeAmounts, {
    global: {
      plugins: [createPinia()],
      mocks: {
        $t: (key: string) => key,
      },
      stubs: {
        IonSkeletonText: {
          template: '<div data-testid="balance-skeleton" />',
        },
      },
    },
  })
}

describe('theHomeAmounts', () => {
  beforeEach(() => {
    remoteBalance.value = 0
    lastKnownRemoteBalance.value = 0
    homeBalanceState.value = 'loading'
    usdtBalance.value = 0
    lastKnownUsdtBalance.value = 0
    usdtHomeBalanceState.value = 'loading'
    isTransactionPending.value = false
    showAnimations.value = false
    isProcessingRemote.value = false
    activeAsset.value = Asset.NIM
    localBalance.value = 0
  })

  it('shows the skeleton while the home balance state is still loading', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(true)
  })

  it('shows a zero balance once the empty state is resolved', async () => {
    homeBalanceState.value = 'resolved-empty'

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('0')
  })

  it('keeps showing the skeleton while remote processing is still active', async () => {
    homeBalanceState.value = 'resolved-empty'
    isProcessingRemote.value = true

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(true)
  })

  it('shows the last known balance instead of the skeleton during HTLC recreation', async () => {
    homeBalanceState.value = 'loading'
    remoteBalance.value = 0
    isProcessingRemote.value = true
    lastKnownRemoteBalance.value = 500

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('500')
  })

  it('shows the optimistic balance while remote processing with a known balance', async () => {
    homeBalanceState.value = 'resolved-remote'
    remoteBalance.value = 750
    isProcessingRemote.value = true

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('750')
  })

  it('shows zero after a spend-to-zero instead of the last known balance', async () => {
    homeBalanceState.value = 'resolved-remote'
    remoteBalance.value = 0
    lastKnownRemoteBalance.value = 500

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('0')
  })

  it('keeps the skeleton during a pending transaction when no balance was ever known', async () => {
    homeBalanceState.value = 'loading'
    isTransactionPending.value = true

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(true)
  })

  it('shows the cached USDT balance instead of the skeleton before consensus', async () => {
    activeAsset.value = Asset.USDT
    usdtBalance.value = 0
    usdtHomeBalanceState.value = 'loading'
    lastKnownUsdtBalance.value = 50

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('50')
  })

  it('does not show the skeleton for USDT while a NIM HTLC is processing', async () => {
    activeAsset.value = Asset.USDT
    usdtBalance.value = 99
    usdtHomeBalanceState.value = 'resolved-balance'
    isProcessingRemote.value = true
    isTransactionPending.value = true

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('99')
  })

  it('switches to the USDT balance when the active asset is USDT', async () => {
    activeAsset.value = Asset.USDT
    remoteBalance.value = 25
    homeBalanceState.value = 'resolved-remote'
    usdtBalance.value = 99
    usdtHomeBalanceState.value = 'resolved-balance'

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('99')
  })

  it('requests at least two decimals for the home crypto amount when showing USDT', async () => {
    activeAsset.value = Asset.USDT
    usdtBalance.value = 2_000_000
    usdtHomeBalanceState.value = 'resolved-balance'

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.get('[data-testid="crypto-amount"]').attributes('data-min-decimals')).toBe('2')
  })

  it('shows the pending top-up line for NIM without adding it to the main balance', async () => {
    homeBalanceState.value = 'resolved-remote'
    remoteBalance.value = 25
    localBalance.value = 10

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="top-up-icon"]').exists()).toBe(true)
    // Main balance stays the spendable remote balance, not remote + local.
    expect(wrapper.find('[data-testid="fiat-amount"]').text()).toBe('25')
  })

  it('hides the pending top-up line for USDT even when localBalance is set', async () => {
    activeAsset.value = Asset.USDT
    usdtBalance.value = 99
    usdtHomeBalanceState.value = 'resolved-balance'
    localBalance.value = 10

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="top-up-icon"]').exists()).toBe(false)
  })

  it('hides the pending top-up line when localBalance is 0', async () => {
    homeBalanceState.value = 'resolved-remote'
    remoteBalance.value = 25
    localBalance.value = 0

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="top-up-icon"]').exists()).toBe(false)
  })

  it('shows the skeleton (no pending line) while loading with no local funds', async () => {
    homeBalanceState.value = 'loading'
    remoteBalance.value = 0
    localBalance.value = 0

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="top-up-icon"]').exists()).toBe(false)
  })

  it('shows the balance skeleton (not the last known balance) while funds are pending with a 0 balance, and keeps the pending line', async () => {
    // localBalance holds funds just drained from our own remote to recreate the HTLC.
    homeBalanceState.value = 'loading'
    isProcessingRemote.value = true
    remoteBalance.value = 0
    lastKnownRemoteBalance.value = 500
    localBalance.value = 500

    const wrapper = await mountComponent()
    await flushPromises()

    // Balance shows a skeleton (real balance unknown), but the pending line stays visible.
    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fiat-amount"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="top-up-icon"]').exists()).toBe(true)
  })

  it('shows the balance skeleton with the pending line when the balance is 0 and funds are pending (no transition)', async () => {
    homeBalanceState.value = 'resolved-empty'
    remoteBalance.value = 0
    localBalance.value = 300

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="balance-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="top-up-icon"]').exists()).toBe(true)
  })
})
