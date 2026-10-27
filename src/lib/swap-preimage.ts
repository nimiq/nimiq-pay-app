import type { Quote, Swap } from '@nimiq/fastspot-api-v2'
import { useFastspotApiV2 } from '@/composables/useFastspotV2'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { promiseWithTimeout } from '@/lib/utils'

const logger = useLogger('swap-preimage')

const POLL_INTERVAL_MS = 1e3
const REQUEST_TIMEOUT_MS = 30e3
// setTimeout overflows above this and would fire immediately.
const MAX_TIMEOUT_MS = 2 ** 31 - 1

// Funds already sit in the swap HTLC while this waits, so transient errors retry. Hung requests time
// out and the deadline ends the wait; the expired-swap sweep refunds the HTLC afterwards.
export function waitForSwapPreimage(
  swapId: string,
  fundingProof: Promise<Swap>,
  timeoutAt: number,
  isCurrent = () => true,
  onPoll?: (status: string) => void,
): Promise<{ preimage: string, source: 'funding_proof' | 'poll' }> {
  return new Promise((resolve, reject) => {
    const timedOut = () => new Error(i18n.t('Swap timed out waiting for Lightning payment confirmation'))
    let done = false
    let pollId: number | undefined
    let deadlineId: number | undefined
    const stop = (error?: Error) => {
      done = true
      window.clearTimeout(pollId)
      window.clearTimeout(deadlineId)
      if (error)
        reject(error)
    }
    const handleSwap = (swap: Swap | Quote, source: 'funding_proof' | 'poll') => {
      if (done)
        return
      if (source === 'poll')
        onPoll?.(swap.status)
      if (!isCurrent())
        return stop(new Error(i18n.t('Wallet or network changed before sending')))
      if ('preimage' in swap && swap.preimage) {
        stop()
        return resolve({ preimage: swap.preimage, source })
      }
      if (swap.status === 'EXPIRED')
        stop(timedOut())
    }
    deadlineId = window.setTimeout(
      () => stop(timedOut()),
      // A missing or invalid timeout would make the delay NaN, which fires immediately.
      Math.min(Number.isFinite(timeoutAt) ? Math.max(timeoutAt - Date.now(), 60_000) : 60_000, MAX_TIMEOUT_MS),
    )

    // The funding proof response rarely has the preimage yet, so polling does not wait for it.
    void fundingProof.then(swap => handleSwap(swap, 'funding_proof'), () => {})

    async function checkSecret() {
      try {
        if (!isCurrent())
          return stop(new Error(i18n.t('Wallet or network changed before sending')))
        const { getSwap } = await useFastspotApiV2()
        handleSwap(await promiseWithTimeout(getSwap(swapId), REQUEST_TIMEOUT_MS), 'poll')
      }
      catch (error) {
        logger.warn('Swap preimage poll failed, retrying', { swapId, error: error instanceof Error ? error.message : String(error) })
      }
      if (!done)
        pollId = window.setTimeout(checkSecret, POLL_INTERVAL_MS)
    }
    void checkSecret()
  })
}
