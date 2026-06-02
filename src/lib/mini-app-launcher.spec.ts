import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const {
  MiniAppHostCtor,
  addListener,
  capacitorHttpGet,
  clearAllCookies,
  clearToast,
  getFaviconUrl,
  hostDestroy,
  loggerError,
  loggerLog,
  openWebView,
  screenOrientationLock,
  screenOrientationUnlock,
  setToast,
  trackDAppClosed,
  trackDAppOpened,
} = vi.hoisted(() => ({
  openWebView: vi.fn(() => Promise.resolve()),
  addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  clearAllCookies: vi.fn(() => Promise.resolve()),
  setToast: vi.fn(() => Promise.resolve()),
  clearToast: vi.fn(),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  getFaviconUrl: vi.fn((url: string) => `https://icons.example/${encodeURIComponent(url)}`),
  hostDestroy: vi.fn(() => Promise.resolve()),
  screenOrientationUnlock: vi.fn(() => Promise.resolve()),
  screenOrientationLock: vi.fn(() => Promise.resolve()),
  trackDAppClosed: vi.fn(),
  trackDAppOpened: vi.fn(),
  MiniAppHostCtor: vi.fn(),
  capacitorHttpGet: vi.fn(() => Promise.resolve({ status: 200, data: { nimiq: [], evm: [] } })),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => false },
  CapacitorHttp: { get: capacitorHttpGet },
}))

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })), hide: vi.fn(() => Promise.resolve()) },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: {
    lock: screenOrientationLock,
    unlock: screenOrientationUnlock,
  },
}))

vi.mock('@capgo/capacitor-inappbrowser', () => ({
  InAppBrowser: { openWebView, addListener, clearAllCookies },
  ToolBarType: { NAVIGATION: 'navigation' },
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ error: loggerError, log: loggerLog }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ setToast, clearToast }),
}))

vi.mock('@/composables/useMiniAppHost', () => ({
  MiniAppHost: class {
    constructor(...args: unknown[]) {
      MiniAppHostCtor(...args)
    }

    destroy = hostDestroy
  },
}))

vi.mock('@/lib/mini-app-confirmation', () => ({
  requestUserConfirmation: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/lib/site-metadata', () => ({
  fetchPageDescription: vi.fn(() => Promise.resolve(undefined)),
  getFaviconUrl,
}))

vi.mock('@/lib/analytics', () => ({ trackDAppClosed, trackDAppOpened }))

vi.mock('@/lib', () => ({
  get isDev() { return false },
  isTestnet: false,
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    query: vi.fn(() => Promise.resolve(undefined)),
    run: vi.fn(() => Promise.resolve()),
  }),
}))

async function importLauncher() {
  const mod = await import('./mini-app-launcher')
  return mod
}

describe('mini-app-launcher', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    openWebView.mockReset()
    openWebView.mockImplementation(() => Promise.resolve())
    addListener.mockReset()
    addListener.mockImplementation(() => Promise.resolve({ remove: vi.fn() }))
    clearAllCookies.mockReset()
    clearAllCookies.mockImplementation(() => Promise.resolve())
    setToast.mockReset()
    setToast.mockImplementation(() => Promise.resolve())
    clearToast.mockReset()
    loggerError.mockReset()
    loggerLog.mockReset()
    hostDestroy.mockReset()
    hostDestroy.mockImplementation(() => Promise.resolve())
    screenOrientationUnlock.mockReset()
    screenOrientationUnlock.mockImplementation(() => Promise.resolve())
    screenOrientationLock.mockReset()
    screenOrientationLock.mockImplementation(() => Promise.resolve())
    trackDAppClosed.mockReset()
    trackDAppOpened.mockReset()
    MiniAppHostCtor.mockReset()

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ text: () => Promise.resolve('window.__provider = true') })))
    vi.resetModules()
  })

  it('normalizes bare hostnames before opening', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'example.com', source: 'deeplink' })

    expect(openWebView).toHaveBeenCalledTimes(1)
    const [[firstArg]] = openWebView.mock.calls as unknown as [[{ url: string }]]
    expect(firstArg.url).toBe('https://example.com/')
  })

  it('short-circuits concurrent launches', async () => {
    const { launchMiniApp } = await importLauncher()
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const first = launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })
    // Drain microtasks so first launch reaches openWebView and parks on the deferred.
    await flushPromises()
    expect(openWebView).toHaveBeenCalledTimes(1)

    await launchMiniApp({ url: 'https://opensea.io', source: 'deeplink' })
    expect(openWebView).toHaveBeenCalledTimes(1)

    deferred.resolve()
    await first
  })

  it('exposes openingMiniAppUrl ref while webview is opening', async () => {
    const { launchMiniApp, openingMiniAppUrl } = await importLauncher()
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)
    let pageLoadedHandler: (() => void) | undefined
    addListener.mockImplementation(((event: string, handler: () => void) => {
      if (event === 'browserPageLoaded')
        pageLoadedHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })
    await Promise.resolve()

    expect(openingMiniAppUrl.value).toBe('https://app.uniswap.org/')

    deferred.resolve()
    await pending

    // Guard is held until the webview confirms it loaded; simulate the native event.
    pageLoadedHandler?.()
    expect(openingMiniAppUrl.value).toBeNull()
  })

  it('shows toast and skips webview when url is invalid', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'not a url at all', source: 'deeplink' })

    expect(openWebView).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })

  it('clears cookies and constructs MiniAppHost before opening webview', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org', title: 'Uniswap', source: 'featured' })

    expect(clearAllCookies).toHaveBeenCalledTimes(1)
    expect(MiniAppHostCtor).toHaveBeenCalledTimes(1)
    expect(openWebView).toHaveBeenCalledTimes(1)
    expect(trackDAppOpened).toHaveBeenCalledWith('https://app.uniswap.org/', 'Uniswap', 'featured')
  })

  it('destroys host and re-locks orientation on close', async () => {
    const { launchMiniApp } = await importLauncher()
    let closeHandler: (() => Promise<void>) | undefined
    addListener.mockImplementation(((event: string, handler: () => Promise<void>) => {
      if (event === 'closeEvent')
        closeHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    await launchMiniApp({ url: 'https://app.uniswap.org', title: 'Uniswap', source: 'deeplink' })

    expect(closeHandler).toBeDefined()
    await closeHandler!()

    expect(hostDestroy).toHaveBeenCalledTimes(1)
    expect(screenOrientationLock).toHaveBeenCalledWith({ orientation: 'portrait' })
    expect(trackDAppClosed).toHaveBeenCalledTimes(1)
  })

  it('shows toast and destroys host when opening fails', async () => {
    const { launchMiniApp, openingMiniAppUrl } = await importLauncher()
    openWebView.mockRejectedValueOnce(new Error('open failed'))

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })

    expect(hostDestroy).toHaveBeenCalledTimes(1)
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
    expect(openingMiniAppUrl.value).toBeNull()
  })

  it('uses hostname as default title when none provided', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })

    expect(trackDAppOpened).toHaveBeenCalledWith('https://app.uniswap.org/', 'app.uniswap.org', 'deeplink')
  })

  it('shows the loading toast while opening', async () => {
    const { launchMiniApp } = await importLauncher()
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const pending = launchMiniApp({
      url: 'https://app.uniswap.org',
      title: 'Uniswap',
      source: 'deeplink',
      icon: 'https://icons.example/uniswap.png',
    })
    await flushPromises()

    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Uniswap'),
      type: 'spinner',
      keepOpen: true,
    }))
    expect(clearToast).not.toHaveBeenCalled()

    deferred.resolve()
    await pending
  })

  it('clears the loading toast once the webview has opened', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })

    expect(clearToast).toHaveBeenCalledTimes(1)
  })

  it('replaces the loading toast with an error toast when opening fails', async () => {
    const { launchMiniApp } = await importLauncher()
    openWebView.mockRejectedValueOnce(new Error('open failed'))

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })

    expect(clearToast).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }))
  })

  it('does not show loading toast for non-deeplink sources', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org', title: 'Uniswap', source: 'featured' })

    expect(setToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'spinner' }))
    expect(clearToast).not.toHaveBeenCalled()
  })

  it('still shows error toast for non-deeplink sources when opening fails', async () => {
    const { launchMiniApp } = await importLauncher()
    openWebView.mockRejectedValueOnce(new Error('open failed'))

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'search' })

    expect(setToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }))
  })
})
