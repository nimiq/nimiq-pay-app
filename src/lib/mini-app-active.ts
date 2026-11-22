import { ref } from 'vue'
import { hasPendingSession } from '@/composables/useMiniAppSession'

/**
 * Reactive flag mirroring whether a MiniAppHost session is currently active.
 * Updated in lock-step with `_activeMiniAppSession`. Used to gate UI signals
 * such as the local-notification visibility check in `useLocks().isHomeVisible`.
 */
export const isMiniAppActive = ref(false)

/** The native client shares the web views' cookie jar, which is then a Mini App's: one open, or one hidden until the PIN is in. */
export function miniAppHoldsCookies(): boolean {
  return isMiniAppActive.value || hasPendingSession()
}
