import type { DAppOpenSource } from '@/lib/analytics'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser'
import { until } from '@vueuse/core'
import { ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { isMiniAppActive, MiniAppHost } from '@/composables/useMiniAppHost'
import { clearSession, hasPendingSession } from '@/composables/useMiniAppSession'
import { useToast } from '@/composables/useToast'
import { isTestnet } from '@/lib'
import { trackDAppClosed, trackDAppOpened } from '@/lib/analytics'
import { requestUserConfirmation, selectLightningAsset } from '@/lib/mini-app-confirmation'
import { getFaviconUrl } from '@/lib/site-metadata'
import { safeHostname } from '@/lib/url-safety'
import { normalizeMiniAppUrl } from '@/modals/mini-app-search'
import { Fiat } from '@/stores/app'
import { useMiniAppWidgets } from '@/stores/mini-app-widgets'
import { useMiniApps } from '@/stores/mini-apps'

const logger = useLogger('MiniAppLauncher')

const evmRpcUrls: Record<string, string> = {
  '0x1': import.meta.env.VITE_ETHEREUM_RPC_URL,
  '0x89': import.meta.env.VITE_POLYGON_RPC_URL,
  '0xa4b1': import.meta.env.VITE_ARBITRUM_RPC_URL,
  '0xa': import.meta.env.VITE_OPTIMISM_RPC_URL,
  '0x2105': import.meta.env.VITE_BASE_RPC_URL,
  '0x38': import.meta.env.VITE_BNB_RPC_URL,
  '0xaa36a7': import.meta.env.VITE_SEPOLIA_RPC_URL,
}

const NIMIQ_RPC_URL = isTestnet ? 'https://rpc.testnet.nimiqwatch.com' : 'https://rpc.nimiqwatch.com'

const LAUNCH_FAILED_TOAST = 'Could not open the Mini App'

export const openingMiniAppUrl = ref<string | null>(null)

let web3ProviderScript: Promise<string> | null = null

function getWeb3ProviderScript(): Promise<string> {
  if (!web3ProviderScript) {
    // Timeout so a hung fetch rejects (clearing the memoized promise) instead of
    // wedging every future launch behind it.
    web3ProviderScript = fetch('/web3-provider.js', { signal: AbortSignal.timeout(10_000) })
      .then(res => res.text())
      .catch((err) => {
        web3ProviderScript = null
        throw err
      })
  }
  return web3ProviderScript
}

/** Eagerly fetch the web3-provider script so the first mini-app open is instant. */
export function warmUpWeb3ProviderScript(): void {
  void getWeb3ProviderScript()
}

/**
 * Blur the focused input and wait until the soft keyboard is fully hidden before
 * opening the webview. The native InAppBrowser pins the webview to the safe area once
 * at present-time; opening while the keyboard is up sizes it to the compressed area and
 * never recomputes, leaving a blank gap below. No-op when no input is focused (button /
 * deeplink paths), so it adds no latency there.
 */
async function dismissKeyboardBeforeOpen(): Promise<void> {
  if (!Capacitor.isNativePlatform())
    return
  const active = document.activeElement as HTMLElement | null
  const focused = !!active
    && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
  if (!focused)
    return
  active?.blur()
  await new Promise<void>((resolve) => {
    let done = false
    const finish = (sub?: { remove: () => void }) => {
      if (done)
        return
      done = true
      sub?.remove()
      resolve()
    }
    Keyboard.addListener('keyboardDidHide', () => finish())
      .then(sub => setTimeout(finish, 350, sub)) // fallback if the event never fires
      .catch(() => finish())
    Keyboard.hide().catch(() => {})
  })
}

export interface LaunchMiniAppOptions {
  url: string
  title?: string
  source: DAppOpenSource
  description?: string
  icon?: string
  /** UI language seeded into `window.__NIMIQ_PAY__`. Defaults to `'en'`. */
  language?: string
  /** Fiat currency seeded into `window.__NIMIQ_PAY__`. Defaults to `Fiat.USD`. */
  userFiat?: Fiat
}

/**
 * Shared entry point for opening a mini-app. Used by both the in-app `MiniAppsModal`
 * and external deeplinks, keeping cookie clearing, provider injection, analytics,
 * and lifecycle wiring in a single place.
 */
export async function launchMiniApp(options: LaunchMiniAppOptions): Promise<void> {
  if (openingMiniAppUrl.value !== null) {
    logger.log('Launch suppressed; another mini-app is already opening:', openingMiniAppUrl.value)
    return
  }

  const targetUrl = normalizeMiniAppUrl(options.url)
  if (!targetUrl) {
    useToast().setToast({ message: 'Enter a valid app URL', type: 'error' })
    return
  }

  const appTitle = options.title || safeHostname(targetUrl, 'Mini App')
  openingMiniAppUrl.value = targetUrl
  const toast = useToast()
  const icon = options.icon ?? getFaviconUrl(targetUrl)
  // Upgrade + cache this site's real icon for opened/searched apps not resolved via the list.
  void useMiniApps().ensureBestIcon(targetUrl)
  // Recently Viewed keeps only the site's root, so a launch is where the gallery learns of a Mini App in a subfolder.
  try {
    useMiniAppWidgets().noteLaunch(targetUrl)
  }
  catch (error) {
    logger.warn('Could not note Mini App launch for widgets:', error)
  }
  // Loading toast only for deeplinks; modal callers show per-button spinner via `openingMiniAppUrl`.
  const showLoadingToast = options.source === 'deeplink'
  if (showLoadingToast)
    toast.setToast({ message: `Opening ${appTitle}…`, type: 'spinner', keepOpen: true })

  let host: MiniAppHost | null = null
  let handle: { remove: () => Promise<void> } | null = null
  let pageLoadedHandle: { remove: () => Promise<void> } | null = null
  let pageErrorHandle: { remove: () => Promise<void> } | null = null
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let guardCleared = false
  let openCalled = false

  // iOS resolves `openWebView` before the present animation finishes, so the guard
  // must be held until the webview confirms it loaded / failed / closed.
  const clearGuard = () => {
    if (guardCleared)
      return
    guardCleared = true
    openingMiniAppUrl.value = null
    if (showLoadingToast)
      toast.clearToast()
    if (watchdog !== null) {
      clearTimeout(watchdog)
      watchdog = null
    }
    void pageLoadedHandle?.remove()
    pageLoadedHandle = null
    void pageErrorHandle?.remove()
    pageErrorHandle = null
  }

  // Failure paths share this: release the guard, tell the user, and kill the pending
  // invisible webview (isPresentAfterPageLoad) so it can't pop up later or stack
  // under a retry. If no webview exists, destroy the host directly — no closeEvent
  // will ever fire for it.
  const failLaunch = (reason: string) => {
    logger.warn('Mini App launch failed:', reason, targetUrl)
    clearGuard()
    toast.setToast({ message: LAUNCH_FAILED_TOAST, type: 'error' })
    void InAppBrowser.close().catch(() => host?.destroy())
  }

  // Scheduled before any await so a hung fetch/native call can never wedge the guard
  // (a wedged guard silently suppresses every future launch).
  watchdog = setTimeout(failLaunch, 15_000, 'timed out')

  try {
    // Never stack webviews: a Mini App can be live in this session (isMiniAppActive)
    // or surviving hidden from before a resume-reload (pending session marker, which
    // PinView's reconnectAndShow would otherwise race with). Close it and wait for
    // its closeEvent-driven teardown, so the old host's destroy() cannot clobber the
    // session state the new MiniAppHost is about to register.
    const pendingSession = hasPendingSession()
    if (isMiniAppActive.value || pendingSession) {
      if (pendingSession)
        await clearSession()
      await InAppBrowser.close().catch(err => logger.log('close before launch failed (likely no webview):', err))
      await until(isMiniAppActive).toBe(false, { timeout: 3000 })
    }

    host = new MiniAppHost(InAppBrowser, {
      url: targetUrl,
      title: appTitle,
      requestUserConfirmation,
      selectLightningAsset,
      evmRpcUrls,
    })

    const [baseScript] = await Promise.all([
      getWeb3ProviderScript(),
      InAppBrowser.clearAllCookies(),
    ])
    const hostContext = JSON.stringify({
      lang: options.language ?? 'en',
      userFiat: options.userFiat ?? Fiat.USD,
      network: isTestnet ? 'testnet' : 'mainnet',
    })
    const scriptContent = `window.__NIMIQ_PAY__=${hostContext};window.__NIMIQ_RPC_URL__=${JSON.stringify(NIMIQ_RPC_URL)};${baseScript}`

    // Attach BEFORE openWebView so events fired during the open animation aren't missed.
    // Null re-entry guard: plugin close() and dialog dismiss can both emit closeEvent.
    const openedAt = Date.now()
    const hostRef = host
    handle = await InAppBrowser.addListener('closeEvent', async () => {
      const h = handle
      if (h === null)
        return
      handle = null
      logger.log('Mini-app webview closed, destroying host')
      trackDAppClosed(targetUrl, appTitle, Date.now() - openedAt)
      await hostRef.destroy()
      await ScreenOrientation.lock({ orientation: 'portrait' })
      await h.remove()
      clearGuard()
    })
    // "Presented" = openWebView resolved AND browserPageLoaded fired. Android
    // resolves at show() (its pageLoaded event reaches JS earlier); iOS resolves at
    // webview creation (pageLoaded fires after presentView). Requiring both clears
    // the guard at actual presentation on both platforms.
    let opened = false
    let pageLoaded = false
    const clearGuardWhenPresented = () => {
      if (opened && pageLoaded)
        clearGuard()
    }
    pageLoadedHandle = await InAppBrowser.addListener('browserPageLoaded', () => {
      pageLoaded = true
      clearGuardWhenPresented()
    })
    pageErrorHandle = await InAppBrowser.addListener('pageLoadError', () => {
      failLaunch('page load error')
    })

    // Keyboard must be hidden before present so the webview isn't sized to the
    // above-keyboard area (the loading spinner already shows via openingMiniAppUrl).
    await dismissKeyboardBeforeOpen()

    // The watchdog may have fired while the awaits above were pending; opening now
    // would pop an unexpected webview over whatever the user is doing by then.
    if (guardCleared) {
      await host.destroy()
      await handle?.remove()
      handle = null
      return
    }

    openCalled = true
    await InAppBrowser.openWebView({
      url: targetUrl,
      title: appTitle,
      toolbarType: ToolBarType.NAVIGATION,
      preventDeeplink: true,
      showReloadButton: true,
      handleDownloads: true,
      activeNativeNavigationForWebview: true,
      isPresentAfterPageLoad: true,
      preShowScript: scriptContent,
      preShowScriptInjectionTime: 'documentStart',
    })
    // Watchdog/pageLoadError may have failed this launch (and closed the webview)
    // while openWebView was in flight; skip the success bookkeeping then.
    if (guardCleared)
      return
    opened = true
    clearGuardWhenPresented()
    await ScreenOrientation.unlock()

    trackDAppOpened(targetUrl, appTitle, options.source)
    useMiniApps().addRecentlyViewed({
      url: targetUrl,
      name: appTitle,
      icon,
      description: options.description,
    })
  }
  catch (err) {
    // pageLoadError / watchdog may have already toasted + closed before the
    // rejection surfaced here (Android rejects openWebView on main-frame errors).
    const alreadyHandled = guardCleared
    logger.error('Failed to open mini-app:', err)
    clearGuard()
    if (!alreadyHandled) {
      toast.setToast({ message: LAUNCH_FAILED_TOAST, type: 'error' })
      // A rejected openWebView leaves the not-yet-shown dialog alive on Android;
      // close it so its error page can't present itself later.
      if (openCalled)
        void InAppBrowser.close().catch(() => {})
    }
    if (host)
      await host.destroy()
    if (handle) {
      try {
        await handle.remove()
      }
      catch { /* listener may already be removed */ }
    }
  }
}
