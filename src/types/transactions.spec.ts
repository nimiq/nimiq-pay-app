import type { Address } from '@nimiq/core'
import type { BaseTransaction, PartialSendTxArgs } from './transactions'
import { describe, expect, it, vi } from 'vitest'

import { isPendingAtomicSwapTransaction, Transfer, translateTransactionTitle } from './transactions'

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string) => value === 'Cashlink Claiming' ? 'Translated Cashlink Claiming' : value,
  },
}))

describe('transaction recovery types', () => {
  it('accepts a null validity start height from persisted transactions', () => {
    const legacy: BaseTransaction = {
      sender: 'NQ00 SENDER',
      recipient: 'NQ01 RECIPIENT',
      status: 'pending',
      timestamp: undefined,
      amount: 1,
      fee: 0,
      hash: 'legacy',
      proofSize: 0,
      validityStartHeight: null,
    }

    expect(legacy.validityStartHeight).toBeNull()
  })

  it('requires an address-specific proof size for immediate reclaim', () => {
    const reclaim: Extract<PartialSendTxArgs, { transfer: Transfer.RemoteToLocalImmediateReclaim }> = {
      transfer: Transfer.RemoteToLocalImmediateReclaim,
      sender: {} as Address,
      amount: 1,
      proofSize: 104,
    }

    expect(reclaim.proofSize).toBe(104)
  })
})

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
