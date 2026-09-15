import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLegacyTransactionValidityStartHeight, isWasmAvailable } from './utils'

describe('isWasmAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when WebAssembly is available', () => {
    expect(isWasmAvailable()).toBe(true)
  })

  it('returns false when WebAssembly is missing (e.g. iOS Lockdown Mode)', () => {
    vi.stubGlobal('WebAssembly', undefined)
    expect(isWasmAvailable()).toBe(false)
  })

  it('returns false when WebAssembly.validate rejects the module', () => {
    vi.stubGlobal('WebAssembly', { validate: () => false })
    expect(isWasmAvailable()).toBe(false)
  })
})

describe('legacy transaction signing content', () => {
  const core: typeof import('@nimiq/core') = createRequire(import.meta.url)('@nimiq/core')
  beforeEach(() => vi.stubGlobal('Nimiq', core))
  afterEach(() => vi.unstubAllGlobals())

  it.each([0, 2])('recovers exact height for sender type %s using real Core content', (senderType) => {
    for (const network of [5, 24]) {
      for (const height of [0, 100, 0xFFFFFFFF]) {
        for (const dataLength of [82, 255, 256]) {
          const address = core.Address.fromAny('11'.repeat(20))
          const tx = new core.Transaction(address, senderType, new Uint8Array([1, 2]), address, 2, new Uint8Array(dataLength), 1234n, 5n, 1, height, network)
          const row = { hash: tx.hash(), sender: tx.sender.toUserFriendlyAddress(), recipient: tx.recipient.toUserFriendlyAddress(), raw: core.BufferUtils.toHex(tx.serializeContent()) }
          expect(getLegacyTransactionValidityStartHeight(row, network)).toBe(height)
          expect(getLegacyTransactionValidityStartHeight(row, network === 5 ? 24 : 5)).toBeUndefined()
          expect(getLegacyTransactionValidityStartHeight({ ...row, hash: '00'.repeat(32) }, network)).toBeUndefined()
          expect(getLegacyTransactionValidityStartHeight({ ...row, sender: row.recipient }, network)).toBeUndefined()
          expect(getLegacyTransactionValidityStartHeight({ ...row, recipient: row.sender }, network)).toBeUndefined()
          expect(getLegacyTransactionValidityStartHeight({ ...row, raw: row.raw.slice(0, -2) }, network)).toBeUndefined()
          expect(getLegacyTransactionValidityStartHeight({ ...row, raw: `${row.raw}00` }, network)).toBeUndefined()
          tx.free()
          address.free()
        }
      }
    }
  })

  it.each([[0, 0], [2, 0], [3, 0], [0, 3]])('recovers outgoing height for account types %s -> %s', (senderType, recipientType) => {
    const sender = core.Address.fromAny('11'.repeat(20))
    const recipient = core.Address.fromAny('22'.repeat(20))
    const tx = new core.Transaction(sender, senderType, new Uint8Array(), recipient, recipientType, new Uint8Array(), 1234n, 5n, 0, 100, 24)
    const row = { hash: tx.hash(), sender: sender.toUserFriendlyAddress(), recipient: recipient.toUserFriendlyAddress(), raw: core.BufferUtils.toHex(tx.serializeContent()) }
    expect(getLegacyTransactionValidityStartHeight(row, 24)).toBe(100)
    tx.free()
    sender.free()
    recipient.free()
  })

  it('recovers the height of a real remove-stake transaction', () => {
    const recipient = core.Address.fromAny('22'.repeat(20))
    const tx = core.TransactionBuilder.newRemoveStake(recipient, 1234n, 0n, 100, 24)
    const row = { hash: tx.hash(), sender: tx.sender.toUserFriendlyAddress(), recipient: tx.recipient.toUserFriendlyAddress(), raw: core.BufferUtils.toHex(tx.serializeContent()) }
    expect(getLegacyTransactionValidityStartHeight(row, 24)).toBe(100)
    tx.free()
    recipient.free()
  })

  it.each([1, 127, 128, 256])('recovers staking sender data of %s bytes', (length) => {
    const sender = core.Address.fromAny('11'.repeat(20))
    const recipient = core.Address.fromAny('22'.repeat(20))
    const tx = new core.Transaction(sender, 3, new Uint8Array(length).fill(1), recipient, 0, new Uint8Array(), 1n, 0n, 0, 100, 24)
    const row = { hash: tx.hash(), sender: tx.sender.toUserFriendlyAddress(), recipient: tx.recipient.toUserFriendlyAddress(), raw: core.BufferUtils.toHex(tx.serializeContent()) }
    expect(getLegacyTransactionValidityStartHeight(row, 24)).toBe(100)
    tx.free()
    sender.free()
    recipient.free()
  })

  it.each([null, undefined, '', 'zz', '00', '0001'])('rejects missing or malformed content %s', (raw) => {
    expect(getLegacyTransactionValidityStartHeight({ hash: '', sender: '', recipient: '', raw }, 5)).toBeUndefined()
  })
})
