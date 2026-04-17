// Inlined rather than imported from '@/lib' to avoid a circular dependency:
// '@/lib/index.ts' re-exports from this file.
const isDev = import.meta.env.DEV

export const NETWORK_OVERRIDE_KEY = 'nimiq-pay:network-override'

export type NetworkMode = 'testnet' | 'mainnet'

function readOverrideSync(): NetworkMode | null {
  try {
    const v = globalThis.localStorage?.getItem(NETWORK_OVERRIDE_KEY)
    return v === 'testnet' || v === 'mainnet' ? v : null
  }
  catch {
    return null
  }
}

// Resolved ONCE at module import so module-scope URL constants (e.g. basePointsUrl
// in useApi.ts) can key off a sync value.
export const networkOverride: NetworkMode | null = readOverrideSync()

export const isTestnet: boolean = networkOverride ? networkOverride === 'testnet' : isDev

export const isNetworkOverridden: boolean = networkOverride !== null

/**
 * Persist the override. Callers MUST reload (router.go(0)) — module-scope URL
 * constants keyed off isTestnet are resolved at import time.
 */
export function setNetworkOverride(mode: NetworkMode | null): void {
  try {
    if (mode === null)
      globalThis.localStorage?.removeItem(NETWORK_OVERRIDE_KEY)
    else
      globalThis.localStorage?.setItem(NETWORK_OVERRIDE_KEY, mode)
  }
  catch (error) {
    // Surface private-mode / quota failures so a silently-failing toggle is debuggable.
    console.warn('[network] Failed to persist override', error)
  }
}
