import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { FlowName } from '@/lib/flows/steps.types'
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

const initializeFlow = vi.fn()

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    getAlias: () => undefined,
    isSavedAddress: () => false,
  }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: { toUserFriendlyAddress: () => 'NQ00 TEST LOCAL ADDRESS' },
  }),
}))

vi.mock('@/lib/flows', () => ({
  initializeFlow: (...args: unknown[]) => initializeFlow(...args),
}))

vi.mock('@ionic/vue', () => ({
  IonButton: defineComponent({ template: '<button><slot /></button>' }),
  IonIcon: defineComponent({ template: '<i />' }),
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
  beforeEach(() => {
    vi.stubGlobal('Nimiq', { AccountType: { HTLC: 'htlc', Basic: 'basic' } })
  })

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

  // APP-170: for an incoming payment, show the sender + message and offer to save the sender.
  // The recipient (the user's own address) must be hidden — showing it was the reported bug.
  it('shows the sender and message and hides the own-address recipient for an incoming payment', async () => {
    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    const wrapper = mount(TransactionDetails, {
      props: {
        tx: {
          transfer: Transfer.UserReceipt,
          title: 'Top-Up',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: 'nimhash',
          sender: 'NQ11 SENDERADDR',
          recipient: 'NQ00 OWNADDRESS',
          message: 'Thanks for lunch',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        },
      },
      global: { mocks: { $t: (value: string) => value } },
    })

    expect(wrapper.text()).toContain('Sender')
    expect(wrapper.text()).not.toContain('Recipient')
    expect(wrapper.text()).toContain('Message')
    expect(wrapper.text()).toContain('Thanks for lunch')

    // Tapping the sender opens the save-to-address-book flow prefilled with the sender.
    initializeFlow.mockClear()
    await wrapper.get('[aria-label="Add sender to address book"]').trigger('click')
    expect(initializeFlow).toHaveBeenCalledWith(
      FlowName.SaveAddress,
      expect.objectContaining({ initialState: { qrCodeScanner: 'NQ11 SENDERADDR' } }),
    )
  })

  it('shows the recipient and no add-to-book action for an outgoing payment', async () => {
    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    const wrapper = mount(TransactionDetails, {
      props: {
        tx: {
          transfer: Transfer.UserPayment,
          title: 'Withdrawal',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: 'nimhash2',
          sender: 'NQ00 OWNADDRESS',
          recipient: 'NQ11 DESTADDR',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        },
      },
      global: { mocks: { $t: (value: string) => value } },
    })

    expect(wrapper.text()).toContain('Recipient')
    expect(wrapper.text()).not.toContain('Sender')
    expect(wrapper.text()).not.toContain('Add to address book')
  })

  it('treats an HTLC redeem paying the local wallet as incoming', async () => {
    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    const wrapper = mount(TransactionDetails, {
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
      global: { mocks: { $t: (value: string) => value } },
    })

    expect(wrapper.text()).toContain('Sender')
    expect(wrapper.text()).not.toContain('Recipient')
  })

  it('treats an HTLC redeem paying a third party as outgoing', async () => {
    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    const wrapper = mount(TransactionDetails, {
      props: {
        tx: {
          transfer: Transfer.HTLC,
          title: 'Redeem HTLC (regular)',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xredeem-third-party',
          sender: 'NQ55 MINI APP HTLC ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ77 SOMEONE ELSE',
          recipientType: 'basic',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        } as any,
      },
      global: { mocks: { $t: (value: string) => value } },
    })

    expect(wrapper.text()).toContain('Recipient')
  })
})
