import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { kv } from '@/stores/app'

const logger = useLogger('geoip')

// export interface GeoIpResponse {
//   location?: {
//     longitude?: number
//     latitude?: number
//   }
//   country?: string
//   city?: string
//   city_names?: { [language: string]: string }
// }

export interface GeoIpResponse {
  status: 'success' | 'fail'
  message?: string
  countryCode?: string
  lat?: number
  lon?: number
  query?: string
}

const CACHE_MAX_SIZE = 1000
const serializer = {
  read: (raw: string) => new Map(JSON.parse(raw)) as Map<string, GeoIpResponse>,
  write: (value: Map<string, GeoIpResponse>) => JSON.stringify(Array.from(value.entries())),
}

export const useGeoIp = defineStore('geoip', () => {
  const cacheStore = useStorageAsync<Map<string, GeoIpResponse>>('geoip-cache', new Map(), kv(), { serializer })
  const latestCheck = ref<GeoIpResponse | null>(null)

  function cached(host: string) {
    return cacheStore.value.get(host)
  }

  function cache(host: string, response: GeoIpResponse) {
    // Clear cache
    while (cacheStore.value.size > CACHE_MAX_SIZE) {
      // Don't remove own location
      const oldestHost = [...cacheStore.value.keys()].slice(0, 2).filter(key => !!key).slice(0, 1)[0]
      cacheStore.value.delete(oldestHost)
    }
    // Save in cache
    cacheStore.value.set(host, response)
  }

  async function getIp(): Promise<string> {
    const response = await fetch('https://api.ipify.org?format=json').then(res => res.json()) as { ip: string }
    return response.ip
  }

  // async function locate(host = ''): Promise<GeoIpResponse> {
  //   console.log('[GeoIP] locate called for host:', host)
  //   const cachedResponse = cached(host)
  //   console.log('[GeoIP] Cached response:', cachedResponse)
  //   if (cachedResponse) {
  //     latestCheck.value = cachedResponse
  //     return cachedResponse
  //   }

  //   const url = `https://geoip.nimiq-network.com:8443/v1/locate${host ? `?host=${host}` : ''}`

  //   const response: GeoIpResponse = await fetch(url).then(res => res.json())
  //   console.log('[GeoIP] Fetched response:', response)
  //   cache(host, response)
  //   latestCheck.value = response
  //   return response
  // }

  async function locate(host = ''): Promise<GeoIpResponse> {
    console.log('[GeoIP] locate called for host:', host)
    const cachedResponse = cached(host)
    console.log('[GeoIP] Cached response:', cachedResponse)
    if (cachedResponse) {
      latestCheck.value = cachedResponse
      return cachedResponse
    }

    const url = `http://ip-api.com/json/${host ? `${host}` : ''}?fields=status,message,countryCode,lat,lon,query`

    const response: GeoIpResponse = await fetch(url).then(res => res.json())
    if (response.status !== 'success') {
      logger.error('Fetch failed with message:', response.message)
    }
    else {
      cache(host, response)
    }
    console.log('[GeoIP] Fetched response:', response)
    latestCheck.value = response
    return response
  }

  return {
    locate,
    getIp,
    latestCheck, // Debugging purposes
  }
})
