const KEY = 'nimiq_pay_approved_accounts'

type Network = 'nimiq' | 'ethereum'
type Cache = Partial<Record<Network, string[]>>

/**
 * Per-network generation counter. Bumped on every clear so an in-flight
 * `listAccounts`/`requestAccounts` that captured the pre-clear generation
 * can detect it must NOT write its (now-stale) result back into the cache.
 */
const generations = new Map<Network, number>()

export function getCacheGeneration(network: Network): number {
  return generations.get(network) ?? 0
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function read(): Cache {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw)
      return {}
    const parsed: unknown = JSON.parse(raw)
    return isPlainObject(parsed) ? (parsed as Cache) : {}
  }
  catch {
    return {}
  }
}

function write(data: Cache): void {
  try {
    if (Object.keys(data).length === 0) {
      sessionStorage.removeItem(KEY)
      return
    }
    sessionStorage.setItem(KEY, JSON.stringify(data))
  }
  catch {
    // sessionStorage may throw (private mode / quota). Re-prompt next call.
  }
}

export function getCachedAccounts(network: Network): string[] | null {
  const v = read()[network]
  return v && v.length > 0 ? v : null
}

export function setCachedAccounts(network: Network, accounts: string[]): void {
  if (!Array.isArray(accounts) || accounts.length === 0)
    return
  if (!accounts.every(a => typeof a === 'string' && a.length > 0))
    return
  const data = read()
  data[network] = accounts
  write(data)
}

function bumpGeneration(network: Network): void {
  generations.set(network, (generations.get(network) ?? 0) + 1)
}

export function clearCachedAccounts(network?: Network): void {
  if (!network) {
    bumpGeneration('nimiq')
    bumpGeneration('ethereum')
    try {
      sessionStorage.removeItem(KEY)
    }
    catch { /* ignore */ }
    return
  }
  bumpGeneration(network)
  const data = read()
  if (data[network]) {
    delete data[network]
    write(data)
  }
}
