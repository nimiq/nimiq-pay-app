import type { WidgetChain } from '@/lib/mini-app-widget-chain'
import type { WidgetDefinition, WidgetState } from '@/lib/mini-app-widgets'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MINI_APP_FALLBACK_ICON } from '@/lib/mini-app-icons'
import { WIDGET_LIMITS } from '@/lib/mini-app-widgets'

const flags = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return reactive({ blockedWidgetOrigins: [] as string[], refreshBlockedWidgetOrigins: () => {} })
})
const { app, fetchWidgetFile, fetchWidgetImage, fetchWidgetRefresh, findWidgetFile, memory, miniApps, nimiqNetwork, storedRead } = vi.hoisted(() => ({
  storedRead: { fetches: Promise.resolve() as Promise<unknown> },
  miniApps: { popularDApps: [{ name: 'Swap', url: 'https://swap.example' }], iconForUrl: (url: string) => `${url}icon.png` },
  app: { language: 'en', selectedFiat: 'EUR' },
  fetchWidgetFile: vi.fn(),
  fetchWidgetRefresh: vi.fn(),
  fetchWidgetImage: vi.fn(),
  findWidgetFile: vi.fn(),
  memory: new Map<string, string>(),
  nimiqNetwork: { height: 1000 },
}))

vi.mock('@/lib', () => ({ isTestnet: false, isDev: false }))
vi.mock('@/lib/mini-app-widget-sources', () => ({ fetchWidgetFile, fetchWidgetImage, fetchWidgetRefresh, findWidgetFile }))
vi.mock('@/stores/app', () => ({
  kv: () => ({
    getItem: async (key: string) => {
      if (key === 'miniAppWidgetFetches')
        await storedRead.fetches
      return memory.get(key) ?? null
    },
    setItem: async (key: string, value: string) => { memory.set(key, value) },
    removeItem: async (key: string) => { memory.delete(key) },
  }),
  useApp: () => app,
}))
vi.mock('@/stores/mini-apps', () => ({
  stripTrailingSlash: (url: string) => url.replace(/\/$/, ''),
  useMiniApps: () => miniApps,
}))
vi.mock('@/stores/nimiq-network', () => ({ useNimiqNetwork: () => nimiqNetwork }))
vi.mock('@/stores/feature-flags', () => ({ useFeatureFlags: () => flags }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))
vi.mock('@/stores/polygon-usdt', () => ({}))
vi.mock('@/stores/remote-signer', () => ({}))
vi.mock('@/composables/useApi', () => ({}))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

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
    nimiqBalance: async () => 0,
    nimiqStake: async () => 0,
    polygonTransaction: async () => 'pending',
    usdtBalance: async () => 0,
    price: async () => 1,
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

async function setup() {
  setActivePinia(createPinia())
  const { useMiniAppWidgets } = await import('./mini-app-widgets')
  const store = useMiniAppWidgets()
  await flushPromises()
  return store
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.setSystemTime(NOW)
  memory.clear()
  flags.blockedWidgetOrigins = []
  app.selectedFiat = 'EUR'
  nimiqNetwork.height = 1000
  fetchWidgetFile.mockReset()
  fetchWidgetRefresh.mockReset()
  findWidgetFile.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('adding, updating, removing', () => {
  it('adds a widget at its first size, named from the catalog, and refuses an eleventh', async () => {
    const store = await setup()
    expect(store.add(SCOPE, definition())).toBe(true)
    expect(store.views[0]).toMatchObject({ appName: 'Swap', appIcon: 'https://swap.example/icon.png', size: 'medium', value: { kind: 'text', text: 'Start a swap' }, url: 'https://swap.example/' })
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
    expect(store.views[0]!.value).toEqual({ kind: 'text', text: 'Start a swap' })
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
    expect(store.views[0]!.value).toEqual({ kind: 'text', text: 'Start a swap' })
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

  it('does not starve a balance behind two widgets with 5 triggers each', async () => {
    const store = await setup()
    const seen = new Set<string>()
    const nimiqBalance = vi.fn(async () => 5e5)
    const nimiqTransaction = async (hash: string) => {
      seen.add(hash)
      return 'pending' as const
    }
    const chain = fakeChain({ nimiqTransaction, nimiqBalance })
    for (const [i, scope] of ['https://one.example/', 'https://two.example/'].entries()) {
      store.add(scope, definition())
      store.update(scope, 'swap', live('Waiting', { next: triggers(5, i + 1) }))
    }
    store.add('https://balance.example/', definition({ content: { value: { live: { nimiqBalance: ADDRESS } }, tone: 'neutral', rows: [] } }))
    for (let i = 0; i < 3; i++)
      await store.tick({ chain, at: NOW + i * 30_000 })
    expect(seen.size).toBe(10)
    expect(nimiqBalance).toHaveBeenCalled()
  })

  it('looks up a widget\'s payment triggers before its own balances', async () => {
    const store = await setup()
    const seen = new Set<string>()
    const nimiqTransaction = async (hash: string) => {
      seen.add(hash)
      return 'pending' as const
    }
    store.add(SCOPE, definition())
    const balance = (address: string) => ({ live: { nimiqBalance: address } })
    store.update(SCOPE, 'swap', {
      content: { label: 'Waiting', value: balance('A'), info: balance('B'), tone: 'neutral', rows: [{ label: 'C', value: balance('C') }] },
      next: triggers(8, 1),
    })
    await store.tick({ chain: fakeChain({ nimiqTransaction }), at: NOW })
    expect(seen.size).toBe(8)
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

  it('re-resolves live prices when the fiat currency changes', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ content: { value: { live: { price: 'NIM' } }, tone: 'neutral', rows: [] } }))
    const price = vi.fn(async (_asset: string, fiat: string) => (fiat === 'EUR' ? 0.0004 : 0.0005))
    await store.tick({ chain: fakeChain({ price }), at: NOW })
    expect(store.views[0]!.value).toEqual({ kind: 'amount', amount: '0.0004', currency: 'EUR' })
    app.selectedFiat = 'USD'
    await store.tick({ chain: fakeChain({ price }), at: NOW + 1000 })
    expect(store.views[0]!.value).toEqual({ kind: 'amount', amount: '0.0005', currency: 'USD' })
  })

  it('looks up rows only at the large size, which draws them', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ sizes: ['medium', 'large'], content: { value: { text: 'Staked' }, tone: 'neutral', rows: [{ label: 'Wallet', value: { live: { nimiqBalance: ADDRESS } } }] } }))
    const nimiqBalance = vi.fn(async () => 1e5)
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW })
    expect(nimiqBalance).not.toHaveBeenCalled()
    store.setSize(SCOPE, 'swap', 'large')
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW + 30_000 })
    expect(nimiqBalance).toHaveBeenCalledTimes(1)
  })

  it('looks up a chart\'s price history only at the large size, which draws it', async () => {
    const store = await setup()
    const chart = definition({ sizes: ['small', 'large'], content: { value: { live: { price: 'NIM' } }, chart: { kind: 'line', priceHistory: { asset: 'NIM', range: '24h' } }, tone: 'neutral', rows: [] } })
    store.add(SCOPE, chart)
    const price = vi.fn(async () => 0.0004)
    await store.tick({ chain: fakeChain({ price }), at: NOW })
    expect(price).toHaveBeenCalledTimes(1)
    store.setSize(SCOPE, 'swap', 'large')
    await store.tick({ chain: fakeChain({ price }), at: NOW + 1000 })
    expect(store.views[0]!.chart?.points).toHaveLength(25)
  })

  it('retries a failed price and price history lookup at the next chain check, not after five minutes', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ sizes: ['large'], content: { value: { live: { price: 'NIM' } }, chart: { kind: 'line', priceHistory: { asset: 'NIM', range: '24h' } }, tone: 'neutral', rows: [] } }))
    let answers = false
    const price = vi.fn(async () => (answers ? 0.0004 : undefined))
    await store.tick({ chain: fakeChain({ price }), at: NOW })
    expect(store.views[0]!.value).toEqual({ kind: 'pending' })
    answers = true
    await store.tick({ chain: fakeChain({ price }), at: NOW + 15_000 })
    expect(store.views[0]!.value).toEqual({ kind: 'pending' })
    await store.tick({ chain: fakeChain({ price }), at: NOW + 30_000 })
    expect(store.views[0]!.value).toEqual({ kind: 'amount', amount: '0.0004', currency: 'EUR' })
    expect(store.views[0]!.chart?.points).toHaveLength(25)
  })

  it('keeps showing a balance when the fiat currency changes', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ content: { value: { live: { nimiqBalance: ADDRESS } }, tone: 'neutral', rows: [] } }))
    const nimiqBalance = vi.fn(async () => 1234500)
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW })
    expect(store.views[0]!.value).toEqual({ kind: 'amount', amount: '12.345', currency: 'NIM' })
    app.selectedFiat = 'USD'
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW + 1000 })
    expect(store.views[0]!.value).toEqual({ kind: 'amount', amount: '12.345', currency: 'NIM' })
    expect(nimiqBalance).toHaveBeenCalledTimes(1)
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

  it('draws Nimiq Pay\'s own widget under its name, opening nothing, and re-checks it without a download', async () => {
    const { BUILTIN_WIDGET_SCOPE, builtinWidgetFile } = await import('@/lib/mini-app-widget-builtins')
    const store = await setup()
    store.add(BUILTIN_WIDGET_SCOPE, builtinWidgetFile().widgets[0]!)
    expect(store.views[0]).toMatchObject({ appName: 'Nimiq Pay', url: undefined })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    expect(fetchWidgetFile).not.toHaveBeenCalled()
    expect(store.widgets).toHaveLength(1)
  })

  it('is ready once the stored widgets have been read', async () => {
    expect((await setup()).ready).toBe(true)
  })

  it('builds a preview view of a definition without adding it', async () => {
    const store = await setup()
    expect(store.previewView(SCOPE, definition())).toMatchObject({ appName: 'Swap', size: 'medium', value: { kind: 'text', text: 'Start a swap' }, key: `${SCOPE}#swap` })
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
      value: { kind: 'amount', amount: '0.05', currency: 'ETH' },
      countdown: { label: 'Deposit window', left: 1_740_000 },
    })
  })

  it('never reaches Home: an added widget starts on its resting state', async () => {
    const store = await setup()
    store.add(SCOPE, definition({ demo }))
    expect(store.views[0]).toMatchObject({ value: { kind: 'text', text: 'Start a swap' }, tone: 'neutral' })
    expect(store.views[0]!.countdown).toBeUndefined()
  })

  it('has its live values looked up for the gallery, in place of the resting state\'s', async () => {
    const store = await setup()
    const price = vi.fn<WidgetChain['price']>(async () => 0.0004)
    await store.resolvePreviews([definition({ content: { value: { live: { price: 'BTC' } }, tone: 'neutral', rows: [] }, demo: { value: { live: { price: 'NIM' } }, tone: 'neutral', rows: [] } })], fakeChain({ price }))
    expect(price.mock.calls.map(([asset]) => asset)).toEqual(['NIM'])
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
    expect(store.views[0]).toMatchObject({ value: { kind: 'text', text: 'No longer available' }, tone: 'neutral' })
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
    expect(store.views[0]).toMatchObject({ value: { kind: 'text', text: 'Start a swap' }, reconnect: true })
    await store.tick({ chain: fakeChain(), at: NEXT, force: true })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    fetchWidgetRefresh.mockResolvedValue({ ok: true, value: null })
    expect(store.setToken(SCOPE, 'swap', 'fresh')).toBe(true)
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
    expect((await setup()).setToken(SCOPE, 'swap', 'x')).toBe(false)
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
    const nimiqBalance = vi.fn(async () => 1e5)
    store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 }, content: { value: { live: { nimiqBalance: ADDRESS } }, tone: 'neutral', rows: [] } }))
    fetchWidgetRefresh.mockResolvedValue({ ok: false, error: 'gone', transient: false, status: 410 })
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW })
    nimiqBalance.mockClear()
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW + 120_000 })
    expect(nimiqBalance).not.toHaveBeenCalled()
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
  const pictured = (images: Record<string, { url: string, sha256: string }>) => definition({ images, content: { value: { text: 'x' }, tone: 'neutral', rows: [], background: { image: 'hero' } } })
  const old = pictured({ hero: { url: url('old'), sha256: OLD } })
  const next = pictured({ hero: { url: url('new'), sha256: NEW } })
  const IMAGE_KEY = (hash: string) => `miniAppWidgetImage:${hash}`

  beforeEach(() => {
    fetchWidgetImage.mockReset()
    fetchWidgetImage.mockImplementation(async (image: { sha256: string }) => ({ ok: true, value: `data:image/png;base64,${image.sha256}` }))
    memory.clear()
  })

  const recheck = async (store: Awaited<ReturnType<typeof setup>>, file: WidgetDefinition) => {
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [file] } })
    await store.tick({ chain: fakeChain(), at: NOW + 25 * 3600_000 })
    await flushPromises()
  }

  it('downloads a widget\'s images when added, stores them, and draws the one its state picks', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledWith({ url: url('old'), sha256: OLD }, SCOPE)
    expect(memory.get(IMAGE_KEY(OLD))).toBe(`data:image/png;base64,${OLD}`)
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('keeps the card plain for a key it did not declare or an image that failed', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'hash', transient: false })
    store.add(SCOPE, old)
    await flushPromises()
    expect(store.views[0]!.background).toBeUndefined()
    expect(memory.has(IMAGE_KEY(OLD))).toBe(false)
    store.update(SCOPE, 'swap', { content: { value: { text: 'y' }, tone: 'neutral', rows: [], background: { image: 'other' } } } as never)
    expect(store.views[0]!.background).toBeUndefined()
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

  it('tries a failed image again at the next re-check', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValueOnce({ ok: false, error: 'down', transient: true })
    store.add(SCOPE, old)
    await flushPromises()
    await recheck(store, old)
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('keeps drawing the approved image when the file changes it, and downloads nothing until approved', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await flushPromises()
    fetchWidgetImage.mockClear()
    await recheck(store, next)
    expect(fetchWidgetImage).not.toHaveBeenCalled()
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
    expect(store.views[0]!.pendingImages).toBe(true)
    expect(store.hasPendingImages(SCOPE, 'swap')).toBe(true)
  })

  it('swaps to the new image once approved, and frees the old one', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await flushPromises()
    await recheck(store, next)
    store.approveImages(SCOPE, 'swap')
    await flushPromises()
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledWith({ url: url('new'), sha256: NEW }, SCOPE)
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${NEW}` })
    expect(store.views[0]!.pendingImages).toBe(false)
    expect(memory.has(IMAGE_KEY(OLD))).toBe(false)
    expect(memory.has(IMAGE_KEY(NEW))).toBe(true)
  })

  it('needs no approval when the file only drops an image', async () => {
    const store = await setup()
    const two = pictured({ hero: { url: url('old'), sha256: OLD }, side: { url: url('new'), sha256: NEW } })
    store.add(SCOPE, two)
    await flushPromises()
    await recheck(store, old)
    expect(store.views[0]!.pendingImages).toBe(false)
    expect(store.widgets[0]!.definition.images).toEqual(old.images)
    expect(memory.has(IMAGE_KEY(NEW))).toBe(false)
  })

  it('withdraws a pending change when the file goes back', async () => {
    const store = await setup()
    store.add(SCOPE, old)
    await flushPromises()
    await recheck(store, next)
    fetchWidgetFile.mockResolvedValue({ ok: true, value: { widgets: [old] } })
    await store.tick({ chain: fakeChain(), at: NOW + 50 * 3600_000 })
    expect(store.views[0]!.pendingImages).toBe(false)
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

  it('looks up the price history of a chart background on a small card, not on an icon', async () => {
    const price = vi.fn(async () => 0.0004)
    const store = await setup()
    store.add(SCOPE, definition({ sizes: ['icon', 'small'], content: { value: { text: 'x' }, tone: 'neutral', rows: [], background: { chart: { kind: 'line', priceHistory: { asset: 'NIM', range: '24h' } } } } }))
    await store.tick({ chain: fakeChain({ price }), at: NOW })
    expect(price).not.toHaveBeenCalled()
    store.setSize(SCOPE, 'swap', 'small')
    await store.tick({ chain: fakeChain({ price }), at: NOW + 30_000 })
    const background = store.views[0]!.background
    expect(background?.kind === 'chart' && background.chart.points).toHaveLength(25)
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

  it('tries a failed image again every few minutes, without waiting for the daily re-check', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValueOnce({ ok: false, error: 'down', transient: true }).mockResolvedValueOnce({ ok: false, error: 'down', transient: true })
    store.add(SCOPE, old)
    await flushPromises()
    await store.tick({ chain: fakeChain(), at: NOW + 60_000 })
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledTimes(2)
    await store.tick({ chain: fakeChain(), at: NOW + 120_000 })
    await flushPromises()
    expect(fetchWidgetImage).toHaveBeenCalledTimes(2)
    await store.tick({ chain: fakeChain(), at: NOW + 6 * 60_000 })
    await flushPromises()
    await flushPromises()
    expect(store.views[0]!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
  })

  it('does not let another site\'s bad URL for the same hash keep an image away', async () => {
    const store = await setup()
    const other = 'https://other.example/'
    fetchWidgetImage.mockImplementation(async (image: { sha256: string }, scope: string) => scope === other
      ? { ok: false, error: 'hash', transient: false }
      : { ok: true, value: `data:image/png;base64,${image.sha256}` })
    store.add(SCOPE, old)
    store.add(other, old)
    await flushPromises()
    await flushPromises()
    expect(store.views.find(view => view.scope === SCOPE)!.background).toEqual({ kind: 'image', src: `data:image/png;base64,${OLD}` })
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

  it('does not download a refused image again this session, but retries one that could not be reached', async () => {
    const store = await setup()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'hash', transient: false })
    store.add(SCOPE, old)
    await flushPromises()
    await recheck(store, old)
    expect(fetchWidgetImage).toHaveBeenCalledTimes(1)
    const other = await setup()
    fetchWidgetImage.mockClear()
    fetchWidgetImage.mockResolvedValue({ ok: false, error: 'down', transient: true })
    other.remove(SCOPE, 'swap')
    await flushPromises()
    other.add(SCOPE, old)
    await flushPromises()
    await recheck(other, old)
    expect(fetchWidgetImage).toHaveBeenCalledTimes(2)
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
    expect(store.views[0]).toMatchObject({ value: { kind: 'text', text: 'Not available' }, tone: 'neutral' })
    expect(store.views[0]!.label).toBeUndefined()
    expect(store.views[0]!.url).toBeUndefined()
    expect(store.views[0]!.appIcon).toBe(MINI_APP_FALLBACK_ICON)
    flags.blockedWidgetOrigins = []
    expect(store.views[0]).toMatchObject({ label: 'Secret', url: `${SCOPE}x` })
  })

  it('asks nothing for a blocked widget: no refresh, no file, no chain', async () => {
    const store = await setup()
    const nimiqBalance = vi.fn(async () => 1e5)
    store.add(SCOPE, definition({ refresh: { url: `${SCOPE}w`, every: 60 }, content: { value: { live: { nimiqBalance: ADDRESS } }, tone: 'neutral', rows: [] } }))
    blockSwap()
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW + 25 * 3600_000 })
    expect(fetchWidgetRefresh).not.toHaveBeenCalled()
    expect(fetchWidgetFile).not.toHaveBeenCalled()
    expect(nimiqBalance).not.toHaveBeenCalled()
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
    expect(store.views[0]).toMatchObject({ appName: 'named.example', value: { kind: 'text', text: 'Not available' } })
    expect(store.views[0]!.appAddress).toBeUndefined()
    expect(store.views[0]!.staleSince).toBeUndefined()
    store.setSize('https://named.example/', 'swap', 'icon')
    expect(store.views[0]).toMatchObject({ appName: 'Not available', appAddress: 'named.example', value: { kind: 'text', text: 'named.example' } })
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

  it('blocks every Mini App with *, but not Nimiq Pay\'s own widgets', async () => {
    const { BUILTIN_WIDGET_SCOPE } = await import('@/lib/mini-app-widget-builtins')
    const store = await setup()
    flags.blockedWidgetOrigins = ['*']
    expect(store.isBlocked(SCOPE)).toBe(true)
    expect(store.isBlocked(BUILTIN_WIDGET_SCOPE)).toBe(false)
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
    const nimiqBalance = vi.fn(async () => 1e5)
    const rows = Array.from({ length: 10 }, (_, i) => ({ label: `r${i}`, value: { live: { nimiqBalance: `${ADDRESS}${i}` } } }))
    store.add(SCOPE, definition({ sizes: ['large'], content: { value: { text: 'x' }, tone: 'neutral', rows } }))
    await store.tick({ chain: fakeChain({ nimiqBalance }), at: NOW })
    expect(nimiqBalance).toHaveBeenCalledTimes(WIDGET_LIMITS.chainLookupsPerMiniApp)
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
