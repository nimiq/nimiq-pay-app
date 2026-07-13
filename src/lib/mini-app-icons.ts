import { getGoogleFaviconUrl } from '@/lib/site-metadata'

export const MINI_APP_FALLBACK_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxZjIzNDgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0ibHVjaWRlIGx1Y2lkZS1nbG9iZS1pY29uIGx1Y2lkZS1nbG9iZSI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgMmExNC41IDE0LjUgMCAwIDAgMCAyMCAxNC41IDE0LjUgMCAwIDAgMC0yMCIvPjxwYXRoIGQ9Ik0yIDEyaDIwIi8+PC9zdmc+'

/**
 * Walk the icon fallback ladder when an <img> fails to load (404 etc.), for the Mini App at `url`:
 * current src -> Google favicon service -> world icon. A `data-icon-fallback` marker tracks the
 * Google stage so a second failure lands on the world icon (a data URI that always renders).
 */
export function applyIconFallback(event: Event, url: string) {
  const img = event.target as HTMLImageElement
  const google = getGoogleFaviconUrl(url)
  if (img.dataset.iconFallback === 'google' || !google) {
    img.src = MINI_APP_FALLBACK_ICON
    return
  }
  img.dataset.iconFallback = 'google'
  img.src = google
}
