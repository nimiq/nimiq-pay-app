import type { Result } from '@/types'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { nativeFetch } from '@/lib/nativeFetch'

// Testnet-only faucet. Mirrors the mechanism used by the Nimiq Wallet.
const FAUCET_ENDPOINT = 'https://faucet.pos.nimiq-testnet.com'

const logger = useLogger('faucet')

type FaucetTapResponse
  = | { success: true }
    | { success: false, error: string, wait?: number }

/** POST /tapit — dispenses free NIM to `address`. Rate-limit/geoblock enforced server-side. */
export async function tapFaucet(address: string): Promise<Result<true, string>> {
  try {
    const res = await nativeFetch(`${FAUCET_ENDPOINT}/tapit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    const result = await res.json() as FaucetTapResponse
    if (result.success)
      return { data: true, error: undefined }

    switch (result.error) {
      case 'RATE_LIMIT':
        return { data: undefined, error: i18n.t('You can receive more free NIM in {waitTime} hours.', { waitTime: Math.ceil((result.wait ?? 0) / 3600) }) }
      case 'GEOBLOCKED':
        return { data: undefined, error: i18n.t('This service is currently not available in your region.') }
      case 'OUT_OF_FUNDS':
        return { data: undefined, error: i18n.t('There are currently no free NIM available.') }
      case 'TRANSACTION_FAILED':
        return { data: undefined, error: i18n.t('Faucet error - please try again.') }
      default:
        return { data: undefined, error: i18n.t('Request failed') }
    }
  }
  catch (error) {
    logger.error('Faucet tap failed', error)
    return { data: undefined, error: i18n.t('Request failed') }
  }
}
