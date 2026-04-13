import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

vi.mock('@nimiq/vue3-components', () => ({
  FiatAmount: defineComponent({
    props: ['amount', 'currency'],
    template: '<span data-testid="fiat-amount">{{ amount }} {{ currency }}</span>',
  }),
}))

vi.mock('@/components/CryptoAmount.vue', () => ({
  default: defineComponent({
    props: ['amount', 'currency'],
    template: '<span data-testid="crypto-amount">{{ amount }} {{ currency }}</span>',
  }),
}))

vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({
    formatCrypto: (amount: number) => String(amount),
  }),
}))

vi.mock('./icons/cryptocity-logo.vue', () => ({
  default: defineComponent({
    template: '<span data-testid="cryptocity-logo" />',
  }),
}))

vi.mock('./icons/invoice.vue', () => ({
  default: defineComponent({
    template: '<span data-testid="invoice-icon" />',
  }),
}))

describe('transactionAmounts', () => {
  it('does not render the fee separator when the fee slot is empty', async () => {
    const { default: TransactionAmounts } = await import('./TransactionAmounts.vue')
    const showFee = ref(false)

    const wrapper = mount(TransactionAmounts, {
      props: {
        cryptoTotal: 123_000,
        cryptoCurrency: 'NIM',
        fiatAmount: 12.34,
        fiatCurrency: 'EUR',
      },
      slots: {
        fee: () => showFee.value
          ? '<span data-testid="fee-text">Incl. fees</span>'
          : [],
      },
    })

    expect(wrapper.find('[data-testid="fee-text"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="separator-dot"]').exists()).toBe(false)
  })
})
