import type { WidgetData } from '@/lib/mini-app-widgets'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_HOME_WIDGETS, useMiniAppWidgets } from './mini-app-widgets'

const { fetchWidgetData, kvStore } = vi.hoisted(() => ({
  fetchWidgetData: vi.fn(),
  kvStore: new Map<string, string>(),
}))

vi.mock('@/lib', () => ({ isTestnet: false }))
vi.mock('@/lib/mini-app-widgets', () => ({ fetchWidgetData }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/stores/app', () => ({
  kv: () => ({
    getItem: async (key: string) => kvStore.get(key) ?? null,
    setItem: async (key: string, value: string) => { kvStore.set(key, value) },
    removeItem: async (key: string) => { kvStore.delete(key) },
  }),
  useApp: () => ({ language: 'en' }),
}))
vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({ localAddress: { toUserFriendlyAddress: () => 'NQ00 TEST' } }),
}))
vi.mock('@/stores/mini-apps', () => ({ stripTrailingSlash: (url: string) => url.endsWith('/') ? url.slice(0, -1) : url }))

const APP = { url: 'https://nimjar.vercel.app', name: 'NimJar' }
const manifest = { name: 'Staking', dataUrl: 'https://nimjar.vercel.app/api/widget' }
const data = (patch: Partial<WidgetData> = {}): WidgetData => ({ rows: [], tone: 'default', refresh: 300, ...patch })

async function setup() {
  const store = useMiniAppWidgets()
  await flushPromises() // let useStorageAsync read kv
  return store
}

beforeEach(() => {
  kvStore.clear()
  fetchWidgetData.mockReset()
  fetchWidgetData.mockResolvedValue(data({ value: { label: 'Staked', luna: '100' } }))
  vi.useFakeTimers({ now: new Date('2026-10-19T10:00:00Z'), toFake: ['Date'] })
  setActivePinia(createPinia())
})

afterEach(() => vi.useRealTimers())

describe('useMiniAppWidgets', () => {
  it('adds a widget and loads its data with the wallet address and network', async () => {
    const store = await setup()
    store.addWidget(APP, manifest)
    await flushPromises()
    expect(store.isOnHome('https://nimjar.vercel.app/')).toBe(true)
    expect(fetchWidgetData).toHaveBeenCalledWith(manifest, APP.url, { address: 'NQ00 TEST', network: 'mainnet', lang: 'en' })
    expect(store.widgets[0]?.data?.value).toEqual({ label: 'Staked', luna: '100' })
    expect(JSON.parse(kvStore.get('miniAppWidgets')!)).toHaveLength(1)
  })

  it('stops at the widget limit', async () => {
    const store = await setup()
    for (let i = 0; i <= MAX_HOME_WIDGETS; i++)
      store.addWidget({ url: `https://app${i}.example`, name: `App ${i}` }, manifest)
    expect(store.widgets).toHaveLength(MAX_HOME_WIDGETS)
    expect(store.canAddWidget).toBe(false)
  })

  it('only refreshes once the data is older than its refresh interval', async () => {
    const store = await setup()
    store.addWidget(APP, manifest)
    await flushPromises()
    fetchWidgetData.mockClear()

    vi.setSystemTime(Date.now() + 120_000)
    await store.refresh()
    expect(fetchWidgetData).not.toHaveBeenCalled()

    vi.setSystemTime(Date.now() + 200_000)
    await store.refresh()
    expect(fetchWidgetData).toHaveBeenCalledTimes(1)
  })

  it('refreshes once when a countdown runs out', async () => {
    const until = Math.floor(Date.now() / 1000) + 90
    fetchWidgetData.mockResolvedValue(data({ countdown: { label: 'Ready', until } }))
    const store = await setup()
    store.addWidget(APP, manifest)
    await flushPromises()
    fetchWidgetData.mockClear()

    vi.setSystemTime((until + 1) * 1000)
    await store.refresh()
    await store.refresh()
    expect(fetchWidgetData).toHaveBeenCalledTimes(1)
  })

  it('keeps the last good data when a refresh fails, and waits a minute before retrying', async () => {
    const store = await setup()
    store.addWidget(APP, manifest)
    await flushPromises()

    fetchWidgetData.mockRejectedValue(new Error('offline'))
    vi.setSystemTime(Date.now() + 400_000)
    await store.refresh()
    expect(store.widgets[0]?.data?.value?.luna).toBe('100')
    expect(store.widgets[0]?.failedAt).toBe(Date.now())

    fetchWidgetData.mockClear()
    vi.setSystemTime(Date.now() + 30_000)
    await store.refresh()
    expect(fetchWidgetData).not.toHaveBeenCalled()

    await store.refresh(undefined, true)
    expect(fetchWidgetData).toHaveBeenCalledTimes(1)
  })

  it('does not show data cached on the other network', async () => {
    kvStore.set('miniAppWidgets', JSON.stringify([{
      appUrl: APP.url,
      appName: APP.name,
      manifest,
      network: 'testnet',
      data: data({ value: { label: 'Staked', luna: '5' } }),
      fetchedAt: Date.now(),
    }]))
    const store = await setup()
    expect(store.widgets[0]?.data).toBeUndefined()
    await store.refresh()
    expect(fetchWidgetData).toHaveBeenCalledTimes(1)
  })

  it('drops the response of a widget removed while it loaded', async () => {
    let resolve!: (value: WidgetData) => void
    fetchWidgetData.mockReturnValue(new Promise((r) => { resolve = r }))
    const store = await setup()
    store.addWidget(APP, manifest)
    store.removeWidget(`${APP.url}/`)
    resolve(data())
    await flushPromises()
    expect(store.widgets).toHaveLength(0)
  })
})
