import type { WidgetChain } from '@/lib/mini-app-widget-chain'
import type { WidgetDefinition, WidgetState } from '@/lib/mini-app-widgets'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { app, fetchWidgetFile, fetchWidgetRefresh, findWidgetFile, memory, nimiqNetwork } = vi.hoisted(() => ({
  app: { language: 'en', selectedFiat: 'EUR' },
  fetchWidgetFile: vi.fn(),
  fetchWidgetRefresh: vi.fn(),
  findWidgetFile: vi.fn(),
  memory: new Map<string, string>(),
  nimiqNetwork: { height: 1000 },
}))

vi.mock('@/lib', () => ({ isTestnet: false, isDev: false }))
vi.mock('@/lib/mini-app-widget-sources', () => ({ fetchWidgetFile, fetchWidgetRefresh, findWidgetFile }))
vi.mock('@/stores/app', () => ({
  kv: () => ({
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => { memory.set(key, value) },
    removeItem: async (key: string) => { memory.delete(key) },
  }),
  useApp: () => app,
}))
vi.mock('@/stores/mini-apps', () => ({
  stripTrailingSlash: (url: string) => url.replace(/\/$/, ''),
  useMiniApps: () => ({ popularDApps: [{ name: 'Swap', url: 'https://swap.example' }], iconForUrl: (url: string) => `${url}icon.png` }),
}))
vi.mock('@/stores/nimiq-network', () => ({ useNimiqNetwork: () => nimiqNetwork }))
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
  vi.setSystemTime(NOW)
  memory.clear()
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
    expect(fetchWidgetRefresh).toHaveBeenCalledWith({ url: 'https://swap.example/w', every: 60 }, { lang: 'en', network: 'mainnet' }, SCOPE, NOW + 60_000)
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
