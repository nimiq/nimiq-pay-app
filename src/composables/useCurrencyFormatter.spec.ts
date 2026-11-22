import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { Crypto } from '@/stores/app'
import { useCurrencyFormatter } from './useCurrencyFormatter'

vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pinia')>()
  return {
    ...actual,
    storeToRefs: <T extends object>(store: T) => store,
  }
})

vi.mock('@/stores/app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/app')>()
  return {
    ...actual,
    useApp: () => ({ language: ref('en'), selectedFiat: ref('USD') }),
  }
})

describe('formatCrypto', () => {
  const { formatCrypto } = useCurrencyFormatter()

  it('uses the decimals of the given currency', () => {
    expect(formatCrypto(5_000_000, { currency: Crypto.USDT })).toBe('5 USDT')
    expect(formatCrypto(5_000_000, { currency: Crypto.NIM })).toBe('50 NIM')
    expect(formatCrypto(150_000_000, { currency: Crypto.BTC })).toBe('1.5 BTC')
  })

  it('defaults to NIM decimals without a suffix', () => {
    expect(formatCrypto(123_456)).toBe('1.23')
  })

  it('suffixes zero only with the given currency', () => {
    expect(formatCrypto(0, { currency: Crypto.USDT })).toBe('0 USDT')
    expect(formatCrypto(0)).toBe('0')
  })

  it('renders a missing amount as zero', () => {
    expect(formatCrypto(Number.NaN, { currency: Crypto.NIM })).toBe('0 NIM')
  })
})
