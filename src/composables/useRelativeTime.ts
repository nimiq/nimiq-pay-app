import type { MaybeRef } from 'vue'
import { computed, getCurrentScope, onScopeDispose, ref, toValue, watchEffect } from 'vue'
import { useApp } from '@/stores/app'
import { toMs } from './useTime'

const timeFormatter = computed(() => new Intl.RelativeTimeFormat(useApp().language, { numeric: 'auto' }))

type Unit = Intl.RelativeTimeFormatUnitSingular
const DEFAULT_UNITS: { unit: Unit, max: number, unitMs: number }[] = [
  { unit: 'second', max: 60_000, unitMs: 1_000 },
  { unit: 'minute', max: 2_760_000, unitMs: 60_000 },
  { unit: 'hour', max: 72_000_000, unitMs: 3_600_000 },
  { unit: 'day', max: 518_400_000, unitMs: 86_400_000 },
  { unit: 'week', max: 2_419_200_000, unitMs: 604_800_000 },
  { unit: 'month', max: 28_512_000_000, unitMs: 2_592_000_000 },
  { unit: 'year', max: Number.POSITIVE_INFINITY, unitMs: 31_536_000_000 },
]

export interface UseRelativeTimeOptions {
  timestamp?: MaybeRef<number | undefined>
}
export function useRelativeTime({ timestamp: timestampMsOrS }: UseRelativeTimeOptions = {}) {
  const defaultTime = Date.now()
  const timestamp = computed(() => toMs(toValue(timestampMsOrS) || defaultTime))

  const formatted = ref('')

  let updateTimeout = -1
  function updateRelativeTime() {
    const diff = timestamp.value - Date.now()
    const { unit, unitMs } = DEFAULT_UNITS.find(({ max }) => Math.abs(diff) < max)!
    formatted.value = timeFormatter.value.format(Math.round(diff / unitMs), unit)

    clearTimeout(updateTimeout)
    if (['second', 'minute', 'hour', 'day'].includes(unit)) {
      const roundedToUnitsMs = Math.round(diff / unitMs) * unitMs
      const roundingPoint = roundedToUnitsMs - unitMs / 2
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
