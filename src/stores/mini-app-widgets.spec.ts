import type { WidgetChain } from '@/lib/mini-app-widget-chain'
import type { WidgetDefinition, WidgetState } from '@/lib/mini-app-widgets'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'
import { sha256Hex } from '@/lib/crypto'
import { isMiniAppActive } from '@/lib/mini-app-active'
import { MINI_APP_FALLBACK_ICON } from '@/lib/mini-app-icons'
import { WIDGET_LIMITS } from '@/lib/mini-app-widgets'

const flags = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return reactive({ blockedWidgetOrigins: [] as string[], refreshBlockedWidgetOrigins: () => {} })
})
const app = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return reactive({ language: 'en' })
})
const logged = vi.hoisted(() => vi.fn())
const downloader = vi.hoisted(() => ({ available: true }))
const nimiqNetwork = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return reactive({ height: 1000 })
})
const { fetchWidgetFile, fetchWidgetImage, fetchWidgetRefresh, findWidgetFile, memory, miniApps, storedRead } = vi.hoisted(() => ({
  storedRead: { fetches: Promise.resolve() as Promise<unknown>, imageFetches: Promise.resolve() as Promise<unknown>, images: Promise.resolve() as Promise<unknown>, imageSaves: Promise.resolve() as Promise<unknown>, attemptSaves: Promise.resolve() as Promise<unknown>, reads: [] as string[], failingRead: '', failingWrite: '' },
  miniApps: { popularDApps: [{ name: 'Swap', url: 'https://swap.example' }], iconForUrl: (url: string) => `${url}icon.png` },
  fetchWidgetFile: vi.fn(),
  fetchWidgetRefresh: vi.fn(),
  fetchWidgetImage: vi.fn(),
  findWidgetFile: vi.fn(),
  memory: new Map<string, string>(),
}))

vi.mock('@/lib', () => ({ isTestnet: false, isDev: false }))
vi.mock('@/lib/mini-app-widget-sources', () => ({ fetchWidgetFile, fetchWidgetImage, fetchWidgetRefresh, findWidgetFile }))
vi.mock('@/stores/app', () => ({
  kv: () => ({
    getItem: async (key: string) => {
      if (key === 'miniAppWidgets' && key === storedRead.failingRead)
        throw new Error('read failed')
      if (key === 'miniAppWidgetFetches')
        await storedRead.fetches
      if (key === 'miniAppWidgetImageFetches')
        await storedRead.imageFetches
      if (key.startsWith('miniAppWidgetImage:')) {
        storedRead.reads.push(key)
        if (key === storedRead.failingRead)
          throw new Error('read failed')
        // As SQLite does, it answers with what was stored when it was asked.
        const saved = memory.get(key) ?? null
        await storedRead.images
        return saved
      }
      return memory.get(key) ?? null
    },
    setItem: async (key: string, value: string) => {
      if (key === storedRead.failingWrite)
        throw new Error('write failed')
      memory.set(key, value)
      if (key.startsWith('miniAppWidgetImage:'))
        await storedRead.imageSaves
      if (key === 'miniAppWidgetImageFailures')
        await storedRead.attemptSaves
    },
    removeItem: async (key: string) => { memory.delete(key) },
  }),
  useApp: () => app,
}))
vi.mock('@/stores/conn', () => ({
  useConn: () => ({ query: async (_statement: string, [like]: [string]) => [...memory.keys()].filter(key => key.startsWith(like.slice(0, -1))).map(key => ({ key })) }),
}))
vi.mock('@/stores/mini-apps', () => ({
  stripTrailingSlash: (url: string) => url.replace(/\/$/, ''),
  useMiniApps: () => miniApps,
}))
vi.mock('@/stores/nimiq-network', () => ({ useNimiqNetwork: () => nimiqNetwork }))
vi.mock('@/lib/mini-app-widget-download', () => ({ canDownloadWidgets: () => downloader.available }))
vi.mock('@/stores/feature-flags', () => ({ useFeatureFlags: () => flags }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))
vi.mock('@/stores/polygon-usdt', () => ({}))
vi.mock('@/stores/remote-signer', () => ({}))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: logged, error: vi.fn() }) }))

const NOW = Date.UTC(2026, 9, 19, 12)
const SCOPE = 'https://swap.example/'
const SUBFOLDER = 'https://name.github.io/my-app/'
const HASH = 'a'.repeat(64)
const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

function definition(extra: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return { id: 'swap', name: 'Swap status', sizes: ['medium', 'small'], content: { value: { text: 'Start a swap' }, tone: 'neutral', rows: [] }, translations: {}, ...extra }
}

function live(label: string, extra: Partial<WidgetState> = {}): WidgetState {
  return { content: { label, value: { text: '0.05 ETH' }, tone: 'attention', rows: [] }, next: [], ...extra }
}

function storedWidget(network: string, widgetId: string, scope = SCOPE) {
  return { scope, widgetId, network, size: 'medium', definition: definition({ id: widgetId }), definitionCheckedAt: NOW, failures: 0, updatedAt: NOW }
}

function fakeChain(overrides: Partial<WidgetChain> = {}): WidgetChain {
  return {
    nimiqHeight: () => 1000,
    nimiqTransaction: async () => 'pending',
    nimiqReceived: async () => false,
    polygonTransaction: async () => 'pending',
    accounts: () => ['NQ07 MINE', '0xmine'],
    ...overrides,
  }
}

function triggers(count: number, tag: number) {
  return Array.from({ length: count }, (_, i) => ({ on: { nimiqTx: `${tag}`.repeat(64).slice(0, 63) + i, status: 'confirmed' as const }, state: null }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// A store left running would react to the next test's changes, in its mocks and its database.
const running: { $dispose: () => void }[] = []

async function setup() {
  setActivePinia(createPinia())
  const { useMiniAppWidgets } = await import('./mini-app-widgets')
  const store = useMiniAppWidgets()
  running.push(store)
  await flushPromises()
  return store
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.setSystemTime(NOW)
  memory.clear()
  flags.blockedWidgetOrigins = []
  nimiqNetwork.height = 1000
  storedRead.imageFetches = storedRead.images = storedRead.imageSaves = Promise.resolve()
  downloader.available = true
  storedRead.attemptSaves = Promise.resolve()
  storedRead.reads = []
  storedRead.failingRead = storedRead.failingWrite = ''
  app.language = 'en'
  logged.mockClear()
  isMiniAppActive.value = false
  sessionStorage.clear()
  fetchWidgetFile.mockReset()
  // The hourly re-check runs in any test that ticks past an hour.
  fetchWidgetFile.mockResolvedValue({ ok: false, error: 'offline', transient: true })
  fetchWidgetRefresh.mockReset()
  findWidgetFile.mockReset()
})

afterEach(() => {
  running.splice(0).forEach(store => store.$dispose())
  vi.useRealTimers()
})

describe('adding, updating, removing', () => {
  it('adds a widget at its first size, named from the catalog, and refuses an eleventh', async () => {
    const store = await setup()
    expect(store.add(SCOPE, definition())).toBe(true)
    expect(store.views[0]).toMatchObject({ appName: 'Swap', appIcon: 'https://swap.example/icon.png', size: 'medium', value: { text: 'Start a swap' }, url: 'https://swap.example/' })
    for (let i = 1; i < 10; i++)
      store.add(`https://app${i}.example/`, definition())
    expect(store.views[1]!.appName).toBe('app1.example')
    expect(store.add('https://eleven.example/', definition())).toBe(false)
  })

  it('shows a declared name instead of the address, unless the catalog names the Mini App, and launches under the address', async () => {
    const store = await setup()
    store.add('https://swapspace.example/', definition({ appName: 'SwapSpace' }))
    store.add(SCOPE, definition({ id: 'listed', appName: 'Other' }))
    store.add('https://plain.example/', definition({ id: 'plain' }))
    expect(store.views.map(v => v.appName)).toEqual(['SwapSpace', 'Swap', 'plain.example'])
    expect(store.views[0]).toMatchObject({ appAddress: 'swapspace.example', launchTitle: 'swapspace.example' })
    expect(store.views[1]).toMatchObject({ appAddress: 'swap.example', launchTitle: 'Swap' })
    expect(store.views[2]).toMatchObject({ appAddress: undefined, launchTitle: 'plain.example' })
  })

  it('names a Mini App outside the catalog by host and folder', async () => {
    const store = await setup()
    store.add(SUBFOLDER, definition())
    expect(store.views[0]!.appName).toBe('name.github.io/my-app')
  })

  it('keeps two Mini Apps of one site apart, and removes both with the site on this network only', async () => {
    memory.set('miniAppWidgets', JSON.stringify([storedWidget('testnet', 'swap', SUBFOLDER)]))
    const store = await setup()
    store.add(SUBFOLDER, definition())
    store.add('https://name.github.io/other/', definition())
    expect(store.listForScope(SUBFOLDER)).toEqual(['swap'])
    expect(store.listForOrigin('https://name.github.io')).toEqual(['swap', 'swap'])
    store.removeForOrigin('https://name.github.io')
    expect(store.widgets).toHaveLength(0)
    await flushPromises()
    expect(JSON.parse(memory.get('miniAppWidgets')!)).toMatchObject([{ network: 'testnet', scope: SUBFOLDER }])
  })

  it('updates only widgets on Home, and null returns to the resting state', async () => {
    const store = await setup()
    expect(store.update(SCOPE, 'swap', live('Waiting'))).toBe(false)
    store.add(SCOPE, definition())
    expect(store.update(SCOPE, 'swap', live('Waiting'))).toBe(true)
    expect(store.views[0]!.label).toBe('Waiting')
    store.update(SCOPE, 'swap', null)
    expect(store.views[0]!.value).toEqual({ text: 'Start a swap' })
  })

  it('sets a size only among the supported sizes', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.setSize(SCOPE, 'swap', 'large')
    expect(store.views[0]!.size).toBe('medium')
    store.setSize(SCOPE, 'swap', 'small')
    expect(store.views[0]!.size).toBe('small')
  })

  it('only shows widgets of the current network', async () => {
    memory.set('miniAppWidgets', JSON.stringify([storedWidget('testnet', 'test-only'), storedWidget('mainnet', 'swap')]))
    const store = await setup()
    expect(store.views.map(view => view.widgetId)).toEqual(['swap'])
  })
})

describe('tick', () => {
  it('shows the resting state once expiresAt has passed', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { expiresAt: NOW - 1 }))
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(store.views[0]!.value).toEqual({ text: 'Start a swap' })
    expect(store.widgets[0]!.state).toBeUndefined()
  })

  it('fires the first matching trigger and follows it to the next state', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { next: [{ on: { at: NOW + 1000 }, state: live('Expired') }] }))
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(store.views[0]!.label).toBe('Waiting')
    await store.tick({ chain: fakeChain(), at: NOW + 1000 })
    expect(store.views[0]!.label).toBe('Expired')
  })

  it('checks chain triggers at most every 30 s and at most 10 lookups per check, starting one widget later each time', async () => {
    const store = await setup()
    const seen: string[] = []
    const nimiqTransaction = vi.fn(async (hash: string) => {
      seen.push(hash[0]!)
      return 'pending' as const
    })
    const chain = fakeChain({ nimiqTransaction })
    const scopes = ['https://one.example/', 'https://two.example/', 'https://three.example/']
    scopes.forEach((scope, i) => {
      store.add(scope, definition())
      store.update(scope, 'swap', live('Waiting', { next: triggers(5, i + 1) }))
    })
    await store.tick({ chain, at: NOW })
    expect(nimiqTransaction).toHaveBeenCalledTimes(10)
    expect([...new Set(seen)]).toEqual(['1', '2'])
    await store.tick({ chain, at: NOW + 10_000 })
    expect(nimiqTransaction).toHaveBeenCalledTimes(10)
    seen.length = 0
    await store.tick({ chain, at: NOW + 30_000 })
    expect([...new Set(seen)]).toEqual(['2', '3'])
    seen.length = 0
    await store.tick({ chain, at: NOW + 60_000 })
    expect([...new Set(seen)]).toEqual(['3', '1'])
  })

  it('checks every payment trigger of two widgets with 8 each within three chain checks', async () => {
    const store = await setup()
    const seen = new Set<string>()
    const nimiqTransaction = async (hash: string) => {
      seen.add(hash)
      return 'pending' as const
    }
    const chain = fakeChain({ nimiqTransaction })
    for (const [i, scope] of ['https://one.example/', 'https://two.example/'].entries()) {
      store.add(scope, definition())
      store.update(scope, 'swap', live('Waiting', { next: triggers(8, i + 1) }))
    }
    for (let i = 0; i < 3; i++)
      await store.tick({ chain, at: NOW + i * 30_000 })
    expect([...seen].sort()).toEqual([...triggers(8, 1), ...triggers(8, 2)].map(t => t.on.nimiqTx).sort())
  })

  it('evaluates no trigger of a state whose payment trigger cannot be looked up, so a time trigger never wins first', async () => {
    const store = await setup()
    const chain = fakeChain()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { next: triggers(8, 1) }))
    store.add('https://other.example/', definition())
    store.update('https://other.example/', 'swap', live('Waiting', { next: [{ on: { at: NOW }, state: live('Expired') }, ...triggers(3, 2)] }))
    await store.tick({ chain, at: NOW })
    expect(store.views[1]!.label).toBe('Waiting')
    await store.tick({ chain, at: NOW + 10_000 })
    expect(store.views[1]!.label).toBe('Waiting')
    await store.tick({ chain, at: NOW + 30_000 })
    expect(store.views[1]!.label).toBe('Expired')
  })

  it('holds back every later trigger while a payment lookup has no answer', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { next: [
      { on: { nimiqPayment: { to: ADDRESS, minValue: '1', since: NOW - 3600_000 } }, state: live('Paid') },
      { on: { at: NOW - 1 }, state: live('Expired') },
    ] }))
    await store.tick({ chain: fakeChain({ nimiqReceived: async () => undefined }), at: NOW })
    expect(store.views[0]!.label).toBe('Waiting')
    await store.tick({ chain: fakeChain({ nimiqReceived: () => Promise.reject(new Error('peer gone')) }), at: NOW + 30_000 })
    expect(store.views[0]!.label).toBe('Waiting')
    await store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    expect(store.views[0]!.label).toBe('Expired')
  })

  it('checks a reached block height on every tick, ahead of a later time trigger', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Locked', { next: [
      { on: { nimiqHeight: 1005 }, state: live('Unlocked') },
      { on: { at: NOW + 15_000 }, state: live('Expired') },
    ] }))
    await store.tick({ chain: fakeChain({ nimiqHeight: () => 1000 }), at: NOW })
    await store.tick({ chain: fakeChain({ nimiqHeight: () => 1010 }), at: NOW + 15_000 })
    expect(store.views[0]!.label).toBe('Unlocked')
  })

  it('waits for the head before any later trigger when it is not known yet', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Locked', { next: [
      { on: { nimiqHeight: 1005 }, state: live('Unlocked') },
      { on: { at: NOW }, state: live('Expired') },
    ] }))
    await store.tick({ chain: fakeChain({ nimiqHeight: () => undefined }), at: NOW })
    expect(store.views[0]!.label).toBe('Locked')
  })

  it('expires a widget from its current state, not from one replaced during an earlier widget\'s lookup', async () => {
    const store = await setup()
    store.add('https://one.example/', definition())
    store.update('https://one.example/', 'swap', live('W1', { next: triggers(1, 1) }))
    store.add('https://two.example/', definition())
    store.update('https://two.example/', 'swap', live('Old quote', { expiresAt: NOW + 1000 }))
    const slow = deferred<'pending'>()
    const nimiqTransaction = vi.fn(() => slow.promise)
    const running = store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW + 1000 })
    await vi.waitFor(() => expect(nimiqTransaction).toHaveBeenCalled())
    store.update('https://two.example/', 'swap', live('New quote'))
    slow.resolve('pending')
    await running
    expect(store.views[1]!.label).toBe('New quote')
  })

  it('does not ask the Mini App again within 60 s of a refresh whose answer was dropped', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 60 } }))
    const answer = deferred<{ ok: true, value: WidgetState }>()
    fetchWidgetRefresh.mockReturnValue(answer.promise)
    const running = store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    await vi.waitFor(() => expect(fetchWidgetRefresh).toHaveBeenCalled())
    store.update(SCOPE, 'swap', live('Pushed'))
    answer.resolve({ ok: true, value: live('Old answer', { refresh: { url: 'https://swap.example/w', every: 60 } }) })
    await running
    store.update(SCOPE, 'swap', live('Pushed again', { refresh: { url: 'https://swap.example/w', every: 3600 } }))
    await store.tick({ chain: fakeChain(), at: NOW + 65_000, force: true })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
  })

  it('runs the queued forced tick with the options of the last forced call', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { next: triggers(1, 1) }))
    const used: string[] = []
    const named = (name: string, lookup?: Promise<'pending'>) => fakeChain({
      nimiqTransaction: async () => {
        used.push(name)
        return lookup ?? 'pending'
      },
    })
    const slow = deferred<'pending'>()
    const running = store.tick({ chain: named('first', slow.promise), at: NOW })
    const f1 = store.tick({ chain: named('f1'), force: true, at: NOW + 31_000 })
    const f2 = store.tick({ chain: named('f2'), force: true, at: NOW + 62_000 })
    slow.resolve('pending')
    await Promise.all([running, f1, f2])
    expect(used).toEqual(['first', 'f2'])
  })

  it('tries triggers in order, one step per tick', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    const nested = live('First', { next: [{ on: { at: NOW + 1000 }, state: live('Nested') }] })
    store.update(SCOPE, 'swap', live('Waiting', { next: [{ on: { at: NOW + 5000 }, state: live('Late') }, { on: { at: NOW }, state: nested }, { on: { at: NOW }, state: live('Second') }] }))
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(store.views[0]!.label).toBe('First')
    await store.tick({ chain: fakeChain(), at: NOW + 1000 })
    expect(store.views[0]!.label).toBe('Nested')
  })

  it('never fires a trigger whose lookup fails', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { next: [{ on: { nimiqTx: HASH, status: 'confirmed' }, state: live('Paid') }] }))
    await store.tick({ chain: fakeChain({ nimiqTransaction: () => Promise.reject(new Error('peer gone')) }), at: NOW })
    expect(store.views[0]!.label).toBe('Waiting')
  })

  it('refreshes when due, replaces the state, and stops when the answer has no refresh', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 60 } }))
    fetchWidgetRefresh.mockResolvedValueOnce({ ok: true, value: live('Exchanging') })
    await store.tick({ chain: fakeChain(), at: NOW + 59_000 })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    await store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledWith({ url: 'https://swap.example/w', every: 60 }, { lang: 'en', network: 'mainnet' }, SCOPE, NOW + 60_000, { token: undefined, accounts: [] })
    expect(store.views[0]!.label).toBe('Exchanging')
    await store.tick({ chain: fakeChain(), at: NOW + 600_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
  })

  it('backs off after failures and marks the widget stale after three', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 60 } }))
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'down', transient: true })
    await store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    await store.tick({ chain: fakeChain(), at: NOW + 61_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
    await store.tick({ chain: fakeChain(), at: NOW + 180_000 })
    expect(store.views[0]!.staleSince).toBeUndefined()
    await store.tick({ chain: fakeChain(), at: NOW + 420_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(3)
    expect(store.views[0]!.staleSince).toBe(NOW)
    expect(store.views[0]!.label).toBe('Waiting')
  })

  it('refreshes once when a countdown runs out', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    const state = live('Waiting', { refresh: { url: 'https://swap.example/w', every: 3600 } })
    state.content.countdown = { label: 'Deposit window', until: NOW + 5000 }
    store.update(SCOPE, 'swap', state)
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'down', transient: true })
    await store.tick({ chain: fakeChain(), at: NOW + 5000 })
    await store.tick({ chain: fakeChain(), at: NOW + 20_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
  })

  it('asks at most once a minute when every answer carries a countdown that ends a second later', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    const answer = (at: number) => {
      const state = live('Waiting', { refresh: { url: 'https://swap.example/w', every: 3600 } })
      state.content.countdown = { label: 'Deposit window', until: at + 1000 }
      return state
    }
    store.update(SCOPE, 'swap', answer(NOW))
    fetchWidgetRefresh.mockImplementation(async (_refresh, _params, _scope, at: number) => ({ ok: true, value: answer(at) }))
    for (const seconds of [5, 20, 35, 50, 65])
      await store.tick({ chain: fakeChain(), at: NOW + seconds * 1000 })
    expect(fetchWidgetRefresh.mock.calls.map(call => call[3])).toEqual([NOW + 5000, NOW + 65_000])
  })

  it('keeps a widget when the file turns invalid, and removes it when the file drops it', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    fetchWidgetFile.mockResolvedValueOnce({ ok: false, error: 'not JSON', transient: false })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    expect(fetchWidgetFile).toHaveBeenCalledWith(SCOPE, NOW + 25 * 3600_000)
    expect(store.widgets).toHaveLength(1)
    fetchWidgetFile.mockResolvedValueOnce({ ok: true, value: { widgets: [definition({ id: 'other' })] } })
    await store.tick({ chain: fakeChain(), at: NOW + 50 * 3600_000 })
    expect(store.widgets).toHaveLength(0)
  })

  it('runs a forced tick asked for during a running tick right after it, with its own options, and resolves when done', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 3600 }, next: [{ on: { nimiqTx: HASH, status: 'confirmed' }, state: null }] }))
    const refresh = deferred<{ ok: false, error: string, transient: true }>()
    fetchWidgetRefresh.mockReturnValue(refresh.promise)
    const slow = deferred<void>()
    const nimiqTransaction = vi.fn(async () => {
      await slow.promise
      return 'pending' as const
    })
    const running = store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW })
    let forcedDone = false
    const forced = store.tick({ chain: fakeChain(), force: true }).then(() => {
      forcedDone = true
    })
    await flushPromises()
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    slow.resolve()
    await running
    await flushPromises()
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
    expect(forcedDone).toBe(false)
    refresh.resolve({ ok: false, error: 'down', transient: true })
    await forced
    expect(forcedDone).toBe(true)
  })

  it('lets a forced tick skip the interval but never refreshes within 60 s or checks the chain within 30 s', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 3600 }, next: triggers(1, 1) }))
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'down', transient: true })
    const nimiqTransaction = vi.fn(async () => 'pending' as const)
    const chain = fakeChain({ nimiqTransaction })
    await store.tick({ chain, at: NOW, force: true })
    await store.tick({ chain, at: NOW + 20_000, force: true })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
    expect(nimiqTransaction).toHaveBeenCalledTimes(1)
    await store.tick({ chain, at: NOW + 60_000, force: true })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(2)
    expect(nimiqTransaction).toHaveBeenCalledTimes(2)
  })

  it('does not let a refresh answer replace a state pushed while it was in flight', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 60 } }))
    const answer = deferred<{ ok: true, value: WidgetState }>()
    fetchWidgetRefresh.mockReturnValue(answer.promise)
    const running = store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    await vi.waitFor(() => expect(fetchWidgetRefresh).toHaveBeenCalled())
    store.update(SCOPE, 'swap', live('Pushed'))
    answer.resolve({ ok: true, value: live('Old answer') })
    await running
    expect(store.views[0]!.label).toBe('Pushed')
  })

  it('does not count a failed refresh against a state pushed while it was in flight', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 60 } }))
    const answer = deferred<{ ok: false, error: string, transient: true }>()
    fetchWidgetRefresh.mockReturnValue(answer.promise)
    const running = store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    await vi.waitFor(() => expect(fetchWidgetRefresh).toHaveBeenCalled())
    store.update(SCOPE, 'swap', live('Pushed', { refresh: { url: 'https://swap.example/w', every: 60 } }))
    answer.resolve({ ok: false, error: 'down', transient: true })
    await running
    expect(store.widgets[0]!.failures).toBe(0)
  })

  it('does not let a trigger fire over a state pushed while its lookup was running', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { next: [{ on: { nimiqTx: HASH, status: 'confirmed' }, state: live('Paid') }] }))
    const lookup = deferred<'confirmed'>()
    const nimiqTransaction = vi.fn(() => lookup.promise)
    const running = store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW })
    await vi.waitFor(() => expect(nimiqTransaction).toHaveBeenCalled())
    store.update(SCOPE, 'swap', live('Pushed'))
    lookup.resolve('confirmed')
    await running
    expect(store.views[0]!.label).toBe('Pushed')
  })

  it('resets failures and staleness when a refresh succeeds again', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: 'https://swap.example/w', every: 60 } }))
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'down', transient: true })
    for (const seconds of [60, 180, 420])
      await store.tick({ chain: fakeChain(), at: NOW + seconds * 1000 })
    expect(store.views[0]!.staleSince).toBe(NOW)
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: live('Back') })
    await store.tick({ chain: fakeChain(), at: NOW + 900_000 })
    expect(store.views[0]!.label).toBe('Back')
    expect(store.views[0]!.staleSince).toBeUndefined()
    expect(store.widgets[0]!.failures).toBe(0)
  })

  it('reads each widget file once per tick when rechecking definitions', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.add(SCOPE, definition({ id: 'second' }))
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [definition(), definition({ id: 'second' })] } })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    expect(fetchWidgetFile).toHaveBeenCalledTimes(1)
    expect(store.widgets).toHaveLength(2)
  })

  it('removes every widget of a scope when its valid file declares none', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.add(SCOPE, definition({ id: 'second' }))
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [] } })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    expect(store.widgets).toHaveLength(0)
  })

  it('counts a block-height countdown from the head seen at the last tick', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { content: { label: 'Waiting', value: { text: 'x' }, tone: 'neutral', rows: [], countdown: { label: 'Block', untilNimiqHeight: 1060 } } }))
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(store.views[0]!.countdown).toEqual({ label: 'Block', until: NOW + 60_000 })
    nimiqNetwork.height = 1030
    store.setSize(SCOPE, 'swap', 'small')
    expect(store.views[0]!.countdown).toEqual({ label: 'Block', until: NOW + 60_000 })
  })
})

describe('removing and previewing', () => {
  it('removes one widget and leaves the others', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.add(SCOPE, definition({ id: 'other' }))
    store.remove(SCOPE, 'swap')
    expect(store.listForScope(SCOPE)).toEqual(['other'])
    expect(store.isOnHome(SCOPE, 'swap')).toBe(false)
  })

  it('is ready once the stored widgets have been read', async () => {
    expect((await setup()).ready).toBe(true)
  })

  it('builds a preview view of a definition without adding it', async () => {
    const store = await setup()
    expect(store.previewView(SCOPE, definition())).toMatchObject({ appName: 'Swap', size: 'medium', value: { text: 'Start a swap' }, key: `${SCOPE}#swap` })
    expect(store.widgets).toHaveLength(0)
  })
})

describe('a widget\'s demo', () => {
  const demo: WidgetDefinition['demo'] = { label: 'Waiting', value: { amount: '0.05', currency: 'ETH' }, tone: 'attention', rows: [], countdown: { label: 'Deposit window', in: 1740 } }

  it('is what the gallery shows, its countdown frozen', async () => {
    const store = await setup()
    expect(store.previewView(SCOPE, definition({ demo }))).toMatchObject({
      label: 'Waiting',
      tone: 'attention',
      value: { amount: '0.05', currency: 'ETH' },
      countdown: { label: 'Deposit window', left: 1_740_000 },
    })
  })

  it('never reaches Home: an added widget starts on its resting state', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ demo }))
    expect(store.views[0]).toMatchObject({ value: { text: 'Start a swap' }, tone: 'neutral' })
    expect(store.views[0]!.countdown).toBeUndefined()
  })
})

describe('what a refresh server answers', () => {
  const NEXT = NOW + 120_000
  const refreshing = () => definition({ refresh: { url: `${SCOPE}w`, every: 60 } })
  const answered = async (result: object) => {
    const store = await setup()
    store.add(SCOPE, refreshing())
    store.setToken(SCOPE, 'swap', 'token')
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'no', transient: false, ...result })
    await store.tick({ chain: fakeChain(), at: NOW })
    fetchWidgetRefresh.mockClear()
    return store
  }

  it('410: says it is no longer available, stops refreshing, and can still be removed', async () => {
    const store = await answered({ status: 410 })
    expect(store.views[0]).toMatchObject({ value: { text: 'No longer available' }, tone: 'neutral' })
    expect(store.views[0]!.staleSince).toBeUndefined()
    await store.tick({ chain: fakeChain(), at: NEXT, force: true })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    store.remove(SCOPE, 'swap')
    expect(store.widgets).toHaveLength(0)
  })

  it('410: comes back when the Mini App sends a state', async () => {
    const store = await answered({ status: 410 })
    store.update(SCOPE, 'swap', live('Back'))
    expect(store.views[0]).toMatchObject({ label: 'Back' })
  })

  it.each([[401], [403]])('%i: keeps the content, asks to reconnect, and pauses until a new token', async (status) => {
    const store = await answered({ status })
    expect(store.views[0]).toMatchObject({ value: { text: 'Start a swap' }, reconnect: true })
    await store.tick({ chain: fakeChain(), at: NEXT, force: true })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    expect(await store.setToken(SCOPE, 'swap', 'fresh')).toBe(true)
    expect(store.views[0]!.reconnect).toBe(false)
    await store.tick({ chain: fakeChain(), at: NEXT + 60_000 })
    expect(fetchWidgetRefresh.mock.calls[0]![4].token).toBe('fresh')
  })

  const heldRefresh = async (act: (store: Awaited<ReturnType<typeof setup>>) => void) => {
    const store = await setup()
    store.add(SCOPE, refreshing())
    store.setToken(SCOPE, 'swap', 'old')
    let answer = (_result: object) => {}
    fetchWidgetRefresh.mockReturnValue(new Promise((resolve) => {
      answer = resolve
    }))
    const tick = store.tick({ chain: fakeChain(), at: NOW })
    await flushPromises()
    act(store)
    answer({ ok: false, error: 'expired', transient: false, status: 401 })
    await tick
    return store
  }

  it('ignores an old request\'s answer after the widget was removed, added again and updated', async () => {
    const polling = { content: { value: { text: 'Polling' }, tone: 'neutral', rows: [] }, next: [], refresh: { url: `${SCOPE}w`, every: 60 } } as never
    const store = await setup()
    store.add(SCOPE, refreshing())
    store.setToken(SCOPE, 'swap', 'old')
    store.update(SCOPE, 'swap', polling)
    let answer = (_result: object) => {}
    fetchWidgetRefresh.mockReturnValue(new Promise((resolve) => {
      answer = resolve
    }))
    const tick = store.tick({ chain: fakeChain(), at: NOW + 120_000 })
    await flushPromises()
    expect(fetchWidgetRefresh).toHaveBeenCalled()
    store.remove(SCOPE, 'swap')
    store.add(SCOPE, refreshing())
    store.setToken(SCOPE, 'swap', 'new')
    store.update(SCOPE, 'swap', { content: { value: { text: 'Fresh' }, tone: 'neutral', rows: [] }, next: [] } as never)
    answer({ ok: false, error: 'expired', transient: false, status: 401 })
    await tick
    expect(store.views[0]!.reconnect).toBe(false)
  })

  it('ignores an old request\'s 401 once a new token is in', async () => {
    const store = await heldRefresh(s => s.setToken(SCOPE, 'swap', 'fresh'))
    expect(store.views[0]!.reconnect).toBe(false)
    expect(store.widgets[0]!.failures).toBe(0)
  })

  it('ignores an old request\'s 401 once the Mini App has sent a state, even the resting one', async () => {
    const store = await heldRefresh(s => s.update(SCOPE, 'swap', null))
    expect(store.views[0]!.reconnect).toBe(false)
  })

  it('sends the stored token with every refresh, and none after it is cleared', async () => {
    const store = await setup()
    store.add(SCOPE, refreshing())
    store.setToken(SCOPE, 'swap', 'secret')
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(fetchWidgetRefresh.mock.calls[0]![4].token).toBe('secret')
    store.setToken(SCOPE, 'swap', null)
    await store.tick({ chain: fakeChain(), at: NOW + 120_000 })
    expect(fetchWidgetRefresh.mock.calls[1]![4].token).toBeUndefined()
  })

  it('answers false for a token on a widget not on Home', async () => {
    expect(await (await setup()).setToken(SCOPE, 'swap', 'x')).toBe(false)
  })

  it('treats a 401 without a token as an ordinary failure, since there is nothing to reconnect', async () => {
    const store = await setup()
    store.add(SCOPE, refreshing())
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'no', transient: false, status: 403 })
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(store.views[0]!.reconnect).toBe(false)
    expect(store.widgets[0]!.failures).toBe(1)
    fetchWidgetRefresh.mockClear()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    await store.tick({ chain: fakeChain(), at: NOW + 3_600_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalled()
  })

  it('holds to Retry-After for a pull to refresh too', async () => {
    const store = await answered({ status: 429, retryAfterMs: 3_600_000 })
    await store.tick({ chain: fakeChain(), at: NOW + 120_000, force: true })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    await store.tick({ chain: fakeChain(), at: NOW + 3_600_000, force: true })
    expect(fetchWidgetRefresh).toHaveBeenCalled()
  })

  it('still re-reads the file of a widget gone with 410, so the site can withdraw it', async () => {
    const store = await answered({ status: 410 })
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [] } })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3_600_000 })
    expect(store.widgets).toHaveLength(0)
  })

  it('does not say "open to reconnect" on a blocked card, which opens nothing', async () => {
    const store = await answered({ status: 401 })
    flags.blockedWidgetOrigins = ['https://swap.example']
    expect(store.views[0]!.reconnect).toBe(false)
  })

  it('429: waits at least Retry-After, even past the usual back-off', async () => {
    const store = await answered({ status: 429, retryAfterMs: 3_600_000 })
    expect(store.widgets[0]!.refreshDueAt).toBe(NOW + 3_600_000)
  })

  it('caps Retry-After at a day, so a server cannot stop a widget for good', async () => {
    const store = await answered({ status: 503, retryAfterMs: 90 * 24 * 3_600_000 })
    expect(store.widgets[0]!.refreshDueAt).toBe(NOW + 24 * 3_600_000)
  })

  it('keeps the usual back-off when Retry-After is shorter', async () => {
    const store = await answered({ status: 503, retryAfterMs: 1000 })
    expect(store.widgets[0]!.refreshDueAt).toBe(NOW + 120_000)
  })

  it('looks up nothing for a widget that is no longer available', async () => {
    const store = await setup()
    const nimiqTransaction = vi.fn(async () => 'pending' as const)
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: `${SCOPE}w`, every: 60 }, next: triggers(1, 1) }))
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'gone', transient: false, status: 410 })
    await store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW + 60_000 })
    expect(nimiqTransaction).toHaveBeenCalledTimes(1)
    await store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW + 120_000 })
    expect(nimiqTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('permissions', () => {
  const sharing = definition({ permissions: ['addresses'], refresh: { url: `${SCOPE}w`, every: 60 } })
  const refreshOnce = async (store: Awaited<ReturnType<typeof setup>>, at = NOW) => {
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    await store.tick({ chain: fakeChain(), at })
    return fetchWidgetRefresh.mock.calls.at(-1)![4].accounts
  }

  it('sends addresses only when the user granted them at install, whatever the file asks', async () => {
    const store = await setup()
    store.add(SCOPE, sharing)
    expect(await refreshOnce(store)).toEqual([])
    expect(store.views[0]!.sharesAddresses).toBe(false)
    expect(store.missingPermissions(SCOPE, 'swap')).toEqual(['addresses'])
  })

  it('reads the addresses at each refresh, once granted', async () => {
    const store = await setup()
    store.add(SCOPE, sharing, ['addresses'])
    expect(await refreshOnce(store)).toEqual(['NQ07 MINE', '0xmine'])
    expect(store.views[0]!.sharesAddresses).toBe(true)
    expect(store.missingPermissions(SCOPE, 'swap')).toEqual([])
  })

  it('stops at once when revoked, and removing the widget takes the grant with it', async () => {
    const store = await setup()
    store.add(SCOPE, sharing, ['addresses'])
    store.revokePermissions(SCOPE, 'swap')
    expect(await refreshOnce(store)).toEqual([])
    store.remove(SCOPE, 'swap')
    store.add(SCOPE, sharing)
    expect(store.views[0]!.sharesAddresses).toBe(false)
  })

  it('grants what the Mini App asks for after install', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 } }))
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [sharing] } })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    expect(store.missingPermissions(SCOPE, 'swap')).toEqual(['addresses'])
    expect(fetchWidgetRefresh.mock.calls.at(-1)![4].accounts).toEqual([])
    store.grantPermissions(SCOPE, 'swap', ['addresses'])
    expect(store.missingPermissions(SCOPE, 'swap')).toEqual([])
    expect(store.views[0]!.sharesAddresses).toBe(true)
  })

  it('drops a grant the file no longer asks for', async () => {
    const store = await setup()
    store.add(SCOPE, sharing, ['addresses'])
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [definition({ refresh: { url: `${SCOPE}w`, every: 60 } })] } })
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    expect(store.views[0]!.sharesAddresses).toBe(false)
  })

  it('grants only what the file asks for', async () => {
    const store = await setup()
    store.add(SCOPE, definition(), ['addresses'])
    expect(store.views[0]!.sharesAddresses).toBe(false)
  })

  it('does not count a permission the user stopped as waiting, though it can be given again', async () => {
    const store = await setup()
    store.add(SCOPE, sharing, ['addresses'])
    store.revokePermissions(SCOPE, 'swap')
    expect(store.views[0]!.pendingPermissions).toBe(false)
    expect(store.views[0]!.stoppedPermissions).toBe(true)
    expect(store.missingPermissions(SCOPE, 'swap')).toEqual([])
    expect(store.askablePermissions(SCOPE, 'swap')).toEqual(['addresses'])
    store.grantPermissions(SCOPE, 'swap', ['addresses'])
    expect(store.views[0]!.stoppedPermissions).toBe(false)
    expect(store.views[0]!.sharesAddresses).toBe(true)
  })

  it('says when a permission waits for the user', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 } }))
    expect(store.views[0]!.pendingPermissions).toBe(false)
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [sharing] } })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    expect(store.views[0]!.pendingPermissions).toBe(true)
  })

  it('does not offer revoking on a blocked card', async () => {
    const store = await setup()
    store.add(SCOPE, sharing, ['addresses'])
    flags.blockedWidgetOrigins = ['https://swap.example']
    expect(store.views[0]!.sharesAddresses).toBe(false)
  })
})

describe('images', () => {
  const OLD = 'a'.repeat(64)
  const NEW = 'b'.repeat(64)
  const url = (name: string) => `${SCOPE}${name}.png`
  const pictured = (images: Record<string, { url: string, sha256: string }>, id = 'swap') => definition({ id, images, content: { value: { text: 'x' }, tone: 'neutral', rows: [], background: { image: 'hero' } } })
  const old = pictured({ hero: { url: url('old'), sha256: OLD } })
  const next = pictured({ hero: { url: url('new'), sha256: NEW } })
  const IMAGE_KEY = (hash: string, origin = 'https://swap.example') => `miniAppWidgetImage:${origin} ${hash}`
  const drawn = (hash: string) => ({ kind: 'image', src: `data:image/png;base64,${hash}` })
  const image = (name: string, sha256: string) => ({ url: url(name), sha256 })
  const asking = (name: string, sha256: string) => ({ ...image(name, sha256), sendToken: true as const })
  const tokensSent = () => fetchWidgetImage.mock.calls.map(([asked, , token]) => [asked.url, token])
  const showing = (background: object, extra: Partial<WidgetState> = {}) => ({ content: { value: { text: 'y' }, tone: 'neutral', rows: [], background }, next: [], ...extra }) as WidgetState
  const settle = async () => {
    for (let i = 0; i < 3; i++)
      await flushPromises()
  }
  const tickAt = async (store: Awaited<ReturnType<typeof setup>>, at: number, force = false) => {
    vi.setSystemTime(at)
    await store.tick({ chain: fakeChain(), at, force })
    await settle()
  }

  beforeEach(() => {
    fetchWidgetImage.mockReset()
    fetchWidgetImage.mockImplementation(async (image: { sha256: string }) => ({ ok: true, value: `data:image/png;base64,${image.sha256}` }))
    memory.clear()
  })

  const recheck = async (store: Awaited<ReturnType<typeof setup>>, file: WidgetDefinition) => {
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [file] } })
    await tickAt(store, NOW + 2 * 3600_000)
  }

  it('downloads a widget\'s images when added, stores them, and draws the one its state picks', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledWith({ url: url('old'), sha256: OLD }, SCOPE, undefined, undefined)
    expect(memory.get(IMAGE_KEY(OLD))).toBe(`data:image/png;base64,${OLD}`)
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('keeps the card plain for an image that failed', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'hash', transient: false })
    store.add(SCOPE, old)
    await flushPromises()
    expect(store.views[0]!.background).toBeUndefined()
    expect(memory.has(IMAGE_KEY(OLD))).toBe(false)
  })

  it('reads stored images on the next start, without contacting the site', async () => {
    const first = await setup()
    first.add(SCOPE, old)
    await flushPromises()
    await flushPromises()
    fetchWidgetImage.mockClear()
    const second = await setup()
    await flushPromises()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    expect(second.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('swaps to a changed image without approval, keeping the previous one until the new one is stored, then frees it', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    const download = deferred<object>()
    fetchWidgetImage.mockReturnValue(download.promise)
    await recheck(store, next)
    expect(store.widgets[0]!.definition.images).toEqual(next.images)
    expect(fetchWidgetImage).toHaveBeenLastCalledWith({ url: url('new'), sha256: NEW }, SCOPE, undefined, undefined)
    expect(store.views[0]!.background).toEqual(drawn(OLD))
    expect(memory.has(IMAGE_KEY(OLD))).toBe(true)
    download.resolve({ ok: true, value: drawn(NEW).src })
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(NEW))
    expect(memory.has(IMAGE_KEY(NEW))).toBe(true)
    expect(memory.has(IMAGE_KEY(OLD))).toBe(false)
  })

  it('drops and frees an image the file drops', async () => {
    const store = await setup()
    const two = pictured({ hero: { url: url('old'), sha256: OLD }, side: { url: url('new'), sha256: NEW } })
    store.add(SCOPE, two)
    await flushPromises()
    await recheck(store, old)
    expect(store.widgets[0]!.definition.images).toEqual(old.images)
    expect(memory.has(IMAGE_KEY(NEW))).toBe(false)
  })

  it('draws a widget an earlier build stored with images waiting for approval', async () => {
    memory.set('miniAppWidgets', JSON.stringify([{ ...storedWidget('mainnet', 'swap'), definition: old, pendingImages: next.images }]))
    const store = await setup()
    await settle()
    expect(store.views[0]).not.toHaveProperty('pendingImages')
    expect(store.views[0]!.background).toEqual(drawn(OLD))
    await recheck(store, next)
    expect(store.views[0]!.background).toEqual(drawn(NEW))
  })

  it('frees an image with the last widget using it', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    store.add(SCOPE, { ...old, id: 'other' })
    await flushPromises()
    await flushPromises()
    store.remove(SCOPE, 'swap')
    await flushPromises()
    expect(memory.has(IMAGE_KEY(OLD))).toBe(true)
    store.remove(SCOPE, 'other')
    await flushPromises()
    expect(memory.has(IMAGE_KEY(OLD))).toBe(false)
  })

  it('contacts no blocked site, and a blocked card draws no image', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await flushPromises()
    fetchWidgetImage.mockClear()
    flags.blockedWidgetOrigins = ['https://swap.example']
    expect(store.views[0]!.background).toBeUndefined()
    store.add(SCOPE, { ...next, id: 'other' })
    await flushPromises()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })

  it.each(['before the gallery opens', 'while it is open'])('counts a preview\'s block-height countdown from a height first known %s', async (arrives) => {
    nimiqNetwork.height = -1
    const store = await setup()
    const counting = definition({ content: { value: { text: 'Next draw' }, tone: 'neutral', rows: [], countdown: { label: 'Draw', untilNimiqHeight: 1060 } } })
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [counting] } })
    if (arrives === 'before the gallery opens')
      nimiqNetwork.height = 1000
    await store.loadGallery([SCOPE])
    nimiqNetwork.height = 1000
    await flushPromises()
    expect(store.previewView(SCOPE, counting).countdown).toEqual({ label: 'Draw', until: NOW + 60_000 })
  })

  it('counts a preview\'s block-height countdown from a head that moved on while the chain synced', async () => {
    nimiqNetwork.height = 10
    const store = await setup()
    const counting = definition({ content: { value: { text: 'Next draw' }, tone: 'neutral', rows: [], countdown: { label: 'Draw', untilNimiqHeight: 1060 } } })
    fetchWidgetFile.mockImplementation(async () => {
      nimiqNetwork.height = 1000
      return { ok: true, value: { widgets: [counting] } }
    })
    await store.loadGallery([SCOPE])
    expect(store.previewView(SCOPE, counting).countdown).toEqual({ label: 'Draw', until: NOW + 60_000 })
  })

  it('shows a gallery preview without storing it', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [old] } })
    await store.loadGallery([SCOPE])
    await store.loadPreviewImages([SCOPE])
    expect(store.previewView(SCOPE, old).background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
    expect(memory.has(IMAGE_KEY(OLD))).toBe(false)
    fetchWidgetImage.mockClear()
    store.add(SCOPE, old)
    await flushPromises()
    await flushPromises()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    expect(memory.has(IMAGE_KEY(OLD))).toBe(true)
  })

  it('downloads for a preview only the image it shows', async () => {
    const store = await setup()
    const two = pictured({ hero: { url: url('old'), sha256: OLD }, side: { url: url('new'), sha256: NEW } })
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [two] } })
    await store.loadGallery([SCOPE])
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    await store.loadPreviewImages([SCOPE])
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
  })

  it('forgets previews when the gallery closes, also one still downloading', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [old] } })
    await store.loadGallery([SCOPE])
    await store.loadPreviewImages([SCOPE])
    store.clearPreviewImages()
    expect(store.previewView(SCOPE, old).background).toBeUndefined()
    let answer = (_result: object) => {}
    fetchWidgetImage.mockReturnValue(new Promise((resolve) => {
      answer = resolve
    }))
    const loading = store.loadPreviewImages([SCOPE])
    await flushPromises()
    store.clearPreviewImages()
    answer({ ok: true, value: 'data:late' })
    await loading
    expect(store.previewView(SCOPE, old).background).toBeUndefined()
  })

  it('downloads no preview for a widget whose first size is an icon', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [{ ...old, sizes: ['icon', 'small'] }] } })
    await store.loadGallery([SCOPE])
    await store.loadPreviewImages([SCOPE])
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })

  it('retries any failure, a hash mismatch included, after 5, 10, 20 minutes and so on, up to every 6 hours', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'hash', transient: false })
    store.add(SCOPE, old)
    await settle()
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    for (const [i, minutes] of [5, 15, 35, 75, 155, 315, 635, 995, 1355].entries()) {
      await tickAt(store, NOW + (minutes - 1) * 60_000)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(i + 1)
      await tickAt(store, NOW + minutes * 60_000)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(i + 2)
    }
  })

  it('keeps the back-off of an image a state switches away from and back to', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: '404', transient: false, status: 404 })
    store.add(SCOPE, definition())
    for (const [name, hash] of [['old', OLD], ['new', NEW], ['old', OLD], ['new', NEW], ['old', OLD], ['new', NEW]] as const) {
      store.update(SCOPE, 'swap', showing({ image: image(name, hash) }))
      await settle()
    }
    expect(fetchWidgetImage).toHaveBeenCalledTimes(2)
  })

  it('makes no native request picked before a Mini App opened', async () => {
    const store = await setup()
    const saved = deferred<void>()
    storedRead.attemptSaves = saved.promise
    store.add(SCOPE, old)
    await settle()
    isMiniAppActive.value = true
    saved.resolve()
    await settle()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })

  it('tries a failed image at once when its widget is removed and added again', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValueOnce({ ok: false, error: 'hash', transient: false })
    store.add(SCOPE, old)
    await settle()
    store.remove(SCOPE, 'swap')
    await settle()
    store.add(SCOPE, old)
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(OLD))
  })

  it('gives each site its own copy of an image, so naming another site\'s hash tells nothing', async () => {
    const store = await setup()
    const other = 'https://other.example/'
    store.add(SCOPE, old)
    await settle()
    fetchWidgetImage.mockClear()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'down', transient: true })
    store.add(other, pictured({ hero: { url: `${other}guess.png`, sha256: OLD } }))
    await settle()
    expect(fetchWidgetImage).toHaveBeenCalledWith({ url: `${other}guess.png`, sha256: OLD }, other, undefined, undefined)
    expect(store.views.find(view => view.scope === other)!.background).toBeUndefined()
    expect(store.views.find(view => view.scope === SCOPE)!.background).toEqual(drawn(OLD))
  })

  it('forgets an image with the last widget using it, so adding again downloads it again', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await flushPromises()
    await flushPromises()
    store.remove(SCOPE, 'swap')
    await flushPromises()
    fetchWidgetImage.mockClear()
    store.add(SCOPE, old)
    await flushPromises()
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
  })

  it('reads what it has stored even while another image cannot be downloaded', async () => {
    const first = await setup()
    first.add(SCOPE, old)
    await flushPromises()
    await flushPromises()
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    first.add(SCOPE, { ...next, id: 'other' })
    await flushPromises()
    const second = await setup()
    await flushPromises()
    await flushPromises()
    expect(second.views.find(view => view.widgetId === 'swap')!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('does not download a failed image again when the set of images on Home changes', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'hash', transient: false })
    store.add(SCOPE, old)
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    store.add(SCOPE, { ...next, id: 'other' })
    await flushPromises()
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledTimes(2)
  })

  it('downloads an image two widgets share once, for previews and when kept', async () => {
    const store = await setup()
    const sharing = [old, { ...old, id: 'other' }, { ...old, id: 'third' }]
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: sharing } })
    await store.loadGallery([SCOPE])
    await store.loadPreviewImages([SCOPE])
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    store.clearPreviewImages()
    fetchWidgetImage.mockClear()
    store.add(SCOPE, sharing[0]!)
    store.add(SCOPE, sharing[1]!)
    await flushPromises()
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
  })

  it('tries each URL a file gives for one hash, so a broken one cannot keep the image away', async () => {
    const store = await setup()
    fetchWidgetImage.mockImplementation(async (image: { url: string, sha256: string }) => image.url === url('broken')
      ? { ok: false, error: 'hash', transient: false }
      : { ok: true, value: `data:image/png;base64,${image.sha256}` })
    store.add(SCOPE, old)
    store.add(SCOPE, pictured({ hero: { url: url('broken'), sha256: OLD } }, 'other'))
    await flushPromises()
    await flushPromises()
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('keeps a preview the user just added, even if the gallery closes before it is stored', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [old] } })
    await store.loadGallery([SCOPE])
    await store.loadPreviewImages([SCOPE])
    fetchWidgetImage.mockClear()
    store.add(SCOPE, old)
    store.clearPreviewImages()
    await flushPromises()
    await flushPromises()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    expect(memory.has(IMAGE_KEY(OLD))).toBe(true)
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('re-reads the widget file after an hour, or on pull to refresh after a minute', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [definition()] } })
    await tickAt(store, NOW + 59 * 60_000)
    await tickAt(store, NOW + 3600_000)
    expect(fetchWidgetFile).toHaveBeenCalledTimes(1)
    await tickAt(store, NOW + 3600_000 + 59_000, true)
    expect(fetchWidgetFile).toHaveBeenCalledTimes(1)
    await tickAt(store, NOW + 3600_000 + 60_000, true)
    expect(fetchWidgetFile).toHaveBeenCalledTimes(2)
  })

  it('downloads and stores an image a Mini App pushes, without waiting for a tick', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    expect(fetchWidgetImage).toHaveBeenCalledWith(image('mine', NEW), SCOPE, undefined, undefined)
    expect(memory.has(IMAGE_KEY(NEW))).toBe(true)
    expect(store.views[0]!.background).toEqual(drawn(NEW))
  })

  it('downloads and draws an image a refresh answer carries', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 } }))
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: showing({ image: image('mine', NEW) }) })
    await tickAt(store, NOW)
    expect(store.views[0]!.background).toEqual(drawn(NEW))
  })

  it('downloads the images of later states ahead, so a trigger switches without a network', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', showing({ image: image('now', OLD) }, { next: [{ on: { at: NOW + 60_000 }, state: showing({ image: image('then', NEW) }) }] }))
    await settle()
    expect(memory.has(IMAGE_KEY(NEW))).toBe(true)
    fetchWidgetImage.mockClear()
    await tickAt(store, NOW + 60_000)
    expect(store.views[0]!.background).toEqual(drawn(NEW))
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })

  it('downloads what every card shows before what later states need', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ id: 'a' }))
    store.add(SCOPE, definition({ id: 'b' }))
    const later = ['c', 'd', 'e'].map(tag => ({ on: { at: NOW + 60_000 }, state: showing({ image: image(tag, tag.repeat(64)) }) }))
    store.update(SCOPE, 'a', showing({ image: image('old', OLD) }, { next: later }))
    store.update(SCOPE, 'b', showing({ image: image('new', NEW) }))
    await settle()
    expect(fetchWidgetImage.mock.calls.slice(0, 2).map(([asked]) => asked.sha256)).toEqual([OLD, NEW])
  })

  it('keeps the previous image while a pushed one loads, across a restart too', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(OLD))
    const restarted = await setup()
    await settle()
    expect(restarted.views[0]!.background).toEqual(drawn(OLD))
  })

  it('keeps the previous image through a state that came before stored images were read', async () => {
    const first = await setup()
    first.add(SCOPE, old)
    await settle()
    const read = deferred<void>()
    storedRead.images = read.promise
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    const second = await setup()
    second.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    read.resolve()
    await settle()
    expect(second.views[0]!.background).toEqual(drawn(OLD))
  })

  it('keeps an image it shares with another widget while its next one loads', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    store.add(SCOPE, { ...old, id: 'other' })
    await settle()
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    store.update(SCOPE, 'other', showing({ image: image('mine', NEW) }))
    await settle()
    expect(store.views.find(view => view.widgetId === 'other')!.background).toEqual(drawn(OLD))
  })

  it.each([
    ['no background', undefined],
    ['a key it did not declare', { image: 'other' }],
    ['a key every object inherits', { image: 'constructor' }],
  ])('turns plain at once for %s, and stays plain while a later image loads', async (_, background) => {
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    store.update(SCOPE, 'swap', showing(background as never))
    expect(store.views[0]!.background).toBeUndefined()
    await settle()
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    expect(store.views[0]!.background).toBeUndefined()
  })

  it('turns a chart background on at once', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    store.update(SCOPE, 'swap', showing({ chart: { kind: 'bars', points: [1, 2] } }))
    expect(store.views[0]!.background).toEqual({ kind: 'chart', chart: { kind: 'bars', points: [1, 2] } })
  })

  it('returns to the resting image when a state expires, and frees the state\'s', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }, { expiresAt: NOW + 60_000 }))
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(NEW))
    await tickAt(store, NOW + 60_000)
    expect(store.views[0]!.background).toEqual(drawn(OLD))
    expect(memory.has(IMAGE_KEY(NEW))).toBe(false)
  })

  it('draws again an image that was freed while it was being saved', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    const save = deferred<void>()
    storedRead.imageSaves = save.promise
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    store.update(SCOPE, 'swap', null)
    await settle()
    save.resolve()
    await settle()
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(NEW))
  })

  it('draws a new image only once it is saved, so a state pushed meanwhile still has the one before', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    storedRead.imageSaves = new Promise(() => {})
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(OLD))
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    store.update(SCOPE, 'swap', showing({ image: image('third', 'c'.repeat(64)) }))
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(OLD))
  })

  it('keeps the image of a state that expired but is still on screen, as the one to show while the next loads', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', showing({ image: image('mine', OLD) }, { expiresAt: NOW + 60_000 }))
    await settle()
    vi.setSystemTime(NOW + 70_000)
    store.add(SCOPE, pictured({ hero: image('other', 'c'.repeat(64)) }, 'other'))
    await settle()
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    store.update(SCOPE, 'swap', showing({ image: image('next', NEW) }))
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(OLD))
  })

  it('never takes a gallery preview for an image it keeps, so closing the gallery blanks no card', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [pictured({ hero: image('new', NEW) }, 'other')] } })
    await store.loadGallery([SCOPE])
    await store.loadPreviewImages([SCOPE])
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'down', transient: true })
    store.update(SCOPE, 'swap', showing({ image: image('new', NEW) }))
    await settle()
    store.clearPreviewImages()
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(OLD))
  })

  it('falls back to the image of the language on screen', async () => {
    const store = await setup()
    store.add(SCOPE, {
      ...pictured({ hero: image('old', OLD), side: image('new', NEW) }),
      translations: { de: { content: { value: { text: 'x' }, tone: 'neutral', rows: [], background: { image: 'side' } } } },
    })
    await settle()
    app.language = 'de'
    await settle()
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    store.update(SCOPE, 'swap', showing({ image: image('mine', 'c'.repeat(64)) }))
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(NEW))
  })

  it('lets a push through while another site\'s download hangs', async () => {
    const store = await setup()
    const other = 'https://other.example/'
    fetchWidgetImage.mockImplementation((asked: { url: string, sha256: string }) => asked.url.startsWith(other) ? new Promise(() => {}) : Promise.resolve({ ok: true, value: drawn(asked.sha256).src }))
    store.add(other, pictured({ hero: { url: `${other}slow.png`, sha256: OLD } }))
    await settle()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    expect(store.views.find(view => view.scope === SCOPE)!.background).toEqual(drawn(NEW))
  })

  it('downloads the others when one stored image cannot be read', async () => {
    storedRead.failingRead = IMAGE_KEY(OLD)
    const store = await setup()
    store.add(SCOPE, old)
    store.add(SCOPE, { ...next, id: 'other' })
    await settle()
    expect(store.views[1]!.background).toEqual(drawn(NEW))
  })

  it('retries an image that could not be saved, like one that could not be downloaded', async () => {
    const store = await setup()
    storedRead.failingWrite = IMAGE_KEY(OLD)
    store.add(SCOPE, old)
    await settle()
    expect(store.views[0]!.background).toBeUndefined()
    storedRead.failingWrite = ''
    await tickAt(store, NOW + 5 * 60_000)
    expect(store.views[0]!.background).toEqual(drawn(OLD))
  })

  it('does not read a missing image from the database again at every tick', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'down', transient: true })
    store.add(SCOPE, old)
    await settle()
    const reads = storedRead.reads.length
    for (let i = 1; i <= 4; i++)
      await tickAt(store, NOW + i * 15_000)
    expect(storedRead.reads).toHaveLength(reads)
  })

  it('gives the last download to a card that draws a background, not to an icon', async () => {
    memory.set('miniAppWidgetImageFetches', JSON.stringify({ 'https://swap.example': Array.from({ length: 59 }).fill(NOW) }))
    const store = await setup()
    store.add(SCOPE, { ...old, id: 'icon', sizes: ['icon', 'small'] })
    store.add(SCOPE, { ...next, id: 'card' })
    await settle()
    expect(fetchWidgetImage.mock.calls.map(([asked]) => asked.sha256)).toEqual([NEW])
  })

  it('waits while a Mini App is open, as the native downloads would share its cookies, and goes once it closes', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    isMiniAppActive.value = true
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    isMiniAppActive.value = false
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(NEW))
  })

  it('waits while a hidden Mini App waits for the PIN with its cookies', async () => {
    sessionStorage.setItem('miniAppSession', JSON.stringify({ url: SCOPE, hiddenAt: NOW }))
    const store = await setup()
    store.add(SCOPE, old)
    await settle()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    sessionStorage.clear()
    await tickAt(store, NOW + 15_000)
    expect(store.views[0]!.background).toEqual(drawn(OLD))
  })

  it('keeps the back-off across restarts', async () => {
    const first = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'hash', transient: false })
    first.add(SCOPE, old)
    await settle()
    fetchWidgetImage.mockClear()
    const second = await setup()
    await settle()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    await tickAt(second, NOW + 5 * 60_000)
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
  })

  it('waits after a download that never ended, as when a huge image brought the app down', async () => {
    const first = await setup()
    fetchWidgetImage.mockReturnValue(new Promise(() => {}))
    first.add(SCOPE, old)
    await settle()
    fetchWidgetImage.mockClear()
    await setup()
    await settle()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })

  it('stores an attempt before making it', async () => {
    const store = await setup()
    let storedBefore: (string | undefined)[] = []
    fetchWidgetImage.mockImplementation(async (asked: { sha256: string }) => {
      storedBefore = [memory.get('miniAppWidgetImageFetches'), memory.get('miniAppWidgetImageFailures')]
      return { ok: true, value: drawn(asked.sha256).src }
    })
    store.add(SCOPE, old)
    await settle()
    expect(storedBefore[0]).toContain(String(NOW))
    expect(storedBefore[1]).toContain(sha256Hex(`https://swap.example ${OLD}`))
  })

  it('makes no attempt it could not store', async () => {
    const store = await setup()
    storedRead.failingWrite = 'miniAppWidgetImageFailures'
    store.add(SCOPE, old)
    await settle()
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })

  it('keeps the saved copy of an image freed and wanted again while it was written', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    const save = deferred<void>()
    storedRead.imageSaves = save.promise
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    store.update(SCOPE, 'swap', null)
    await settle()
    store.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    save.resolve()
    await settle()
    expect(store.views[0]!.background).toEqual(drawn(NEW))
    expect(memory.has(IMAGE_KEY(NEW))).toBe(true)
  })

  it('keeps the saved copy of an image freed and wanted again while it was read', async () => {
    const first = await setup()
    first.add(SCOPE, definition())
    first.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    const read = deferred<void>()
    storedRead.images = read.promise
    const second = await setup()
    second.update(SCOPE, 'swap', null)
    await settle()
    second.update(SCOPE, 'swap', showing({ image: image('mine', NEW) }))
    await settle()
    read.resolve()
    await settle()
    expect(second.views[0]!.background).toEqual(drawn(NEW))
    expect(memory.has(IMAGE_KEY(NEW))).toBe(true)
  })

  it('draws an added widget\'s preview only once it is saved, and downloads it when that save fails', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [old] } })
    await store.loadGallery([SCOPE])
    await store.loadPreviewImages([SCOPE])
    fetchWidgetImage.mockClear()
    storedRead.failingWrite = IMAGE_KEY(OLD)
    store.add(SCOPE, old)
    await settle()
    expect(store.views[0]!.background).toBeUndefined()
    storedRead.failingWrite = ''
    await tickAt(store, NOW + 5 * 60_000)
    expect(store.views[0]!.background).toEqual(drawn(OLD))
    expect(memory.has(IMAGE_KEY(OLD))).toBe(true)
  })

  it('leaves room for other sites when one site\'s downloads all hang', async () => {
    const store = await setup()
    const other = 'https://other.example/'
    fetchWidgetImage.mockImplementation((asked: { url: string, sha256: string }) => asked.url.startsWith(other) ? new Promise(() => {}) : Promise.resolve({ ok: true, value: drawn(asked.sha256).src }))
    const many = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`i${i}`, { url: `${other}${i}.png`, sha256: String(i).repeat(64) }]))
    store.add(other, definition({ images: many }))
    await settle()
    store.add(SCOPE, old)
    await settle()
    expect(store.views.find(view => view.scope === SCOPE)!.background).toEqual(drawn(OLD))
  })

  it('logs a failed image\'s site, never its URL, which can be a secret', async () => {
    const store = await setup()
    const secret = `${SCOPE}w/7f3c9a.png`
    fetchWidgetImage.mockResolvedValue({ ok: false, error: `${secret} answered 500`, transient: true, status: 500 })
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', showing({ image: { url: secret, sha256: NEW } }))
    await settle()
    expect(logged).toHaveBeenCalled()
    expect(JSON.stringify(logged.mock.calls)).not.toContain('7f3c9a')
  })

  describe('an image that asks for the token', () => {
    it('gets the token of its own widget, and no sibling\'s', async () => {
      const store = await setup()
      store.add(SCOPE, pictured({ hero: asking('waits', OLD) }, 'waits'))
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }, 'mine'))
      await settle()
      store.setToken(SCOPE, 'mine', 'mine-token')
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'mine-token']])
    })

    it('is fetched with the token of the widget that has one, when two show the same', async () => {
      const store = await setup()
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }, 'without'))
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }, 'with'))
      store.setToken(SCOPE, 'with', 'with-token')
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'with-token']])
    })

    it('is the only kind that gets it', async () => {
      const store = await setup()
      store.add(SCOPE, old)
      store.setToken(SCOPE, 'swap', 'opaque-token')
      await settle()
      expect(tokensSent()).toEqual([[url('old'), undefined]])
    })

    it('waits for a token without spending the budget, then is fetched without a tick', async () => {
      const store = await setup()
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
      expect(memory.has('miniAppWidgetImageFetches')).toBe(false)
      expect(memory.has('miniAppWidgetImageFailures')).toBe(false)
      store.setToken(SCOPE, 'swap', 'opaque-token')
      await settle()
      expect(store.views[0]!.background).toEqual(drawn(NEW))
    })

    it('waits while the Mini App is open, then fetches only the newest image with the newest token', async () => {
      const store = await setup()
      store.add(SCOPE, definition())
      await settle()
      isMiniAppActive.value = true
      for (const i of [1, 2, 3, 4, 5]) {
        store.setToken(SCOPE, 'swap', `token-${i}`)
        store.update(SCOPE, 'swap', showing({ image: asking(`n${i}`, String(i).repeat(64)) }))
        await settle()
      }
      expect(fetchWidgetImage).not.toHaveBeenCalled()
      expect(memory.has('miniAppWidgetImageFetches')).toBe(false)
      expect(memory.has('miniAppWidgetImageFailures')).toBe(false)
      isMiniAppActive.value = false
      await settle()
      expect(tokensSent()).toEqual([[url('n5'), 'token-5']])
    })

    it('carries the token to an image of a later state', async () => {
      const store = await setup()
      store.add(SCOPE, definition())
      store.setToken(SCOPE, 'swap', 'opaque-token')
      store.update(SCOPE, 'swap', showing({ chart: { kind: 'bars', points: [1, 2] } }, { next: [{ on: { at: NOW + 60_000 }, state: showing({ image: asking('then', NEW) }) }] }))
      await settle()
      expect(tokensSent()).toEqual([[url('then'), 'opaque-token']])
    })

    it('does not hold back a sibling\'s plain image of the same URL', async () => {
      const store = await setup()
      store.add(SCOPE, pictured({ hero: image('same', NEW) }, 'plain'))
      store.add(SCOPE, pictured({ hero: asking('same', NEW) }, 'asks'))
      await settle()
      expect(tokensSent()).toEqual([[url('same'), undefined]])
    })

    it.each([
      ['is gone', { halted: 'gone' }],
      ['is the other network\'s', { network: 'testnet' }],
    ])('is not sent for a widget that %s, as refreshes are not', async (_, how) => {
      memory.set('miniAppWidgets', JSON.stringify([{ ...storedWidget('mainnet', 'swap'), definition: pictured({ hero: asking('mine', NEW) }), token: 'opaque-token', ...how }]))
      await setup()
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
    })

    it('takes a token that reads "none" for a token', async () => {
      const store = await setup()
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }, 'with'))
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }, 'without'))
      store.setToken(SCOPE, 'with', 'none')
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'none']])
    })

    it('carries the token from a refresh answer\'s image too', async () => {
      const store = await setup()
      store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 } }))
      store.setToken(SCOPE, 'swap', 'opaque-token')
      fetchWidgetRefresh.mockResolvedValue({ ok: true, value: showing({ image: asking('mine', NEW) }) })
      await tickAt(store, NOW)
      expect(tokensSent()).toEqual([[url('mine'), 'opaque-token']])
    })

    it('waits while the widget waits to reconnect', async () => {
      memory.set('miniAppWidgets', JSON.stringify([{ ...storedWidget('mainnet', 'swap'), definition: pictured({ hero: asking('mine', NEW) }), token: 'refused', halted: 'reconnect' }]))
      const store = await setup()
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
      store.update(SCOPE, 'swap', null)
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'refused']])
    })

    it('tries a new token whatever the back-off of the old, once the Mini App that gave it closes', async () => {
      const store = await setup()
      const refused = deferred<object>()
      fetchWidgetImage.mockReturnValueOnce(refused.promise)
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      store.setToken(SCOPE, 'swap', 'old-token')
      await settle()
      isMiniAppActive.value = true
      store.setToken(SCOPE, 'swap', 'new-token')
      refused.resolve({ ok: false, error: '401', transient: false, status: 401 })
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'old-token']])
      isMiniAppActive.value = false
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'old-token'], [url('mine'), 'new-token']])
      expect(store.views[0]!.background).toEqual(drawn(NEW))
    })

    it.each([
      ['its token was cleared', (store: any) => store.setToken(SCOPE, 'swap', null)],
      ['its token was replaced', (store: any) => store.setToken(SCOPE, 'swap', 'new-token')],
      ['its widget was removed', (store: any) => store.remove(SCOPE, 'swap')],
      ['a Mini App opened', () => { isMiniAppActive.value = true }],
    ])('does not send a token picked before %s', async (_, change) => {
      const store = await setup()
      const saved = deferred<void>()
      storedRead.attemptSaves = saved.promise
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      store.setToken(SCOPE, 'swap', 'old-token')
      await settle()
      change(store)
      await flushPromises()
      saved.resolve()
      await settle()
      expect(tokensSent().map(([, token]) => token)).not.toContain('old-token')
    })

    it.each([
      ['its token is cleared', (store: any) => store.setToken(SCOPE, 'swap', null)],
      ['its token is replaced', (store: any) => store.setToken(SCOPE, 'swap', 'new-token')],
      ['its widget is removed', (store: any) => store.remove(SCOPE, 'swap')],
      ['its refresh is refused', async (store: any) => {
        fetchWidgetRefresh.mockResolvedValue({ ok: false, error: '401', transient: false, status: 401 })
        await tickAt(store, NOW + 1)
      }],
    ])('stops a request under way when %s, as its preflight can come before the token', async (_, change) => {
      const store = await setup()
      const signals: AbortSignal[] = []
      fetchWidgetImage.mockImplementation((_image: unknown, _scope: string, _token?: string, signal?: AbortSignal) => {
        if (signal)
          signals.push(signal)
        return new Promise(() => {})
      })
      store.add(SCOPE, { ...pictured({ hero: asking('mine', NEW) }), refresh: { url: `${SCOPE}w`, every: 60 } })
      store.setToken(SCOPE, 'swap', 'old-token')
      await settle()
      await change(store)
      await settle()
      expect(signals[0]?.aborted).toBe(true)
    })

    it('tries a replaced token at once after stopping the old one\'s request', async () => {
      const store = await setup()
      fetchWidgetImage.mockImplementationOnce((_image: unknown, _scope: string, _token?: string, signal?: AbortSignal) =>
        new Promise(resolve => signal?.addEventListener('abort', () => resolve({ ok: false, error: 'stopped', transient: true }))))
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      store.setToken(SCOPE, 'swap', 'old-token')
      await settle()
      store.setToken(SCOPE, 'swap', 'new-token')
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'old-token'], [url('mine'), 'new-token']])
      expect(store.views[0]!.background).toEqual(drawn(NEW))
    })

    it('fetches without waiting out a back-off what it picked just before a Mini App opened', async () => {
      const store = await setup()
      const saved = deferred<void>()
      storedRead.attemptSaves = saved.promise
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      store.setToken(SCOPE, 'swap', 'opaque-token')
      await settle()
      isMiniAppActive.value = true
      saved.resolve()
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
      isMiniAppActive.value = false
      await settle()
      expect(tokensSent()).toEqual([[url('mine'), 'opaque-token']])
    })

    it.each([404, 500, undefined])('keeps the back-off through a new token after a failure %s, which is not about the token', async (status) => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: 'failed', transient: false, status })
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      for (const token of ['one', 'two', 'three']) {
        store.setToken(SCOPE, 'swap', token)
        await settle()
      }
      expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    })

    it('tries each widget\'s token once when the site refuses them all', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: '403', transient: false, status: 403 })
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }, 'a'))
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }, 'b'))
      store.setToken(SCOPE, 'a', 'a-token')
      store.setToken(SCOPE, 'b', 'b-token')
      await settle()
      await tickAt(store, NOW + 15_000)
      expect(tokensSent()).toEqual([[url('mine'), 'a-token'], [url('mine'), 'b-token']])
    })

    it('does not try the refused token again when it is only set again', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: '401', transient: false, status: 401 })
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      for (let i = 0; i < 3; i++) {
        store.setToken(SCOPE, 'swap', 'same-token')
        await settle()
      }
      expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    })

    it('stores nothing derived from the token with the failures', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: '401', transient: false, status: 401 })
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      store.setToken(SCOPE, 'swap', '1234')
      await settle()
      expect(memory.get('miniAppWidgetImageFailures')).not.toContain(sha256Hex('1234'))
    })

    it('waits as long as the image\'s Retry-After says', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: '429', transient: true, status: 429, retryAfterMs: 3600_000 })
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      store.setToken(SCOPE, 'swap', 'opaque-token')
      await settle()
      await tickAt(store, NOW + 30 * 60_000)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
      await tickAt(store, NOW + 3600_000)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(2)
    })

    it('waits while the site asked the widget\'s refreshes to wait', async () => {
      memory.set('miniAppWidgets', JSON.stringify([{ ...storedWidget('mainnet', 'swap'), definition: pictured({ hero: asking('mine', NEW) }), token: 'opaque-token', retryNotBefore: NOW + 3600_000 }]))
      const store = await setup()
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
      await tickAt(store, NOW + 3600_000)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    })

    it('does not pause the refreshes when the site refuses it', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: '401', transient: false, status: 401 })
      store.add(SCOPE, pictured({ hero: asking('mine', NEW) }))
      store.setToken(SCOPE, 'swap', 'opaque-token')
      await settle()
      expect(store.views[0]!.reconnect).toBe(false)
    })

    it('is left out of gallery previews, which have no token', async () => {
      const store = await setup()
      fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [pictured({ hero: asking('mine', NEW) })] } })
      await store.loadGallery([SCOPE])
      await store.loadPreviewImages([SCOPE])
      expect(fetchWidgetImage).not.toHaveBeenCalled()
    })
  })

  describe('a token\'s images', () => {
    const copies = (hash: string) => [...memory.keys()].filter(key => key.startsWith(IMAGE_KEY(hash)))
    const signedIn = async (resting: WidgetDefinition = definition()) => {
      const store = await setup()
      store.add(SCOPE, resting)
      store.setToken(SCOPE, 'swap', 'token-a')
      store.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }))
      await settle()
      expect(store.views[0]!.background).toEqual(drawn(OLD))
      fetchWidgetImage.mockClear()
      return store
    }

    it('go at once when the token is cleared, also while the Mini App is open, and stay gone after a restart', async () => {
      const store = await signedIn()
      isMiniAppActive.value = true
      store.setToken(SCOPE, 'swap', null)
      expect(store.views[0]!.background).toBeUndefined()
      await settle()
      expect(copies(OLD)).toEqual([])
      const restarted = await setup()
      await settle()
      expect(restarted.views[0]!.background).toBeUndefined()
    })

    it('never stand in for the next account\'s while that one loads or keeps failing', async () => {
      const store = await signedIn()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: 'down', transient: true })
      store.setToken(SCOPE, 'swap', 'token-b')
      store.update(SCOPE, 'swap', showing({ image: asking('b', NEW) }))
      expect(store.views[0]!.background).toBeUndefined()
      await settle()
      expect(store.views[0]!.background).toBeUndefined()
      expect(copies(OLD)).toEqual([])
      expect(tokensSent()).toEqual([[url('b'), 'token-b']])
    })

    it('are fetched again, not reused, when another token shows the same one', async () => {
      const store = await signedIn(pictured({ hero: asking('a', OLD) }))
      fetchWidgetImage.mockReturnValue(new Promise(() => {}))
      store.setToken(SCOPE, 'swap', 'token-b')
      await settle()
      expect(store.views[0]!.background).toBeUndefined()
      expect(tokensSent()).toEqual([[url('a'), 'token-b']])
    })

    it('stay, with no request, when the same token is set again', async () => {
      const store = await signedIn()
      store.setToken(SCOPE, 'swap', 'token-a')
      await settle()
      expect(store.views[0]!.background).toEqual(drawn(OLD))
      expect(fetchWidgetImage).not.toHaveBeenCalled()
    })

    it('leave the widget\'s plain images alone', async () => {
      const store = await signedIn(pictured({ hero: image('plain', NEW) }))
      store.update(SCOPE, 'swap', null)
      await settle()
      store.setToken(SCOPE, 'swap', null)
      await settle()
      expect(store.views[0]!.background).toEqual(drawn(NEW))
      expect(copies(NEW)).toHaveLength(1)
    })

    it('are not drawn by a widget that has another token or none', async () => {
      const store = await signedIn()
      store.add(SCOPE, pictured({ hero: asking('a', OLD) }, 'other'))
      await settle()
      expect(store.views.find(view => view.widgetId === 'other')!.background).toBeUndefined()
    })

    it('are shared by a site\'s widgets with the same token, and kept while one of them has it', async () => {
      const store = await signedIn()
      store.add(SCOPE, pictured({ hero: asking('a', OLD) }, 'other'))
      store.setToken(SCOPE, 'other', 'token-a')
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
      store.setToken(SCOPE, 'swap', null)
      await settle()
      expect(store.views.find(view => view.widgetId === 'swap')!.background).toBeUndefined()
      expect(store.views.find(view => view.widgetId === 'other')!.background).toEqual(drawn(OLD))
      expect(copies(OLD)).toHaveLength(1)
    })

    it('are not saved when their download ends after the token went', async () => {
      const store = await setup()
      const download = deferred<object>()
      fetchWidgetImage.mockReturnValueOnce(download.promise)
      store.add(SCOPE, pictured({ hero: asking('a', OLD) }))
      store.setToken(SCOPE, 'swap', 'token-a')
      await settle()
      store.setToken(SCOPE, 'swap', null)
      download.resolve({ ok: true, value: drawn(OLD).src })
      await settle()
      expect(store.views[0]!.background).toBeUndefined()
      expect(copies(OLD)).toEqual([])
    })

    it('go when the token is cleared before the stored images were read', async () => {
      await signedIn()
      const read = deferred<void>()
      storedRead.images = read.promise
      const restarted = await setup()
      restarted.setToken(SCOPE, 'swap', null)
      read.resolve()
      await settle()
      expect(restarted.views[0]!.background).toBeUndefined()
      expect(copies(OLD)).toEqual([])
    })

    it('are not drawn in the gallery from a copy on Home', async () => {
      const store = await signedIn()
      expect(store.previewView(SCOPE, pictured({ hero: asking('a', OLD) }, 'other')).background).toBeUndefined()
    })

    it('leave a plain copy of the same bytes alone', async () => {
      const store = await signedIn(pictured({ hero: image('a', OLD) }))
      store.setToken(SCOPE, 'swap', null)
      await settle()
      expect(store.views[0]!.background).toEqual(drawn(OLD))
    })

    it('still download for a widget whose sibling with the same token is paused', async () => {
      const store = await setup()
      store.add(SCOPE, definition({ id: 'other' }))
      store.add(SCOPE, definition())
      store.setToken(SCOPE, 'other', 'token-a')
      store.setToken(SCOPE, 'swap', 'token-a')
      isMiniAppActive.value = true
      store.update(SCOPE, 'other', showing({ image: asking('a', OLD) }))
      store.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }, { refresh: { url: `${SCOPE}w`, every: 60 } }))
      fetchWidgetRefresh.mockResolvedValue({ ok: false, error: '401', transient: false, status: 401 })
      await tickAt(store, NOW + 120_000)
      fetchWidgetImage.mockClear()
      isMiniAppActive.value = false
      await settle()
      expect(tokensSent()).toEqual([[url('a'), 'token-a']])
    })

    it('keep their back-off when the widget with the token goes but another still names them', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: 'down', transient: true })
      store.add(SCOPE, pictured({ hero: asking('a', OLD) }))
      store.setToken(SCOPE, 'swap', 'token-a')
      await settle()
      store.add(SCOPE, pictured({ hero: asking('a', OLD) }, 'other'))
      store.remove(SCOPE, 'swap')
      await settle()
      fetchWidgetImage.mockClear()
      store.setToken(SCOPE, 'other', 'token-b')
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
    })

    it('still download for a widget whose sibling with the same token was told to wait', async () => {
      const store = await setup()
      store.add(SCOPE, definition({ id: 'other' }))
      store.add(SCOPE, definition())
      store.setToken(SCOPE, 'other', 'token-a')
      store.setToken(SCOPE, 'swap', 'token-a')
      isMiniAppActive.value = true
      store.update(SCOPE, 'other', showing({ image: asking('a', OLD) }))
      store.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }, { refresh: { url: `${SCOPE}w`, every: 60 } }))
      fetchWidgetRefresh.mockResolvedValue({ ok: false, error: '429', transient: true, status: 429, retryAfterMs: 3600_000 })
      await tickAt(store, NOW + 120_000)
      fetchWidgetImage.mockClear()
      isMiniAppActive.value = false
      await settle()
      expect(tokensSent()).toEqual([[url('a'), 'token-a']])
    })

    it('stay when a refresh is refused, as the token is still there', async () => {
      const store = await signedIn()
      store.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }, { refresh: { url: `${SCOPE}w`, every: 60 } }))
      fetchWidgetRefresh.mockResolvedValue({ ok: false, error: '401', transient: false, status: 401 })
      await tickAt(store, NOW + 120_000)
      expect(store.views[0]!.reconnect).toBe(true)
      expect(store.views[0]!.background).toEqual(drawn(OLD))
    })
  })

  describe('what else is linked to a token', () => {
    const connected = async (resting: WidgetDefinition = definition()) => {
      const store = await setup()
      store.add(SCOPE, resting)
      store.setToken(SCOPE, 'swap', 'token-a')
      store.update(SCOPE, 'swap', live('Balance of A', { next: [{ on: { at: NOW + 60_000 }, state: live('Later, of A') }] }))
      await settle()
      return store
    }

    it.each([['cleared', null], ['replaced', 'token-b']])('goes at once when it is %s, text and later states included, and stays gone after a restart', async (_, token) => {
      const store = await connected()
      store.setToken(SCOPE, 'swap', token)
      expect(store.views[0]).toMatchObject({ label: undefined, value: { text: 'Start a swap' } })
      await settle()
      expect(memory.get('miniAppWidgets')).not.toContain('of A')
      const restarted = await setup()
      await tickAt(restarted, NOW + 120_000)
      expect(restarted.views[0]).toMatchObject({ label: undefined, value: { text: 'Start a swap' } })
    })

    it('stays with the same token', async () => {
      const store = await connected()
      store.setToken(SCOPE, 'swap', 'token-a')
      expect(store.views[0]!.label).toBe('Balance of A')
    })

    it('is nothing before a first token, so the first state can be pushed before it', async () => {
      const store = await setup()
      store.add(SCOPE, definition())
      store.update(SCOPE, 'swap', live('Order A-42'))
      store.setToken(SCOPE, 'swap', 'token-a')
      expect(store.views[0]!.label).toBe('Order A-42')
    })

    it('never comes back with an answer to the token before', async () => {
      const store = await connected()
      store.update(SCOPE, 'swap', live('Balance of A', { refresh: { url: `${SCOPE}w`, every: 60 } }))
      const answer = deferred<object>()
      fetchWidgetRefresh.mockReturnValueOnce(answer.promise)
      vi.setSystemTime(NOW + 120_000)
      const ticked = store.tick({ chain: fakeChain(), at: NOW + 120_000 })
      await flushPromises()
      store.setToken(SCOPE, 'swap', 'token-b')
      answer.resolve({ ok: true, value: live('Newer, of A') })
      await ticked
      expect(store.views[0]!.label).toBeUndefined()
    })

    it('makes way for the file\'s refresh at the next check, with the new token', async () => {
      const store = await setup()
      store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 3600 } }))
      store.setToken(SCOPE, 'swap', 'token-a')
      fetchWidgetRefresh.mockResolvedValue({ ok: true, value: live('Balance of A') })
      await tickAt(store, NOW)
      fetchWidgetRefresh.mockClear()
      store.setToken(SCOPE, 'swap', 'token-b')
      await tickAt(store, NOW + 15_000)
      expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
      expect(fetchWidgetRefresh.mock.calls[0]![4]).toMatchObject({ token: 'token-b' })
    })

    it('takes a plain image the state showed, also while the file\'s loads', async () => {
      const store = await setup()
      fetchWidgetImage.mockImplementation(async (asked: { sha256: string }) => asked.sha256 === NEW ? { ok: false, error: 'down', transient: true } : { ok: true, value: drawn(asked.sha256).src })
      store.add(SCOPE, pictured({ hero: image('rest', NEW) }))
      store.setToken(SCOPE, 'swap', 'token-a')
      store.update(SCOPE, 'swap', showing({ image: image('secret-of-a', OLD) }))
      await settle()
      expect(store.views[0]!.background).toEqual(drawn(OLD))
      store.setToken(SCOPE, 'swap', null)
      expect(store.views[0]!.background).toBeUndefined()
      await settle()
      expect(store.views[0]!.background).toBeUndefined()
    })

    it('leaves no image URL in the back-off records, as one can be a secret', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: 'down', transient: true })
      store.add(SCOPE, pictured({ hero: image('secret-of-a', OLD) }))
      await settle()
      expect(memory.get('miniAppWidgetImageFailures')).not.toContain('secret-of-a')
    })

    it('is reported gone only once that is stored', async () => {
      const store = await connected()
      storedRead.failingWrite = 'miniAppWidgets'
      expect(await store.setToken(SCOPE, 'swap', null)).toBe(false)
      expect(store.views[0]!.label).toBeUndefined()
      storedRead.failingWrite = ''
      expect(await store.setToken(SCOPE, 'swap', null)).toBe(true)
      expect(memory.get('miniAppWidgets')).not.toContain('of A')
    })

    it('leaves no image behind a delete that never happened', async () => {
      const first = await setup()
      first.add(SCOPE, pictured({ hero: image('rest', NEW) }))
      await settle()
      const left = `${IMAGE_KEY(OLD)} 12345`
      memory.set(left, drawn(OLD).src)
      const second = await setup()
      await settle()
      expect(memory.has(left)).toBe(false)
      expect(memory.has(IMAGE_KEY(NEW))).toBe(true)
      expect(second.views[0]!.background).toEqual(drawn(NEW))
    })

    it.each(['unreadable', 'garbled'])('takes no image on the strength of widgets that are %s', async (how) => {
      memory.set('miniAppWidgets', how === 'garbled' ? '[{' : '[]')
      if (how === 'unreadable')
        storedRead.failingRead = 'miniAppWidgets'
      memory.set(IMAGE_KEY(OLD), drawn(OLD).src)
      await setup()
      await settle()
      expect(memory.has(IMAGE_KEY(OLD))).toBe(true)
    })

    it('doesn\'t keep the next account waiting for the refresh after a clear', async () => {
      const store = await setup()
      store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 86_400 } }))
      store.setToken(SCOPE, 'swap', 'token-a')
      fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
      await tickAt(store, NOW)
      store.setToken(SCOPE, 'swap', null)
      await tickAt(store, NOW + 15_000)
      fetchWidgetRefresh.mockClear()
      store.setToken(SCOPE, 'swap', 'token-b')
      await tickAt(store, NOW + 30_000)
      expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
      expect(fetchWidgetRefresh.mock.calls[0]![4]).toMatchObject({ token: 'token-b' })
    })

    it('asks a failing server about renewed tokens no more than the budget allows', async () => {
      const store = await setup()
      store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 } }))
      fetchWidgetRefresh.mockResolvedValue({ ok: false, error: '500', transient: true, status: 500 })
      for (let i = 0; i < 100; i++) {
        store.setToken(SCOPE, 'swap', `token-${i}`)
        await tickAt(store, NOW + i * 15_000)
      }
      const { windowMs, max } = WIDGET_LIMITS.refreshBudgets[0]!
      expect(fetchWidgetRefresh.mock.calls.length).toBeLessThanOrEqual(max * Math.ceil(100 * 15_000 / windowMs) + 1)
    })

    it('never takes an answer back after a restart, even with the clock where it was', async () => {
      const first = await setup()
      first.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 } }))
      first.setToken(SCOPE, 'swap', 'token-a')
      await settle()
      const second = await setup()
      const answer = deferred<object>()
      fetchWidgetRefresh.mockReturnValueOnce(answer.promise)
      const ticked = second.tick({ chain: fakeChain(), at: NOW })
      await flushPromises()
      expect(fetchWidgetRefresh).toHaveBeenCalled()
      second.setToken(SCOPE, 'swap', null)
      answer.resolve({ ok: true, value: live('Newer, of A') })
      await ticked
      expect(second.views[0]!.label).toBeUndefined()
    })

    it('is not looked up on the chain any more', async () => {
      const store = await setup()
      store.add(SCOPE, definition())
      store.setToken(SCOPE, 'swap', 'token-a')
      store.update(SCOPE, 'swap', live('Of A', { next: triggers(2, 7) }))
      await settle()
      const first = deferred<'pending'>()
      const lookup = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('pending')
      const ticked = store.tick({ chain: fakeChain({ nimiqTransaction: lookup }), at: NOW + 1000 })
      await flushPromises()
      store.setToken(SCOPE, 'swap', null)
      first.resolve('pending')
      await ticked
      expect(lookup).toHaveBeenCalledTimes(1)
    })

    it('leaves nothing legible of its images in the back-off records', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: '401', transient: false, status: 401 })
      store.add(SCOPE, definition())
      store.setToken(SCOPE, 'swap', 'token-a')
      store.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }))
      await settle()
      const records = memory.get('miniAppWidgetImageFailures')!
      expect(records).toContain('refused')
      expect(records).not.toContain(OLD)
    })

    it('leaves a server\'s Retry-After in place for the next token', async () => {
      const store = await setup()
      fetchWidgetImage.mockResolvedValue({ ok: false, error: '503', transient: true, status: 503, retryAfterMs: 20 * 3600_000 })
      store.add(SCOPE, definition())
      store.setToken(SCOPE, 'swap', 'token-a')
      store.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }))
      await settle()
      expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
      store.setToken(SCOPE, 'swap', 'token-b')
      await settle()
      store.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }))
      await settle()
      expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    })

    it('resets no other copy\'s back-off when a token\'s image arrives', async () => {
      const store = await setup()
      fetchWidgetImage.mockImplementation(async (asked: { sendToken?: boolean }) => asked.sendToken ? { ok: true, value: drawn(OLD).src } : { ok: false, error: '404', transient: false, status: 404 })
      store.add(SCOPE, pictured({ hero: image('plain', OLD) }))
      await settle()
      store.add(SCOPE, pictured({ hero: asking('a', OLD) }, 'other'))
      for (const token of ['t1', 't2', 't3']) {
        store.setToken(SCOPE, 'other', token)
        await settle()
      }
      expect(fetchWidgetImage.mock.calls.filter(([asked]) => !asked.sendToken)).toHaveLength(1)
    })

    it('never reaches the log through a refresh URL, as the log can be shared', async () => {
      const store = await setup()
      store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w?id=secret-of-a`, every: 60 } }))
      fetchWidgetRefresh.mockResolvedValue({ ok: false, error: `${SCOPE}w?id=secret-of-a answered 500`, transient: true, status: 500 })
      await tickAt(store, NOW)
      expect(logged).toHaveBeenCalled()
      expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-of-a')
    })

    it('is told apart after a restart, even with the clock where it was', async () => {
      const first = await setup()
      first.add(SCOPE, definition())
      first.setToken(SCOPE, 'swap', 'token-a')
      first.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }))
      await settle()
      expect(first.views[0]!.background).toEqual(drawn(OLD))
      const second = await setup()
      await settle()
      fetchWidgetImage.mockReturnValue(new Promise(() => {}))
      second.update(SCOPE, 'swap', null)
      second.setToken(SCOPE, 'swap', 'token-b')
      second.update(SCOPE, 'swap', showing({ image: asking('a', OLD) }))
      expect(second.views[0]!.background).toBeUndefined()
    })
  })

  describe('a Mini App\'s download budget', () => {
    const nth = (i: number) => i.toString(16).padStart(64, '0')
    const push = async (store: Awaited<ReturnType<typeof setup>>, i: number) => {
      store.update(SCOPE, 'swap', showing({ image: image(`n${i}`, nth(i)) }))
      await settle()
    }

    it('lets 60 through in an hour, and the next once the hour is over', async () => {
      const store = await setup()
      store.add(SCOPE, definition())
      for (let i = 0; i < 61; i++)
        await push(store, i)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(60)
      expect(store.views[0]!.background).toEqual(drawn(nth(59)))
      await tickAt(store, NOW + 3600_000)
      expect(store.views[0]!.background).toEqual(drawn(nth(60)))
    })

    it('lets 120 through in a day, and the next once the day is over', async () => {
      const store = await setup()
      store.add(SCOPE, definition())
      for (let i = 0; i < 121; i++) {
        vi.setSystemTime(NOW + Math.floor(i / 60) * 2 * 3600_000)
        await push(store, i)
      }
      expect(fetchWidgetImage).toHaveBeenCalledTimes(120)
      await tickAt(store, NOW + 24 * 3600_000)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(121)
    })

    it('is stored, so a restart does not reset it', async () => {
      const first = await setup()
      first.add(SCOPE, definition())
      await push(first, 1)
      expect(JSON.parse(memory.get('miniAppWidgetImageFetches')!)).toEqual({ 'https://swap.example': [NOW] })
      memory.set('miniAppWidgetImageFetches', JSON.stringify({ 'https://swap.example': Array.from({ length: 60 }).fill(NOW) }))
      const second = await setup()
      await push(second, 2)
      expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    })

    it('is read before anything is downloaded, then lets downloads go', async () => {
      const read = deferred<void>()
      storedRead.imageFetches = read.promise
      const store = await setup()
      store.add(SCOPE, old)
      await settle()
      expect(fetchWidgetImage).not.toHaveBeenCalled()
      read.resolve()
      await settle()
      expect(store.views[0]!.background).toEqual(drawn(OLD))
    })

    it('does not count gallery previews, which the user opens', async () => {
      memory.set('miniAppWidgetImageFetches', JSON.stringify({ 'https://swap.example': Array.from({ length: 60 }).fill(NOW) }))
      const store = await setup()
      fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [old] } })
      await store.loadGallery([SCOPE])
      await store.loadPreviewImages([SCOPE])
      expect(store.previewView(SCOPE, old).background).toEqual(drawn(OLD))
    })
  })

  it('draws a chart background, with no download', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ content: { value: { text: 'x' }, tone: 'neutral', rows: [], background: { chart: { kind: 'bars', points: [1, 2] } } } }))
    await flushPromises()
    expect(store.views[0]!.background).toEqual({ kind: 'chart', chart: { kind: 'bars', points: [1, 2] } })
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })
})

describe('approving a new name', () => {
  const NAMED = 'https://named.example/'
  const DAY = 25 * 3600_000
  const named = (appName?: string, extra: Partial<WidgetDefinition> = {}) => definition({ ...(appName ? { appName } : {}), ...extra })
  const dailyCheck = async (store: Awaited<ReturnType<typeof setup>>, file: WidgetDefinition[], days = 1) => {
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: file } })
    await store.tick({ chain: fakeChain(), at: NOW + days * DAY })
  }

  it('keeps showing the approved name when the file changes it, while the rest of the file applies', async () => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    await dailyCheck(store, [named('New', { description: 'Changed' })])
    expect(store.views[0]).toMatchObject({ appName: 'Old', pendingAppName: 'New' })
    expect(store.widgets[0]!.definition.description).toBe('Changed')
  })

  it('asks too when a Mini App that showed its address starts declaring a name', async () => {
    const store = await setup()
    store.add(NAMED, named())
    await dailyCheck(store, [named('Bank of Nimiq')])
    expect(store.views[0]).toMatchObject({ appName: 'named.example', pendingAppName: 'Bank of Nimiq' })
  })

  it('treats a folder as one Mini App: a re-check of one widget offers the name on all, and approving covers them', async () => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    vi.setSystemTime(NOW + DAY)
    store.add(NAMED, named('Old', { id: 'other' }))
    await dailyCheck(store, [named('New'), named('New', { id: 'other' })])
    expect(store.views.map(view => view.pendingAppName)).toEqual(['New', 'New'])
    store.approveName(NAMED, 'New')
    expect(store.views.map(view => view.appName)).toEqual(['New', 'New'])
    expect(store.views[1]!.pendingAppName).toBeUndefined()
  })

  it('applies only the name the user saw', async () => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    await dailyCheck(store, [named('Seen')])
    await dailyCheck(store, [named('Newer')], 2)
    store.approveName(NAMED, 'Seen')
    expect(store.views[0]).toMatchObject({ appName: 'Old', pendingAppName: 'Newer' })
  })

  it('does not touch another folder', async () => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    store.add('https://else.example/', named('Elsewhere', { id: 'else' }))
    await dailyCheck(store, [named('New'), named('Elsewhere', { id: 'else' })])
    store.approveName(NAMED, 'New')
    expect(store.views[1]!.appName).toBe('Elsewhere')
  })

  it('gives a widget added later the folder\'s approved name, leaving the new one waiting', async () => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    store.add(NAMED, named('New', { id: 'other' }))
    expect(store.views.map(view => view.appName)).toEqual(['Old', 'Old'])
    expect(store.views.map(view => view.pendingAppName)).toEqual(['New', 'New'])
    expect(store.previewView(NAMED, named('New', { id: 'third' })).appName).toBe('Old')
    expect(store.consentFor(NAMED, named('New', { id: 'third' })).appName).toBe('Old')
  })

  it('stops asking when the file goes back to the approved name', async () => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    await dailyCheck(store, [named('New')])
    await dailyCheck(store, [named('Old')], 2)
    expect(store.views[0]).toMatchObject({ appName: 'Old' })
    expect(store.views[0]!.pendingAppName).toBeUndefined()
  })

  it.each([['dropping the name', undefined], ['declaring only the address', 'named.example']])('needs no approval for %s, as that only shows the address', async (_name, offered) => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    await dailyCheck(store, [named(offered)])
    expect(store.views[0]).toMatchObject({ appName: 'named.example' })
    expect(store.views[0]!.pendingAppName).toBeUndefined()
  })

  it('offers nothing for a catalog Mini App, which shows its catalog name', async () => {
    const store = await setup()
    store.add(SCOPE, named('Old'))
    await dailyCheck(store, [named('New')])
    expect(store.views[0]).toMatchObject({ appName: 'Swap' })
    expect(store.views[0]!.pendingAppName).toBeUndefined()
    expect(store.pendingName(SCOPE)).toBeUndefined()
  })

  it('tells the host what to ask about, with the folder\'s full address', async () => {
    const store = await setup()
    const FOLDER = 'https://name.github.io/my-app/'
    store.add(FOLDER, named('Old'))
    await dailyCheck(store, [named('New')])
    expect(store.pendingName(FOLDER)).toEqual({ to: 'New', address: 'name.github.io/my-app' })
  })

  it('tells the host the name a widget will show under, before it is added', async () => {
    const store = await setup()
    expect(store.consentFor(NAMED, named('Declared')).appName).toBe('Declared')
    expect(store.consentFor(NAMED, named()).appName).toBeUndefined()
    expect(store.consentFor(SCOPE, named('Declared')).appName).not.toBe('Declared')
  })

  it('offers nothing on a blocked card', async () => {
    const store = await setup()
    store.add(NAMED, named('Old'))
    await dailyCheck(store, [named('New')])
    flags.blockedWidgetOrigins = ['https://named.example']
    expect(store.views[0]!.pendingAppName).toBeUndefined()
  })
})

describe('the remote kill switch', () => {
  const blockSwap = () => {
    flags.blockedWidgetOrigins = ['https://swap.example']
  }

  it('shows only that it is not available, opening nothing, and comes back when lifted', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ content: { label: 'Secret', value: { text: 'Start a swap' }, tone: 'attention', rows: [], path: `${SCOPE}x` } }))
    blockSwap()
    expect(store.isBlocked(SCOPE)).toBe(true)
    expect(store.views[0]).toMatchObject({ value: { text: 'Not available' }, tone: 'neutral' })
    expect(store.views[0]!.label).toBeUndefined()
    expect(store.views[0]!.url).toBeUndefined()
    expect(store.views[0]!.appIcon).toBe(MINI_APP_FALLBACK_ICON)
    flags.blockedWidgetOrigins = []
    expect(store.views[0]).toMatchObject({ label: 'Secret', url: `${SCOPE}x` })
  })

  it('asks nothing for a blocked widget: no refresh, no file, no chain', async () => {
    const store = await setup()
    const nimiqTransaction = vi.fn(async () => 'pending' as const)
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Waiting', { refresh: { url: `${SCOPE}w`, every: 60 }, next: triggers(1, 1) }))
    blockSwap()
    await store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW + 25 * 3600_000 })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    expect(fetchWidgetFile).not.toHaveBeenCalled()
    expect(nimiqTransaction).not.toHaveBeenCalled()
    expect(store.widgets).toHaveLength(1)
  })

  it('keeps it out of the gallery, and refuses adding it', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    blockSwap()
    expect(store.galleryScopesFor(['https://swap.example', 'https://other.example'])).toEqual(['https://other.example/'])
    expect(store.add(SCOPE, definition({ id: 'other' }))).toBe(false)
  })

  it('searches nothing for a Mini App\'s calls or launch, even after a search that found its file', async () => {
    const store = await setup()
    findWidgetFile.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [definition()] } } })
    await store.discover(`${SCOPE}app`)
    findWidgetFile.mockClear()
    blockSwap()
    expect(await store.discover(`${SCOPE}app`)).toMatchObject({ ok: false, error: expect.stringContaining('not available') })
    store.noteLaunch(`${SCOPE}other`)
    expect(findWidgetFile).not.toHaveBeenCalled()
  })

  it('shows neither a declared name nor a stale note, and says it on an icon too', async () => {
    const store = await setup()
    store.add('https://named.example/', definition({ appName: 'Bad name', sizes: ['medium', 'icon'] }))
    flags.blockedWidgetOrigins = ['https://named.example']
    expect(store.views[0]).toMatchObject({ appName: 'named.example', value: { text: 'Not available' } })
    expect(store.views[0]!.appAddress).toBeUndefined()
    expect(store.views[0]!.staleSince).toBeUndefined()
    store.setSize('https://named.example/', 'swap', 'icon')
    expect(store.views[0]).toMatchObject({ appName: 'Not available', appAddress: 'named.example', value: { text: 'named.example' } })
  })

  it('reads the block on each chain check, so it lands without a restart', async () => {
    const store = await setup()
    const refresh = vi.spyOn(flags, 'refreshBlockedWidgetOrigins')
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(refresh).toHaveBeenCalledTimes(1)
    await store.tick({ chain: fakeChain(), at: NOW + 1000 })
    expect(refresh).toHaveBeenCalledTimes(1)
    await store.tick({ chain: fakeChain(), at: NOW + 31_000 })
    expect(refresh).toHaveBeenCalledTimes(2)
    refresh.mockRestore()
  })

  it('lets the user still remove it', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    blockSwap()
    store.remove(SCOPE, 'swap')
    expect(store.widgets).toHaveLength(0)
  })

  it('blocks every widget with *', async () => {
    const store = await setup()
    flags.blockedWidgetOrigins = ['*']
    expect(store.isBlocked(SCOPE)).toBe(true)
  })
})

describe('a build without the capped downloader', () => {
  beforeEach(() => {
    downloader.available = false
    fetchWidgetImage.mockReset()
  })

  it('has no widgets: no file, search, image, refresh or record, and no adding', async () => {
    const images = { hero: { url: `${SCOPE}hero.png`, sha256: HASH, sendToken: true as const } }
    const content = { value: { text: 'x' }, tone: 'neutral', rows: [], background: { image: 'hero' } }
    memory.set('miniAppWidgets', JSON.stringify([{ ...storedWidget('mainnet', 'swap'), token: 'opaque-token', definition: { ...definition({ images, refresh: { url: `${SCOPE}w`, every: 60 } }), content } }]))
    const store = await setup()
    await store.tick({ chain: fakeChain(), at: NOW + 2 * 3600_000, force: true })
    store.noteLaunch(SCOPE)
    expect(await store.discover(SCOPE)).toMatchObject({ ok: false })
    await store.loadGallery([SCOPE])
    await flushPromises()
    for (const request of [fetchWidgetFile, findWidgetFile, fetchWidgetImage, fetchWidgetRefresh])
      expect(request).not.toHaveBeenCalled()
    expect(memory.has('miniAppWidgetChecks')).toBe(false)
    expect(store.canAddTo(SCOPE)).toBe(false)
    expect(store.galleryScopesFor(['https://swap.example'])).toEqual([])
    expect(store.catalogScopes()).toEqual([])
  })
})

describe('where widgets are stored', () => {
  it('keeps states in the database, which logout deletes', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    store.update(SCOPE, 'swap', live('Invoice 4821'))
    await flushPromises()
    expect(memory.get('miniAppWidgets')).toContain('Invoice 4821')
  })
})

describe('widgets stored by a build that had live values', () => {
  const content = (extra: object) => ({ value: { text: 'x' }, tone: 'neutral', rows: [], ...extra })
  const priceHistory = { kind: 'line', priceHistory: { asset: 'NIM', range: '24h' } }

  it.each([
    ['a live value', content({ value: { live: { price: 'NIM' } } })],
    ['a live info', content({ info: { live: { priceChange: { asset: 'NIM', range: '24h' } } } })],
    ['a live row', content({ rows: [{ label: 'Balance', value: { live: { nimiqBalance: ADDRESS } } }] })],
    ['a price history', content({ chart: priceHistory })],
    ['a price history behind it', content({ background: { chart: priceHistory } })],
  ])('drops one with %s, in its declaration or its state, as Home could not draw it', async (_, removed) => {
    memory.set('miniAppWidgets', JSON.stringify([
      { ...storedWidget('mainnet', 'declared'), definition: { ...definition({ id: 'declared' }), content: removed } },
      { ...storedWidget('mainnet', 'pushed'), state: { content: content({}), next: [{ on: { at: NOW }, state: { content: removed, next: [] } }] } },
      storedWidget('mainnet', 'kept'),
    ]))
    setActivePinia(createPinia())
    const { useMiniAppWidgets } = await import('./mini-app-widgets')
    const store = useMiniAppWidgets()
    // Home draws whatever the store holds, so the state between the read and `ready` counts too.
    const drawn: string[][] = []
    watch(() => store.widgets.map(w => w.widgetId), ids => drawn.push(ids), { flush: 'sync' })
    await flushPromises()
    expect(drawn).toEqual([['kept']])
    expect(JSON.parse(memory.get('miniAppWidgets')!)).toEqual([storedWidget('mainnet', 'kept')])
  })

  it('keeps one that only uses those words for an image\'s key and a text', async () => {
    const images = { live: { url: `${SCOPE}live.png`, sha256: HASH } }
    memory.set('miniAppWidgets', JSON.stringify([
      { ...storedWidget('mainnet', 'keyed'), definition: { ...definition({ id: 'keyed', images }), content: content({ value: { text: '"priceHistory":' }, info: '"live":{"price"' }) } },
    ]))
    const store = await setup()
    expect(store.widgets.map(w => w.widgetId)).toEqual(['keyed'])
  })
})

describe('limits per Mini App', () => {
  const refreshing = (id: string) => definition({ id, refresh: { url: `${SCOPE}w?id=${id}`, every: 60 } })

  it('lets one Mini App fill only part of Home, across its folders', async () => {
    const store = await setup()
    for (let i = 0; i < WIDGET_LIMITS.widgetsPerMiniApp; i++)
      expect(store.add(i % 2 ? `${SCOPE}a/` : SCOPE, definition({ id: `w${i}` }))).toBe(true)
    expect(store.canAddTo(SCOPE)).toBe(false)
    expect(store.add(SCOPE, definition({ id: 'one-more' }))).toBe(false)
    expect(store.canAdd).toBe(true)
    expect(store.canAddTo('https://other.example/')).toBe(true)
    expect(store.add('https://other.example/', definition({ id: 'other' }))).toBe(true)
  })

  it('keeps some chain lookups for other Mini Apps, while any valid state still fits', async () => {
    expect(WIDGET_LIMITS.chainLookupsPerMiniApp).toBeGreaterThanOrEqual(WIDGET_LIMITS.triggersPerState)
    expect(WIDGET_LIMITS.chainLookupsPerMiniApp).toBeLessThan(WIDGET_LIMITS.chainLookups)
    const store = await setup()
    const seen = new Set<string>()
    const nimiqTransaction = async (hash: string) => {
      seen.add(hash[0]!)
      return 'pending' as const
    }
    for (const [id, tag, count] of [['first', 1, 5], ['second', 2, 5]] as const) {
      store.add(SCOPE, definition({ id }))
      store.update(SCOPE, id, live('Waiting', { next: triggers(count, tag) }))
    }
    store.add('https://other.example/', definition())
    store.update('https://other.example/', 'swap', live('Waiting', { next: triggers(5, 3) }))
    await store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW })
    expect([...seen]).toEqual(['1', '3'])
  })

  it('holds a Mini App\'s refreshes at its hourly budget, across its widgets, and catches up later', async () => {
    const store = await setup()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    for (const id of ['a', 'b', 'c'])
      store.add(SCOPE, refreshing(id))
    for (let minute = 0; minute < 40; minute++)
      await store.tick({ chain: fakeChain(), at: NOW + minute * 61_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(WIDGET_LIMITS.refreshBudgets[0]!.max)
    fetchWidgetRefresh.mockClear()
    await store.tick({ chain: fakeChain(), at: NOW + 3_700_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalled()
  })

  it('does not hold back the first fetch or pull to refresh, though the rest waits', async () => {
    memory.set('miniAppWidgetFetches', JSON.stringify({ [new URL(SCOPE).origin]: Array.from({ length: 30 }, (_, i) => NOW - i * 1000) }))
    const store = await setup()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    store.add(SCOPE, refreshing('a'))
    await store.tick({ chain: fakeChain(), at: NOW + 1000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
    await store.tick({ chain: fakeChain(), at: NOW + 70_000 })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
    await store.tick({ chain: fakeChain(), at: NOW + 140_000, force: true })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(2)
  })

  it('gives a freed slot to the widget that has waited longest, not the first listed', async () => {
    const stored = (id: string, refreshDueAt: number) => ({ ...storedWidget('mainnet', id), definition: refreshing(id), lastAttemptAt: refreshDueAt - 60_000, refreshDueAt })
    memory.set('miniAppWidgets', JSON.stringify([stored('fast', NOW - 1000), stored('slow', NOW - 3600_000)]))
    memory.set('miniAppWidgetFetches', JSON.stringify({ [new URL(SCOPE).origin]: Array.from({ length: 29 }, (_, i) => NOW - i * 1000) }))
    const store = await setup()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(fetchWidgetRefresh).toHaveBeenCalledTimes(1)
    expect(fetchWidgetRefresh.mock.calls[0]![0].url).toContain('id=slow')
  })

  it('waits for the stored count before refreshing, so a restart cannot slip past the budget', async () => {
    let read = () => {}
    storedRead.fetches = new Promise<void>((resolve) => {
      read = resolve
    })
    memory.set('miniAppWidgets', JSON.stringify([{ ...storedWidget('mainnet', 'a'), definition: refreshing('a'), lastAttemptAt: NOW - 120_000, refreshDueAt: NOW - 60_000 }]))
    memory.set('miniAppWidgetFetches', JSON.stringify({ [new URL(SCOPE).origin]: Array.from({ length: 30 }, (_, i) => NOW - i * 1000) }))
    const store = await setup()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    read()
    storedRead.fetches = Promise.resolve()
    await flushPromises()
    await store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    expect(JSON.parse(memory.get('miniAppWidgetFetches')!)[new URL(SCOPE).origin]).toHaveLength(30)
  })

  it('stores what it counted, so a restart does not reset the budget', async () => {
    const store = await setup()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    store.add(SCOPE, refreshing('a'))
    await store.tick({ chain: fakeChain(), at: NOW })
    await flushPromises()
    expect(JSON.parse(memory.get('miniAppWidgetFetches')!)[new URL(SCOPE).origin]).toEqual([NOW])
  })

  it('spreads refreshes with up to 30 s of random delay, so servers are not all hit at once', async () => {
    const store = await setup()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    vi.mocked(Math.random).mockReturnValue(0.5)
    store.add(SCOPE, refreshing('a'))
    await store.tick({ chain: fakeChain(), at: NOW })
    expect(store.widgets[0]!.refreshDueAt).toBe(NOW + 60_000 + 15_000)
  })
})

describe('a block arriving while the gallery loads', () => {
  it('leaves sites still waiting uncontacted', async () => {
    const store = await setup()
    const scopes = Array.from({ length: 8 }, (_, i) => `https://site${i}.example/`)
    fetchWidgetFile.mockImplementationOnce(async () => {
      flags.blockedWidgetOrigins = ['https://site7.example']
      return { ok: false, error: 'none', transient: false }
    })
    fetchWidgetFile.mockResolvedValue({ ok: false, error: 'none', transient: false })
    await store.loadGallery(scopes)
    expect(fetchWidgetFile).not.toHaveBeenCalledWith('https://site7.example/')
  })

  it('downloads no preview image from a site that has since been blocked', async () => {
    const store = await setup()
    fetchWidgetImage.mockReset()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [definition({ images: { hero: { url: `${SCOPE}a.png`, sha256: 'a'.repeat(64) } }, content: { value: { text: 'x' }, tone: 'neutral', rows: [], background: { image: 'hero' } } })] } })
    await store.loadGallery([SCOPE])
    flags.blockedWidgetOrigins = ['https://swap.example']
    await store.loadPreviewImages([SCOPE])
    expect(fetchWidgetImage).not.toHaveBeenCalled()
  })
})

describe('catalog Mini Apps in the gallery', () => {
  it('offers the catalog\'s folders, without the blocked ones', async () => {
    const store = await setup()
    expect(store.catalogScopes()).toEqual(['https://swap.example/'])
    flags.blockedWidgetOrigins = ['https://swap.example']
    expect(store.catalogScopes()).toEqual([])
  })

  it('takes a catalog URL\'s folder, without its query', async () => {
    const catalog = miniApps.popularDApps
    miniApps.popularDApps = [{ url: 'https://other.example/app?ref=pay', name: 'Other' }]
    const store = await setup()
    expect(store.catalogScopes()).toEqual(['https://other.example/app/'])
    miniApps.popularDApps = catalog
  })

  it('asks a few sites at a time, not the whole catalog at once', async () => {
    const store = await setup()
    let running = 0
    let most = 0
    fetchWidgetFile.mockImplementation(async () => {
      most = Math.max(most, ++running)
      await flushPromises()
      running--
      return { ok: false, error: 'none', transient: false }
    })
    await store.loadGallery(Array.from({ length: 20 }, (_, i) => `https://site${i}.example/`))
    expect(fetchWidgetFile).toHaveBeenCalledTimes(20)
    expect(most).toBeLessThanOrEqual(6)
  })
})

describe('a re-check of a widget file', () => {
  it('is stored before its request, so one that ends the app is not repeated at each start', async () => {
    const first = await setup()
    first.add(SCOPE, definition())
    await flushPromises()
    let storedBefore = ''
    fetchWidgetFile.mockImplementation(() => {
      storedBefore = memory.get('miniAppWidgets')!
      return new Promise(() => {})
    })
    const at = NOW + 2 * 3600_000
    void first.tick({ chain: fakeChain(), at })
    await flushPromises()
    expect(JSON.parse(storedBefore)[0].definitionCheckedAt).toBe(at)
    fetchWidgetFile.mockClear()
    const second = await setup()
    await second.tick({ chain: fakeChain(), at: at + 60_000 })
    expect(fetchWidgetFile).not.toHaveBeenCalled()
  })

  it('is tried again a minute after it could not be stored, not an hour', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    await flushPromises()
    storedRead.failingWrite = 'miniAppWidgets'
    const at = NOW + 2 * 3600_000
    await store.tick({ chain: fakeChain(), at }).catch(() => {})
    storedRead.failingWrite = ''
    await store.tick({ chain: fakeChain(), at: at + 60_000 })
    expect(fetchWidgetFile).toHaveBeenCalled()
  })

  it('makes no request it could not store', async () => {
    const store = await setup()
    store.add(SCOPE, definition())
    await flushPromises()
    storedRead.failingWrite = 'miniAppWidgets'
    await store.tick({ chain: fakeChain(), at: NOW + 2 * 3600_000 }).catch(() => {})
    expect(fetchWidgetFile).not.toHaveBeenCalled()
  })

  it('reads a folder\'s file once for all its widgets, and applies it to all', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ id: 'a' }))
    vi.setSystemTime(NOW + 15 * 60_000)
    store.add(SCOPE, definition({ id: 'b' }))
    const changed = (id: string) => definition({ id, name: 'Changed' })
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [changed('a'), changed('b')] } })
    await store.tick({ chain: fakeChain(), at: NOW + 3600_000 })
    expect(store.widgets.map(w => w.definition.name)).toEqual(['Changed', 'Changed'])
    await store.tick({ chain: fakeChain(), at: NOW + 3600_000 + 15 * 60_000 })
    expect(fetchWidgetFile).toHaveBeenCalledTimes(1)
  })

  it('replaces the copy the gallery and add use', async () => {
    const store = await setup()
    findWidgetFile.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [definition()] } } })
    await store.discover(SCOPE)
    store.add(SCOPE, definition())
    const file = { widgets: [definition({ name: 'Changed' }), definition({ id: 'new' })] }
    fetchWidgetFile.mockResolvedValue({ ok: true, value: file })
    await store.tick({ chain: fakeChain(), at: NOW + 3600_000 })
    expect(store.galleryFiles.get(SCOPE)).toEqual(file)
    expect(await store.discover(SCOPE)).toEqual({ ok: true, value: { scope: SCOPE, file } })
  })

  it('is due right away for a widget added from a copy read over an hour ago', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [definition()] } })
    await store.loadGallery([SCOPE])
    const later = NOW + 2 * 3600_000
    vi.setSystemTime(later)
    store.add(SCOPE, definition())
    await store.tick({ chain: fakeChain(), at: later })
    expect(fetchWidgetFile).toHaveBeenCalledTimes(2)
  })

  it('does not wait for a refresh on pull to refresh', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 } }))
    const answer = deferred<object>()
    fetchWidgetRefresh.mockReturnValue(answer.promise)
    const pulled = store.tick({ chain: fakeChain(), at: NOW + 61_000, force: true })
    await flushPromises()
    expect(fetchWidgetFile).toHaveBeenCalledTimes(1)
    answer.resolve({ ok: true, value: null })
    await pulled
  })
})

describe('discovery and gallery', () => {
  it('discovers a Mini App\'s scope once per session and offers it to the gallery', async () => {
    const store = await setup()
    findWidgetFile.mockResolvedValue({ ok: true, value: { scope: SUBFOLDER, file: { widgets: [definition()] } } })
    await store.discover('https://name.github.io/my-app/orders/12')
    await store.discover('https://name.github.io/my-app/orders/12')
    expect(findWidgetFile).toHaveBeenCalledTimes(1)
    expect(store.galleryScopesFor(['https://name.github.io'])).toEqual([SUBFOLDER, 'https://name.github.io/'])
    expect(store.galleryFiles.get(SUBFOLDER)).toEqual({ widgets: [definition()] })
  })

  it('retries a discovery that failed on a network error', async () => {
    const store = await setup()
    findWidgetFile.mockResolvedValueOnce({ ok: false, error: 'offline', transient: true })
    findWidgetFile.mockResolvedValueOnce({ ok: true, value: { scope: SCOPE, file: { widgets: [definition()] } } })
    expect((await store.discover('https://swap.example/')).ok).toBe(false)
    expect((await store.discover('https://swap.example/')).ok).toBe(true)
  })

  it('skips discovery on launch within a day of checking the same folder', async () => {
    memory.set('miniAppWidgetChecks', JSON.stringify({ 'https://swap.example/': { scope: SCOPE, checkedAt: NOW - 3600_000 } }))
    findWidgetFile.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [definition()] } } })
    const store = await setup()
    store.noteLaunch('https://swap.example/?swap=abc')
    await flushPromises()
    expect(findWidgetFile).not.toHaveBeenCalled()
    vi.setSystemTime(NOW + 24 * 3600_000)
    store.noteLaunch('https://swap.example/?swap=abc')
    expect(findWidgetFile).toHaveBeenCalledWith('https://swap.example/')
  })

  it('does not let a known root hide a Mini App in a subfolder', async () => {
    memory.set('miniAppWidgetChecks', JSON.stringify({ 'https://name.github.io/': { scope: 'https://name.github.io/', checkedAt: NOW } }))
    findWidgetFile.mockResolvedValue({ ok: true, value: { scope: SUBFOLDER, file: { widgets: [definition()] } } })
    const store = await setup()
    store.noteLaunch('https://name.github.io/my-app/')
    await flushPromises()
    expect(findWidgetFile).toHaveBeenCalledWith('https://name.github.io/my-app/')
    expect(store.galleryScopesFor(['https://name.github.io'])).toEqual([SUBFOLDER, 'https://name.github.io/'])
  })

  it('remembers a definite miss for a day, but never a network error', async () => {
    const store = await setup()
    findWidgetFile.mockResolvedValueOnce({ ok: false, error: 'offline', transient: true })
    store.noteLaunch('https://none.example/')
    await flushPromises()
    findWidgetFile.mockResolvedValueOnce({ ok: false, error: 'no valid nimiq-pay-widgets.json in https://none.example/', transient: false })
    store.noteLaunch('https://none.example/')
    await flushPromises()
    const nextSession = await setup()
    nextSession.noteLaunch('https://none.example/')
    await flushPromises()
    expect(findWidgetFile).toHaveBeenCalledTimes(2)
  })

  it('loads each scope once per session and hides scopes without a file', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValueOnce({ ok: true, value: { widgets: [definition()] } })
    fetchWidgetFile.mockResolvedValueOnce({ ok: false, error: '404', transient: false })
    await store.loadGallery([SCOPE, 'https://none.example/'])
    await store.loadGallery([SCOPE])
    expect(fetchWidgetFile).toHaveBeenCalledTimes(2)
    expect(store.galleryFiles.get('https://none.example/')).toBeNull()
  })

  it('asks again after a network error instead of remembering no file', async () => {
    const store = await setup()
    fetchWidgetFile.mockResolvedValueOnce({ ok: false, error: 'offline', transient: true })
    await store.loadGallery([SCOPE])
    expect(store.galleryFiles.has(SCOPE)).toBe(false)
    fetchWidgetFile.mockResolvedValueOnce({ ok: true, value: { widgets: [definition()] } })
    await store.loadGallery([SCOPE])
    expect(store.galleryFiles.get(SCOPE)).toEqual({ widgets: [definition()] })
  })

  it('drops misses older than a day from the remembered checks, and keeps found folders', async () => {
    memory.set('miniAppWidgetChecks', JSON.stringify({
      'https://old-miss.example/': { scope: null, checkedAt: NOW - 2 * 24 * 3600_000 },
      'https://new-miss.example/': { scope: null, checkedAt: NOW - 3600_000 },
      'https://old-found.example/': { scope: 'https://old-found.example/', checkedAt: NOW - 2 * 24 * 3600_000 },
    }))
    const store = await setup()
    findWidgetFile.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [definition()] } } })
    await store.discover('https://swap.example/')
    await flushPromises()
    expect(Object.keys(JSON.parse(memory.get('miniAppWidgetChecks')!)).sort()).toEqual(['https://new-miss.example/', 'https://old-found.example/', SCOPE])
  })
})
