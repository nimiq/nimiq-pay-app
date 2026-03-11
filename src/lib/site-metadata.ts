import { CapacitorHttp } from '@capacitor/core'

/**
 * Get best favicon URL for a domain using Google's favicon service.
 * Returns high-res (up to 256px) cached favicons.
 */
export function getFaviconUrl(url: string, size = 128): string {
  try {
    const { origin } = new URL(url)
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&drop_404_icon=true&url=${origin}&size=${size}`
  }
  catch {
    return ''
  }
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
    const response = await CapacitorHttp.get({
      url,
      headers: { Accept: 'text/html' },
      readTimeout: 5000,
      connectTimeout: 5000,
      responseType: 'text',
    })

    if (response.status < 200 || response.status >= 300) {
      console.warn('Failed to fetch page metadata for', url, 'Status:', response.status)
      return undefined
    }

    const html = typeof response.data === 'string' ? response.data : String(response.data)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const metadata = getPageMetadata(doc)

    // eslint-disable-next-line no-console
    console.log('Fetched metadata for', url, metadata)

    return metadata.description
      || metadata.openGraph['og:description']
      || metadata.title
      || undefined
  }
  catch {
    return undefined
  }
}
