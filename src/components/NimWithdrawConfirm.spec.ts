import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { StepName } from '@/lib/flows/steps.types'

const isNimiqAsset = ref(false)
const getCachedTransferQuote = vi.fn()
const refreshTransferQuote = vi.fn()

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (value: string) => value },
}))

vi.mock('@ionic/vue', () => ({
  IonButton: defineComponent({ template: '<button v-bind="$attrs"><slot /></button>' }),
}))

vi.mock('@nimiq/vue3-components', () => ({
  Identicon: defineComponent({ template: '<span />' }),
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    activeAsset: ref('USDT'),
    isNimiqAsset,
    selectedFiat: ref('EUR'),
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({ getCachedTransferQuote, refreshTransferQuote }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ error: vi.fn() }),
}))

vi.mock('@/lib/assets', () => ({
  assetToCrypto: (asset: string) => asset,
  formatUsdtAmount: (amount: number) => `${(amount / 1e6).toFixed(2)} USDT`,
}))

vi.mock('@/components/AddressDisplay.vue', () => ({
  default: defineComponent({ template: '<span />' }),
}))

vi.mock('@/components/TransactionAmounts.vue', () => ({
  default: defineComponent({
    props: { cryptoTotal: { type: Number, required: true } },
    template: '<div data-testid="transaction-amounts" :data-crypto-total="cryptoTotal"><slot name="crypto-after" /></div>',
  }),
}))

enableAutoUnmount(afterEach)

const recipient = '0x00000000000000000000000000000000000000AA'
const quote = (fee: number) => ({ amount: 10_000_000, fee, totalDebit: 10_000_000 + fee, expiresAt: Date.now() + 60_000 })

async function mountComponent() {
  const { default: NimWithdrawConfirm } = await import('./NimWithdrawConfirm.vue')
  return mount(NimWithdrawConfirm, {
    props: {
      isVisible: true,
      state: {
        [StepName.NimWithdrawalAmountSelectionStep]: { amount: 10_000_000, recipient, fiatAmount: 10, polygonQuote: quote(10_000) },
      } as any,
    },
    global: { mocks: { $t: (value: string) => value }, stubs: { 'i18n-t': true } },
  })
}

describe('nimWithdrawConfirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNimiqAsset.value = false
    getCachedTransferQuote.mockReturnValue(null)
    refreshTransferQuote.mockResolvedValue(quote(10_000))
  })

  it('lets the user confirm again with a fresh fee after the withdrawal failed on the PIN step', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    await wrapper.get('[data-testid="nim-withdraw-confirm"]').trigger('click')
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(wrapper.emitted('done')![0][0]).toMatchObject({ polygonQuote: { fee: 10_000 } })

    // Flow moves on to the PIN step, where signing fails because the Polygon fee went up
    await wrapper.setProps({ isVisible: false })
    refreshTransferQuote.mockResolvedValue(quote(50_000))
    await wrapper.setProps({ isVisible: true })
    await flushPromises()

    expect(wrapper.get('[data-testid="transaction-amounts"]').attributes('data-crypto-total')).toBe('10050000')
    await wrapper.get('[data-testid="nim-withdraw-confirm"]').trigger('click')
    expect(wrapper.emitted('done')).toHaveLength(2)
    expect(wrapper.emitted('done')![1][0]).toMatchObject({ polygonQuote: { fee: 50_000 } })
  })
})
