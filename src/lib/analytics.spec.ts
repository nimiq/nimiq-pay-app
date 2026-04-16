import { describe, expect, it, vi } from 'vitest'
import {
  buildPaymentAnalyticsProps,
  finishPaymentAnalytics,
  getAmountRange,
  startPaymentAnalytics,
} from './analytics'

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (value: string) => value },
}))

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
    // 10 NIM = 1_000_000 luna (5 decimals)
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
    // 50 USDT = 50_000_000 (6 decimals)
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
    const state = startPaymentAnalytics(123)

    expect(state).toEqual({
      startedAt: 123,
      status: 'started',
    })
    expect(state.status).toBe('started')
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
