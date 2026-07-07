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

describe('useMiniApps.removeRecentlyViewed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('removes a recently-viewed entry by exact URL match', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://app.uniswap.org/', name: 'Uniswap', icon: '' })
    store.addRecentlyViewed({ url: 'https://aave.com/', name: 'Aave', icon: '' })

    store.removeRecentlyViewed('https://app.uniswap.org/')

    expect(store.recentlyViewedDApps.map(d => d.url)).toEqual(['https://aave.com'])
  })

  it('removes regardless of trailing slash on the lookup URL', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://app.uniswap.org', name: 'Uniswap', icon: '' })

    store.removeRecentlyViewed('https://app.uniswap.org/')

    expect(store.recentlyViewedDApps.length).toBe(0)
  })

  it('is a noop when the URL is not present', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://aave.com/', name: 'Aave', icon: '' })

    store.removeRecentlyViewed('https://app.uniswap.org/')

    expect(store.recentlyViewedDApps.map(d => d.url)).toEqual(['https://aave.com'])
  })

  it('drops the URL from trustedUrls so the warning prompt re-triggers', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://app.uniswap.org/', name: 'Uniswap', icon: '' })
    expect(store.isTrustedMiniAppUrl('https://app.uniswap.org/')).toBe(true)

    store.removeRecentlyViewed('https://app.uniswap.org/')

    expect(store.isTrustedMiniAppUrl('https://app.uniswap.org/')).toBe(false)
  })
})

describe('useMiniApps.addRecentlyViewed hostname dedupe', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('collapses different paths of the same host into one root entry', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://payshareminiapp.vercel.app/', name: 'Share', icon: '' })
    store.addRecentlyViewed({ url: 'https://payshareminiapp.vercel.app/another-thing', name: 'Share', icon: '' })

    expect(store.recentlyViewedDApps.map(d => d.url)).toEqual(['https://payshareminiapp.vercel.app'])
  })

  it('normalizes a deep-path open to the root URL', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://payshareminiapp.vercel.app/invite/abc', name: 'Share', icon: '' })

    expect(store.recentlyViewedDApps.map(d => d.url)).toEqual(['https://payshareminiapp.vercel.app'])
  })

  it('keeps separate entries for different hosts', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://a.example/x', name: 'A', icon: '' })
    store.addRecentlyViewed({ url: 'https://b.example/y', name: 'B', icon: '' })

    expect(store.recentlyViewedDApps.map(d => d.url)).toEqual(['https://b.example', 'https://a.example'])
  })

  it('moves a revisited host back to the top', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://a.example/', name: 'A', icon: '' })
    store.addRecentlyViewed({ url: 'https://b.example/', name: 'B', icon: '' })
    store.addRecentlyViewed({ url: 'https://a.example/deep', name: 'A', icon: '' })

    expect(store.recentlyViewedDApps.map(d => d.url)).toEqual(['https://a.example', 'https://b.example'])
  })
})
