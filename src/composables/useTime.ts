import { type MaybeRef, toValue } from 'vue'
import { storeToRefs } from 'pinia'
import { useApp } from '@/stores/app'

const { language } = storeToRefs(useApp())

const defaultFormatter: Intl.DateTimeFormatOptions = { dateStyle: 'short' }

const twentyFirstCentury = 1000000000000 /* 17:46:40 20/11/2001 GMT */

type UseFormatTimeOptions = {
  /**
   * The locale to use when formatting the relative time.
   * @default storeToRefs(useApp()).language.value
   */
  locale?: string
} & Intl.DateTimeFormatOptions

export function useFormatTime(timestamp: number, { locale = language.value, ...options }: UseFormatTimeOptions = {}) {
  return new Intl.DateTimeFormat(locale, { ...defaultFormatter, ...options }).format(toMs(timestamp))
}

// Detects if it is sec and converts to ms. We assume that the timestamps are always from the 2020s.
export function toMs(_maybeSec: MaybeRef<number>) {
  const maybeSec = toValue(_maybeSec)
  return maybeSec < twentyFirstCentury ? maybeSec * 1000 : maybeSec
}
