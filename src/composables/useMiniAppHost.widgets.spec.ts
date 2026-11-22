import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRemoteSigner } from '@/stores/remote-signer'
import { MiniAppHost } from './useMiniAppHost'

const { logged, createBirpc, toastShow, trackWeb3Request, widgets } = vi.hoisted(() => ({
  logged: vi.fn(),
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
    canAddTo: vi.fn(() => true),
    setToken: vi.fn(() => true),
    consentFor: vi.fn((_scope: string, definition: { name: string, description?: string, permissions?: string[] }) => ({ widgetName: definition.name, description: definition.description, appName: undefined, permissions: definition.permissions })),
    missingPermissions: vi.fn((): string[] => []),
    widgetName: vi.fn(() => 'Swap status'),
    grantPermissions: vi.fn(),
    pendingName: vi.fn((): { to: string, address: string } | undefined => undefined),
    approveName: vi.fn(),
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
vi.mock('./useLogger', () => ({ useLogger: () => ({ error: logged, log: logged, warn: logged }) }))

const DEFINITION = { id: 'swap', name: 'Swap status', description: 'Follows your swap.', sizes: ['medium'], content: { value: { text: 'Start' }, tone: 'neutral', rows: [] }, translations: {} }
const SCOPE = 'https://swap.example/app/'
// A clear goes by the site the Mini App was opened on.
const SITE = 'https://swap.example'
const found = { ok: true, value: { scope: SCOPE, file: { widgets: [DEFINITION] } } }

function slowSearch() {
  let answer!: () => void
  widgets.discover.mockReturnValueOnce(new Promise((resolve) => {
    answer = () => resolve(found)
  }))
  return () => answer()
}

function createHost(confirm = vi.fn().mockResolvedValue(true)) {
  const listeners: Record<string, Array<(event: object) => void>> = {}
  const removes: Record<string, ReturnType<typeof vi.fn>> = {}
  const browser = {
    addListener: vi.fn((name: string, listener: (event: object) => void) => {
      (listeners[name] ??= []).push(listener)
      return Promise.resolve({ remove: removes[name] ??= vi.fn() })
    }),
    clearAllCookies: vi.fn(() => Promise.resolve()),
    hide: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
    postMessage: vi.fn(),
    removeAllListeners: vi.fn(() => Promise.resolve()),
  }
  const config = { requestUserConfirmation: confirm, title: 'Swap', url: 'https://Swap.Example/app' }
  const host = new MiniAppHost(browser as never, config)
  const [handlers] = createBirpc.mock.calls.at(-1)! as any[]
  const handleRequest = handlers.handleRequest as (params: { network: string, name: string, params?: unknown }) => Promise<unknown>
  const emit = async (name: string, event: object) => {
    await Promise.resolve()
    listeners[name]?.forEach(listener => listener(event))
  }
  return {
    browser,
    close: (id?: string) => emit('closeEvent', { id, url: 'https://swap.example/' }),
    confirm,
    host,
    load: (id?: string) => emit('browserPageLoaded', { id }),
    openPopup: (id: string) => emit('popupWindowOpened', { id }),
    navigate: (url: string, id?: string) => emit('urlChangeEvent', { id, url }),
    rawRequest: handleRequest,
    removes,
    request: (name: string, params?: unknown) => handleRequest({ network: 'host', name, params }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  widgets.isOnHome.mockReturnValue(false)
  widgets.canAdd = true
  widgets.canAddTo.mockReturnValue(true)
  widgets.pendingName.mockReturnValue(undefined)
  widgets.missingPermissions.mockReturnValue([])
  widgets.discover.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [DEFINITION] } } })
  vi.mocked(useRemoteSigner).mockReturnValue({ remoteAddress: undefined } as never)
})

describe('widgets.add', () => {
  it('asks once, then adds the declared widget under the Mini App\'s scope', async () => {
    const { confirm, request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(widgets.discover).toHaveBeenCalledWith('https://Swap.Example/app')
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'widget', widgetName: 'Swap status', description: 'Follows your swap.', url: 'https://Swap.Example/app' }), expect.any(Number))
    expect(widgets.add).toHaveBeenCalledWith(SCOPE, DEFINITION, [])
    expect(trackWeb3Request).toHaveBeenCalledWith(expect.objectContaining({ requestType: 'widget_add', approved: true }))
  })

  it('declines once and stops asking', async () => {
    const { confirm, request } = createHost(vi.fn().mockResolvedValue(false))
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(false)
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(widgets.add).not.toHaveBeenCalled()
  })

  const pendingRename = () => {
    widgets.isOnHome.mockReturnValue(true)
    widgets.pendingName.mockReturnValue({ to: 'New', address: 'swap.example/app' })
  }

  it('asks about a new name when the Mini App calls add for a widget on Home, and applies it on yes', async () => {
    pendingRename()
    const { confirm, request } = createHost()
    confirm.mockResolvedValue(true)
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'widgetName', to: 'New', address: 'swap.example/app' }), expect.any(Number))
    expect(widgets.approveName).toHaveBeenCalledWith(SCOPE, 'New')
    expect(trackWeb3Request).toHaveBeenCalledWith(expect.objectContaining({ requestType: 'widget_name', approved: true }))
  })

  it('keeps the approved name on no, and does not ask again until the Mini App is opened again', async () => {
    pendingRename()
    const { confirm, request } = createHost()
    confirm.mockResolvedValue(false)
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(widgets.approveName).not.toHaveBeenCalled()
  })

  it('shows one sheet for add calls at once on several widgets, however many the Mini App fires', async () => {
    pendingRename()
    const { confirm, request } = createHost()
    confirm.mockResolvedValue(false)
    await Promise.all(['a', 'b', 'c'].map(id => request('widgets.add', { id })))
    expect(confirm).toHaveBeenCalledTimes(1)
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

  it('tells the sheet the name the widget will show under, and none when that is only the address', async () => {
    const { confirm, request } = createHost()
    confirm.mockResolvedValue(true)
    widgets.consentFor.mockReturnValueOnce({ widgetName: 'Swap status', appName: 'SwapSpace' } as never)
    await request('widgets.add', { id: 'swap' })
    expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'widget', appName: 'SwapSpace' }), expect.any(Number))

    const second = createHost()
    second.confirm.mockResolvedValue(true)
    await second.request('widgets.add', { id: 'swap' })
    expect(second.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'widget', appName: undefined }), expect.any(Number))
  })

  it('asks for the widget\'s permissions in the sheet and grants them on yes', async () => {
    widgets.discover.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [{ ...DEFINITION, permissions: ['addresses'] }] } } })
    const { confirm, request } = createHost()
    confirm.mockResolvedValue(true)
    await request('widgets.add', { id: 'swap' })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'widget', permissions: ['addresses'] }), expect.any(Number))
    expect(widgets.add).toHaveBeenCalledWith(SCOPE, expect.anything(), ['addresses'])
  })

  it('asks about a permission added after install when the Mini App calls add, once if declined', async () => {
    widgets.isOnHome.mockReturnValue(true)
    widgets.missingPermissions.mockReturnValue(['addresses'])
    const { confirm, request } = createHost()
    confirm.mockResolvedValue(false)
    await request('widgets.add', { id: 'swap' })
    await request('widgets.add', { id: 'swap' })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'widgetPermissions' }), expect.any(Number))
    expect(widgets.grantPermissions).not.toHaveBeenCalled()
    confirm.mockResolvedValue(true)
    const again = createHost()
    again.confirm.mockResolvedValue(true)
    await again.request('widgets.add', { id: 'swap' })
    expect(widgets.grantPermissions).toHaveBeenCalledWith(SCOPE, 'swap', ['addresses'])
  })

  const held = () => {
    let answer = (_value: boolean) => {}
    return { answer: (value: boolean) => answer(value), promise: new Promise<boolean>((resolve) => {
      answer = resolve
    }) }
  }

  it('shows consent sheets one at a time, for new widgets too', async () => {
    widgets.discover.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [DEFINITION, { ...DEFINITION, id: 'other' }] } } })
    const first = held()
    const { confirm, request } = createHost()
    confirm.mockReturnValueOnce(first.promise).mockResolvedValue(true)
    const calls = [request('widgets.add', { id: 'swap' }), request('widgets.add', { id: 'other' })]
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(confirm).toHaveBeenCalledTimes(1)
    first.answer(true)
    await Promise.all(calls)
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('applies nothing, and asks nothing more, once the Mini App has closed', async () => {
    widgets.isOnHome.mockReturnValue(true)
    widgets.missingPermissions.mockReturnValue(['addresses'])
    const first = held()
    const { confirm, host, request } = createHost()
    confirm.mockReturnValueOnce(first.promise).mockResolvedValue(true)
    const one = request('widgets.add', { id: 'a' })
    const two = request('widgets.add', { id: 'b' })
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    await host.destroy()
    first.answer(true)
    await Promise.allSettled([one, two])
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(widgets.grantPermissions).not.toHaveBeenCalled()
  })

  it('does not add a new widget confirmed after the Mini App closed', async () => {
    const first = held()
    const { confirm, host, request } = createHost()
    confirm.mockReturnValueOnce(first.promise)
    const call = request('widgets.add', { id: 'swap' })
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    await host.destroy()
    first.answer(true)
    await call.catch(() => {})
    expect(widgets.add).not.toHaveBeenCalled()
  })

  it('asks nothing about images, and leaves the Mini App in front, when it calls add for a widget on Home', async () => {
    widgets.isOnHome.mockReturnValue(true)
    const images = { hero: { url: 'https://swap.example/app/hero.png', sha256: 'b'.repeat(64) } }
    widgets.discover.mockResolvedValue({ ok: true, value: { scope: SCOPE, file: { widgets: [{ ...DEFINITION, images }] } } })
    const { browser, confirm, request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(browser.hide).not.toHaveBeenCalled()
  })

  it('closes a widget sheet when the request that asked for it times out, however long it waited', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const { confirm, request } = createHost()
      widgets.discover.mockReturnValueOnce(new Promise(resolve => setTimeout(resolve, 20_000, found)))
      const adding = request('widgets.add', { id: 'swap' })
      await vi.advanceTimersByTimeAsync(20_000)
      await adding
      expect(confirm.mock.calls[0]![1]).toBe(1_120_000)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('opens a later request\'s sheet at once, as the dialog then closes the one on screen', async () => {
    const { confirm } = createHost()
    confirm.mockReturnValueOnce(new Promise(() => {})).mockResolvedValue(true)
    const [handlers] = createBirpc.mock.calls.at(-1)! as any[]
    void handlers.requestChainApproval({ chainId: '0x89', chainName: 'Polygon' }).catch(() => {})
    const second = handlers.requestChainApproval({ chainId: '0xa', chainName: 'Optimism' }).catch(() => {})
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)
    await second
  })

  it('takes a sheet that ran out of time for no answer, not a no', async () => {
    vi.useFakeTimers()
    try {
      const { confirm, request } = createHost()
      confirm.mockReturnValueOnce(new Promise(resolve => setTimeout(resolve, 120_000, false)))
      const ignored = request('widgets.add', { id: 'swap' })
      await vi.advanceTimersByTimeAsync(120_000)
      await expect(ignored).resolves.toBe(false)
      expect(trackWeb3Request).toHaveBeenCalledWith(expect.objectContaining({ requestType: 'widget_add', approved: false, timedOut: true }))
      await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('fails when the Mini App has all the widgets it may have on Home', async () => {
    widgets.canAddTo.mockReturnValue(false)
    const { request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).rejects.toMatchObject({ message: expect.stringContaining('This Mini App already has 6 widgets') })
  })

  it('fails when Home is full', async () => {
    widgets.canAdd = false
    widgets.canAddTo.mockReturnValue(false)
    const { request } = createHost()
    await expect(request('widgets.add', { id: 'swap' })).rejects.toMatchObject({ message: expect.stringContaining('10 widgets') })
  })
})

describe('widgets.setToken', () => {
  it('stores a token for the Mini App\'s scope, and clears it with null', async () => {
    const { request } = createHost()
    await request('widgets.setToken', { id: 'swap', token: 'opaque' })
    expect(widgets.setToken).toHaveBeenLastCalledWith(SCOPE, 'swap', 'opaque')
    await request('widgets.setToken', { id: 'swap', token: null })
    expect(widgets.setToken).toHaveBeenLastCalledWith(SITE, 'swap', null)
  })

  describe('so that a sign-out holds', () => {
    it('lets no earlier token land after a clear', async () => {
      const answer = slowSearch()
      const { request } = createHost()
      const calls = [request('widgets.setToken', { id: 'swap', token: 'a' }), request('widgets.setToken', { id: 'swap', token: null })]
      await flushPromises()
      answer()
      await Promise.all(calls)
      expect(widgets.setToken.mock.calls).toEqual([[SCOPE, 'swap', 'a'], [SITE, 'swap', null]])
    })

    it('lets no earlier state land after a switch', async () => {
      const answer = slowSearch()
      const { request } = createHost()
      const calls = [request('widgets.update', { id: 'swap', state: { content: { value: { text: 'Of A' } } } }), request('widgets.setToken', { id: 'swap', token: 'b' })]
      await flushPromises()
      answer()
      await Promise.all(calls)
      expect(widgets.update.mock.invocationCallOrder[0]).toBeLessThan(widgets.setToken.mock.invocationCallOrder[0]!)
    })

    it.each([
      ['widgets.setToken', { id: 'swap', token: 'a' }],
      ['widgets.update', { id: 'swap', state: { content: { value: { text: 'Of A' } } } }],
      ['widgets.remove', { id: 'swap' }],
    ])('applies no %s whose search ends after the Mini App closed', async (name, params) => {
      const answer = slowSearch()
      const { host, request } = createHost()
      const call = request(name, params)
      await flushPromises()
      await host.destroy()
      answer()
      await call
      expect(widgets.setToken).not.toHaveBeenCalled()
      expect(widgets.update).not.toHaveBeenCalled()
      expect(widgets.remove).not.toHaveBeenCalled()
    })

    describe.each([
      ['widgets.setToken', { token: null }, widgets.setToken],
      ['widgets.update', { state: null }, widgets.update],
    ] as const)('clearing with %s', (name, nothing, applied) => {
      it('is never lost to closing right after it, and no earlier state lands after it', async () => {
        const answer = slowSearch()
        const { host, request } = createHost()
        const calls = [request('widgets.update', { id: 'swap', state: { content: { value: { text: 'Of A' } } } }), request(name, { id: 'swap', ...nothing })]
        await flushPromises()
        await host.destroy()
        answer()
        await Promise.all(calls)
        expect(applied.mock.calls).toEqual([[SITE, 'swap', null]])
        expect(widgets.update).not.toHaveBeenCalledWith(SCOPE, 'swap', expect.anything())
      })

      it('lands as the Mini App closes, so it can\'t land on what the next person\'s session wrote', async () => {
        slowSearch()
        const { host, request } = createHost()
        void request('widgets.update', { id: 'swap', state: { content: { value: { text: 'Of A' } } } })
        void request(name, { id: 'swap', ...nothing })
        await flushPromises()
        expect(applied).not.toHaveBeenCalled()
        await host.destroy()
        await flushPromises()
        expect(applied).toHaveBeenCalledWith(SITE, 'swap', null)
      })

      it('needs no widget file, so neither the network nor a block stops it', async () => {
        widgets.discover.mockResolvedValue({ ok: false, error: 'offline', transient: true })
        const { request } = createHost()
        await expect(request(name, { id: 'swap', ...nothing })).resolves.toBe(true)
        expect(applied).toHaveBeenCalledWith(SITE, 'swap', null)
        expect(widgets.discover).not.toHaveBeenCalled()
      })
    })

    it('carries on after a call that was invalid', async () => {
      const { request } = createHost()
      const invalid = request('widgets.update', { id: 'swap', state: { content: { value: { text: 'x' }, path: 42 } } }).catch(() => {})
      await expect(request('widgets.setToken', { id: 'swap', token: 'b' })).resolves.toBe(true)
      await invalid
    })
  })

  it('keeps the token out of the logs, also for a refused one', async () => {
    const { request } = createHost()
    await request('widgets.setToken', { id: 'swap', token: 'top-secret' })
    await request('widgets.setToken', { id: 'swap', token: 'top secret' }).catch(() => {})
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret')
    expect(JSON.stringify(logged.mock.calls)).toContain('widgets.setToken')
  })

  it.each([[''], ['has space'], ['line\nbreak'], ['x'.repeat(2049)], [42]])('refuses the token %j', async (token) => {
    const { request } = createHost()
    await expect(request('widgets.setToken', { id: 'swap', token })).rejects.toMatchObject({ message: expect.stringContaining('token') })
    expect(widgets.setToken).not.toHaveBeenCalled()
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
    expect(widgets.update).toHaveBeenCalledWith(SITE, 'swap', null)
  })

  it('answers false and an empty list when the Mini App has no widget file', async () => {
    widgets.discover.mockResolvedValue({ ok: false, error: 'no valid file', transient: false })
    const { request } = createHost()
    await expect(request('widgets.update', { id: 'swap', state: { content: { value: { text: 'Done' } } } })).resolves.toBe(false)
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

describe('one site per session', () => {
  it('serves the launch URL before any event, and after a load that changed nothing', async () => {
    const { load, request } = createHost()
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    await load()
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    expect(widgets.discover).toHaveBeenCalledWith('https://Swap.Example/app')
  })

  it('never takes its site from another origin the launch went through', async () => {
    const { load, navigate, request } = createHost()
    await navigate('https://www.swap.example/app/')
    await load()
    await expectRefused(request)
    await navigate('https://swap.example/app/next')
    await load()
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
    await request('widgets.update', { id: 'swap', state: { content: { value: { text: 'Done' } } } })
    expect(widgets.discover.mock.calls.map(([url]) => new URL(url as string).origin)).toEqual([SITE, SITE])
    await request('widgets.setToken', { id: 'swap', token: null })
    await request('widgets.update', { id: 'swap', state: null })
    expect(widgets.setToken).toHaveBeenCalledExactlyOnceWith(SITE, 'swap', null)
    expect(widgets.update).toHaveBeenLastCalledWith(SITE, 'swap', null)
  })

  it('still lands a clear asked for before the page left the site', async () => {
    const answer = slowSearch()
    const { navigate, request } = createHost()
    const token = request('widgets.setToken', { id: 'swap', token: 'a' })
    const clear = request('widgets.setToken', { id: 'swap', token: null })
    await navigate('https://login.example/')
    answer()
    await Promise.all([token, clear])
    expect(widgets.setToken).toHaveBeenLastCalledWith(SITE, 'swap', null)
  })

  it('asks nothing for a page that left the site while the widget file loaded', async () => {
    const answer = slowSearch()
    const { confirm, navigate, request } = createHost()
    const adding = request('widgets.add', { id: 'swap' })
    await navigate('https://other.example/')
    answer()
    await expect(adding).resolves.toBe(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('refuses between the redirect\'s url change and its load', async () => {
    const { navigate, request } = createHost()
    await navigate('https://www.swap.example/app/')
    await expectRefused(request)
  })

  it('refuses all four requests on another origin, before and after its load', async () => {
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
    expect(removes.popupWindowOpened).toHaveBeenCalledTimes(1)
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

  it('serves again once the popup has closed', async () => {
    const { close, load, navigate, openPopup, request } = createHost()
    await navigate('https://swap.example/app/', 'main')
    await load('main')
    await openPopup('popup')
    await expectRefused(request)
    await close('popup')
    await expect(request('widgets.list')).resolves.toEqual(['swap'])
    await expect(request('widgets.add', { id: 'swap' })).resolves.toBe(true)
  })
})

async function expectRefused(request: (name: string, params?: unknown) => Promise<unknown>) {
  const calls = { add: widgets.add.mock.calls.length, setToken: widgets.setToken.mock.calls.length, update: widgets.update.mock.calls.length, remove: widgets.remove.mock.calls.length, list: widgets.listForScope.mock.calls.length }
  await expect(request('widgets.add', { id: 'swap' })).rejects.toMatchObject({ message: 'This page cannot change Home widgets' })
  await expect(request('widgets.update', { id: 'swap', state: null })).resolves.toBe(false)
  await expect(request('widgets.setToken', { id: 'swap', token: null })).resolves.toBe(false)
  await expect(request('widgets.remove', { id: 'swap' })).resolves.toBeUndefined()
  await expect(request('widgets.list')).resolves.toEqual([])
  expect(widgets.setToken.mock.calls.length).toBe(calls.setToken)
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
