import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSession, reconnectAndShow, saveSession } from './useMiniAppSession'

const { clearAllCookies, addListener, show, close, reconnect } = vi.hoisted(() => ({
  clearAllCookies: vi.fn(() => Promise.resolve()),
  addListener: vi.fn(),
  show: vi.fn(),
  close: vi.fn(),
  reconnect: vi.fn(),
}))

vi.mock('@capgo/capacitor-inappbrowser', () => ({
  InAppBrowser: {
    clearAllCookies,
    addListener,
    show,
    close,
  },
}))

vi.mock('@/composables/useMiniAppHost', () => ({
  MiniAppHost: { reconnect },
}))

vi.mock('@/lib/mini-app-confirmation', () => ({
  requestUserConfirmation: vi.fn(),
  selectLightningAsset: vi.fn(),
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

describe('reconnectAndShow', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.resetAllMocks()
  })

  it('destroys the host and removes its close listener when the webview is gone', async () => {
    const host = { destroy: vi.fn(() => Promise.resolve()) }
    const closeHandle = { remove: vi.fn(() => Promise.resolve()) }
    reconnect.mockReturnValue(host)
    addListener.mockResolvedValue(closeHandle)
    // Native plugin rejects both calls without emitting closeEvent when no webview exists.
    show.mockRejectedValue(new Error('WebView is not initialized'))
    close.mockRejectedValue(new Error('WebView is not initialized'))
    saveSession({
      url: 'https://example.com',
      title: 'Example',
      chainId: '0x1',
    })

    await expect(reconnectAndShow()).resolves.toBeNull()

    expect(host.destroy).toHaveBeenCalledOnce()
    expect(closeHandle.remove).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('miniAppSession')).toBeNull()
  })
})
