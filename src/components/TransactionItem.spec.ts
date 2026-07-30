import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { MerchantCategory, PaymentMethod, Rail, Transfer } from '@/types/transactions'

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string) => value,
    tc: (value: string) => value,
  },
}))

vi.mock('@/composables/useRelativeTime', () => ({
  useRelativeTime: () => ({
    formatted: '1m ago',
  }),
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice: () => ({
    fiat: {
      total: 25,
      currency: 'USD',
    },
    crypto: {
      total: 25,
      totalUnits: 2500000,
      currency: Asset.USDT,
    },
  }),
}))

vi.mock('./icons/categories/CategoryIcon.vue', () => ({
  default: defineComponent({
    props: ['category'],
    template: '<div data-testid="category-icon">{{ category }}</div>',
  }),
}))

vi.mock('./icons/cryptocity-logo.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="points-logo" />',
  }),
}))

vi.mock('@/components/CryptoAmount.vue', () => ({
  default: defineComponent({
    props: {
      currency: {
        type: String,
        required: true,
      },
    },
    template: '<div data-testid="crypto-amount">{{ currency }}</div>',
  }),
}))

vi.mock('@nimiq/vue3-components', () => ({
  FiatAmount: defineComponent({
    template: '<div data-testid="fiat-amount" />',
  }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({ getAlias: () => undefined }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: { toUserFriendlyAddress: () => 'NQ00 TEST LOCAL ADDRESS' },
  }),
}))

describe('transactionItem', () => {
  beforeEach(() => {
    vi.stubGlobal('Nimiq', {
      AccountType: {
        HTLC: 'htlc',
        Basic: 'basic',
      },
    })
  })

  it('shows asset metadata for merged histories', async () => {
    const { default: TransactionItem } = await import('./TransactionItem.vue')
    const wrapper = mount(TransactionItem, {
      props: {
        tx: {
          transfer: Transfer.UserPaymentToMerchant,
          title: 'Payment',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xhash',
          sender: '0xsender',
          recipient: '0xrecipient',
          status: 'confirmed',
          proofSize: 0,
          merchantName: 'Merchant',
          merchantCategory: MerchantCategory.Shop,
          paymentMethod: PaymentMethod.USDT,
          paymentRef: 'ref',
          rail: Rail.Unknown,
          fiatAmount: 25,
          fiatFeeAmount: 0,
          fiatCurrency: 'USD',
          isCashbackClaimed: true,
          asset: Asset.USDT,
          chain: Chain.Polygon,
        },
      },
      global: {
        stubs: {
          IonRippleEffect: true,
        },
      },
    })

    expect(wrapper.text()).toContain('USDT')
    expect(wrapper.get('[data-testid="crypto-amount"]').text()).toBe('USDT')
  })

  it('treats mined transactions like confirmed ones in the list', async () => {
    const { default: TransactionItem } = await import('./TransactionItem.vue')
    const wrapper = mount(TransactionItem, {
      props: {
        tx: {
          transfer: Transfer.UserPayment,
          title: 'Payment',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xhash',
          sender: '0xsender',
          recipient: '0xrecipient',
          status: 'mined',
          proofSize: 0,
          message: '',
          asset: Asset.USDT,
          chain: Chain.Polygon,
        },
      },
      global: {
        stubs: {
          IonRippleEffect: true,
        },
      },
    })

    expect(wrapper.classes()).not.toContain('opacity-60')
    expect(wrapper.text()).not.toContain('Confirming')
  })

  it('keeps included transactions undimmed in the list', async () => {
    const { default: TransactionItem } = await import('./TransactionItem.vue')
    const wrapper = mount(TransactionItem, {
      props: {
        tx: {
          transfer: Transfer.UserPayment,
          title: 'Payment',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xhash',
          sender: '0xsender',
          recipient: '0xrecipient',
          status: 'included',
          proofSize: 0,
          message: '',
          asset: Asset.USDT,
          chain: Chain.Polygon,
        },
      },
      global: {
        stubs: {
          IonRippleEffect: true,
        },
      },
    })

    expect(wrapper.classes()).not.toContain('opacity-60')
    expect(wrapper.text()).not.toContain('Confirming')
  })

  it('shows a redeem paying the local wallet with the deposit icon', async () => {
    const { default: TransactionItem } = await import('./TransactionItem.vue')
    const wrapper = mount(TransactionItem, {
      props: {
        tx: {
          transfer: Transfer.HTLC,
          title: 'Redeem HTLC (regular)',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xredeem',
          sender: 'NQ55 MINI APP HTLC ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        } as any,
      },
      global: { stubs: { IonRippleEffect: true } },
    })

    expect(wrapper.get('[data-testid="category-icon"]').text()).toBe('deposit')
  })

  it('does not give an HTLC funding the withdraw icon', async () => {
    const { default: TransactionItem } = await import('./TransactionItem.vue')
    const wrapper = mount(TransactionItem, {
      props: {
        tx: {
          transfer: Transfer.HTLC,
          title: 'New HTLC',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xfunding',
          sender: 'NQ11 TEST REMOTE ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ55 MINI APP HTLC ADDRESS',
          recipientType: 'htlc',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        } as any,
      },
      global: { stubs: { IonRippleEffect: true } },
    })

    const icon = wrapper.get('[data-testid="category-icon"]').text()
    expect(icon).not.toBe('withdraw')
    expect(icon).not.toBe('deposit')
  })
})
