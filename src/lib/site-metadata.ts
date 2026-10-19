import { CapacitorHttp } from '@capacitor/core'
import { safeOrigin } from '@/lib/url-safety'

/**
 * The site's own favicon at the conventional path — immediate placeholder and
 * last-resort fallback. No third-party service (avoids leaking browsing metadata).
 */
export function getFaviconUrl(url: string): string {
  const origin = safeOrigin(url, '')
  return origin ? `${origin}/favicon.ico` : ''
}

/**
 * Google's favicon service. Used only as a render-time fallback when a site's own icons 404
 * (see applyIconFallback) — never eagerly for the whole list, so the metadata leak stays minimal.
 */
export function getGoogleFaviconUrl(url: string, size = 128): string {
  const origin = safeOrigin(url, '')
  return origin
    ? `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&drop_404_icon=true&url=${origin}&size=${size}`
    : ''
}

/** Resolve `href` against `base` to an absolute http(s) URL, or undefined (rejects javascript:, data:, etc.). */
function toHttpUrl(href: string, base: string): string | undefined {
  try {
    const { protocol, href: abs } = new URL(href, base)
    return protocol === 'http:' || protocol === 'https:' ? abs : undefined
  }
  catch {
    return undefined
  }
}

/** Largest edge from a `sizes` attr like "192x192 512x512"; `any` → Infinity, absent → 0. */
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
export function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
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
async function fetchHtmlDoc(url: string): Promise<Document | undefined> {
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
    return new DOMParser().parseFromString(html, 'text/html')
  }
  console.warn('Too many redirects for', url)
  return undefined
}

/**
 * Extract metadata from a parsed HTML document.
 */
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

/**
 * Fetch a webpage and extract its description.
 * Priority: meta description -> og:description -> <title> -> undefined
 */
export async function fetchPageDescription(url: string): Promise<string | undefined> {
  try {
    const doc = await fetchHtmlDoc(url)
    if (!doc)
      return undefined

    const metadata = getPageMetadata(doc)
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

/**
 * Best square icon a site declares for itself, by priority:
 * apple-touch-icon -> largest <link rel=icon> -> /favicon.ico.
 * Returns an absolute http(s) URL, or undefined on failure. Rendered via <img> only (no code exec).
 */
export async function fetchBestIcon(pageUrl: string): Promise<string | undefined> {
  try {
    const doc = await fetchHtmlDoc(pageUrl)
    if (!doc)
      return getFaviconUrl(pageUrl)

    // 1. apple-touch-icon — 180px square app icon.
    const appleHref = doc.querySelector('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')?.getAttribute('href')

    // 2. Largest declared <link rel~=icon>.
    const largestIconHref = Array.from(doc.querySelectorAll('link[rel~="icon"]'))
      .sort((a, b) => sizesToPixels(b.getAttribute('sizes')) - sizesToPixels(a.getAttribute('sizes')))[0]
      ?.getAttribute('href')

    const href = appleHref || largestIconHref
    return (href && toHttpUrl(href, pageUrl)) || getFaviconUrl(pageUrl)
  }
  catch {
    return undefined
  }
}
