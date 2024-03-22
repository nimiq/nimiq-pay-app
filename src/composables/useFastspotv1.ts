import { nativeFetch } from '../lib/nativeFetch'
import { useDevice } from './useDevice'

let fastspot: typeof import('@nimiq/fastspot-api-v1') | undefined

export async function useFastspotApiV1() {
  if (fastspot)
    return fastspot

  fastspot = await import('@nimiq/fastspot-api-v1')

  const { isAndroid, isIOS } = useDevice()

  fastspot.init(
    'https://api.test.fastspot.io/fast/v1',
    '447f6050-25a5-453e-9b4f-a2db55abbbec',
    {
      customFetch: isAndroid || isIOS ? nativeFetch : undefined,
    },
  )
  return fastspot
}
