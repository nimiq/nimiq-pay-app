import type { MiniAppHost, MiniAppSessionState } from '@/composables/useMiniAppHost'
import { InAppBrowser } from '@capgo/inappbrowser'
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

  try {
    const { MiniAppHost } = await import('@/composables/useMiniAppHost')
    const { requestUserConfirmation } = await import('@/lib/mini-app-confirmation')

    const host = MiniAppHost.reconnect(InAppBrowser, {
      url: session.url,
      title: session.title,
      evmRpcUrls: session.evmRpcUrls,
      requestUserConfirmation,
    }, session.chainId)

    // Re-register close listener so the host is destroyed when user closes the webview
    InAppBrowser.addListener('closeEvent', async () => {
      logger.log('Reconnected mini-app webview closed, destroying host')
      await host.destroy()
    })

    await InAppBrowser.show()
    clearPersistedSession()
    logger.log('Webview reconnected and shown successfully')
    return host
  }
  catch (error) {
    logger.error('Failed to reconnect webview:', error)
    await clearSession()
    // Try to close any orphaned webview
    try {
      await InAppBrowser.close()
    }
    catch {}
    return null
  }
}
