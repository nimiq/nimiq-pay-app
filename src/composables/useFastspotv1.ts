import { isDev } from '@/lib/index'
import { nativeFetch } from '../lib/nativeFetch'
import { useDevice } from './useDevice'

let fastspot: typeof import('@nimiq/fastspot-api-v1') | undefined

export async function useFastspotApiV1() {
  if (fastspot)
    return fastspot

  fastspot = await import('@nimiq/fastspot-api-v1')

  const { isAndroid, isIOS } = useDevice()

  fastspot.init(
    isDev ? 'https://api.test.fastspot.io/fast/v1' : 'https://api.go.fastspot.io/fast/v1',
    '447f6050-25a5-453e-9b4f-a2db55abbbec', // API Key is the same for testnet and mainnet Fastspot
    {
      customFetch: isAndroid || isIOS ? nativeFetch : undefined,
    },
  )
  return fastspot
}
