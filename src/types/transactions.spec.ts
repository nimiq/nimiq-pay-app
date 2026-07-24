import { describe, expect, it, vi } from 'vitest'

import { isPendingAtomicSwapTransaction, Transfer, translateTransactionTitle } from './transactions'

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string) => value === 'Cashlink Claiming' ? 'Translated Cashlink Claiming' : value,
  },
}))

describe('isPendingAtomicSwapTransaction', () => {
  it('returns false for expired atomic swaps without a secret', () => {
    expect(isPendingAtomicSwapTransaction({
      transfer: Transfer.UserPaymentToAtomicSwap,
      status: 'expired',
      meta: {},
    })).toBe(false)
  })

  it('returns true while the atomic swap is still unresolved', () => {
    expect(isPendingAtomicSwapTransaction({
      transfer: Transfer.UserPaymentToAtomicSwap,
      status: 'confirmed',
      meta: {},
    })).toBe(true)
  })

  it('returns false once the swap has a terminal marker', () => {
    expect(isPendingAtomicSwapTransaction({
      transfer: Transfer.UserPaymentToAtomicSwap,
      status: 'mined',
      meta: { secret: 'preimage' },
    })).toBe(false)
    expect(isPendingAtomicSwapTransaction({
      transfer: Transfer.UserPaymentToAtomicSwap,
      status: 'mined',
      meta: { refunded: true },
    })).toBe(false)
  })
})

describe('translateTransactionTitle', () => {
  it('translates Cashlink Claiming', () => {
    expect(translateTransactionTitle('Cashlink Claiming')).toBe('Translated Cashlink Claiming')
  })
})
