import { describe, expect, it, vi } from 'vitest'
import { deriveAppScopedId } from './device-identifier'

vi.mock('@capacitor/device', () => ({
  Device: { getId: vi.fn(async () => ({ identifier: 'abc-device-123' })) },
}))

describe('deriveAppScopedId', () => {
  it('returns a 64-char lowercase hex SHA-256 digest', async () => {
    const id = await deriveAppScopedId('https://app.example')
    expect(id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same origin', async () => {
    const a = await deriveAppScopedId('https://app.example')
    const b = await deriveAppScopedId('https://app.example')
    expect(a).toBe(b)
  })

  it('differs across origins', async () => {
    const a = await deriveAppScopedId('https://a.example')
    const b = await deriveAppScopedId('https://b.example')
    expect(a).not.toBe(b)
  })
})
