import { isDev } from '@/lib'

export const MOCK_DATA_OVERRIDE_KEY = 'nimiq-pay:mock-data-override'

function readOverrideSync(): boolean {
  try {
    return globalThis.localStorage?.getItem(MOCK_DATA_OVERRIDE_KEY) === 'true'
  }
  catch {
    return false
  }
}

// Gated on isDev so mock can NEVER activate in production: prod builds compile isDev to the literal
// `false`, dead-code-eliminating both branches (immune to a leaked VITE_MOCK_DATA and to a stale mock
// dist being shipped). Screenshot builds run in dev mode, so VITE_MOCK_DATA still bakes in there.
export const isMockBakedIn: boolean = isDev && import.meta.env.VITE_MOCK_DATA === 'true'

// Resolved ONCE at module import, like networkOverride: sync/boot code keys off a sync value.
// When enabled, the app skips blockchain sync and renders in-memory fixtures (UI dev / screenshots).
export const isMockEnabled: boolean = isDev && (isMockBakedIn || readOverrideSync())

/**
 * Persist the override. Callers MUST reload (router.go(0)) — isMockEnabled is
 * resolved at import time.
 */
export function setMockDataOverride(enabled: boolean): void {
  try {
    if (enabled)
      globalThis.localStorage?.setItem(MOCK_DATA_OVERRIDE_KEY, 'true')
    else
      globalThis.localStorage?.removeItem(MOCK_DATA_OVERRIDE_KEY)
  }
  catch (error) {
    // Surface private-mode / quota failures so a silently-failing toggle is debuggable.
    console.warn('[mock-mode] Failed to persist override', error)
  }
}
