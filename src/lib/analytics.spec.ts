import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPaymentAnalyticsProps,
  finishPaymentAnalytics,
  getAmountRange,
  startPaymentAnalytics,
  trackAppOpened,
  trackFeatureOpened,
  trackWalletCreated,
  trackWalletEntrySelected,
  trackWalletImported,
} from './analytics'

const state = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  isDev: false,
}))

vi.mock('@capawesome/capacitor-posthog', () => ({
  Posthog: {
    capture: state.capture,
    identify: state.identify,
  },
}))

vi.mock('@/lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib')>()
  return {
    ...actual,
    get isDev() {
      return state.isDev
    },
  }
})

vi.mock('@/composables/useDecrypt', () => ({
  useDecrypt: () => ({
    hasPin: () => true,
    decrypted: { value: false },
  }),
}))

vi.mock('@/composables/useDevice', () => ({
  useDevice: () => ({
    isWeb: false,
  }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    activeAsset: 'NIM',
  }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    dbExists: true,
  }),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (value: string) => value },
}))

beforeEach(() => {
  state.capture.mockReset()
  state.identify.mockReset()
  state.isDev = false
})

describe('getAmountRange', () => {
  it('returns <1 for amounts below 1', () => {
    expect(getAmountRange(0)).toBe('<1')
    expect(getAmountRange(0.5)).toBe('<1')
    expect(getAmountRange(0.99)).toBe('<1')
  })

  it('returns 1-10 for amounts between 1 and 10', () => {
    expect(getAmountRange(1)).toBe('1-10')
    expect(getAmountRange(5)).toBe('1-10')
    expect(getAmountRange(10)).toBe('1-10')
  })

  it('returns 10-100 for amounts between 10 and 100', () => {
    expect(getAmountRange(10.01)).toBe('10-100')
    expect(getAmountRange(50)).toBe('10-100')
    expect(getAmountRange(100)).toBe('10-100')
  })

  it('returns 100-1000 for amounts between 100 and 1000', () => {
    expect(getAmountRange(100.01)).toBe('100-1000')
    expect(getAmountRange(500)).toBe('100-1000')
    expect(getAmountRange(1000)).toBe('100-1000')
  })

  it('returns 1000-10000 for amounts between 1000 and 10000', () => {
    expect(getAmountRange(1000.01)).toBe('1000-10000')
    expect(getAmountRange(5000)).toBe('1000-10000')
    expect(getAmountRange(10000)).toBe('1000-10000')
  })

  it('returns 10000-50000 for amounts between 10000 and 50000', () => {
    expect(getAmountRange(10000.01)).toBe('10000-50000')
    expect(getAmountRange(25000)).toBe('10000-50000')
    expect(getAmountRange(50000)).toBe('10000-50000')
  })

  it('returns 50000-100000 for amounts between 50000 and 100000', () => {
    expect(getAmountRange(50000.01)).toBe('50000-100000')
    expect(getAmountRange(75000)).toBe('50000-100000')
    expect(getAmountRange(100000)).toBe('50000-100000')
  })

  it('returns 100000+ for amounts above 100000', () => {
    expect(getAmountRange(100000.01)).toBe('100000+')
    expect(getAmountRange(1000000)).toBe('100000+')
  })

  it('handles negative amounts as <1', () => {
    expect(getAmountRange(-1)).toBe('<1')
  })
})

describe('buildPaymentAnalyticsProps', () => {
  it('converts NIM amount from luna to human-readable before bucketing', async () => {
    const { Asset } = await import('@/lib/assets')
    const { PaymentMethod, Rail, Transfer } = await import('@/types/transactions')
    const props = buildPaymentAnalyticsProps({
      asset: Asset.NIM,
      paymentMethod: PaymentMethod.NIM,
      payWithPuntos: false,
      rail: Rail.CryptoPaymentLink,
      amount: 1_000_000,
      transfer: Transfer.UserPaymentToMerchant,
    })
    expect(props.amount_range).toBe('1-10')
  })

  it('converts USDT amount from smallest units to human-readable before bucketing', async () => {
    const { Asset } = await import('@/lib/assets')
    const { PaymentMethod, Rail, Transfer } = await import('@/types/transactions')
    const props = buildPaymentAnalyticsProps({
      asset: Asset.USDT,
      paymentMethod: PaymentMethod.USDT,
      payWithPuntos: false,
      rail: Rail.CryptoPaymentLink,
      amount: 50_000_000,
      transfer: Transfer.UserPaymentToMerchant,
    })
    expect(props.amount_range).toBe('10-100')
  })
})

describe('payment analytics state', () => {
  it('starts a pending payment attempt with the provided timestamp', () => {
    const analyticsState = startPaymentAnalytics(123)

    expect(analyticsState).toEqual({
      startedAt: 123,
      status: 'started',
    })
  })

  it('keeps the original start timestamp when marking a terminal state', () => {
    const started = startPaymentAnalytics(456)
    const completed = finishPaymentAnalytics(started, 'completed')

    expect(completed).toEqual({
      startedAt: 456,
      status: 'completed',
    })
  })

  it('stops treating failed or completed attempts as cancellable', () => {
    const started = startPaymentAnalytics(789)

    expect(finishPaymentAnalytics(started, 'failed').status).toBe('failed')
    expect(finishPaymentAnalytics(started, 'completed').status).toBe('completed')
  })
})

describe('core analytics events', () => {
  it('captures app_opened with snake_case properties', async () => {
    const { Asset } = await import('@/lib/assets')

    trackAppOpened({
      openSource: 'cold_start',
      hasWallet: true,
      isUnlocked: false,
      activeAsset: Asset.USDT,
    })

    expect(state.capture).toHaveBeenCalledWith({
      event: 'app_opened',
      properties: {
        open_source: 'cold_start',
        has_wallet: true,
        is_unlocked: false,
        active_asset: Asset.USDT,
      },
    })
  })

  it('omits optional active_asset for feature events when not provided', () => {
    trackFeatureOpened({
      featureName: 'mini_apps',
      source: 'menu',
      channel: 'modal',
    })

    expect(state.capture).toHaveBeenCalledWith({
      event: 'feature_opened',
      properties: {
        feature_name: 'mini_apps',
        source: 'menu',
        channel: 'modal',
      },
    })
  })

  it('captures wallet lifecycle events with the expected payloads', () => {
    trackWalletEntrySelected('create_with_promo_code')
    trackWalletCreated({ entryMethod: 'create_with_promo_code', hasReferralCode: true })
    trackWalletImported()

    expect(state.capture).toHaveBeenNthCalledWith(1, {
      event: 'wallet_entry_selected',
      properties: { entry_method: 'create_with_promo_code' },
    })
    expect(state.capture).toHaveBeenNthCalledWith(2, {
      event: 'wallet_created',
      properties: {
        entry_method: 'create_with_promo_code',
        has_referral_code: true,
      },
    })
    expect(state.capture).toHaveBeenNthCalledWith(3, {
      event: 'wallet_imported',
      properties: { entry_method: 'import' },
    })
  })

  it('does not emit capture events in development mode', () => {
    state.isDev = true

    trackWalletEntrySelected('create')
    trackFeatureOpened({
      featureName: 'pay',
      source: 'footer_pay_button',
      channel: 'flow',
    })

    expect(state.capture).not.toHaveBeenCalled()
  })
})
