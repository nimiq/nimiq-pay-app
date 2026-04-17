import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NETWORK_OVERRIDE_KEY } from './network'

const STORAGE_KEY = NETWORK_OVERRIDE_KEY

async function importFresh(opts: { storedValue?: string | null, isDev?: boolean } = {}) {
  const { storedValue = null, isDev = false } = opts

  vi.resetModules()
  vi.stubEnv('DEV', isDev)

  if (storedValue === null)
    globalThis.localStorage.removeItem(STORAGE_KEY)
  else
    globalThis.localStorage.setItem(STORAGE_KEY, storedValue)

  return import('./network')
}

describe('network override', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
    vi.unstubAllEnvs()
  })

  describe('isTestnet', () => {
    it('tracks isDev=false when no override', async () => {
      const mod = await importFresh({ isDev: false })
      expect(mod.isTestnet).toBe(false)
      expect(mod.isNetworkOverridden).toBe(false)
      expect(mod.networkOverride).toBeNull()
    })

    it('tracks isDev=true when no override', async () => {
      const mod = await importFresh({ isDev: true })
      expect(mod.isTestnet).toBe(true)
      expect(mod.isNetworkOverridden).toBe(false)
    })

    it('is true when override=testnet, regardless of isDev', async () => {
      const mod = await importFresh({ isDev: false, storedValue: 'testnet' })
      expect(mod.isTestnet).toBe(true)
      expect(mod.isNetworkOverridden).toBe(true)
      expect(mod.networkOverride).toBe('testnet')
    })

    it('is false when override=mainnet, regardless of isDev', async () => {
      const mod = await importFresh({ isDev: true, storedValue: 'mainnet' })
      expect(mod.isTestnet).toBe(false)
      expect(mod.isNetworkOverridden).toBe(true)
      expect(mod.networkOverride).toBe('mainnet')
    })

    it('ignores garbage values and falls back to isDev', async () => {
      const mod = await importFresh({ isDev: true, storedValue: 'garbage' })
      expect(mod.isTestnet).toBe(true)
      expect(mod.isNetworkOverridden).toBe(false)
      expect(mod.networkOverride).toBeNull()
    })
  })

  describe('setNetworkOverride', () => {
    it('writes testnet to localStorage', async () => {
      const { setNetworkOverride } = await importFresh()
      setNetworkOverride('testnet')
      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('testnet')
    })

    it('writes mainnet to localStorage', async () => {
      const { setNetworkOverride } = await importFresh()
      setNetworkOverride('mainnet')
      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('mainnet')
    })

    it('removes the key when passed null', async () => {
      globalThis.localStorage.setItem(STORAGE_KEY, 'testnet')
      const { setNetworkOverride } = await importFresh({ storedValue: 'testnet' })
      setNetworkOverride(null)
      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })
})
