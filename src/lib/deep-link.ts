import type { URLOpenListenerEvent } from '@capacitor/app'
import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { until } from '@vueuse/core'
import { useDecrypt } from '@/composables/useDecrypt'
import { useLogger } from '@/composables/useLogger'
import { clearSession, hasPendingSession } from '@/composables/useMiniAppSession'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { normalizeMiniAppUrl } from '@/modals/mini-app-search'
import { useApp } from '@/stores/app'
import { useMiniApps } from '@/stores/mini-apps'
import { launchMiniApp } from './mini-app-launcher'
import { confirmUntrustedMiniApp } from './mini-app-untrusted-confirm'
import { isExternalDeepLinkUrlSafe } from './url-safety'

const logger = useLogger('DeepLink')

/**
 * Route Capacitor `appUrlOpen` events. Parses up-front so malformed URLs don't
 * block the listener task on PIN entry; waits for decrypt only when the routed
 * action needs wallet access.
 */
export async function handleDeepLink(event: URLOpenListenerEvent): Promise<void> {
  let url: URL
  try {
    url = new URL(event.url)
  }
  catch {
    logger.error('Invalid deeplink URL:', event.url)
    return
  }

  switch (url.protocol) {
    case 'lightning:':
      await until(useDecrypt().decrypted).toBeTruthy()
      initializeFlow(FlowName.Payment, {
        initialState: { qrCodeScanner: url.toString() },
        analyticsSource: 'lightning_deeplink',
      })
      return

    case 'nimiqpay:': {
      if (url.host !== 'miniapp') {
        logger.warn('Unknown nimiqpay action:', url.host)
        return
      }
      const raw = url.searchParams.get('url')
      if (!raw) {
        logger.warn('nimiqpay://miniapp missing url param')
        return
      }
      await openMiniAppFromDeeplink(raw)
      return
    }

    case 'https:':
    case 'http:': {
      if (url.host !== 'nimpay.app') {
        logger.log('Unhandled deeplink host:', url.host)
        return
      }
      const match = url.pathname.match(/^\/miniapps\/open\/(.+)$/)
      if (!match) {
        logger.log('Unhandled nimpay.app path:', url.pathname)
        return
      }
      // Decoded segment may itself contain a path; preserve original search/hash.
      const raw = decodeURIComponent(match[1]) + url.search + url.hash
      await openMiniAppFromDeeplink(raw)
      return
    }

    default:
      logger.log('Unhandled deeplink protocol:', url.protocol)
  }
}

async function openMiniAppFromDeeplink(raw: string): Promise<void> {
  const normalized = normalizeMiniAppUrl(raw)
  if (!normalized) {
    logger.warn('Invalid mini-app url in deeplink:', raw)
    return
  }
  // Reject before the user-facing trust gate so "Open anyway" can never reach
  // a LAN/SSRF target, regardless of what the user taps.
  const safety = isExternalDeepLinkUrlSafe(normalized)
  if (!safety.ok) {
    logger.warn('Refused unsafe mini-app deeplink:', normalized, safety.reasons)
    return
  }
  await until(useDecrypt().decrypted).toBeTruthy()
  const store = useMiniApps()
  if (!store.isTrustedMiniAppUrl(normalized)) {
    const confirmed = await confirmUntrustedMiniApp({ normalizedUrl: normalized, rawUrl: raw })
    if (!confirmed) {
      logger.log('User declined untrusted mini-app deeplink:', normalized)
      return
    }
  }
  // Clear any preserved session + close its webview so PinView's reconnectAndShow
  // does not race with — or stack on top of — this launch.
  await Promise.all([
    hasPendingSession() ? clearSession() : Promise.resolve(),
    InAppBrowser.close().catch(err =>
      logger.log('InAppBrowser.close before deeplink launch failed (likely no webview):', err)),
  ])
  const app = useApp()
  await launchMiniApp({ url: normalized, source: 'deeplink', language: app.language, userFiat: app.selectedFiat })
}
