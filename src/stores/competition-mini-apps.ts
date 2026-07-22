import { CapacitorHttp } from '@capacitor/core'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getFaviconUrl } from '@/lib/site-metadata'
import { kvPreferences } from '@/stores/app'

export const COMPETITION_FEED_URL = 'https://nimiq.github.io/miniappscompetition-submissions/apps.json'

export type CompetitionPricing = 'Free' | 'Freemium' | 'Paid'

export interface CompetitionMiniApp {
  cycle: string
  name: string
  category: string
  tagline: string
  description: string
  pricing?: CompetitionPricing
  url: string
  repositoryUrl?: string
  videoUrl?: string
  icon: string
  thumbnail?: string
  screenshots: string[]
  githubLogin?: string
  xAccount?: string
  teamName?: string
  teamMembers: string[]
  submittedAt?: string
}

interface CachedCompetitionFeed {
  generatedAt?: string
  commit?: string
  apps: CompetitionMiniApp[]
}

const CYCLE_RE = /^cycle(\d+)$/
const PRICING = new Set<CompetitionPricing>(['Free', 'Freemium', 'Paid'])

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function httpUrl(value: unknown): string | undefined {
  const raw = stringValue(value)
  if (!raw)
    return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  }
  catch {
    return undefined
  }
}

function isoDate(value: unknown): string | undefined {
  const raw = stringValue(value)
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter((item): item is string => !!item) : []
}

function urlArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(httpUrl).filter((item): item is string => !!item) : []
}

function parseCompetitionApp(value: unknown): CompetitionMiniApp | undefined {
  if (!value || typeof value !== 'object')
    return undefined

  const item = value as Record<string, unknown>
  const cycle = stringValue(item.cycle)
  const name = stringValue(item.app_name)
  const category = stringValue(item.category)
  const tagline = stringValue(item.tagline)
  const description = stringValue(item.description)
  const url = httpUrl(item.url)

  if (!cycle || !CYCLE_RE.test(cycle) || !name || !category || !tagline || !description || !url)
    return undefined

  const pricing = stringValue(item.pricing)
  const icon = httpUrl(item.icon) ?? getFaviconUrl(url)

  return {
    cycle,
    name,
    category,
    tagline,
    description,
    pricing: pricing && PRICING.has(pricing as CompetitionPricing) ? pricing as CompetitionPricing : undefined,
    url,
    repositoryUrl: httpUrl(item.repo_url),
    videoUrl: httpUrl(item.video_url),
    icon,
    thumbnail: httpUrl(item.thumbnail),
    screenshots: urlArray(item.screenshots),
    githubLogin: stringValue(item.github_login),
    xAccount: stringValue(item.x_account)?.replace(/^@/, ''),
    teamName: stringValue(item.team_name),
    teamMembers: stringArray(item.team_members),
    submittedAt: isoDate(item.submitted_at),
  }
}

export function parseCompetitionFeed(value: unknown): CachedCompetitionFeed | undefined {
  if (!value || typeof value !== 'object')
    return undefined

  const response = value as Record<string, unknown>
  if (!Array.isArray(response.apps))
    return undefined

  const apps = response.apps.map(parseCompetitionApp).filter((app): app is CompetitionMiniApp => !!app)
  if (response.apps.length > 0 && apps.length === 0)
    return undefined

  return {
    generatedAt: isoDate(response.generated_at),
    commit: stringValue(response.commit),
    apps,
  }
}

export function competitionCycleNumber(cycle: string): number {
  return Number(cycle.match(CYCLE_RE)?.[1] ?? -1)
}

export const useCompetitionMiniApps = defineStore('competition-mini-apps', () => {
  const cachedFeed = useStorageAsync<CachedCompetitionFeed>(
    'miniAppsCompetitionFeed',
    { apps: [] },
    kvPreferences(),
    { writeDefaults: false },
  )
  const freshFeed = ref<CachedCompetitionFeed | null>(null)
  const isLoading = ref(false)
  const hasLoaded = ref(false)
  const hasRefreshError = ref(false)
  let loadingPromise: Promise<void> | undefined

  const feed = computed(() => freshFeed.value ?? cachedFeed.value)
  const apps = computed(() => feed.value.apps)
  const cycles = computed(() => [...new Set(apps.value.map(app => app.cycle))]
    .sort((a, b) => competitionCycleNumber(b) - competitionCycleNumber(a)))
  const newestCycle = computed(() => cycles.value[0])
  const newestCycleApps = computed(() => newestCycle.value
    ? apps.value.filter(app => app.cycle === newestCycle.value)
    : [])

  async function load() {
    if (loadingPromise)
      return loadingPromise

    loadingPromise = (async () => {
      isLoading.value = true
      hasRefreshError.value = false
      try {
        const response = await CapacitorHttp.get({
          url: COMPETITION_FEED_URL,
          headers: { Accept: 'application/json' },
          readTimeout: 10000,
          connectTimeout: 5000,
          responseType: 'json',
        })
        const parsed = response.status >= 200 && response.status < 300
          ? parseCompetitionFeed(response.data)
          : undefined
        if (!parsed)
          throw new Error(`Competition feed returned status ${response.status}`)

        freshFeed.value = parsed
        cachedFeed.value = parsed
      }
      catch {
        hasRefreshError.value = true
      }
      finally {
        isLoading.value = false
        hasLoaded.value = true
      }
    })()

    try {
      await loadingPromise
    }
    finally {
      loadingPromise = undefined
    }
  }

  return {
    apps,
    cycles,
    newestCycle,
    newestCycleApps,
    isLoading,
    hasLoaded,
    hasRefreshError,
    load,
  }
})
