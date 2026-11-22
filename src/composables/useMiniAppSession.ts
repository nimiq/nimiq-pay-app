import type { MiniAppSessionState } from '@/composables/useMiniAppHost'
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
 * Use this when relaunching the saved Mini App, whose cookies must stay intact.
 */
export function clearPersistedSession(): void {
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
