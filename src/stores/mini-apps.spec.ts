import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  CapacitorHttp: {
    get: vi.fn(() => Promise.resolve({ status: 200, data: { nimiq: [], evm: [] } })),
  },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/lib', () => ({
  isDev: false,
  isTestnet: false,
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    query: vi.fn(() => Promise.resolve(undefined)),
    run: vi.fn(() => Promise.resolve()),
  }),
}))

vi.mock('@/lib/site-metadata', () => ({
  getFaviconUrl: (url: string) => `https://icons.example/${encodeURIComponent(url)}`,
  fetchPageDescription: vi.fn(() => Promise.resolve(undefined)),
}))

describe('useMiniApps.isTrustedMiniAppUrl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('returns false when no remote apps are cached and no recents exist', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    expect(store.isTrustedMiniAppUrl('https://example.com/')).toBe(false)
  })

  it('returns true for a url present in the recently-viewed list', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://app.uniswap.org/', name: 'Uniswap', icon: '' })
    expect(store.isTrustedMiniAppUrl('https://app.uniswap.org/')).toBe(true)
  })

  it('matches urls with and without a trailing slash', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://app.uniswap.org', name: 'Uniswap', icon: '' })
    expect(store.isTrustedMiniAppUrl('https://app.uniswap.org/')).toBe(true)
    expect(store.isTrustedMiniAppUrl('https://app.uniswap.org')).toBe(true)
  })

  it('keeps up to 20 recently-viewed entries for trust gating', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    for (let i = 0; i < 25; i++)
      store.addRecentlyViewed({ url: `https://app-${i}.example/`, name: `App ${i}`, icon: '' })

    expect(store.recentlyViewedDApps.length).toBe(20)
    // The 5 oldest entries are evicted; the oldest survivor (added 5th) is still trusted.
    expect(store.isTrustedMiniAppUrl('https://app-5.example/')).toBe(true)
    expect(store.isTrustedMiniAppUrl('https://app-4.example/')).toBe(false)
  })
})
