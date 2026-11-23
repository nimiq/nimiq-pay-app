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

export const isMockBakedIn: boolean = isDev && import.meta.env.VITE_MOCK_DATA === 'true'

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
    console.warn('[mock-mode] Failed to persist override', error)
  }
}
