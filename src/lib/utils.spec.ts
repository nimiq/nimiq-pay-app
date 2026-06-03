import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWasmAvailable } from './utils'

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
