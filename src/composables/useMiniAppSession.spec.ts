import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSession, saveSession } from './useMiniAppSession'

const { clearAllCookies } = vi.hoisted(() => ({
  clearAllCookies: vi.fn(() => Promise.resolve()),
}))

vi.mock('@capgo/capacitor-inappbrowser', () => ({
  InAppBrowser: {
    clearAllCookies,
    addListener: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
  },
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    log: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('clearSession', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearAllCookies.mockClear()
  })

  it('removes the persisted session and clears InAppBrowser cookies', async () => {
    saveSession({
      url: 'https://example.com',
      title: 'Example',
      chainId: '0x1',
    })

    expect(sessionStorage.getItem('miniAppSession')).not.toBeNull()

    await clearSession()

    expect(sessionStorage.getItem('miniAppSession')).toBeNull()
    expect(clearAllCookies).toHaveBeenCalledOnce()
  })
})
