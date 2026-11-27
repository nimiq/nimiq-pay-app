import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBestIcon } from '@/lib/site-metadata'

const { env, httpGet, preferencesGet } = vi.hoisted(() => ({
  env: { isDev: false, isMockEnabled: false },
  httpGet: vi.fn((_options?: unknown): Promise<{ status: number, data: unknown }> => Promise.resolve({ status: 200, data: { nimiq: [], evm: [] } })),
  preferencesGet: vi.fn((_options: { key: string }): Promise<{ value: string | null }> => Promise.resolve({ value: null })),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  CapacitorHttp: {
    get: httpGet,
  },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: preferencesGet,
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/lib', () => ({
  get isDev() {
    return env.isDev
  },
  isTestnet: false,
}))

vi.mock('@/lib/mock-mode', () => ({
  get isMockEnabled() {
    return env.isMockEnabled
  },
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
  fetchBestIcon: vi.fn(() => Promise.resolve(undefined)),
}))

describe('useMiniApps.isTrustedMiniAppUrl', () => {
  beforeEach(() => {
    env.isDev = false
    env.isMockEnabled = false
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
    expect(store.isTrustedMiniAppUrl('https://app-5.example/')).toBe(true)
    expect(store.isTrustedMiniAppUrl('https://app-4.example/')).toBe(false)
  })
})

describe('useMiniApps development app', () => {
  beforeEach(() => {
    env.isDev = true
    env.isMockEnabled = false
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('includes the local Demo App during normal development', async () => {
    const { useMiniApps } = await import('./mini-apps')
    expect(useMiniApps().allDApps.map(({ name }) => name)).toContain('Demo App')
  })

  it('hides the local Demo App from screenshot mock mode', async () => {
    env.isMockEnabled = true
    const { useMiniApps } = await import('./mini-apps')
    expect(useMiniApps().allDApps.map(({ name }) => name)).not.toContain('Demo App')
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

describe('useMiniApps remote catalog', () => {
  const remoteApp = { name: 'Cinima', url: 'https://cinima.example/', description: 'Movies', logo: '', source: null, developer: null, featured: true, slug: 'cinima', type: 'nimiq' }

  beforeEach(() => {
    env.isDev = false
    env.isMockEnabled = false
    httpGet.mockReset()
    preferencesGet.mockReset()
    preferencesGet.mockResolvedValue({ value: null })
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('shows a retryable error instead of loading forever when the first fetch fails with no cache', async () => {
    httpGet.mockRejectedValueOnce(new Error('offline'))
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    expect(store.isLoading).toBe(true)
    await flushPromises()

    expect(store.isLoading).toBe(false)
    expect(store.hasLoadError).toBe(true)

    httpGet.mockResolvedValueOnce({ status: 200, data: { nimiq: [remoteApp], evm: [] } })
    await store.loadRemoteApps()

    expect(store.hasLoadError).toBe(false)
    expect(store.allDApps.map(d => d.name)).toEqual(['Cinima'])
  })

  it('falls back to the cached catalog when the fetch fails before the cache is read', async () => {
    let resolveCache!: (value: { value: string | null }) => void
    preferencesGet.mockImplementation(({ key }) => key === 'miniAppsRemoteList'
      ? new Promise(resolve => resolveCache = resolve)
      : Promise.resolve({ value: null }))
    httpGet.mockRejectedValueOnce(new Error('offline'))
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    await flushPromises()

    resolveCache({ value: JSON.stringify([remoteApp]) })
    await flushPromises()

    expect(store.hasLoadError).toBe(false)
    expect(store.allDApps.map(d => d.name)).toEqual(['Cinima'])
  })

  it('does not refetch once the catalog loaded', async () => {
    httpGet.mockResolvedValue({ status: 200, data: { nimiq: [remoteApp], evm: [] } })
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    await flushPromises()
    await store.loadRemoteApps()

    expect(httpGet).toHaveBeenCalledTimes(1)
  })

  it('uses the listing logo for a deep link path on a listed origin', async () => {
    httpGet.mockResolvedValue({ status: 200, data: { nimiq: [
      { ...remoteApp, logo: 'https://cinima.example/logo.png' },
      { ...remoteApp, url: 'https://cinima.example/tickets', slug: 'tickets', logo: 'https://cinima.example/tickets.png' },
    ], evm: [] } })
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    await flushPromises()

    expect(store.iconForUrl('https://cinima.example/movies/42')).toBe('https://cinima.example/logo.png')
    expect(store.iconForUrl('https://cinima.example/tickets/7')).toBe('https://cinima.example/tickets.png')
    expect(store.iconForUrl('https://cinima.example/tickets?id=7')).toBe('https://cinima.example/tickets.png')
    expect(store.iconForUrl('https://cinima.example/tickets#seat')).toBe('https://cinima.example/tickets.png')
  })

  it('prefers the exact listing logo over a same-origin listing', async () => {
    httpGet.mockResolvedValue({ status: 200, data: { nimiq: [
      { ...remoteApp, url: 'https://cinima.example/tickets', slug: 'tickets', logo: 'https://cinima.example/tickets.png' },
      { ...remoteApp, logo: 'https://cinima.example/logo.png' },
    ], evm: [] } })
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    await flushPromises()

    expect(store.iconForUrl('https://cinima.example/')).toBe('https://cinima.example/logo.png')
  })

  it('ignores a same-origin listing whose path is not a prefix of the URL', async () => {
    httpGet.mockResolvedValue({ status: 200, data: { nimiq: [
      { ...remoteApp, url: 'https://cinima.example/tickets', slug: 'tickets', logo: 'https://cinima.example/tickets.png' },
    ], evm: [] } })
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    await flushPromises()

    expect(store.iconForUrl('https://cinima.example/other')).not.toBe('https://cinima.example/tickets.png')
    expect(store.iconForUrl('https://cinima.example/ticketsales')).not.toBe('https://cinima.example/tickets.png')
  })
})

describe('useMiniApps device ID consent', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('revokes consent for one origin and keeps the others', async () => {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    store.grantDeviceIdConsent('https://a.example')
    store.grantDeviceIdConsent('https://b.example')

    store.revokeDeviceIdConsent('https://a.example')

    expect(store.hasDeviceIdConsent('https://a.example')).toBe(false)
    expect(store.hasDeviceIdConsent('https://b.example')).toBe(true)
    expect(Object.keys(store.deviceIdConsent)).toEqual(['https://b.example'])
  })
})

describe('useMiniApps.ensureBestIcon', () => {
  const APP = 'https://app.example/'
  const ORIGIN = 'https://app.example'
  const DAY = 24 * 60 * 60 * 1000
  const NOW = Date.UTC(2026, 0, 15)
  const fetchIcon = vi.mocked(fetchBestIcon)

  function storeBestIcons(entries: Record<string, { url: string, checkedAt: number }>) {
    preferencesGet.mockImplementation(({ key }) => Promise.resolve({ value: key === 'miniAppsBestIconsV2' ? JSON.stringify(entries) : null }))
  }

  async function createStore() {
    const { useMiniApps } = await import('./mini-apps')
    const store = useMiniApps()
    await flushPromises()
    return store
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    httpGet.mockReset()
    httpGet.mockResolvedValue({ status: 200, data: { nimiq: [], evm: [] } })
    preferencesGet.mockReset()
    preferencesGet.mockResolvedValue({ value: null })
    fetchIcon.mockReset()
    setActivePinia(createPinia())
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores nothing when the fetch fails and retries on the next call', async () => {
    fetchIcon.mockResolvedValue(undefined)
    const store = await createStore()

    await store.ensureBestIcon(APP)
    expect(store.iconForUrl(APP)).toBe(`https://icons.example/${encodeURIComponent(APP)}`)

    fetchIcon.mockResolvedValue('https://app.example/icon.png')
    await store.ensureBestIcon(APP)

    expect(fetchIcon).toHaveBeenCalledTimes(2)
    expect(store.iconForUrl(APP)).toBe('https://app.example/icon.png')
  })

  it('does not refetch an entry checked less than 7 days ago', async () => {
    storeBestIcons({ [ORIGIN]: { url: 'https://app.example/old.png', checkedAt: NOW - 6 * DAY } })
    const store = await createStore()

    await store.ensureBestIcon(APP)

    expect(fetchIcon).not.toHaveBeenCalled()
    expect(store.iconForUrl(APP)).toBe('https://app.example/old.png')
  })

  it('refetches and replaces an entry checked more than 7 days ago', async () => {
    storeBestIcons({ [ORIGIN]: { url: 'https://app.example/old.png', checkedAt: NOW - 8 * DAY } })
    let resolveIcon!: (icon: string) => void
    fetchIcon.mockImplementation(() => new Promise(resolve => resolveIcon = resolve))
    const store = await createStore()

    const pending = store.ensureBestIcon(APP)
    expect(store.iconForUrl(APP)).toBe('https://app.example/old.png')
    resolveIcon('https://app.example/new.png')
    await pending

    expect(store.iconForUrl(APP)).toBe('https://app.example/new.png')
    await store.ensureBestIcon(APP)
    expect(fetchIcon).toHaveBeenCalledTimes(1)
  })

  it('keeps the old entry when the refetch fails', async () => {
    storeBestIcons({ [ORIGIN]: { url: 'https://app.example/old.png', checkedAt: NOW - 8 * DAY } })
    fetchIcon.mockResolvedValue(undefined)
    const store = await createStore()

    await store.ensureBestIcon(APP)
    expect(store.iconForUrl(APP)).toBe('https://app.example/old.png')

    await store.ensureBestIcon(APP)
    expect(fetchIcon).toHaveBeenCalledTimes(2)
  })
})
