import { useLogger } from '@/composables/useLogger'
import { useApp } from '@/stores/app'
import { type MaybeRef, toValue } from 'vue'
import { useDevice } from './useDevice'

const logger = useLogger('useTime')

const defaultFormatter: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }

const twentyFirstCentury = 1000000000000 /* 17:46:40 20/11/2001 GMT */

type UseFormatTimeOptions = {
  /**
   * The locale to use when formatting the relative time.
   * @default useApp().language
   */
  locale?: string
} & Intl.DateTimeFormatOptions

export function useFormatTime(timestamp: number, { locale = useApp().language, ...options }: UseFormatTimeOptions = {}) {
  return new Intl.DateTimeFormat(locale, { ...defaultFormatter, ...options }).format(toMs(timestamp))
}

// Detects if it is sec and converts to ms. We assume that the timestamps are always from the 2020s.
export function toMs(_maybeSec: MaybeRef<number>) {
  const maybeSec = toValue(_maybeSec)
  return maybeSec < twentyFirstCentury ? maybeSec * 1000 : maybeSec
}

export function toSeconds(_maybeMs: MaybeRef<number>) {
  const ms = toMs(_maybeMs)
  return Math.round(ms / 1000)
}

export function countdownTo(timestamp: number, target = Date.now()) {
  const count = Math.max(0, toMs(timestamp) - target)
  const minutes = Math.floor(count / 60000)
  const seconds = Math.floor(count / 1000) % 60
  return { minutes, seconds }
}

let serverTimeOffset: number | undefined
let serverTimeOffsetResetTimeout = -1

/** Get the server time in ms, for the case that the user's system time is wrong */
export async function getServerTime() {
  if (serverTimeOffset === undefined)
    await updateServerTimeOffset()
  const serverTime = Date.now() + (serverTimeOffset || 0)
  return toMs(serverTime)
}

async function updateServerTimeOffset() {
  try {
    // Send a request to Nimiq Pay's web version's server to read the response's Date header. Note that via browser
    // fetch, the Date header can only be read for non-cors requests, unless the cors response specifically allows
    // reading the Date header by specifying it in Access-Control-Expose-Headers. Therefore, we use native HTTP requests
    // in native apps to read the Date header, and use browser fetch only in the web version, where it shouldn't be a
    // cors request.
    const url = window.location.hostname.includes('nimpay.app') ? window.location.origin : 'https://nimpay.app'
    // Send a HEAD request only to avoid transmitting the actual asset, and to avoid potentially being served a cached
    // response by the service worker.
    const method = 'HEAD'
    const dateHeader = await (useDevice().isWeb
      ? fetch(url, { method, cache: 'no-cache' })
          .then(({ headers }) => headers.get('Date'))
      : import('@capacitor/core').then(({ CapacitorHttp: { request } }) => request({ url, method })).then(({ headers }) => headers.Date || headers.date)
    )
    const serverTime = Date.parse(dateHeader || '')
    if (Number.isNaN(serverTime))
      throw new Error('Failed to read server time')
    serverTimeOffset = serverTime - Date.now()
    if (Math.abs(serverTimeOffset) < 1500) {
      // If deviation from server time is minimal, ignore it as it might be coming just from network delays.
      serverTimeOffset = 0
    }

    // Reset cached serverTimeOffset after one hour for the case that user changes his clock without killing the app.
    // Note that setTimeout is unaffected from changes to the user clock.
    clearTimeout(serverTimeOffsetResetTimeout)
    serverTimeOffsetResetTimeout = window.setTimeout(() => serverTimeOffset = undefined, 60 * 60 * 1000)
  }
  catch (error) {
    serverTimeOffset = undefined
    logger.error(error)
  }
}
