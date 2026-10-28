import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { normalizeMiniAppUrl, useMiniAppSearch } from './mini-app-search'

const apps = [
  { name: 'Uniswap', url: 'https://app.uniswap.org' },
  { name: 'OpenSea', url: 'https://opensea.io' },
  { name: 'DappRadar', url: 'https://dappradar.com' },
]

describe('normalizeMiniAppUrl', () => {
  it('returns normalized https URL when protocol is missing', () => {
    expect(normalizeMiniAppUrl('opensea.io')).toBe('https://opensea.io/')
  })

  it('keeps valid http/https URLs unchanged except normalization', () => {
    expect(normalizeMiniAppUrl('https://app.uniswap.org/swap')).toBe('https://app.uniswap.org/swap')
    expect(normalizeMiniAppUrl('http://localhost:5173')).toBe('http://localhost:5173/')
  })

  it('defaults to http for localhost and IP addresses', () => {
    expect(normalizeMiniAppUrl('localhost:5173')).toBe('http://localhost:5173/')
    expect(normalizeMiniAppUrl('192.168.1.1:8080')).toBe('http://192.168.1.1:8080/')
    expect(normalizeMiniAppUrl('127.0.0.1')).toBe('http://127.0.0.1/')
  })

  it('rejects cleartext http for public hosts', () => {
    expect(normalizeMiniAppUrl('http://example.com')).toBeUndefined()
    expect(normalizeMiniAppUrl('HTTP://app.uniswap.org/swap')).toBeUndefined()
    expect(normalizeMiniAppUrl('http://8.8.8.8:8080')).toBeUndefined()
    expect(normalizeMiniAppUrl('8.8.8.8')).toBeUndefined()
  })

  it('keeps http for LAN dev servers', () => {
    expect(normalizeMiniAppUrl('http://10.0.0.5:5174')).toBe('http://10.0.0.5:5174/')
    expect(normalizeMiniAppUrl('http://172.16.0.2:5173/')).toBe('http://172.16.0.2:5173/')
  })

  it('rejects http for LAN and localhost outside dev builds', () => {
    vi.stubEnv('DEV', false)
    try {
      expect(normalizeMiniAppUrl('http://192.168.1.2:8080')).toBeUndefined()
      expect(normalizeMiniAppUrl('192.168.1.2:8080')).toBeUndefined()
      expect(normalizeMiniAppUrl('http://localhost:5173')).toBeUndefined()
      expect(normalizeMiniAppUrl('https://app.uniswap.org/swap')).toBe('https://app.uniswap.org/swap')
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  it('returns undefined for non-URL inputs', () => {
    expect(normalizeMiniAppUrl('swap tokens')).toBeUndefined()
    expect(normalizeMiniAppUrl('')).toBeUndefined()
  })
})

describe('useMiniAppSearch', () => {
  it('returns all apps for empty query', () => {
    const searchQuery = ref('')
    const descriptions = ref<Record<string, string>>({})
    const { filteredApps } = useMiniAppSearch(searchQuery, ref(apps), descriptions)

    expect(filteredApps.value).toEqual(apps)
  })

  it('filters by app name and URL case-insensitively using fuse', async () => {
    const searchQuery = ref('uni')
    const descriptions = ref<Record<string, string>>({})
    const { filteredApps } = useMiniAppSearch(searchQuery, ref(apps), descriptions)

    await nextTick()
    expect(filteredApps.value).toEqual([apps[0]])

    searchQuery.value = 'OPENSEA.IO'
    await nextTick()
    expect(filteredApps.value).toEqual([apps[1]])
  })

  it('filters by fetched description when available', async () => {
    const searchQuery = ref('discover')
    const descriptions = ref<Record<string, string>>({
      'https://dappradar.com': 'Track dapps and discover trends',
    })
    const { filteredApps } = useMiniAppSearch(searchQuery, ref(apps), descriptions)

    await nextTick()
    expect(filteredApps.value).toEqual([apps[2]])
  })
})
