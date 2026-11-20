import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBundleVersion } from './app-version'

const { current, getInfo } = vi.hoisted(() => ({ current: vi.fn(), getInfo: vi.fn() }))

vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: { current } }))
vi.mock('@capacitor/app', () => ({ App: { getInfo } }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), error: vi.fn() }) }))

describe('getBundleVersion', () => {
  beforeEach(() => {
    getInfo.mockResolvedValue({ version: '2.24.0' })
  })

  it('returns the OTA bundle version', async () => {
    current.mockResolvedValue({ bundle: { version: '2.24.1' } })
    expect(await getBundleVersion()).toBe('2.24.1')
  })

  it('returns the native version for the builtin bundle', async () => {
    current.mockResolvedValue({ bundle: { version: 'builtin' } })
    expect(await getBundleVersion()).toBe('2.24.0')
  })
})
