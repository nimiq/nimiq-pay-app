import { useDevice } from './useDevice'

const defaultFormatter: Intl.DateTimeFormatOptions = { dateStyle: 'short' }

const twentyFirstCentury = 1000000000000 /* 17:46:40 20/11/2001 GMT */

export function useTime() {
  type UseFormatTimeOptions = {
    /**
     * The locale to use when formatting the relative time.
     * @default useDevice().locale
     */
    locale?: string
  } & Intl.DateTimeFormatOptions

  function formatTime(timestamp: number, { locale = useDevice().locale, ...options }: UseFormatTimeOptions = {}) {
    return new Intl.DateTimeFormat(locale, { ...defaultFormatter, ...options }).format(toMs(timestamp))
  }

  // Detects if it is sec and converts to ms. We assume that the timestamps are always from the 2020s.
  function toMs(maybeSec: number) {
    return maybeSec < twentyFirstCentury ? maybeSec * 1000 : maybeSec
  }

  // Detects if it is ms and converts to sec. We assume that the timestamps are always from the 2020s.
  function toSec(maybeMs: number) {
    return maybeMs > twentyFirstCentury ? maybeMs / 1000 : maybeMs
  }

  return {
    formatTime,
    toMs,
    toSec,
  }
}
