import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { MerchantCategory, PaymentMethod, Rail, Transfer } from '@/types/transactions'

const updateNimiqTransaction = vi.fn()
const updatePolygonTransaction = vi.fn()

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string) => value,
    tc: (value: string) => value,
  },
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice: () => ({
    crypto: {
      totalUnits: 2500000,
    },
    fiat: {
      total: 25,
      currency: 'USD',
    },
  }),
}))

vi.mock('@/composables/useTime', () => ({
  useFormatTime: () => '2026-03-12 17:00',
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    setToast: vi.fn(),
  }),
}))

vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({
    formatFiat: (amount: number, options?: { currency?: string }) => `${options?.currency || 'USD'} ${amount}`,
  }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    query: vi.fn(),
  }),
}))

vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({
    consensus: 'established',
    height: 0,
  }),
}))

vi.mock('@/stores/sync', () => ({
  useSync: () => ({
    updateSingleTransaction: updateNimiqTransaction,
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    updateSingleTransaction: updatePolygonTransaction,
  }),
}))

vi.mock('@/stores/transactions', () => ({
  getSwapHtlcKey: (tx: { chain?: string, hash: string, recipient: string }) =>
    tx.chain === 'Polygon' ? tx.hash : tx.recipient,
}))

vi.mock('./TransactionAmounts.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="transaction-amounts" />',
  }),
}))

describe('transactionDetails', () => {
  it('refreshes polygon transactions through the polygon store', async () => {
    updateNimiqTransaction.mockReset()
    updatePolygonTransaction.mockReset()

    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    mount(TransactionDetails, {
      props: {
        tx: {
          transfer: Transfer.UserPayment,
          title: 'Payment',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xpolygonhash',
          sender: '0xsender',
          recipient: '0xrecipient',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.USDT,
          chain: Chain.Polygon,
        },
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    expect(updatePolygonTransaction).toHaveBeenCalledWith('0xpolygonhash')
    expect(updateNimiqTransaction).not.toHaveBeenCalled()
  })

  it('renders asset and chain fields for the selected transaction', async () => {
    updateNimiqTransaction.mockReset()
    updatePolygonTransaction.mockReset()

    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    const wrapper = mount(TransactionDetails, {
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
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    expect(wrapper.text()).toContain('Asset')
    expect(wrapper.text()).toContain('USDT')
    expect(wrapper.text()).toContain('Network')
    expect(wrapper.text()).toContain('Polygon')
  })
})
