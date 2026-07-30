import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isHtlcRedeemToSelf, isOwnRemoteHtlcShape, isPendingAtomicSwapTransaction, Transfer, translateTransactionTitle, ZERO_HASH_ROOT } from './transactions'

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

const addresses = { localAddress: 'NQ00 LOCAL', cosignerAddress: 'NQ11 COSIGNER' }

function ourHtlc(overrides: Record<string, unknown> = {}) {
  return {
    sender: 'NQ00 LOCAL',
    recipient: 'NQ11 COSIGNER',
    hashRoot: ZERO_HASH_ROOT,
    hashCount: 1,
    ...overrides,
  }
}

describe('isOwnRemoteHtlcShape', () => {
  it('matches an HTLC created by createDepositData', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc(), addresses)).toBe(true)
  })

  it('rejects a Mini App HTLC that names a real counterparty', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ recipient: 'NQ77 COUNTERPARTY' }), addresses)).toBe(false)
  })

  it('rejects a Mini App HTLC with a real hash root', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ hashRoot: 'ab'.repeat(32) }), addresses)).toBe(false)
  })

  it('rejects a Mini App HTLC that mimics the zero hash root but not the cosigner', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ recipient: 'NQ77 COUNTERPARTY', hashCount: 1 }), addresses)).toBe(false)
  })

  it('rejects an HTLC whose sender is not the local wallet', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ sender: 'NQ77 SOMEONE ELSE' }), addresses)).toBe(false)
  })

  it('ignores the hash algorithm', () => {
    expect(isOwnRemoteHtlcShape({ ...ourHtlc(), hashAlgorithm: 'sha256' } as any, addresses)).toBe(true)
  })
})

describe('isHtlcRedeemToSelf', () => {
  beforeEach(() => {
    vi.stubGlobal('Nimiq', { AccountType: { Basic: 0, HTLC: 2 } })
  })

  it('matches a redeem paying the local wallet', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.HTLC, senderType: 2, recipient: 'NQ00 LOCAL' } as any,
      'NQ00 LOCAL',
    )).toBe(true)
  })

  it('rejects a redeem paying a third party', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.HTLC, senderType: 2, recipient: 'NQ77 SOMEONE ELSE' } as any,
      'NQ00 LOCAL',
    )).toBe(false)
  })

  it('rejects an HTLC funding', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.HTLC, senderType: 2, recipient: 'NQ55 NEW CONTRACT' } as any,
      'NQ00 LOCAL',
    )).toBe(false)
  })

  it('rejects a non-HTLC transfer paying the local wallet', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.UserReceipt, senderType: 2, recipient: 'NQ00 LOCAL' } as any,
      'NQ00 LOCAL',
    )).toBe(false)
  })
})
