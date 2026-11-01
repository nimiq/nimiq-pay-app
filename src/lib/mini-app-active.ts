import { ref } from 'vue'

/**
 * Reactive flag mirroring whether a MiniAppHost session is currently active.
 * Updated in lock-step with `_activeMiniAppSession`. Used to gate UI signals
 * such as the local-notification visibility check in `useLocks().isHomeVisible`.
 */
export const isMiniAppActive = ref(false)
