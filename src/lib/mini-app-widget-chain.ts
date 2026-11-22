import type { WidgetTrigger } from '@/lib/mini-app-widgets'
import { promiseWithTimeout } from '@/lib/utils'
import { walletAddresses } from '@/lib/wallet-addresses'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { fetchPolygonTransactionState, getPolygonUsdtClient, isSuccessfulOpenGsnReceipt, shouldValidateOpenGsnTransaction } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'

export type ChainStatus = 'confirmed' | 'failed' | 'pending'

export interface WidgetChain {
  /** Head height, or undefined without consensus. */
  nimiqHeight: () => number | undefined
  nimiqTransaction: (hash: string) => Promise<ChainStatus | undefined>
  nimiqReceived: (to: string, minLuna: number, since: number) => Promise<boolean | undefined>
  polygonTransaction: (hash: string) => Promise<ChainStatus | undefined>
  /** Read at each refresh, as a cosigner can change. */
  accounts: () => string[]
}

const LOOKUP_TIMEOUT_MS = 15_000

function lunaRoundedUp(nim: string): number {
  const [whole = '0', fraction = ''] = nim.split('.')
  const luna = BigInt(whole + fraction.padEnd(5, '0').slice(0, 5))
  return Number(/[1-9]/.test(fraction.slice(5)) ? luna + 1n : luna)
}

export function needsLookup(trigger: WidgetTrigger): boolean {
  return 'nimiqTx' in trigger || 'nimiqPayment' in trigger || 'polygonTx' in trigger
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
    return await chain.nimiqReceived(to, lunaRoundedUp(minValue), since)
  }
  catch {
    return undefined
  }
}

let historyInFlight = false

export function createWidgetChain(): WidgetChain {
  const network = useNimiqNetwork()
  const client = () => (network.consensus === 'established' ? network.client : undefined)
  return {
    accounts: walletAddresses,
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
  }
}
