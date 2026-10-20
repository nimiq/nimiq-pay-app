import type { UserReceiptTransaction } from '@/types/transactions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPaymentAnalyticsProps,
  finishPaymentAnalytics,
  getAmountRange,
  reportCriticalError,
  startPaymentAnalytics,
  trackAppOpened,
  trackFeatureOpened,
  trackFundsBlocked,
  trackPaymentUnknown,
  trackSwapStep,
  trackTopUpReceived,
  trackWalletCreated,
  trackWalletEntrySelected,
  trackWalletImported,
} from './analytics'

const state = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  captureException: vi.fn(),
  isDev: false,
}))

vi.mock('@capawesome/capacitor-posthog', () => ({
  Posthog: {
    capture: state.capture,
    identify: state.identify,
    captureException: state.captureException,
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
  state.captureException.mockReset()
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

describe('trackTopUpReceived', () => {
  async function makeReceipt(asset: UserReceiptTransaction['asset'], amount: number): Promise<UserReceiptTransaction> {
    const { Transfer } = await import('@/types/transactions')
    return {
      transfer: Transfer.UserReceipt,
      title: 'Top-Up',
      sender: 'sender',
      recipient: 'recipient',
      status: 'confirmed',
      timestamp: 0,
      amount,
      fee: 0,
      hash: 'hash',
      proofSize: 0,
      asset,
    }
  }

  it('resolves an undefined asset to NIM and buckets luna amount and balance', async () => {
    const { Asset } = await import('@/lib/assets')
    const receipt = await makeReceipt(undefined, 500_000) // 5 NIM

    trackTopUpReceived(receipt, 5_000_000) // 50 NIM

    expect(state.capture).toHaveBeenCalledWith({
      event: 'top_up_received',
      properties: { asset: Asset.NIM, amount_range: '1-10', balance_range: '10-100' },
    })
  })

  it('buckets a USDT deposit and balance from 6-decimal base units', async () => {
    const { Asset } = await import('@/lib/assets')
    const receipt = await makeReceipt(Asset.USDT, 50_000_000) // 50 USDT

    trackTopUpReceived(receipt, 1_000_000_000) // 1000 USDT

    expect(state.capture).toHaveBeenCalledWith({
      event: 'top_up_received',
      properties: { asset: Asset.USDT, amount_range: '10-100', balance_range: '100-1000' },
    })
  })

  it('does not emit capture events in development mode', async () => {
    const { Asset } = await import('@/lib/assets')
    state.isDev = true
    const receipt = await makeReceipt(Asset.USDT, 50_000_000)

    trackTopUpReceived(receipt, 1_000_000_000)

    expect(state.capture).not.toHaveBeenCalled()
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

describe('reportCriticalError', () => {
  // Reports go through the logger's sink, which sends after a microtask.
  const flushReports = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }

  it('captures an Error with its message, name and stack', async () => {
    const error = new TypeError('boom')

    reportCriticalError(error)
    await flushReports()

    expect(state.captureException).toHaveBeenCalledWith({
      message: 'boom',
      name: 'TypeError',
      properties: { stack: error.stack },
    })
  })

  it('reports the same error once', async () => {
    const error = new Error('Request is a string')

    reportCriticalError(error, { flow: 'payment' })
    reportCriticalError(error, { flow: 'payment' })
    await flushReports()

    expect(state.captureException).toHaveBeenCalledOnce()
  })

  it('redacts addresses from the message', async () => {
    reportCriticalError(new Error('Request: NQ80 E3XT 79B1 D8U8 EFDN FHB0 MSGX 1NR5 MYMQ'))
    await flushReports()

    expect(state.captureException.mock.calls[0][0].message).toBe('Request: NQ…')
  })

  it('normalizes non-Error values into an Error', async () => {
    reportCriticalError('plain failure')
    await flushReports()

    expect(state.captureException).toHaveBeenCalledWith({
      message: 'plain failure',
      name: 'Error',
      properties: { stack: expect.any(String) },
    })
  })

  it('merges context into the reported properties', async () => {
    const error = new Error('invariant')

    reportCriticalError(error, { flow: 'payment' })
    await flushReports()

    expect(state.captureException).toHaveBeenCalledWith({
      message: 'invariant',
      name: 'Error',
      properties: { flow: 'payment', stack: error.stack },
    })
  })

  it('reports even in development mode (filterable via the isDev person-property)', async () => {
    state.isDev = true

    reportCriticalError(new Error('still reported'))
    await flushReports()

    expect(state.captureException).toHaveBeenCalledTimes(1)
  })
})

describe('trackFundsBlocked', () => {
  it('captures the reason with its properties', () => {
    trackFundsBlocked('activation_failed', { tx_hash: 'abc' })

    expect(state.capture).toHaveBeenCalledWith({ event: 'funds_blocked', properties: { reason: 'activation_failed', tx_hash: 'abc' } })
  })
})

describe('trackSwapStep', () => {
  it('captures the step with swap pair and provider', async () => {
    const { Asset } = await import('@/lib/assets')
    trackSwapStep({ step: 'cosign', ok: true, asset: Asset.NIM, swap_id: 'swap-1', duration_ms: 1200, tx_sent: true })

    expect(state.capture).toHaveBeenCalledWith({
      event: 'swap_step',
      properties: { step: 'cosign', ok: true, asset: 'NIM', swap_id: 'swap-1', duration_ms: 1200, tx_sent: true, swap_pair: 'NIM_BTC_LN', swap_provider: 'fastspot' },
    })
  })

  it('redacts addresses and hashes from the error reason', async () => {
    const { Asset } = await import('@/lib/assets')
    trackSwapStep({ step: 'broadcast', ok: false, asset: Asset.NIM, error_reason: `Rejected ${'a'.repeat(64)} from NQ07 0000 0000 0000 0000 0000 0000 0000 0000` })

    expect(state.capture.mock.calls[0][0].properties.error_reason).toBe('Rejected … from NQ…')
  })

  it('redacts Lightning invoices, LNURLs and Bitcoin addresses from the error reason', async () => {
    const { Asset } = await import('@/lib/assets')
    const invoice = 'lnbc10u1pjqqqqqpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdqqcqzzsxqyz5vq'
    trackSwapStep({
      step: 'quote',
      ok: false,
      asset: Asset.NIM,
      error_reason: `Bad peer ${invoice}, LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS, bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq, 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2`,
    })

    expect(state.capture.mock.calls[0][0].properties.error_reason).toBe('Bad peer ln…, ln…, btc…, btc…')
  })
})

describe('trackPaymentUnknown', () => {
  it('captures payment_unknown with a redacted error reason', async () => {
    const { Asset } = await import('@/lib/assets')
    const { PaymentMethod } = await import('@/types/transactions')
    trackPaymentUnknown({
      asset: Asset.NIM,
      payment_method: PaymentMethod.NIM,
      transfer_type: undefined,
      amount_range: '1-10',
      is_atomic_swap: true,
      duration_ms: 31000,
      error_reason: 'Timeout for NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    })

    expect(state.capture).toHaveBeenCalledWith({
      event: 'payment_unknown',
      properties: expect.objectContaining({ is_atomic_swap: true, duration_ms: 31000, error_reason: 'Timeout for NQ…' }),
    })
  })
})
