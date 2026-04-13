import { computedAsync, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { isDev } from '@/lib'
import { fetchPageDescription, getFaviconUrl } from '@/lib/site-metadata'
import { kv } from '@/stores/app'

export interface DApp {
  name: string
  url: string
  icon: string
  description?: string
}

interface BaseDApp {
  name: string
  url: string
  icon: string
}

const baseDApps: BaseDApp[] = [
  ...(isDev
    ? [{
        name: 'Demo App',
        url: `http://${__VITE_SERVER_IP__}:5174/`,
        icon: getFaviconUrl('http://localhost:5174/'),
      }]
    : []),
  {
    name: 'EVM Mini Wallet',
    url: 'https://evm-mini-wallet.vercel.app/',
    icon: getFaviconUrl('https://evm-mini-wallet.vercel.app/'),
  },
  {
    name: '1inch',
    url: 'https://1inch.com/',
    icon: getFaviconUrl('https://1inch.com/'),
  },
  {
    name: 'Uniswap',
    url: 'https://app.uniswap.org',
    icon: getFaviconUrl('https://app.uniswap.org'),
  },
  {
    name: 'Polymarket',
    url: 'https://polymarket.com',
    icon: getFaviconUrl('https://polymarket.com'),
  },
  {
    name: 'OpenSea',
    url: 'https://opensea.io',
    icon: getFaviconUrl('https://opensea.io'),
  },
  {
    name: 'Aave',
    url: 'https://app.aave.com',
    icon: getFaviconUrl('https://app.aave.com'),
  },
  {
    name: 'DappRadar',
    url: 'https://dappradar.com',
    icon: getFaviconUrl('https://dappradar.com'),
  },
]

type SearchedDescriptionState = 'loading' | 'done'

interface RecentDApp {
  name: string
  url: string
  icon: string
  description?: string
}

const MAX_RECENT = 5

export const useMiniApps = defineStore('mini-apps', () => {
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

  // Each dApp gets its own computedAsync so descriptions load incrementally
  const descriptions = baseDApps.map(dapp =>
    computedAsync(() => fetchPageDescription(dapp.url), undefined),
  )

  const popularDApps = computed<DApp[]>(() =>
    baseDApps.map((dapp, i) => ({
      ...dapp,
      description: descriptions[i].value || undefined,
    })),
  )

  // For searched URLs not in popularDApps
  const searchedDescriptions = reactive<Record<string, { status: SearchedDescriptionState, text?: string }>>({})

  async function ensureDescription(url: string) {
    if (!url || searchedDescriptions[url])
      return
    if (baseDApps.some(d => d.url === url))
      return

    searchedDescriptions[url] = { status: 'loading' }
    const desc = await fetchPageDescription(url)
    searchedDescriptions[url] = { status: 'done', text: desc || undefined }
  }

  const recentDAppsWithDescriptions = computedAsync(async () => {
    const recentDApps = recentlyViewedDApps.value ?? []
    return Promise.all(recentDApps.map(async (dapp) => {
      // First check if it's in popularDApps to avoid unnecessary fetches, matching URLs with or without trailing slash
      const popular = popularDApps.value.find(p =>
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
    for (const dapp of popularDApps.value) {
      if (dapp.description)
        texts[dapp.url] = dapp.description
    }
    for (const [url, state] of Object.entries(searchedDescriptions)) {
      if (state.text)
        texts[url] = state.text
    }
    return texts
  })

  return { popularDApps, searchedDescriptions, descriptionTexts, ensureDescription, recentlyViewedDApps, recentDAppsWithDescriptions, addRecentlyViewed }
})
