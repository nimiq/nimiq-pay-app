import { useNow } from '@vueuse/core'
import { ref } from 'vue'
import { useDevice } from './useDevice'
import { toMs } from './useTime'

type Unit = Intl.RelativeTimeFormatUnitSingular
const DEFAULT_UNITS: { unit: Unit; max: number; value: number }[] = [
  { unit: 'second', max: 60_000, value: 1_000 },
  { unit: 'minute', max: 2_760_000, value: 60_000 },
  { unit: 'hour', max: 72_000_000, value: 3_600_000 },
  { unit: 'day', max: 518_400_000, value: 86_400_000 },
  { unit: 'week', max: 2_419_200_000, value: 604_800_000 },
  { unit: 'month', max: 28_512_000_000, value: 2_592_000_000 },
  { unit: 'year', max: Number.POSITIVE_INFINITY, value: 31_536_000_000 },
]

export interface UseRelativeTimeOptions {
  /**
   * The locale to use when formatting the relative time.
   * @default useDevice().locale
   */
  locale?: string

  /**
   * The timestamp to format.
   * @default Date.now()
   */
  timestamp?: number
}
export function useRelativeTime({ timestamp: _timestamp = Date.now(), locale = useDevice().locale }: UseRelativeTimeOptions = {}) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const now = useNow()

  const formatted = ref('')
  const timestamp = toMs(_timestamp)

  function formatRelativeTime() {
    const diff = timestamp - now.value.getTime()
    const { unit, value } = DEFAULT_UNITS.find(({ max }) => Math.abs(diff) < max)!
    formatted.value = rtf.format(Math.round(diff / value), unit)
    if (['second', 'minute', 'hour'].includes(unit))
      setTimeout(formatRelativeTime, value - Math.abs(diff % value) + 200)
  }

  formatRelativeTime()

  return {
    formatted,
  }
}
