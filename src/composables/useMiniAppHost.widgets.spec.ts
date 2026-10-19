import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRemoteSigner } from '@/stores/remote-signer'
import { MiniAppHost } from './useMiniAppHost'

const { createBirpc, toastShow, trackWeb3Request, widgets } = vi.hoisted(() => ({
  createBirpc: vi.fn(() => ({
    $close: vi.fn(),
    onChainAdded: { asEvent: vi.fn() },
    onChainChanged: { asEvent: vi.fn() },
    onUnsupportedChain: { asEvent: vi.fn() },
    updateRpcUrl: vi.fn(),
  })),
  toastShow: vi.fn(),
  trackWeb3Request: vi.fn(),
  widgets: {
    discover: vi.fn(),
    isOnHome: vi.fn(() => false),
    canAdd: true,
    add: vi.fn(() => true),
    update: vi.fn(() => true),
    remove: vi.fn(),
    listForScope: vi.fn(() => ['swap']),
  },
}))

vi.mock('@capacitor/toast', () => ({ Toast: { show: toastShow } }))
vi.mock('birpc', () => ({ createBirpc }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (m: string) => m } }))
vi.mock('@/lib/analytics', () => ({ trackChainSwitched: vi.fn(), trackWeb3Request }))
vi.mock('@/lib/ethereum/hex-utils', () => ({ hexToBytes: vi.fn() }))
vi.mock('@/lib/ethereum/validation', () => ({ addressesEqual: vi.fn(), isValidEthAddress: vi.fn(), parseChainId: vi.fn() }))
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: vi.fn() }))
vi.mock('@/stores/nimiq-network', () => ({ STAKING_CONTRACT_ADDRESS: 'NQ00', useNimiqNetwork: vi.fn() }))
vi.mock('@/stores/polygon-usdt', () => ({ usePolygonUsdt: vi.fn() }))
vi.mock('@/stores/remote-signer', () => ({ useRemoteSigner: vi.fn() }))
vi.mock('@/stores/transactions', () => ({ useTransactions: vi.fn() }))
vi.mock('@/stores/mini-apps', () => ({ useMiniApps: () => ({ hasDeviceIdConsent: vi.fn(), grantDeviceIdConsent: vi.fn() }) }))
vi.mock('@/stores/mini-app-widgets', () => ({ useMiniAppWidgets: () => widgets }))
vi.mock('@/stores/app', async importOriginal => ({ ...await importOriginal<typeof import('@/stores/app')>(), useApp: () => ({ language: 'en' }) }))
vi.mock('../../web3-provider/src/utils', () => ({ generateUUID: () => 'test-uuid' }))
vi.mock('./useLogger', () => ({ useLogger: () => ({ error: vi.fn(), log: vi.fn(), warn: vi.fn() }) }))

const DEFINITION = { id: 'swap', name: 'Swap status', description: 'Follows your swap.', sizes: ['medium'], content: { value: { text: 'Start' }, tone: 'neutral', rows: [] }, translations: {} }
const SCOPE = 'https://swap.example/app/'

function createHost(confirm = vi.fn().mockResolvedValue(true), { reconnect = false } = {}) {
  const listeners: Record<string, Array<(event: object) => void>> = {}
  const removes: Record<string, ReturnType<typeof vi.fn>> = {}
  const browser = {
    addListener: vi.fn((name: string, listener: (event: object) => void) => {
      (listeners[name] ??= []).push(listener)
      return Promise.resolve({ remove: removes[name] ??= vi.fn() })
    }),
    clearAllCookies: vi.fn(() => Promise.resolve()),
    postMessage: vi.fn(),
    removeAllListeners: vi.fn(() => Promise.resolve()),
  }
  const config = { requestUserConfirmation: confirm, title: 'Swap', url: 'https://Swap.Example/app' }
  const host = reconnect ? MiniAppHost.reconnect(browser as never, config, '0x1') : new MiniAppHost(browser as never, config)
  const [handlers, options] = createBirpc.mock.calls.at(-1)! as any[]
  const received = vi.fn()
  options.on(received)
  const handleRequest = handlers.handleRequest as (params: { network: string, name: string, params?: unknown }) => Promise<unknown>
  const emit = async (name: string, event: object) => {
    await Promise.resolve()
    listeners[name]?.forEach(listener => listener(event))
  }
  return {
    close: (id?: string) => emit('closeEvent', { id, url: 'https://swap.example/' }),
    confirm,
    host,
    load: (id?: string) => emit('browserPageLoaded', { id }),
    message: (id: string) => emit('messageFromWebview', { id, detail: { type: 'birpc' } }),
    navigate: (url: string, id?: string) => emit('urlChangeEvent', { id, url }),
    rawRequest: handleRequest,
    received,
    removes,
    request: (name: string, params?: unknown) => handleRequest({ network: 'host', name, params }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  widgets.isOnHome.mockReturnValue(false)
  widgets.canAdd = true
  widgets.discover.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [DEFINITION] } } })
  vi.mocked(useRemoteSigner).mockReturnValue({ remoteAddress: undefined } as never)
})

describe('widgets.add', () => {
  it('asks once, then adds the declared widget under the Mini App\'s scope', async () => {
    const { confirm, request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(widgets.discover).toHaveBeenCalledWith('https://Swap.Example/app')
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'widget', widgetName: 'Swap status', description: 'Follows your swap.', url: 'https://Swap.Example/app' }))
    expect(widgets.add).toHaveBeenCalledWith(SCOPE, DEFINITION)
    expect(trackWeb3Request).toHaveBeenCalledWith(expect.objectContaining({ requestType: 'widget_add', approved: true }))
  })

  it('declines once and stops asking', async () => {
    const { confirm, request } = createHost(vi.fn().mockResolvedValue(false))
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(false)
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(widgets.add).not.toHaveBeenCalled()
  })

  it('answers true without asking when the widget is already on Home', async () => {
    widgets.isOnHome.mockReturnValue(true)
    const { confirm, request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('fails with the folders it looked in when there is no widget file, without a toast', async () => {
    widgets.discover.mockResolvedValue({ ok: false, error: 'no valid nimiq-pay-widgets.json in https://swap.example/app/, https://swap.example/', transient: false })
    const { confirm, request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).rejects.toMatchObject({ message: expect.stringContaining('no valid nimiq-pay-widgets.json') })
    expect(confirm).not.toHaveBeenCalled()
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('fails for an id the file does not declare', async () => {
    const { request } = createHost()
    await expect(request('widgets.add', { id: 'nope' })).rejects.toMatchObject({ message: 'https://swap.example/app/nimiq-pay-widgets.json declares no widget "nope"' })
  })

  it('fails when Home is full', async () => {
    widgets.canAdd = false
    const { request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).rejects.toMatchObject({ message: expect.stringContaining('10 widgets') })
  })
})

describe('widgets.update, remove and list', () => {
  it('parses the state against the Mini App\'s scope before storing it', async () => {
    const { request } = createHost()
    await expect(request('widgets.update', { id: 'swap', state: { content: { value: { text: 'Done' }, path: 'status' } } })).resolves.toBe(true)
    expect(widgets.update).toHaveBeenCalledWith(SCOPE, 'swap', expect.objectContaining({ content: expect.objectContaining({ value: { text: 'Done' }, path: 'https://swap.example/app/status' }) }))
  })

  it('treats a missing state as "back to the resting state"', async () => {
    const { request } = createHost()
    await request('widgets.update', { id: 'swap' })
    expect(widgets.update).toHaveBeenCalledWith(SCOPE, 'swap', null)
  })

  it('answers false and an empty list when the Mini App has no widget file', async () => {
    widgets.discover.mockResolvedValue({ ok: false, error: 'no valid file', transient: false })
    const { request } = createHost()
    await expect(request('widgets.update', { id: 'swap', state: null })).resolves.toBe(false)
    await expect(request('widgets.list')).resolves.toEqual([])
    expect(widgets.update).not.toHaveBeenCalled()
  })

  it('refuses an invalid state with the field name, and no toast', async () => {
    const { request } = createHost()
    await expect(request('widgets.update', { id: 'swap', state: { content: { value: { text: 'x' }, path: 42 } } }))
      .rejects
      .toMatchObject({ message: expect.stringContaining('state.content.path') })
    expect(widgets.update).not.toHaveBeenCalled()
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('removes and lists only this Mini App\'s widgets', async () => {
    const { request } = createHost()
    await request('widgets.remove', { id: 'swap' })
    expect(widgets.remove).toHaveBeenCalledWith(SCOPE, 'swap')
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    expect(widgets.listForScope).toHaveBeenCalledWith(SCOPE)
  })

  it('refuses a missing id', async () => {
    const { request } = createHost()
    await expect(request('widgets.remove', {})).rejects.toMatchObject({ message: 'id must be a widget id from nimiq-pay-widgets.json' })
  })

  it('refuses an id that could not be declared, without echoing it', async () => {
    const { request } = createHost()
    const huge = 'a'.repeat(1_000_000)
    const error = await request('widgets.add', { id: huge }).catch(e => e as Error)
    expect((error as Error).message).toBe('id must be a widget id from nimiq-pay-widgets.json')
    expect(widgets.discover).not.toHaveBeenCalled()
  })

  it('does nothing on remove when the Mini App has no widget file', async () => {
    widgets.discover.mockResolvedValue({ ok: false, error: 'no valid file', transient: false })
    const { request } = createHost()
    await expect(request('widgets.remove', { id: 'swap' })).resolves.toBeUndefined()
    expect(widgets.remove).not.toHaveBeenCalled()
  })

  it('does not throw on a non-string request name', async () => {
    const { rawRequest } = createHost()
    await expect(rawRequest({ network: 'host', name: 42 as never })).rejects.toMatchObject({ message: expect.stringContaining('Unknown host message name') })
  })
})

describe('concurrent widgets.add', () => {
  it('shows one consent sheet and gives every caller the same answer', async () => {
    const { confirm, request } = createHost()
    const answers = await Promise.all(Array.from({ length: 20 }, () => request('widgets.add', { id: 'swap' })))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(answers).toEqual(Array.from({ length: 20 }).fill(true))
    expect(widgets.add).toHaveBeenCalledTimes(1)
  })

  it('asks no further after a decline, even for concurrent calls', async () => {
    const { confirm, request } = createHost(vi.fn().mockResolvedValue(false))
    const first = await Promise.all([request('widgets.add', { id: 'swap' }), request('widgets.add', { id: 'swap' })])
    const later = await Promise.all([request('widgets.add', { id: 'swap' }), request('widgets.add', { id: 'swap' })])
    expect([...first, ...later]).toEqual([false, false, false, false])
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})

function discoverByPage() {
  widgets.discover.mockImplementation(async (url: string) => ({ ok: true, value: { scope: `${new URL(url).origin}/app/`, file: { widgets: [DEFINITION] } } }))
}

describe('one site per session', () => {
  it('serves the launch URL before any event, and after a load that changed nothing', async () => {
    const { load, request } = createHost()
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    await load()
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    expect(widgets.discover).toHaveBeenCalledWith('https://Swap.Example/app')
  })

  it('adds under the www scope once a redirected launch has loaded', async () => {
    discoverByPage()
    const { confirm, load, navigate, request } = createHost()
    await navigate('https://www.swap.example/app/')
    await load()
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(widgets.discover).toHaveBeenCalledWith('https://www.swap.example/app/')
    expect(widgets.add).toHaveBeenCalledWith('https://www.swap.example/app/', DEFINITION)
    const [sheet] = confirm.mock.calls[0]!
    expect(sheet.url).toBe('https://www.swap.example/app/')
    await request('widgets.update', { id: 'swap', state: null })
    expect(widgets.update).toHaveBeenCalledWith('https://www.swap.example/app/', 'swap', null)
    await request('widgets.remove', { id: 'swap' })
    expect(widgets.remove).toHaveBeenCalledWith('https://www.swap.example/app/', 'swap')
    await request('widgets.list')
    expect(widgets.listForScope).toHaveBeenCalledWith('https://www.swap.example/app/')
  })

  it('refuses between the redirect\'s url change and its load', async () => {
    discoverByPage()
    const { navigate, request } = createHost()
    await navigate('https://www.swap.example/app/')
    await expectRefused(request)
  })

  it('refuses all four requests on another origin, before and after its load', async () => {
    discoverByPage()
    const { load, navigate, request } = createHost()
    await load()
    await navigate('https://other.example/page')
    await expectRefused(request)
    await load()
    await expectRefused(request)
  })

  it('stays refused when a page on another origin reports the session origin again without a load', async () => {
    const { load, navigate, request } = createHost()
    await load()
    await navigate('https://evil.example/')
    await load()
    await navigate('https://swap.example/app/')
    await expectRefused(request)
    await load()
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
  })

  it('allows pushState and hash changes on the session origin without a load', async () => {
    const { confirm, load, navigate, request } = createHost()
    await load()
    await navigate('https://swap.example/other/page?x=1#top')
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    await expect(request('widgets.update', { id: 'swap', state: null })).resolves.toBe(true)
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(confirm.mock.calls[0]![0]).not.toHaveProperty('name')
  })

  it('shows one sheet for concurrent adds across a same-origin page change', async () => {
    const { confirm, load, navigate, request } = createHost()
    await load()
    const first = request('widgets.add', { id: 'swap' })
    await navigate('https://swap.example/p2/#x')
    const second = request('widgets.add', { id: 'swap' })
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('discovers with one session URL however often the page pushes state', async () => {
    const { load, navigate, request } = createHost()
    await load()
    for (let n = 0; n < 10; n++) {
      await navigate(`https://swap.example/p${n}/`)
      await request('widgets.list')
    }
    expect(new Set(widgets.discover.mock.calls.map(([url]) => url))).toEqual(new Set(['https://Swap.Example/app']))
  })

  it('removes the navigation and close listeners on teardown', async () => {
    const { host, removes } = createHost()
    await Promise.resolve()
    await host.destroy()
    expect(removes.urlChangeEvent).toHaveBeenCalledTimes(1)
    expect(removes.browserPageLoaded).toHaveBeenCalledTimes(1)
    expect(removes.closeEvent).toHaveBeenCalledTimes(1)
  })
})

describe('popups', () => {
  it('ignores a popup\'s navigation and load: the main page on another origin stays refused', async () => {
    const { load, navigate, request } = createHost()
    await navigate('https://swap.example/app/', 'main')
    await load('main')
    await navigate('https://evil.example/', 'main')
    await load('main')
    await navigate('https://swap.example/app/', 'popup')
    await load('popup')
    await expectRefused(request)
  })

  it('refuses while a popup is open, even one on the session origin', async () => {
    const { load, navigate, request } = createHost()
    await navigate('https://swap.example/app/', 'main')
    await load('main')
    await navigate('https://swap.example/app/help', 'popup')
    await load('popup')
    await expectRefused(request)
  })

  it('refuses a request that arrives with a popup\'s first message', async () => {
    const { load, message, navigate, received, request } = createHost()
    await navigate('https://swap.example/app/', 'main')
    await load('main')
    await message('popup')
    expect(received).toHaveBeenCalledWith({ type: 'birpc' })
    await expectRefused(request)
  })

  it('serves again once the popup has closed', async () => {
    const { close, load, navigate, request } = createHost()
    await navigate('https://swap.example/app/', 'main')
    await load('main')
    await navigate('https://evil.example/', 'popup')
    await load('popup')
    await expectRefused(request)
    await close('popup')
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
  })

  it('treats events without an id as the main webview\'s', async () => {
    const { load, navigate, request } = createHost()
    await navigate('https://swap.example/app/', 'main')
    await load('main')
    await navigate('https://evil.example/')
    await load()
    await expectRefused(request)
    await navigate('https://swap.example/app/')
    await load()
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
  })
})

describe('after a reconnect', () => {
  it('refuses until the main webview loads a page on the launch origin', async () => {
    discoverByPage()
    const { load, navigate, request } = createHost(undefined, { reconnect: true })
    await expectRefused(request)
    await load('main')
    await expectRefused(request)
    await navigate('https://swap.example/app/next', 'main')
    await expectRefused(request)
    await load('main')
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    expect(widgets.discover).toHaveBeenLastCalledWith('https://swap.example/app/next')
  })

  it('stays refused after a load on another origin', async () => {
    discoverByPage()
    const { load, navigate, request } = createHost(undefined, { reconnect: true })
    await navigate('https://evil.example/app/', 'main')
    await load('main')
    await expectRefused(request)
    expect(widgets.discover).not.toHaveBeenCalled()
  })
})

async function expectRefused(request: (name: string, params?: unknown) => Promise<unknown>) {
  const calls = { add: widgets.add.mock.calls.length, update: widgets.update.mock.calls.length, remove: widgets.remove.mock.calls.length, list: widgets.listForScope.mock.calls.length }
  await expect(request('widgets.add', { id: 'swap' })).rejects.toMatchObject({ message: 'This page cannot change Home widgets' })
  await expect(request('widgets.update', { id: 'swap', state: null })).resolves.toBe(false)
  await expect(request('widgets.remove', { id: 'swap' })).resolves.toBeUndefined()
  await expect(request('widgets.list')).resolves.toEqual([])
  expect(widgets.add.mock.calls.length).toBe(calls.add)
  expect(widgets.update.mock.calls.length).toBe(calls.update)
  expect(widgets.remove.mock.calls.length).toBe(calls.remove)
  expect(widgets.listForScope.mock.calls.length).toBe(calls.list)
}

describe('pending adds are forgotten once settled', () => {
  it('checks again on a later add after an accept', async () => {
    const { confirm, request } = createHost()
    await request('widgets.add', { id: 'swap' })
    widgets.isOnHome.mockReturnValue(true)
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(widgets.discover).toHaveBeenCalledTimes(2)
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('asks again after an add that threw', async () => {
    widgets.add.mockImplementationOnce(() => {
      throw new Error('store broke')
    })
    const { confirm, request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).rejects.toThrow()
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})
