import type { LiveValue, PriceRange, WidgetAsset, WidgetTrigger } from '@/lib/mini-app-widgets'
import { useCurrencyPriceApi } from '@/composables/useApi'
import { promiseWithTimeout } from '@/lib/utils'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { fetchPolygonTransactionState, getPolygonUsdtClient, isSuccessfulOpenGsnReceipt, shouldValidateOpenGsnTransaction } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'

export type ChainStatus = 'confirmed' | 'failed' | 'pending'

export interface WidgetChain {
  /** Head height, or undefined without consensus. */
  nimiqHeight: () => number | undefined
  nimiqTransaction: (hash: string) => Promise<ChainStatus | undefined>
  nimiqReceived: (to: string, minLuna: number, since: number) => Promise<boolean | undefined>
  /** In luna. */
  nimiqBalance: (address: string) => Promise<number | undefined>
  /** In luna. */
  nimiqStake: (address: string, part: 'active' | 'inactive') => Promise<number | undefined>
  polygonTransaction: (hash: string) => Promise<ChainStatus | undefined>
  /** In USDT micro-units (6 decimals). */
  usdtBalance: (address: string) => Promise<number | undefined>
  /** One unit of `asset` in `fiat`, now or at `at` (ms). */
  price: (asset: WidgetAsset, fiat: string, at?: number) => Promise<number | undefined>
}

export type ResolvedLive = { kind: 'amount', amount: string, currency: string } | { kind: 'change', percent: number }

export const RANGE_MS: Record<PriceRange, number> = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 }
const HISTORY_STEPS: Record<PriceRange, number> = { '24h': 24, '7d': 28, '30d': 30 }
const LOOKUP_TIMEOUT_MS = 15_000
// Same checkpoints as usePrice, so a lookup repeated within one hits the cache.
const PRICE_CHECKPOINT_MS = 10 * 60 * 1000
const PRICE_CACHE_LIMIT = 500

export function decimalToUnits(value: string, decimals: number, roundUp = false): number {
  const [whole = '0', fraction = ''] = value.split('.')
  const units = BigInt(whole + fraction.padEnd(decimals, '0').slice(0, decimals))
  const hasRemainder = /[1-9]/.test(fraction.slice(decimals))
  return Number(roundUp && hasRemainder ? units + 1n : units)
}

export function unitsToDecimal(units: number, decimals: number): string {
  const digits = Math.round(Math.abs(units)).toString().padStart(decimals + 1, '0')
  const fraction = digits.slice(-decimals).replace(/0+$/, '')
  return `${units < 0 ? '-' : ''}${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ''}`
}

function priceToDecimal(price: number): string {
  return price.toFixed(10).replace(/0+$/, '').replace(/\.$/, '')
}

export function needsLookup(trigger: WidgetTrigger): boolean {
  return 'nimiqTx' in trigger || 'nimiqPayment' in trigger || 'polygonTx' in trigger
}

export function isBalanceLive(live: LiveValue): boolean {
  return 'nimiqBalance' in live || 'nimiqStake' in live || 'usdtBalance' in live
}

/** true: fired. false: checked, not fired. undefined: unknown, because the lookup had no answer or the head is not known yet. */
export async function evaluateTrigger(trigger: WidgetTrigger, chain: WidgetChain, now: number): Promise<boolean | undefined> {
  try {
    if ('at' in trigger)
      return now >= trigger.at
    if ('nimiqHeight' in trigger) {
      const head = chain.nimiqHeight()
      return head === undefined ? undefined : head >= trigger.nimiqHeight
    }
    if ('nimiqTx' in trigger) {
      const status = await chain.nimiqTransaction(trigger.nimiqTx)
      return status === undefined ? undefined : status === trigger.status
    }
    if ('polygonTx' in trigger) {
      const status = await chain.polygonTransaction(trigger.polygonTx)
      return status === undefined ? undefined : status === trigger.status
    }
    const { to, minValue, since } = trigger.nimiqPayment
    return await chain.nimiqReceived(to, decimalToUnits(minValue, 5, true), since)
  }
  catch {
    return undefined
  }
}

export async function resolveLiveValue(live: LiveValue, chain: WidgetChain, fiat: string, now: number): Promise<ResolvedLive | undefined> {
  if ('nimiqBalance' in live || 'nimiqStake' in live) {
    const luna = 'nimiqBalance' in live
      ? await chain.nimiqBalance(live.nimiqBalance)
      : await chain.nimiqStake(live.nimiqStake.address, live.nimiqStake.part)
    return luna === undefined ? undefined : { kind: 'amount', amount: unitsToDecimal(luna, 5), currency: 'NIM' }
  }
  if ('usdtBalance' in live) {
    const units = await chain.usdtBalance(live.usdtBalance)
    return units === undefined ? undefined : { kind: 'amount', amount: unitsToDecimal(units, 6), currency: 'USDT' }
  }
  if ('price' in live) {
    const price = await chain.price(live.price, fiat)
    return price === undefined ? undefined : { kind: 'amount', amount: priceToDecimal(price), currency: fiat }
  }
  const { asset, range } = live.priceChange
  const [current, then] = await Promise.all([chain.price(asset, fiat), chain.price(asset, fiat, now - RANGE_MS[range])])
  return current && then ? { kind: 'change', percent: (current / then - 1) * 100 } : undefined
}

export async function resolvePriceHistory(asset: WidgetAsset, range: PriceRange, chain: WidgetChain, fiat: string, now: number): Promise<number[] | undefined> {
  const steps = HISTORY_STEPS[range]
  const step = RANGE_MS[range] / steps
  // A fixed grid, so consecutive checks ask for the same instants and hit the cache.
  const grid = Math.floor(now / step) * step
  const points = await Promise.all(Array.from({ length: steps + 1 }, (_, i) =>
    chain.price(asset, fiat, i === steps ? undefined : grid - (steps - i) * step)))
  return points.every(p => p !== undefined) ? points as number[] : undefined
}

const priceCache = new Map<string, Promise<number | undefined>>()

function remember(key: string, lookup: () => Promise<number | undefined>): Promise<number | undefined> {
  const cached = priceCache.get(key)
  if (cached)
    return cached
  const pending = lookup().catch(() => undefined)
  priceCache.set(key, pending)
  if (priceCache.size > PRICE_CACHE_LIMIT)
    priceCache.delete(priceCache.keys().next().value!)
  void pending.then((price) => {
    if (price === undefined)
      priceCache.delete(key)
  })
  return pending
}

/** Prices come in USD and a fiat's "price" is its units per dollar, hence the product; history uses today's fiat rate, which moves far less than crypto. */
function cachedPrice(asset: WidgetAsset, fiat: string, at?: number): Promise<number | undefined> {
  const checkpoint = Math.floor((at ?? Date.now()) / PRICE_CHECKPOINT_MS) * PRICE_CHECKPOINT_MS
  const { getPriceNow, getPriceAt } = useCurrencyPriceApi()
  const crypto = remember(`${asset}|${at === undefined ? 'now' : 'at'}|${checkpoint}`, async () =>
    (at === undefined ? await getPriceNow({ currency: asset }) : await getPriceAt({ currency: asset, timestamp: checkpoint })).data?.price)
  const rate = fiat === 'USD'
    ? Promise.resolve(1)
    : remember(`rate|${fiat}|${Math.floor(Date.now() / PRICE_CHECKPOINT_MS)}`, async () => (await getPriceNow({ currency: fiat })).data?.price)
  return Promise.all([crypto, rate]).then(([usd, fiatPerUsd]) => (usd && fiatPerUsd ? usd * fiatPerUsd : undefined))
}

let historyInFlight = false

export function createWidgetChain(): WidgetChain {
  const network = useNimiqNetwork()
  const client = () => (network.consensus === 'established' ? network.client : undefined)
  return {
    nimiqHeight: () => (network.consensus === 'established' && network.height > 0 ? network.height : undefined),
    async nimiqTransaction(hash) {
      const nimiq = client()
      if (!nimiq)
        return undefined
      const tx = await promiseWithTimeout(nimiq.getTransaction(hash).catch(() => undefined), LOOKUP_TIMEOUT_MS)
      // Any rejection with consensus counts as not confirmed yet: the client rejects hashes it does not know, and a hash never sent must not hold back later triggers.
      if (!tx)
        return client() ? 'pending' : undefined
      if (tx.state === 'invalidated' || tx.state === 'expired')
        return 'failed'
      if (tx.state !== 'included' && tx.state !== 'confirmed')
        return 'pending'
      // A missing execution result is unknown, never success.
      return tx.executionResult === true ? 'confirmed' : tx.executionResult === false ? 'failed' : 'pending'
    },
    async nimiqReceived(to, minLuna, since) {
      if (!client() || historyInFlight)
        return undefined
      historyInFlight = true
      try {
        // Through the remote-signer store, which serialises history scans: a parallel scan on the wallet's client could stall it.
        const txs = await promiseWithTimeout(useRemoteSigner().getTransactionsForAddress(Nimiq.Address.fromString(to), { limit: 25 }), LOOKUP_TIMEOUT_MS)
        return txs.some(tx => tx.recipient === to && tx.value >= minLuna && (tx.timestamp ?? 0) >= since && tx.executionResult === true)
      }
      catch {
        return undefined
      }
      finally {
        historyInFlight = false
      }
    },
    async nimiqBalance(address) {
      const nimiq = client()
      return nimiq ? (await promiseWithTimeout(nimiq.getAccount(address), LOOKUP_TIMEOUT_MS)).balance : undefined
    },
    async nimiqStake(address, part) {
      const nimiq = client()
      if (!nimiq)
        return undefined
      const staker = await promiseWithTimeout(nimiq.getStaker(address), LOOKUP_TIMEOUT_MS)
      return staker ? (part === 'active' ? staker.balance : staker.inactiveBalance) : 0
    },
    async polygonTransaction(hash) {
      try {
        const state = await promiseWithTimeout((async () => {
          const { provider } = await getPolygonUsdtClient()
          return fetchPolygonTransactionState(provider, hash, r => !shouldValidateOpenGsnTransaction(r) || isSuccessfulOpenGsnReceipt(r))
        })(), LOOKUP_TIMEOUT_MS)
        if (state.lookupFailed)
          return undefined
        return state.status === 'confirmed' || state.status === 'failed' ? state.status : 'pending'
      }
      catch {
        return undefined
      }
    },
    async usdtBalance(address) {
      return promiseWithTimeout((async () => {
        const { tokenContract } = await getPolygonUsdtClient()
        return Number(await tokenContract.balanceOf(address))
      })(), LOOKUP_TIMEOUT_MS)
    },
    price: cachedPrice,
  }
}
