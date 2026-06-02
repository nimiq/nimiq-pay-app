import type { DAppOpenSource } from '@/lib/analytics'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser'
import { ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { MiniAppHost } from '@/composables/useMiniAppHost'
import { useToast } from '@/composables/useToast'
import { isTestnet } from '@/lib'
import { trackDAppClosed, trackDAppOpened } from '@/lib/analytics'
import { requestUserConfirmation } from '@/lib/mini-app-confirmation'
import { getFaviconUrl } from '@/lib/site-metadata'
import { safeHostname } from '@/lib/url-safety'
import { normalizeMiniAppUrl } from '@/modals/mini-app-search'
import { Fiat } from '@/stores/app'
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

export const openingMiniAppUrl = ref<string | null>(null)

let web3ProviderScript: Promise<string> | null = null

function getWeb3ProviderScript(): Promise<string> {
  if (!web3ProviderScript) {
    web3ProviderScript = fetch('/web3-provider.js')
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

  // iOS resolves `openWebView` before the present animation finishes, so the guard
  // must be held until the webview confirms it loaded / failed / closed.
  const clearGuard = () => {
    if (guardCleared)
      return
    guardCleared = true
    openingMiniAppUrl.value = null
    if (watchdog !== null) {
      clearTimeout(watchdog)
      watchdog = null
    }
    void pageLoadedHandle?.remove()
    pageLoadedHandle = null
    void pageErrorHandle?.remove()
    pageErrorHandle = null
  }

  try {
    host = new MiniAppHost(InAppBrowser, {
      url: targetUrl,
      title: appTitle,
      requestUserConfirmation,
      evmRpcUrls,
    })

    const [baseScript] = await Promise.all([
      getWeb3ProviderScript(),
      InAppBrowser.clearAllCookies(),
    ])
    const hostContext = JSON.stringify({
      lang: options.language ?? 'en',
      userFiat: options.userFiat ?? Fiat.USD,
    })
    const scriptContent = `window.__NIMIQ_PAY__=${hostContext};window.__NIMIQ_RPC_URL__=${JSON.stringify(NIMIQ_RPC_URL)};${baseScript}`

    // Attach BEFORE openWebView so events fired during the open animation aren't missed.
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
    pageLoadedHandle = await InAppBrowser.addListener('browserPageLoaded', () => {
      clearGuard()
    })
    pageErrorHandle = await InAppBrowser.addListener('pageLoadError', () => {
      clearGuard()
    })
    watchdog = setTimeout(clearGuard, 15_000)

    await InAppBrowser.openWebView({
      url: targetUrl,
      title: appTitle,
      toolbarType: ToolBarType.NAVIGATION,
      preventDeeplink: true,
      showReloadButton: true,
      enabledSafeBottomMargin: true,
      useTopInset: true,
      activeNativeNavigationForWebview: true,
      isPresentAfterPageLoad: true,
      preShowScript: scriptContent,
      preShowScriptInjectionTime: 'documentStart',
    })
    if (showLoadingToast)
      toast.clearToast()
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
    logger.error('Failed to open mini-app:', err)
    useToast().setToast({ message: 'Could not open the mini-app webview', type: 'error' })
    if (host)
      await host.destroy()
    if (handle) {
      try {
        await handle.remove()
      }
      catch { /* listener may already be removed */ }
    }
    clearGuard()
  }
}
