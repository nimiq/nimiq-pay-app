import { describe, expect, it } from 'vitest'
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

  it('keeps the query string, so a widget can open a deep link', () => {
    expect(normalizeMiniAppUrl('https://swap.example/?swap=abc')).toBe('https://swap.example/?swap=abc')
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
