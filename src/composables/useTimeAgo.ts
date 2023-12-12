import { useDevice } from './useDevice'

export interface UseTimeAgoOptions {
  /**
   * The locale to use when formatting the relative time.
   * @default useDevice().locale
   */
  locale?: string
}
export function useTimeAgo({ locale = useDevice().locale }: UseTimeAgoOptions = {}) {
  const now = Date.now()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const units: Partial<Record<Intl.RelativeTimeFormatUnitSingular, number>> = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1,
  }

  function formatRelativeTime(timestamp: number): string {
    const diffInSeconds = Math.floor((now - timestamp) / 1_000_000)

    let unit: Intl.RelativeTimeFormatUnitSingular | undefined
    let value: number | undefined

    for (const [currentUnit, seconds] of Object.entries(units)) {
      if (diffInSeconds >= seconds) {
        unit = currentUnit as Intl.RelativeTimeFormatUnitSingular
        value = seconds
        break
      }
    }

    if (!unit || !value)
      return ''

    const relativeValue = Math.floor(diffInSeconds / value)
    return rtf.format(-relativeValue, unit)
  }

  return {
    formatRelativeTime,
  }
}
