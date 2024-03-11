import { type MaybeRef, computed, getCurrentScope, onScopeDispose, ref, toValue, watchEffect } from 'vue'
import { toMs } from './useTime'
import { useApp } from '@/stores/app'

// Formatter for current language.
const timeFormatter = computed(() => new Intl.RelativeTimeFormat(useApp().language, { numeric: 'auto' }))

type Unit = Intl.RelativeTimeFormatUnitSingular
const DEFAULT_UNITS: { unit: Unit; max: number; unitMs: number }[] = [
  { unit: 'second', max: 60_000, unitMs: 1_000 },
  { unit: 'minute', max: 2_760_000, unitMs: 60_000 },
  { unit: 'hour', max: 72_000_000, unitMs: 3_600_000 },
  { unit: 'day', max: 518_400_000, unitMs: 86_400_000 },
  { unit: 'week', max: 2_419_200_000, unitMs: 604_800_000 },
  { unit: 'month', max: 28_512_000_000, unitMs: 2_592_000_000 },
  { unit: 'year', max: Number.POSITIVE_INFINITY, unitMs: 31_536_000_000 },
]

export interface UseRelativeTimeOptions {
  /**
   * The timestamp to format. In ms or s. Reactive if passed as a ref.
   * @default time when useRelativeTime was called, if timestamp is undefined or 0.
   */
  timestamp?: MaybeRef<number | undefined>
}
export function useRelativeTime({ timestamp: timestampMsOrS }: UseRelativeTimeOptions = {}) {
  const defaultTime = Date.now() // Default to time when useRelativeTime was called, if timestamp is undefined or 0
  const timestamp = computed(() => toMs(toValue(timestampMsOrS) || defaultTime))

  const formatted = ref('')

  let updateTimeout = -1
  function updateRelativeTime() {
    const diff = timestamp.value - Date.now()
    const { unit, unitMs } = DEFAULT_UNITS.find(({ max }) => Math.abs(diff) < max)!
    formatted.value = timeFormatter.value.format(Math.round(diff / unitMs), unit)

    clearTimeout(updateTimeout)
    if (['second', 'minute', 'hour', 'day'].includes(unit)) {
      // Schedule next update to be shortly after when we should be rounding to the next number (i.e. to the earliest
      // time the number is changing).
      // Note that the next rounding point would in terms of absolute value depend on whether the time diff is negative
      // or positive, it does however not differ when not working with absolute values, in the sense of in which
      // direction the next rounding point is: as the next rounding point is in the future, and Date.now() is subtracted
      // in diff, the diff gets smaller regardless of whether diff is/was positive or negative. For illustration:
      // - If the timestamp is 4.2 seconds in the past, diff is -4200, rounded to "4 seconds ago" (represented in
      //   roundedToUnitsMs below), and rounding to "5 seconds ago" begins at <=-4500 (called roundingPoint below),
      //   i.e. in >=300ms (called timeToRoundingPoint below).
      // - If the timestamp is 4.2 seconds in the future, diff is 4200, rounded to "in 4 seconds" (represented in
      //   roundedToUnitsMs below), and rounding to "in 3 seconds" begins at <3500 (called roundingPoint below),
      //   i.e. in >700ms (called timeToRoundingPoint below).
      // To cover both, the >= for negative diff, and > for positive diff, we simply add a small fixed value of 10 to
      // get the final wait time (called waitTime below).
      const roundedToUnitsMs = Math.round(diff / unitMs) * unitMs
      // The point where rounding changes the formatted result next time in the future, is in the middle of the unit
      // (unitMs / 2). As Date.now() is subtracted in diff, the diff becomes smaller in the future, which is why the
      // half unit needs to be subtracted here.
      const roundingPoint = roundedToUnitsMs - unitMs / 2
      // timeToRounding point is the delta or distance in time between current diff and roundingPoint. As roundingPoint
      // is smaller than diff as it's in the future (see above), no Math.abs() is required here.
      const timeToRoundingPoint = diff - roundingPoint
      const waitTime = timeToRoundingPoint + 10
      updateTimeout = window.setTimeout(updateRelativeTime, waitTime)
    }
  }

  const unwatch = watchEffect(updateRelativeTime)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearTimeout(updateTimeout)
      unwatch()
    })
  }

  return {
    formatted,
  }
}
