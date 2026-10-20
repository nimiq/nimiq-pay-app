import type { WidgetSize } from '@/lib/mini-app-widgets'
import { CapacitorHttp } from '@capacitor/core'
import { computedAsync, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { isDev } from '@/lib'
import { isMockEnabled } from '@/lib/mock-mode'
import { fetchBestIcon, fetchPageDescription, getFaviconUrl } from '@/lib/site-metadata'
import { safeHostname, safeOrigin } from '@/lib/url-safety'
import { kv, kvPreferences } from '@/stores/app'

const REMOTE_JSON_URL = 'https://raw.githubusercontent.com/nimiq/awesome/main/src/data/dist/nimiq-mini-apps.json'

// Base for the nimiq/awesome "report this Mini App" page: `${REPORT_BASE}/<type>/<slug>/report`.
const REPORT_BASE = 'https://nimpay.app/miniapps'

export type MiniAppType = 'nimiq' | 'evm'

export interface DApp {
  name: string
  url: string
  icon: string
  description?: string
  featured: boolean
  type?: MiniAppType
}

export interface RowDApp {
  url: string
  name: string
  icon: string
  description?: string
  type?: MiniAppType
}

export interface MiniAppMenuContext {
  app: Pick<RowDApp, 'name' | 'url' | 'icon'>
  reportUrl?: string
  removable: boolean
  /** Unset means shareable; false for a widget with no Mini App behind it. */
  shareable?: boolean
  /** The site a widget comes from, shown under its name. */
  address?: string
  widget?: { size: WidgetSize, sizes: WidgetSize[] }
}

interface BaseDApp {
  name: string
  url: string
  featured: boolean
  type?: MiniAppType
}

interface RemoteMiniApp {
  name: string
  url: string
  // Always overwritten at flatten time from the source array key (nimiq/evm);
  // raw upstream value is discarded.
  type: MiniAppType
  description: string
  logo: string
  source: string | null
  developer: string | null
  featured: boolean
  slug: string
}

interface RemoteMiniAppsResponse {
  nimiq: RemoteMiniApp[]
  evm: RemoteMiniApp[]
}

function toBaseDApp(remote: RemoteMiniApp): BaseDApp {
  return {
    name: remote.name,
    url: remote.url,
    featured: remote.featured,
    type: remote.type,
  }
}

function tagType(items: RemoteMiniApp[] | undefined, type: MiniAppType): RemoteMiniApp[] {
  return (items ?? []).map(item => ({ ...item, type }))
}

type SearchedDescriptionState = 'loading' | 'done'

interface RecentDApp {
  name: string
  url: string
  icon: string
  description?: string
  type?: MiniAppType
}

const MAX_RECENT = 20
const MAX_RECENT_DISPLAY = 5
const TRAILING_SLASH_RE = /\/$/

export function stripTrailingSlash(url: string): string {
  return url.replace(TRAILING_SLASH_RE, '')
}

export const useMiniApps = defineStore('mini-apps', () => {
  // Cache remote apps list in Preferences (available pre-login, persists across launches)
  const cachedRemoteApps = useStorageAsync<RemoteMiniApp[]>(
    'miniAppsRemoteList',
    [],
    kvPreferences(),
    { writeDefaults: false },
  )

  // Lazily-resolved best icon per origin, filling the fallback slot when awesome has no
  // curated logo. Persisted so we don't re-scrape sites on every launch. See ensureBestIcon.
  const bestIcons = useStorageAsync<Record<string, string>>(
    'miniAppsBestIcons',
    {},
    kvPreferences(),
    { writeDefaults: false },
  )
  const bestIconInFlight = new Set<string>()

  // Fetch remote apps, update cache on success, fall back to cache on failure
  const remoteApps = computedAsync<RemoteMiniApp[]>(async () => {
    try {
      const response = await CapacitorHttp.get({
        url: REMOTE_JSON_URL,
        headers: { Accept: 'application/json' },
        readTimeout: 10000,
        connectTimeout: 5000,
        responseType: 'json',
      })
      if (response.status >= 200 && response.status < 300) {
        const data = response.data as RemoteMiniAppsResponse
        const apps = [...tagType(data.nimiq, 'nimiq'), ...tagType(data.evm, 'evm')]
        cachedRemoteApps.value = apps
        return apps
      }
    }
    catch { /* silent fallback to cache */ }
    return cachedRemoteApps.value ?? []
  }, [])

  const baseDApps = computed<BaseDApp[]>(() => {
    const devApp: BaseDApp[] = isDev && !isMockEnabled
      ? [{
          name: 'Demo App',
          url: `http://${__VITE_SERVER_IP__}:5174/`,
          featured: false,
          type: 'nimiq',
        }]
      : []
    return [...devApp, ...remoteApps.value.map(toBaseDApp)]
  })

  const isLoading = computed(() => baseDApps.value.length === 0)

  const recentlyViewedDApps = useStorageAsync<RecentDApp[]>(
    'recentlyViewedDApps',
    [],
    kv(),
    { writeDefaults: false },
  )

  // kv() so consent clears on logout alongside other user data.
  const deviceIdConsent = useStorageAsync<Record<string, true>>(
    'miniAppDeviceIdConsent',
    {},
    kv(),
    { writeDefaults: false },
  )

  function hasDeviceIdConsent(origin: string): boolean {
    return deviceIdConsent.value[origin] === true
  }

  function grantDeviceIdConsent(origin: string) {
    if (deviceIdConsent.value[origin])
      return
    deviceIdConsent.value = { ...deviceIdConsent.value, [origin]: true }
  }

  // In-memory description cache for recently-viewed dApps; keyed by raw stored url.
  const recentDescriptionCache = new Map<string, string | undefined>()

  function addRecentlyViewed(dapp: RecentDApp) {
    const current = recentlyViewedDApps.value
    const root = safeOrigin(dapp.url)
    const host = safeHostname(dapp.url)
    // Collapse to one row per hostname; store the app's root URL (APP-166).
    if (current[0]?.url === root)
      return
    const filtered = current.filter(d => safeHostname(d.url) !== host)
    filtered.unshift({ ...dapp, url: root })
    const next = filtered.slice(0, MAX_RECENT)
    for (const evicted of filtered.slice(MAX_RECENT))
      recentDescriptionCache.delete(evicted.url)
    recentlyViewedDApps.value = next
  }

  function removeRecentlyViewed(url: string) {
    const target = stripTrailingSlash(url)
    const current = recentlyViewedDApps.value
    const filtered: RecentDApp[] = []
    for (const d of current) {
      if (stripTrailingSlash(d.url) === target)
        recentDescriptionCache.delete(d.url)
      else
        filtered.push(d)
    }
    if (filtered.length === current.length)
      return
    recentlyViewedDApps.value = filtered
  }

  /**
   * Trusted = curated remote list OR recently-viewed history.
   * Path-scoped (not origin) so subpath phishing (`uniswap.org/swap?to=attacker`) still
   * triggers the warning prompt.
   */
  const trustedUrls = computed(() => {
    const set = new Set<string>()
    for (const r of remoteApps.value)
      set.add(stripTrailingSlash(r.url))
    for (const r of recentlyViewedDApps.value)
      set.add(stripTrailingSlash(r.url))
    return set
  })

  function isTrustedMiniAppUrl(url: string): boolean {
    if (!url)
      return false
    return trustedUrls.value.has(stripTrailingSlash(url))
  }

  /**
   * The single owner of icon precedence for any `url` (listed or not):
   * curated awesome logo -> lazily-resolved best site icon -> /favicon.ico.
   */
  function iconForUrl(url: string): string {
    const logo = remoteApps.value.find(r => stripTrailingSlash(r.url) === stripTrailingSlash(url))?.logo
    return logo || bestIcons.value[safeOrigin(url)] || getFaviconUrl(url)
  }

  /**
   * Lazily resolve & cache the best icon for a logo-less Mini App's own site (fetches the
   * site HTML). Call only for on-screen / opened apps — never eagerly for the whole list.
   * No-op when a curated awesome logo exists (source of truth), when already cached, or in-flight.
   */
  async function ensureBestIcon(url: string) {
    const origin = safeOrigin(url)
    if (!origin.startsWith('http') || bestIcons.value[origin] || bestIconInFlight.has(origin))
      return
    if (remoteApps.value.some(r => r.logo && safeOrigin(r.url) === origin))
      return

    bestIconInFlight.add(origin)
    try {
      const icon = await fetchBestIcon(url)
      if (icon)
        bestIcons.value = { ...bestIcons.value, [origin]: icon }
    }
    finally {
      bestIconInFlight.delete(origin)
    }
  }

  /**
   * Report-page URL for an awesome-list Mini App, or undefined when `url` isn't in the
   * curated remote list (only those carry the `slug`/`type` the report endpoint needs).
   */
  function getMiniAppReportUrl(url: string): string | undefined {
    const target = stripTrailingSlash(url)
    const remote = remoteApps.value.find(r => stripTrailingSlash(r.url) === target)
    return remote ? `${REPORT_BASE}/${remote.type}/${remote.slug}/report` : undefined
  }

  /** Top-N slice of recently-viewed for the marketplace UI. */
  const recentDAppsForDisplay = computed(() => recentlyViewedDApps.value.slice(0, MAX_RECENT_DISPLAY))

  // Each dApp gets its own computedAsync so descriptions load incrementally.
  // If the remote JSON provides a description, use it directly; otherwise fall back to live scrape.
  const descriptions = computed(() => baseDApps.value.map((dapp) => {
    const remote = remoteApps.value.find(r => r.url === dapp.url)
    if (remote?.description)
      return computed(() => remote.description)
    return computedAsync(() => fetchPageDescription(dapp.url), undefined)
  }))

  const allDApps = computed<DApp[]>(() =>
    baseDApps.value.map((dapp, i) => ({
      ...dapp,
      icon: iconForUrl(dapp.url),
      description: descriptions.value[i]?.value || undefined,
    })),
  )

  const featuredDApps = computed<DApp[]>(() =>
    allDApps.value.filter(d => d.featured),
  )

  const nonFeaturedDApps = computed<DApp[]>(() =>
    allDApps.value.filter(d => !d.featured),
  )

  // Backward compat alias used by search and recently-viewed lookups
  const popularDApps = allDApps

  // For searched URLs not in the app list
  const searchedDescriptions = reactive<Record<string, { status: SearchedDescriptionState, text?: string }>>({})

  async function ensureDescription(url: string) {
    if (!url || searchedDescriptions[url])
      return
    if (baseDApps.value.some(d => d.url === url))
      return

    searchedDescriptions[url] = { status: 'loading' }
    const desc = await fetchPageDescription(url)
    searchedDescriptions[url] = { status: 'done', text: desc || undefined }
  }

  const recentDAppsWithDescriptions = computedAsync<RecentDApp[]>(async () => {
    const recentDApps = recentDAppsForDisplay.value ?? []
    return Promise.all(recentDApps.map(async (dapp): Promise<RecentDApp> => {
      // First check if it's in allDApps to avoid unnecessary fetches, matching URLs with or without trailing slash
      const popular = allDApps.value.find(p =>
        p.url === dapp.url || stripTrailingSlash(p.url) === stripTrailingSlash(dapp.url),
      )
      if (popular)
        return { ...dapp, icon: popular.icon, description: popular.description, type: popular.type }
      if (!recentDescriptionCache.has(dapp.url))
        recentDescriptionCache.set(dapp.url, (await fetchPageDescription(dapp.url)) ?? undefined)
      return { ...dapp, icon: iconForUrl(dapp.url), description: recentDescriptionCache.get(dapp.url) }
    }))
  }, recentlyViewedDApps.value ?? [])

  // Used by useMiniAppSearch for fuzzy search indexing
  const descriptionTexts = computed(() => {
    const texts: Record<string, string> = {}
    for (const dapp of allDApps.value) {
      if (dapp.description)
        texts[dapp.url] = dapp.description
    }
    for (const [url, state] of Object.entries(searchedDescriptions)) {
      if (state.text)
        texts[url] = state.text
    }
    return texts
  })

  return {
    allDApps,
    featuredDApps,
    nonFeaturedDApps,
    popularDApps,
    isLoading,
    searchedDescriptions,
    descriptionTexts,
    ensureDescription,
    recentlyViewedDApps,
    recentDAppsWithDescriptions,
    addRecentlyViewed,
    removeRecentlyViewed,
    isTrustedMiniAppUrl,
    iconForUrl,
    ensureBestIcon,
    getMiniAppReportUrl,
    hasDeviceIdConsent,
    grantDeviceIdConsent,
  }
})
