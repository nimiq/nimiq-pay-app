import { describe, expect, it } from 'vitest'
import {
  RELOAD_AFTER_BACKGROUND_TIMEOUT_MS,
  shouldPreserveMiniAppSession,
  shouldReloadAppAfterBackground,
} from './app-resume'

describe('shouldReloadAppAfterBackground', () => {
  it('returns false when app was never paused', () => {
    expect(shouldReloadAppAfterBackground(0, Date.now())).toBe(false)
  })

  it('returns false when background time is exactly timeout', () => {
    const now = Date.now()
    expect(shouldReloadAppAfterBackground(now - RELOAD_AFTER_BACKGROUND_TIMEOUT_MS, now)).toBe(false)
  })

  it('returns true when background time is above timeout', () => {
    const now = Date.now()
    expect(shouldReloadAppAfterBackground(now - RELOAD_AFTER_BACKGROUND_TIMEOUT_MS - 1, now)).toBe(true)
  })
})

describe('shouldPreserveMiniAppSession', () => {
  it('returns true only when an active session exists and setting is enabled', () => {
    expect(shouldPreserveMiniAppSession({
      hasActiveMiniAppSession: true,
      reopenMiniAppWebviewAfterResume: true,
    })).toBe(true)

    expect(shouldPreserveMiniAppSession({
      hasActiveMiniAppSession: false,
      reopenMiniAppWebviewAfterResume: true,
    })).toBe(false)

    expect(shouldPreserveMiniAppSession({
      hasActiveMiniAppSession: true,
      reopenMiniAppWebviewAfterResume: false,
    })).toBe(false)
  })
})
