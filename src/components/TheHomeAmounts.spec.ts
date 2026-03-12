import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'

const remoteBalance = ref(0)
const homeBalanceState = ref<'loading' | 'resolved-empty' | 'resolved-remote'>('loading')
const isTransactionPending = ref(false)
const showAnimations = ref(false)
const isProcessingRemote = ref(false)

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    remoteBalance,
    homeBalanceState,
  }),
}))

vi.mock('@/stores/sync', () => ({
  useSync: () => ({
    isTransactionPending,
  }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    showAnimations,
  }),
}))

vi.mock('@/stores/locks', () => ({
  useLocks: () => ({
    isProcessingRemote,
  }),
}))

vi.mock('@/components/CryptoAmount.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="crypto-amount" />',
  }),
}))

vi.mock('@/components/PriceChange.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="price-change" />',
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
    template: '<div data-testid="fiat-amount">{{ amount }}</div>',
  }),
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice: (balance: { value: number }) => ({
    fiat: computed(() => ({
      total: balance.value,
      currency: 'USD',
    })),
    crypto: computed(() => ({
      totalUnits: balance.value,
      currency: 'NIM',
    })),
  }),
}))

async function mountComponent() {
  const { default: TheHomeAmounts } = await import('./TheHomeAmounts.vue')
  return mount(TheHomeAmounts, {
    global: {
      plugins: [createPinia()],
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
    homeBalanceState.value = 'loading'
    isTransactionPending.value = false
    showAnimations.value = false
    isProcessingRemote.value = false
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
})
