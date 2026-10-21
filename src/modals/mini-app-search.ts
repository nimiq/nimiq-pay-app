import type { MaybeRefOrGetter } from 'vue'
import { useFuse } from '@vueuse/integrations/useFuse'
import { computed, toValue } from 'vue'
import { IPV4_RE, isPrivateOrReservedIPv4 } from '@/lib/url-safety'

type MiniAppDescriptions = Record<string, string>

/**
 * Normalize user input into an absolute mini-app URL.
 * Accepts HTTPS URLs, HTTP URLs of local dev servers, and hostnames without a protocol.
 */
export function normalizeMiniAppUrl(input: string): string | undefined {
  const rawInput = input.trim()
  if (!rawInput)
    return undefined

  try {
    const isLocalhost = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?:[:/]|$)/i.test(rawInput)
    const withProtocol = /^https?:\/\//i.test(rawInput) ? rawInput : `${isLocalhost ? 'http' : 'https'}://${rawInput}`
    const parsed = new URL(withProtocol)

    if (!/^https?:$/i.test(parsed.protocol))
      return undefined

    const hostname = parsed.hostname.toLowerCase()
    const isHostnameLike = hostname === 'localhost' || hostname.includes('.') || IPV4_RE.test(hostname)

    if (!isHostnameLike)
      return undefined

    // The bridge is injected into the page, so cleartext would let anyone on the network drive it.
    // Only local dev servers (localhost, LAN IPs) may use http.
    if (parsed.protocol === 'http:' && hostname !== 'localhost' && !isPrivateOrReservedIPv4(hostname))
      return undefined

    return parsed.href
  }
  catch {
    return undefined
  }
}

export function useMiniAppSearch<T extends { name: string, url: string }>(
  query: MaybeRefOrGetter<string>,
  apps: MaybeRefOrGetter<T[]>,
  descriptions: MaybeRefOrGetter<MiniAppDescriptions>,
) {
  const searchableApps = computed(() => {
    const appList = toValue(apps)
    const descriptionsByUrl = toValue(descriptions)

    return appList.map(app => ({
      app,
      name: app.name,
      url: app.url,
      description: descriptionsByUrl[app.url] ?? '',
    }))
  })

  const { results } = useFuse(query, searchableApps, {
    fuseOptions: {
      keys: ['name', 'url', 'description'],
      ignoreLocation: true,
      threshold: 0.3,
    },
  })

  const filteredApps = computed(() => {
    const normalizedQuery = toValue(query).trim()
    if (!normalizedQuery)
      return toValue(apps)

    return results.value.map(result => result.item.app)
  })

  return { filteredApps }
}
