import { CapacitorHttp } from '@capacitor/core'
import { safeOrigin } from '@/lib/url-safety'

export function getFaviconUrl(url: string): string {
  const origin = safeOrigin(url, '')
  return origin ? `${origin}/favicon.ico` : ''
}

export function getGoogleFaviconUrl(url: string, size = 128): string {
  const origin = safeOrigin(url, '')
  return origin
    ? `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&drop_404_icon=true&url=${origin}&size=${size}`
    : ''
}

function toHttpUrl(href: string, base: string): string | undefined {
  try {
    const { protocol, href: abs } = new URL(href, base)
    return protocol === 'http:' || protocol === 'https:' ? abs : undefined
  }
  catch {
    return undefined
  }
}

function sizesToPixels(sizes: string | null | undefined): number {
  if (!sizes)
    return 0
  if (/\bany\b/i.test(sizes))
    return Number.POSITIVE_INFINITY
  let max = 0
  for (const token of sizes.split(/\s+/)) {
    const n = Number.parseInt(token, 10)
    if (n > max)
      max = n
  }
  return max
}

const MAX_REDIRECTS = 5

/** Case-insensitive header lookup (native platforms vary the casing, e.g. `Location`/`location`). */
function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === target)
      return value
  }
  return undefined
}

/**
 * Native-fetch a URL as HTML and parse it into a Document (CORS-free via CapacitorHttp).
 * Follows 3xx redirects via the `Location` header — CapacitorHttp doesn't reliably auto-follow,
 * so a site answering e.g. 307 would otherwise read as a failure.
 */
async function fetchHtmlDoc(url: string): Promise<{ doc: Document, url: string } | undefined> {
  let currentUrl = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await CapacitorHttp.get({
      url: currentUrl,
      headers: { Accept: 'text/html' },
      readTimeout: 5000,
      connectTimeout: 5000,
      responseType: 'text',
    })

    if (response.status >= 300 && response.status < 400) {
      const location = headerValue(response.headers, 'location')
      if (!location)
        return undefined
      currentUrl = new URL(location, currentUrl).href
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      console.warn('Failed to fetch', currentUrl, 'Status:', response.status)
      return undefined
    }

    const html = typeof response.data === 'string' ? response.data : String(response.data)
    return { doc: new DOMParser().parseFromString(html, 'text/html'), url: response.url || currentUrl }
  }
  console.warn('Too many redirects for', url)
  return undefined
}

function getPageMetadata(doc: Document) {
  const title = (doc.querySelector('title')?.textContent ?? '').trim()
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? ''

  const openGraph: Record<string, string> = {}
  for (const m of Array.from(doc.querySelectorAll('meta[property^="og:"]'))) {
    const property = m.getAttribute('property')
    const content = m.getAttribute('content')?.trim()
    if (property && content)
      openGraph[property] = content
  }

  return { title, description, openGraph }
}

export async function fetchPageDescription(url: string): Promise<string | undefined> {
  try {
    const page = await fetchHtmlDoc(url)
    if (!page)
      return undefined

    const metadata = getPageMetadata(page.doc)
    return metadata.description
      || metadata.openGraph['og:description']
      || metadata.title
      || undefined
  }
  catch {
    console.warn('Error fetching page metadata for', url)
    return undefined
  }
}

export async function fetchBestIcon(pageUrl: string): Promise<string | undefined> {
  try {
    const page = await fetchHtmlDoc(pageUrl)
    if (!page)
      return undefined

    const { doc, url } = page
    const baseHref = doc.querySelector('base[href]')?.getAttribute('href')
    const base = (baseHref && toHttpUrl(baseHref, url)) || url

    const appleLinks = Array.from(doc.querySelectorAll('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'))
    const iconLinks = Array.from(doc.querySelectorAll('link[rel~="icon"]'))
      .sort((a, b) => sizesToPixels(b.getAttribute('sizes')) - sizesToPixels(a.getAttribute('sizes')))

    for (const link of [...appleLinks, ...iconLinks]) {
      const href = link.getAttribute('href')
      const icon = href && toHttpUrl(href, base)
      if (icon)
        return icon
    }
    return getFaviconUrl(url)
  }
  catch {
    return undefined
  }
}
