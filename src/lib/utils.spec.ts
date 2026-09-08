import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLegacyHtlcValidityStartHeight, isWasmAvailable } from './utils'

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

describe('legacy HTLC signing content', () => {
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
          expect(getLegacyHtlcValidityStartHeight(row, network)).toBe(height)
          expect(getLegacyHtlcValidityStartHeight(row, network === 5 ? 24 : 5)).toBeUndefined()
          expect(getLegacyHtlcValidityStartHeight({ ...row, hash: '00'.repeat(32) }, network)).toBeUndefined()
          expect(getLegacyHtlcValidityStartHeight({ ...row, sender: row.recipient }, network)).toBeUndefined()
          expect(getLegacyHtlcValidityStartHeight({ ...row, recipient: row.sender }, network)).toBeUndefined()
          expect(getLegacyHtlcValidityStartHeight({ ...row, raw: row.raw.slice(0, -2) }, network)).toBeUndefined()
          expect(getLegacyHtlcValidityStartHeight({ ...row, raw: `${row.raw}00` }, network)).toBeUndefined()
          tx.free()
          address.free()
        }
      }
    }
  })

  it.each([null, undefined, '', 'zz', '00', '0001'])('rejects missing or malformed content %s', (raw) => {
    expect(getLegacyHtlcValidityStartHeight({ hash: '', sender: '', recipient: '', raw }, 5)).toBeUndefined()
  })
})
