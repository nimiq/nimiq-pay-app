/**
 * Get best favicon URL for a domain using Google's favicon service.
 * Returns high-res (up to 256px) cached favicons.
 */
export function getFaviconUrl(url: string, size = 128): string {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`
  }
  catch {
    return ''
  }
}
