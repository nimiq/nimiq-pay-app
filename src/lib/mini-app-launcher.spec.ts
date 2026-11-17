import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MAIN_WEBVIEW_ID = 'main-webview'

type CloseHandler = (event: { id?: string, url: string }) => Promise<void>

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
  closeActiveMiniApp,
  getDeviceInfo,
  getFaviconUrl,
  getPlatform,
  hostDestroy,
  hostIsMainWebview,
  loggerError,
  loggerLog,
  loggerWarn,
  openWebView,
  screenOrientationLock,
  screenOrientationUnlock,
  setToast,
  trackDAppClosed,
  trackDAppOpened,
  trackDAppPopupClosed,
  trackDAppSheetHeld,
} = vi.hoisted(() => ({
  getDeviceInfo: vi.fn(),
  getPlatform: vi.fn(() => 'ios'),
  openWebView: vi.fn(() => Promise.resolve({ id: MAIN_WEBVIEW_ID })),
  addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  closeActiveMiniApp: vi.fn(() => Promise.resolve()),
  clearAllCookies: vi.fn(() => Promise.resolve()),
  setToast: vi.fn(() => Promise.resolve()),
  clearToast: vi.fn(),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
  getFaviconUrl: vi.fn((url: string) => `https://icons.example/${encodeURIComponent(url)}`),
  hostDestroy: vi.fn(() => Promise.resolve()),
  hostIsMainWebview: vi.fn((id: string) => id === MAIN_WEBVIEW_ID),
  screenOrientationUnlock: vi.fn(() => Promise.resolve()),
  screenOrientationLock: vi.fn(() => Promise.resolve()),
  trackDAppClosed: vi.fn(),
  trackDAppOpened: vi.fn(),
  trackDAppPopupClosed: vi.fn(),
  trackDAppSheetHeld: vi.fn(),
  MiniAppHostCtor: vi.fn(),
  capacitorHttpGet: vi.fn(() => Promise.resolve({ status: 200, data: { nimiq: [], evm: [] } })),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform, isNativePlatform: () => false },
  CapacitorHttp: { get: capacitorHttpGet },
}))

vi.mock('@capacitor/device', () => ({
  Device: { getInfo: getDeviceInfo },
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
  useLogger: () => ({ error: loggerError, log: loggerLog, warn: loggerWarn }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ setToast, clearToast }),
}))

vi.mock('@/composables/useMiniAppHost', async () => {
  const { ref } = await import('vue')
  return {
    closeActiveMiniApp,
    isMiniAppActive: ref(false),
    MINI_APP_REQUEST_TIMEOUT_MS: 120_000,
    MiniAppHost: class {
      constructor(...args: unknown[]) {
        MiniAppHostCtor(...args)
      }

      destroy = hostDestroy
      isMainWebview = hostIsMainWebview
    },
  }
})

vi.mock('@/lib/mini-app-confirmation', () => ({
  requestUserConfirmation: vi.fn(() => Promise.resolve(true)),
  selectLightningAsset: vi.fn(() => Promise.resolve('NIM')),
}))

vi.mock('@/lib/site-metadata', () => ({
  fetchPageDescription: vi.fn(() => Promise.resolve(undefined)),
  fetchBestIcon: vi.fn(() => Promise.resolve(undefined)),
  getFaviconUrl,
}))

vi.mock('@/lib/analytics', () => ({ trackDAppClosed, trackDAppOpened, trackDAppPopupClosed, trackDAppSheetHeld }))

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
    getPlatform.mockReturnValue('ios')
    getDeviceInfo.mockResolvedValue({})
    openWebView.mockReset()
    openWebView.mockImplementation(() => Promise.resolve({ id: MAIN_WEBVIEW_ID }))
    addListener.mockReset()
    addListener.mockImplementation(() => Promise.resolve({ remove: vi.fn() }))
    closeActiveMiniApp.mockReset()
    closeActiveMiniApp.mockImplementation(() => Promise.resolve())
    hostIsMainWebview.mockClear()
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
    trackDAppPopupClosed.mockReset()
    trackDAppSheetHeld.mockReset()
    MiniAppHostCtor.mockReset()

    sessionStorage.clear()
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

  it('limits the native bridge to the Mini App origin', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://example.com:8443/app?x=1', source: 'deeplink' })

    expect(openWebView).toHaveBeenCalledWith(expect.objectContaining({
      javascriptBridgeOrigins: ['https://example.com:8443'],
    }))
  })

  it.each([
    ['Android 15', { androidSDKVersion: 35 }, true],
    ['Android 14', { androidSDKVersion: 34 }, false],
    ['iOS', {}, false],
  ])('sets the safe bottom margin on %s', async (_name, deviceInfo, expected) => {
    getDeviceInfo.mockResolvedValue(deviceInfo)
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://example.com', source: 'deeplink' })

    expect(openWebView).toHaveBeenCalledWith(expect.objectContaining({
      enabledSafeBottomMargin: expected,
    }))
  })

  it('short-circuits concurrent launches', async () => {
    const { launchMiniApp } = await importLauncher()
    const deferred = createDeferred<{ id: string }>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const first = launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })
    // Drain microtasks so first launch reaches openWebView and parks on the deferred.
    await flushPromises()
    expect(openWebView).toHaveBeenCalledTimes(1)

    await launchMiniApp({ url: 'https://opensea.io', source: 'deeplink' })
    expect(openWebView).toHaveBeenCalledTimes(1)

    deferred.resolve({ id: MAIN_WEBVIEW_ID })
    await first
  })

  it('exposes openingMiniAppUrl ref while webview is opening', async () => {
    const { launchMiniApp, openingMiniAppUrl } = await importLauncher()
    const deferred = createDeferred<{ id: string }>()
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

    deferred.resolve({ id: MAIN_WEBVIEW_ID })
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
    let closeHandler: CloseHandler | undefined
    addListener.mockImplementation(((event: string, handler: CloseHandler) => {
      if (event === 'closeEvent')
        closeHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    await launchMiniApp({ url: 'https://app.uniswap.org', title: 'Uniswap', source: 'deeplink' })

    expect(closeHandler).toBeDefined()
    await closeHandler!({ id: MAIN_WEBVIEW_ID, url: 'https://app.uniswap.org/' })

    expect(hostDestroy).toHaveBeenCalledTimes(1)
    expect(screenOrientationLock).toHaveBeenCalledWith({ orientation: 'portrait' })
    expect(trackDAppClosed).toHaveBeenCalledTimes(1)
  })

  it('keeps the host alive when a popup closes, then destroys it once on main close', async () => {
    const { launchMiniApp } = await importLauncher()
    const removeCloseListener = vi.fn()
    let closeHandler: CloseHandler | undefined
    addListener.mockImplementation(((event: string, handler: CloseHandler) => {
      if (event === 'closeEvent') {
        closeHandler = handler
        return Promise.resolve({ remove: removeCloseListener })
      }
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })

    await closeHandler!({ id: 'popup-webview', url: 'https://accounts.example/' })
    expect(hostDestroy).not.toHaveBeenCalled()
    expect(removeCloseListener).not.toHaveBeenCalled()
    expect(trackDAppClosed).not.toHaveBeenCalled()
    expect(trackDAppPopupClosed).toHaveBeenCalledWith('https://app.uniswap.org/', 'app.uniswap.org')

    await closeHandler!({ id: MAIN_WEBVIEW_ID, url: 'https://app.uniswap.org/' })
    await closeHandler!({ id: MAIN_WEBVIEW_ID, url: 'https://app.uniswap.org/' })
    expect(hostDestroy).toHaveBeenCalledTimes(1)
    expect(removeCloseListener).toHaveBeenCalledTimes(1)
  })

  it('destroys the previous host when a new launch arrives with a popup open', async () => {
    const { launchMiniApp } = await importLauncher()
    const { isMiniAppActive } = await import('@/composables/useMiniAppHost')
    const handlers: Record<string, (event?: unknown) => unknown> = {}
    addListener.mockImplementation(((event: string, handler: (event?: unknown) => unknown) => {
      handlers[event] ??= handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)
    hostDestroy.mockImplementation(() => {
      isMiniAppActive.value = false
      return Promise.resolve()
    })

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    handlers.browserPageLoaded?.()
    await flushPromises()
    isMiniAppActive.value = true

    // closeActiveMiniApp closes the popup, then the Mini App.
    closeActiveMiniApp.mockImplementationOnce(async () => {
      await handlers.closeEvent?.({ id: 'popup-webview', url: 'https://accounts.example/' })
      await handlers.closeEvent?.({ id: MAIN_WEBVIEW_ID, url: 'https://app.uniswap.org/' })
    })

    vi.useFakeTimers()
    const launch = launchMiniApp({ url: 'https://other.example', source: 'deeplink' })
    await vi.advanceTimersByTimeAsync(3000)
    vi.useRealTimers()
    await launch

    expect(hostDestroy).toHaveBeenCalledTimes(1)
    isMiniAppActive.value = false
  })

  it('registers the id openWebView returns as the main webview before any of its events', async () => {
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })

    expect(hostIsMainWebview).toHaveBeenCalledExactlyOnceWith(MAIN_WEBVIEW_ID)
  })

  it('destroys the host on a closeEvent without an id', async () => {
    const { launchMiniApp } = await importLauncher()
    let closeHandler: CloseHandler | undefined
    addListener.mockImplementation(((event: string, handler: CloseHandler) => {
      if (event === 'closeEvent')
        closeHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    await closeHandler!({ url: 'https://app.uniswap.org/' })

    expect(hostDestroy).toHaveBeenCalledTimes(1)
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
    const deferred = createDeferred<{ id: string }>()
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

    deferred.resolve({ id: MAIN_WEBVIEW_ID })
    await pending
  })

  it('clears the loading toast once the webview is presented (opened + page loaded)', async () => {
    const { launchMiniApp } = await importLauncher()
    let pageLoadedHandler: (() => void) | undefined
    addListener.mockImplementation(((event: string, handler: () => void) => {
      if (event === 'browserPageLoaded')
        pageLoadedHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })

    // openWebView resolved but the page-loaded signal hasn't fired yet: still opening.
    expect(clearToast).not.toHaveBeenCalled()

    pageLoadedHandler?.()
    expect(clearToast).toHaveBeenCalledTimes(1)
  })

  it('replaces the loading toast with an error toast when opening fails', async () => {
    const { launchMiniApp } = await importLauncher()
    openWebView.mockRejectedValueOnce(new Error('open failed'))

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'deeplink' })

    // clearGuard clears the spinner toast, then the error toast replaces it.
    expect(clearToast).toHaveBeenCalledTimes(1)
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

  it('holds the guard until both openWebView resolves and browserPageLoaded fires (page loads first)', async () => {
    const { launchMiniApp, openingMiniAppUrl } = await importLauncher()
    const deferred = createDeferred<{ id: string }>()
    openWebView.mockImplementationOnce(() => deferred.promise)
    let pageLoadedHandler: (() => void) | undefined
    addListener.mockImplementation(((event: string, handler: () => void) => {
      if (event === 'browserPageLoaded')
        pageLoadedHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    await flushPromises()

    // Android order: pageLoaded arrives before openWebView resolves at show().
    pageLoadedHandler?.()
    expect(openingMiniAppUrl.value).toBe('https://app.uniswap.org/')

    deferred.resolve({ id: MAIN_WEBVIEW_ID })
    await pending
    expect(openingMiniAppUrl.value).toBeNull()
  })

  it('holds the guard until both signals (open resolves first)', async () => {
    const { launchMiniApp, openingMiniAppUrl } = await importLauncher()
    let pageLoadedHandler: (() => void) | undefined
    addListener.mockImplementation(((event: string, handler: () => void) => {
      if (event === 'browserPageLoaded')
        pageLoadedHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    // iOS order: openWebView resolves at creation, pageLoaded fires after present.
    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    expect(openingMiniAppUrl.value).toBe('https://app.uniswap.org/')

    pageLoadedHandler?.()
    expect(openingMiniAppUrl.value).toBeNull()
  })

  it('watchdog fails the launch and closes the pending webview when opening hangs', async () => {
    vi.useFakeTimers()
    try {
      const { launchMiniApp, openingMiniAppUrl } = await importLauncher()
      openWebView.mockImplementationOnce(() => new Promise(() => {}))

      void launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
      await vi.advanceTimersByTimeAsync(0)
      expect(openingMiniAppUrl.value).toBe('https://app.uniswap.org/')

      await vi.advanceTimersByTimeAsync(15_000)
      expect(openingMiniAppUrl.value).toBeNull()
      expect(closeActiveMiniApp).toHaveBeenCalledTimes(1)
      expect(setToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }))
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('watchdog rescues a hung provider fetch and the late fetch cannot open a surprise webview', async () => {
    vi.useFakeTimers()
    try {
      const fetchDeferred = createDeferred<{ text: () => Promise<string> }>()
      vi.stubGlobal('fetch', vi.fn(() => fetchDeferred.promise))
      const { launchMiniApp, openingMiniAppUrl } = await importLauncher()

      const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
      await vi.advanceTimersByTimeAsync(15_000)
      expect(openingMiniAppUrl.value).toBeNull()

      fetchDeferred.resolve({ text: () => Promise.resolve('window.__provider = true') })
      await pending

      expect(openWebView).not.toHaveBeenCalled()
      expect(hostDestroy).toHaveBeenCalledTimes(1)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('retries the provider fetch after a failed one instead of reusing the rejection', async () => {
    const fetchMock = vi.fn<() => Promise<{ text: () => Promise<string> }>>(() => Promise.reject(new Error('network down')))
    vi.stubGlobal('fetch', fetchMock)
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    expect(openWebView).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }))

    fetchMock.mockImplementation(() => Promise.resolve({ text: () => Promise.resolve('window.__provider = true') }))
    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(openWebView).toHaveBeenCalledTimes(1)
  })

  it('closes an active Mini App before opening the next (no stacking)', async () => {
    const { launchMiniApp } = await importLauncher()
    const { isMiniAppActive } = await import('@/composables/useMiniAppHost')
    isMiniAppActive.value = true
    closeActiveMiniApp.mockImplementationOnce(() => {
      isMiniAppActive.value = false
      return Promise.resolve()
    })

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })

    expect(closeActiveMiniApp).toHaveBeenCalledTimes(1)
    expect(openWebView).toHaveBeenCalledTimes(1)
    expect(closeActiveMiniApp.mock.invocationCallOrder[0]).toBeLessThan(openWebView.mock.invocationCallOrder[0])
  })

  it('clears a preserved session and closes its hidden webview before opening', async () => {
    // A resume-reload leaves isMiniAppActive false while the native webview survives;
    // the pending session marker is the only trace of it.
    sessionStorage.setItem('miniAppSession', JSON.stringify({
      url: 'https://old.example',
      title: 'Old',
      chainId: '0x1',
      hiddenAt: Date.now(),
    }))
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })

    expect(closeActiveMiniApp).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('miniAppSession')).toBeNull()
    expect(closeActiveMiniApp.mock.invocationCallOrder[0]).toBeLessThan(openWebView.mock.invocationCallOrder[0])
  })

  it('relaunches a preserved session in a fresh webview without clearing its cookies', async () => {
    sessionStorage.setItem('miniAppSession', JSON.stringify({
      url: 'https://app.uniswap.org/',
      title: 'Uniswap',
      chainId: '0x1',
      hiddenAt: Date.now(),
    }))
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org/', title: 'Uniswap', source: 'resume', keepCookies: true })

    expect(clearAllCookies).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('miniAppSession')).toBeNull()
    expect(closeActiveMiniApp.mock.invocationCallOrder[0]).toBeLessThan(openWebView.mock.invocationCallOrder[0])
    expect(trackDAppOpened).toHaveBeenCalledWith('https://app.uniswap.org/', 'Uniswap', 'resume')
  })

  it('relaunches a preserved session when its hidden webview is already gone', async () => {
    sessionStorage.setItem('miniAppSession', JSON.stringify({
      url: 'https://app.uniswap.org/',
      title: 'Uniswap',
      chainId: '0x1',
      hiddenAt: Date.now(),
    }))
    // Native close() rejects without a closeEvent when no webview exists.
    closeActiveMiniApp.mockRejectedValueOnce(new Error('WebView is not initialized'))
    const { launchMiniApp } = await importLauncher()

    await launchMiniApp({ url: 'https://app.uniswap.org/', title: 'Uniswap', source: 'resume', keepCookies: true })

    expect(openWebView).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('miniAppSession')).toBeNull()
  })

  it('fails the launch on pageLoadError and skips success bookkeeping', async () => {
    const { launchMiniApp, openingMiniAppUrl } = await importLauncher()
    const deferred = createDeferred<{ id: string }>()
    openWebView.mockImplementationOnce(() => deferred.promise)
    let errorHandler: (() => void) | undefined
    addListener.mockImplementation(((event: string, handler: () => void) => {
      if (event === 'pageLoadError')
        errorHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    await flushPromises()

    errorHandler?.()
    expect(openingMiniAppUrl.value).toBeNull()
    expect(setToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }))
    expect(closeActiveMiniApp).toHaveBeenCalledTimes(1)

    deferred.resolve({ id: MAIN_WEBVIEW_ID })
    await pending
    expect(trackDAppOpened).not.toHaveBeenCalled()
  })

  it('holds confirmation sheets until the webview is presented', async () => {
    getPlatform.mockReturnValue('android')
    const { requestUserConfirmation, selectLightningAsset } = await import('@/lib/mini-app-confirmation')
    vi.mocked(requestUserConfirmation).mockClear()
    vi.mocked(selectLightningAsset).mockClear()
    const { launchMiniApp } = await importLauncher()
    const deferred = createDeferred<{ id: string }>()
    openWebView.mockImplementationOnce(() => deferred.promise)
    let pageLoadedHandler: (() => void) | undefined
    addListener.mockImplementation(((event: string, handler: () => void) => {
      if (event === 'browserPageLoaded')
        pageLoadedHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    await flushPromises()
    const [, config] = MiniAppHostCtor.mock.calls[0] as [unknown, {
      requestUserConfirmation: (request: unknown, deadline?: number) => Promise<boolean>
      selectLightningAsset: (app: unknown, deadline?: number) => Promise<unknown>
    }]

    // The provider is live from documentStart, so a connect can arrive before the webview shows.
    const request = { type: 'accounts', url: 'https://app.uniswap.org/', network: 'ethereum' }
    const confirmation = config.requestUserConfirmation(request, 123)
    const assetSelection = config.selectLightningAsset({ url: 'https://app.uniswap.org/', name: 'Uniswap' }, 456)
    await flushPromises()
    expect(requestUserConfirmation).not.toHaveBeenCalled()

    pageLoadedHandler?.()
    await flushPromises()
    expect(requestUserConfirmation).not.toHaveBeenCalled()

    deferred.resolve({ id: MAIN_WEBVIEW_ID })
    await pending
    expect(await confirmation).toBe(true)
    expect(await assetSelection).toBe('NIM')
    expect(requestUserConfirmation).toHaveBeenCalledWith(request, 123)
    expect(selectLightningAsset).toHaveBeenCalledWith({ url: 'https://app.uniswap.org/', name: 'Uniswap' }, 456)
    expect(trackDAppSheetHeld).toHaveBeenCalledWith('https://app.uniswap.org/', 'app.uniswap.org', 'accounts', expect.any(Number), true)
    expect(trackDAppSheetHeld).toHaveBeenCalledWith('https://app.uniswap.org/', 'app.uniswap.org', 'lightning-asset', expect.any(Number), true)

    trackDAppSheetHeld.mockClear()
    await config.requestUserConfirmation(request, 123)
    expect(trackDAppSheetHeld).not.toHaveBeenCalled()
  })

  it('keeps the request deadline of a held confirmation sheet', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    try {
      const { requestUserConfirmation } = await import('@/lib/mini-app-confirmation')
      vi.mocked(requestUserConfirmation).mockClear()
      const { launchMiniApp } = await importLauncher()
      const deferred = createDeferred<{ id: string }>()
      openWebView.mockImplementationOnce(() => deferred.promise)
      let pageLoadedHandler: (() => void) | undefined
      addListener.mockImplementation(((event: string, handler: () => void) => {
        if (event === 'browserPageLoaded')
          pageLoadedHandler = handler
        return Promise.resolve({ remove: vi.fn() })
      }) as never)

      const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
      await vi.advanceTimersByTimeAsync(0)
      const [, config] = MiniAppHostCtor.mock.calls[0] as [unknown, {
        requestUserConfirmation: (request: unknown) => Promise<boolean>
      }]
      const request = { type: 'accounts', url: 'https://app.uniswap.org/', network: 'ethereum' }
      const confirmation = config.requestUserConfirmation(request)

      await vi.advanceTimersByTimeAsync(10_000)
      pageLoadedHandler?.()
      deferred.resolve({ id: MAIN_WEBVIEW_ID })
      await pending
      await vi.advanceTimersByTimeAsync(600)
      await confirmation
      expect(requestUserConfirmation).toHaveBeenCalledWith(request, 1_000_000 + 120_000)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('releases held sheets on iOS only after the present transition', async () => {
    vi.useFakeTimers()
    try {
      const { requestUserConfirmation } = await import('@/lib/mini-app-confirmation')
      vi.mocked(requestUserConfirmation).mockClear()
      const { launchMiniApp } = await importLauncher()
      let pageLoadedHandler: (() => void) | undefined
      addListener.mockImplementation(((event: string, handler: () => void) => {
        if (event === 'browserPageLoaded')
          pageLoadedHandler = handler
        return Promise.resolve({ remove: vi.fn() })
      }) as never)

      const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
      await vi.advanceTimersByTimeAsync(0)
      const [, config] = MiniAppHostCtor.mock.calls.at(-1) as [unknown, {
        requestUserConfirmation: (request: unknown, deadline?: number) => Promise<boolean>
      }]
      const request = { type: 'accounts', url: 'https://app.uniswap.org/', network: 'ethereum' }
      const confirmation = config.requestUserConfirmation(request, 123)

      pageLoadedHandler?.()
      await pending
      await vi.advanceTimersByTimeAsync(599)
      expect(requestUserConfirmation).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(await confirmation).toBe(true)
      expect(requestUserConfirmation).toHaveBeenCalledWith(request, 123)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('rejects a held sheet when the webview closes during the iOS present transition', async () => {
    vi.useFakeTimers()
    try {
      const { requestUserConfirmation } = await import('@/lib/mini-app-confirmation')
      vi.mocked(requestUserConfirmation).mockClear()
      const { launchMiniApp } = await importLauncher()
      const handlers: Record<string, () => unknown> = {}
      addListener.mockImplementation(((event: string, handler: () => unknown) => {
        handlers[event] = handler
        return Promise.resolve({ remove: vi.fn() })
      }) as never)

      const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
      await vi.advanceTimersByTimeAsync(0)
      const [, config] = MiniAppHostCtor.mock.calls.at(-1) as [unknown, {
        requestUserConfirmation: (request: unknown) => Promise<boolean>
      }]
      const confirmation = config.requestUserConfirmation({ type: 'accounts', url: 'https://app.uniswap.org/', network: 'ethereum' })

      handlers.browserPageLoaded?.()
      await pending
      await (handlers.closeEvent as CloseHandler | undefined)?.({ id: MAIN_WEBVIEW_ID, url: 'https://app.uniswap.org/' })
      await vi.advanceTimersByTimeAsync(600)

      expect(await confirmation).toBe(false)
      expect(requestUserConfirmation).not.toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('rejects held confirmation sheets when the launch fails before presentation', async () => {
    const { requestUserConfirmation, selectLightningAsset } = await import('@/lib/mini-app-confirmation')
    vi.mocked(requestUserConfirmation).mockClear()
    vi.mocked(selectLightningAsset).mockClear()
    const { launchMiniApp } = await importLauncher()
    const deferred = createDeferred<{ id: string }>()
    openWebView.mockImplementationOnce(() => deferred.promise)
    let errorHandler: (() => void) | undefined
    addListener.mockImplementation(((event: string, handler: () => void) => {
      if (event === 'pageLoadError')
        errorHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    }) as never)

    const pending = launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })
    await flushPromises()
    const [, config] = MiniAppHostCtor.mock.calls[0] as [unknown, {
      requestUserConfirmation: (request: unknown) => Promise<boolean>
      selectLightningAsset: (app: unknown) => Promise<unknown>
    }]
    const confirmation = config.requestUserConfirmation({ type: 'accounts', url: 'https://app.uniswap.org/', network: 'ethereum' })
    const assetSelection = config.selectLightningAsset({ url: 'https://app.uniswap.org/', name: 'Uniswap' })

    errorHandler?.()
    deferred.resolve({ id: MAIN_WEBVIEW_ID })
    await pending
    expect(await confirmation).toBe(false)
    expect(await assetSelection).toBeUndefined()
    expect(requestUserConfirmation).not.toHaveBeenCalled()
    expect(selectLightningAsset).not.toHaveBeenCalled()
  })

  it('closes the failed dialog when openWebView rejects', async () => {
    const { launchMiniApp } = await importLauncher()
    openWebView.mockRejectedValueOnce(new Error('Initial page load failed'))

    await launchMiniApp({ url: 'https://app.uniswap.org', source: 'featured' })

    expect(closeActiveMiniApp).toHaveBeenCalledTimes(1)
    expect(hostDestroy).toHaveBeenCalledTimes(1)
  })
})
