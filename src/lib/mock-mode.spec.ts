import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOCK_DATA_OVERRIDE_KEY } from './mock-mode'

async function importFresh(opts: { storedValue?: string | null, envValue?: string } = {}) {
  const { storedValue = null, envValue } = opts

  vi.resetModules()
  if (envValue !== undefined)
    vi.stubEnv('VITE_MOCK_DATA', envValue)

  if (storedValue === null)
    globalThis.localStorage.removeItem(MOCK_DATA_OVERRIDE_KEY)
  else
    globalThis.localStorage.setItem(MOCK_DATA_OVERRIDE_KEY, storedValue)

  return import('./mock-mode')
}

describe('mock-data override', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
    vi.unstubAllEnvs()
  })

  describe('isMockEnabled', () => {
    it('is false by default', async () => {
      const mod = await importFresh()
      expect(mod.isMockEnabled).toBe(false)
      expect(mod.isMockBakedIn).toBe(false)
    })

    it('is true when localStorage override is set', async () => {
      const mod = await importFresh({ storedValue: 'true' })
      expect(mod.isMockEnabled).toBe(true)
      expect(mod.isMockBakedIn).toBe(false)
    })

    it('is true when baked in via VITE_MOCK_DATA', async () => {
      const mod = await importFresh({ envValue: 'true' })
      expect(mod.isMockEnabled).toBe(true)
      expect(mod.isMockBakedIn).toBe(true)
    })

    it('ignores garbage localStorage values', async () => {
      const mod = await importFresh({ storedValue: 'garbage' })
      expect(mod.isMockEnabled).toBe(false)
    })

    it('ignores garbage env values', async () => {
      const mod = await importFresh({ envValue: 'yes' })
      expect(mod.isMockEnabled).toBe(false)
      expect(mod.isMockBakedIn).toBe(false)
    })
  })

  describe('setMockDataOverride', () => {
    it('writes true to localStorage', async () => {
      const { setMockDataOverride } = await importFresh()
      setMockDataOverride(true)
      expect(globalThis.localStorage.getItem(MOCK_DATA_OVERRIDE_KEY)).toBe('true')
    })

    it('removes the key when disabled', async () => {
      const { setMockDataOverride } = await importFresh({ storedValue: 'true' })
      setMockDataOverride(false)
      expect(globalThis.localStorage.getItem(MOCK_DATA_OVERRIDE_KEY)).toBeNull()
    })
  })
})
