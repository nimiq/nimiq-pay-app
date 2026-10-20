import type { PluginListenerHandle } from '@capacitor/core'
import type { MiniAppHost, MiniAppSessionState } from '@/composables/useMiniAppHost'
import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('MiniAppSession')

const SESSION_KEY = 'miniAppSession'
/** Discard sessions older than 10 minutes */
const MAX_SESSION_AGE_MS = 10 * 60 * 1000

interface PersistedSession extends MiniAppSessionState {
  hiddenAt: number
}

/**
 * Clears only the temporary session marker from `sessionStorage`.
 * Use this after a successful reconnect, when the webview/cookies must stay intact.
 */
function clearPersistedSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export function saveSession(state: MiniAppSessionState): void {
  const data: PersistedSession = {
    ...state,
    hiddenAt: Date.now(),
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
  logger.log('Session saved:', data)
}

export function getSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw)
      return null
    const data = JSON.parse(raw) as PersistedSession
    // Discard stale sessions
    if (Date.now() - data.hiddenAt > MAX_SESSION_AGE_MS) {
      logger.log('Session expired, discarding')
      void clearSession()
      return null
    }
    return data
  }
  catch {
    void clearSession()
    return null
  }
}

/**
 * Full reset for abandoned/invalid mini-app sessions.
 * Clears both the persisted marker and webview cookies to avoid stale auth state.
 */
export async function clearSession(): Promise<void> {
  clearPersistedSession()
  try {
    await InAppBrowser.clearAllCookies()
  }
  catch (error) {
    logger.error('Failed to clear mini-app cookies while clearing session:', error)
  }
}

export function hasPendingSession(): boolean {
  return getSession() !== null
}

/**
 * Reconnect to a hidden webview after PIN unlock.
 * Creates a new MiniAppHost (re-registering listeners), then shows the webview.
 * Returns the new host, or null if reconnection failed.
 */
export async function reconnectAndShow(): Promise<MiniAppHost | null> {
  const session = getSession()
  if (!session) {
    logger.log('No pending session to reconnect')
    return null
  }

  let host: MiniAppHost | null = null
  let closeHandle: PluginListenerHandle | null = null
  try {
    const { MiniAppHost } = await import('@/composables/useMiniAppHost')
    const { requestUserConfirmation, selectLightningAsset } = await import('@/lib/mini-app-confirmation')

    host = MiniAppHost.reconnect(InAppBrowser, {
      url: session.url,
      title: session.title,
      evmRpcUrls: session.evmRpcUrls,
      requestUserConfirmation,
      selectLightningAsset,
    }, session.chainId)

    // Re-register close listener so the host is destroyed when user closes the webview
    // (host.destroy() no longer removes listeners it doesn't own). Null re-entry guard
    // because plugin close() and dialog dismiss can both emit closeEvent.
    const hostRef = host
    closeHandle = await InAppBrowser.addListener('closeEvent', async () => {
      const h = closeHandle
      if (h === null)
        return
      closeHandle = null
      logger.log('Reconnected mini-app webview closed, destroying host')
      await hostRef.destroy()
      await h.remove()
    })

    await InAppBrowser.show()
    clearPersistedSession()
    logger.log('Webview reconnected and shown successfully')
    return host
  }
  catch (error) {
    logger.error('Failed to reconnect webview:', error)
    // With the webview gone, close() rejects without emitting closeEvent, so the
    // listener above never destroys the host and isMiniAppActive would stay true.
    await closeHandle?.remove().catch(() => {})
    await host?.destroy()
    await clearSession()
    // Try to close any orphaned webview
    try {
      await InAppBrowser.close()
    }
    catch {}
    return null
  }
}
