export const POLYGON_RPC_OVERRIDE_KEY = 'nimiq-pay:polygon-rpc-override'

export interface PolygonRpcChoice {
  url: string
  label: string
}

// Public mainnet RPCs from https://docs.polygon.technology/pos/reference/rpc-endpoints
export const POLYGON_PUBLIC_RPCS: readonly PolygonRpcChoice[] = [
  { url: 'https://polygon.drpc.org', label: 'dRPC' },
  { url: 'https://tenderly.rpc.polygon.community', label: 'Tenderly' },
  { url: 'https://polygon.publicnode.com', label: 'Allnodes (PublicNode)' },
  { url: 'https://polygon-mainnet.gateway.tatum.io/', label: 'Tatum' },
  { url: 'https://polygon-public.nodies.app/', label: 'Nodies' },
  { url: 'https://1rpc.io/matic', label: '1RPC' },
  { url: 'https://rpc-mainnet.matic.quiknode.pro', label: 'Quicknode' },
  { url: 'https://polygon.api.onfinality.io/public', label: 'OnFinality' },
] as const

function readOverrideSync(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(POLYGON_RPC_OVERRIDE_KEY)
    return typeof v === 'string' && v.length > 0 ? v : null
  }
  catch {
    return null
  }
}

// Resolved once at module import to match the network-override pattern.
export const polygonRpcOverride: string | null = readOverrideSync()

/**
 * Persist the override. Callers MUST reload (router.go(0)) — the resolved
 * value is captured at module import and the polygon-usdt store reads it
 * via the feature-flags computed.
 */
export function setPolygonRpcOverride(url: string | null): void {
  try {
    if (url === null)
      globalThis.localStorage?.removeItem(POLYGON_RPC_OVERRIDE_KEY)
    else
      globalThis.localStorage?.setItem(POLYGON_RPC_OVERRIDE_KEY, url)
  }
  catch (error) {
    // Surface private-mode / quota failures so a silently-failing toggle is debuggable.
    console.warn('[polygon-rpc-override] Failed to persist override', error)
  }
}
