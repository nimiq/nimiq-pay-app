import { CapacitorHttp } from '@capacitor/core'
import { computedAsync, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { isDev } from '@/lib'
import { fetchPageDescription, getFaviconUrl } from '@/lib/site-metadata'
import { kv, kvPreferences } from '@/stores/app'

const REMOTE_JSON_URL = 'https://raw.githubusercontent.com/nimiq/awesome/main/src/data/dist/nimiq-mini-apps.json'

export interface DApp {
  name: string
  url: string
  icon: string
  description?: string
  featured: boolean
}

interface BaseDApp {
  name: string
  url: string
  icon: string
  featured: boolean
}

interface RemoteMiniApp {
  name: string
  url: string
  type: string
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
    icon: remote.logo || getFaviconUrl(remote.url),
    featured: remote.featured,
  }
}

type SearchedDescriptionState = 'loading' | 'done'

interface RecentDApp {
  name: string
  url: string
  icon: string
  description?: string
}

const MAX_RECENT = 5

export const useMiniApps = defineStore('mini-apps', () => {
  // Cache remote apps list in Preferences (available pre-login, persists across launches)
  const cachedRemoteApps = useStorageAsync<RemoteMiniApp[]>(
    'miniAppsRemoteList',
    [],
    kvPreferences(),
    { writeDefaults: false },
  )

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
        const apps = [...(data.nimiq ?? []), ...(data.evm ?? [])]
        cachedRemoteApps.value = apps
        return apps
      }
    }
    catch { /* silent fallback to cache */ }
    return cachedRemoteApps.value ?? []
  }, [])

  const baseDApps = computed<BaseDApp[]>(() => {
    const devApp: BaseDApp[] = isDev
      ? [{
          name: 'Demo App',
          url: `http://${__VITE_SERVER_IP__}:5174/`,
          icon: getFaviconUrl('http://localhost:5174/'),
          featured: false,
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

  function addRecentlyViewed(dapp: RecentDApp) {
    const filtered = recentlyViewedDApps.value.filter(d => d.url !== dapp.url)
    filtered.unshift(dapp)
    recentlyViewedDApps.value = filtered.slice(0, MAX_RECENT)
  }

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

  const recentDAppsWithDescriptions = computedAsync(async () => {
    const recentDApps = recentlyViewedDApps.value ?? []
    return Promise.all(recentDApps.map(async (dapp) => {
      // First check if it's in allDApps to avoid unnecessary fetches, matching URLs with or without trailing slash
      const popular = allDApps.value.find(p =>
        p.url === dapp.url || p.url.replace(/\/$/, '') === dapp.url.replace(/\/$/, ''),
      )
      if (popular)
        return { ...dapp, description: popular.description }
      const description = await fetchPageDescription(dapp.url)
      return { ...dapp, description: description ?? undefined }
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
  }
})
