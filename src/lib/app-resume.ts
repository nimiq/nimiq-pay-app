export const RELOAD_AFTER_BACKGROUND_TIMEOUT_MS = 2 * 60 * 1000

export function shouldReloadAppAfterBackground(
  lastPauseTimestamp: number,
  now = Date.now(),
  timeoutMs = RELOAD_AFTER_BACKGROUND_TIMEOUT_MS,
): boolean {
  return lastPauseTimestamp !== 0 && now - lastPauseTimestamp > timeoutMs
}

export function shouldPreserveMiniAppSession(options: {
  hasActiveMiniAppSession: boolean
  reopenMiniAppWebviewAfterResume: boolean
}): boolean {
  return options.hasActiveMiniAppSession && options.reopenMiniAppWebviewAfterResume
}
