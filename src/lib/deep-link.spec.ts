import type { URLOpenListenerEvent } from '@capacitor/app'
import type { Ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  clearSession,
  confirmUntrustedMiniApp,
  hasPendingSession,
  inAppBrowserClose,
  initializeFlow,
  isTrustedMiniAppUrl,
  launchMiniApp,
  loggerError,
  loggerLog,
  loggerWarn,
} = vi.hoisted(() => ({
  clearSession: vi.fn(() => Promise.resolve()),
  confirmUntrustedMiniApp: vi.fn(() => Promise.resolve(false)),
  hasPendingSession: vi.fn(() => false),
  inAppBrowserClose: vi.fn(() => Promise.resolve()),
  initializeFlow: vi.fn(),
  isTrustedMiniAppUrl: vi.fn(() => true),
  launchMiniApp: vi.fn(() => Promise.resolve()),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/composables/useDecrypt', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  const decrypted = vue.ref(true)
  return {
    __decrypted: decrypted,
    useDecrypt: () => ({ decrypted }),
  }
})

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ error: loggerError, log: loggerLog, warn: loggerWarn }),
}))

vi.mock('@/lib/flows', () => ({ initializeFlow }))

vi.mock('@/lib/flows/steps.types', () => ({
  FlowName: { Payment: 'Payment' },
}))

vi.mock('./mini-app-launcher', () => ({ launchMiniApp }))

vi.mock('@/stores/app', () => ({
  useApp: () => ({ language: 'en' }),
}))

vi.mock('@/composables/useMiniAppSession', () => ({ clearSession, hasPendingSession }))

vi.mock('@capgo/capacitor-inappbrowser', () => ({
  InAppBrowser: { close: inAppBrowserClose },
}))

vi.mock('@/stores/mini-apps', () => ({
  useMiniApps: () => ({ isTrustedMiniAppUrl }),
}))

vi.mock('./mini-app-untrusted-confirm', () => ({ confirmUntrustedMiniApp }))

function event(url: string): URLOpenListenerEvent {
  return { url } as URLOpenListenerEvent
}

async function loadHandler() {
  const mod = await import('./deep-link')
  return mod.handleDeepLink
}

async function getDecryptedRef(): Promise<Ref<boolean>> {
  const mod = await import('@/composables/useDecrypt') as unknown as { __decrypted: Ref<boolean> }
  return mod.__decrypted
}

describe('handleDeepLink', () => {
  beforeEach(async () => {
    initializeFlow.mockReset()
    launchMiniApp.mockReset()
    launchMiniApp.mockImplementation(() => Promise.resolve())
    loggerError.mockReset()
    loggerLog.mockReset()
    loggerWarn.mockReset()
    clearSession.mockReset()
    clearSession.mockImplementation(() => Promise.resolve())
    hasPendingSession.mockReset()
    hasPendingSession.mockImplementation(() => false)
    inAppBrowserClose.mockReset()
    inAppBrowserClose.mockImplementation(() => Promise.resolve())
    isTrustedMiniAppUrl.mockReset()
    isTrustedMiniAppUrl.mockImplementation(() => true)
    confirmUntrustedMiniApp.mockReset()
    confirmUntrustedMiniApp.mockImplementation(() => Promise.resolve(false))
    const decrypted = await getDecryptedRef()
    decrypted.value = true
  })

  it('routes nimiqpay://miniapp?url=… to launchMiniApp with normalized url', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=example-mini-app.com'))

    expect(launchMiniApp).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example-mini-app.com/',
      source: 'deeplink',
    }))
  })

  it('accepts url-encoded https URLs in the url param', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event(`nimiqpay://miniapp?url=${encodeURIComponent('https://app.uniswap.org/swap')}`))

    expect(launchMiniApp).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://app.uniswap.org/swap',
      source: 'deeplink',
    }))
  })

  it('clears a preserved mini-app session before launching the deeplink target', async () => {
    hasPendingSession.mockReturnValueOnce(true)
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=example.com'))

    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(inAppBrowserClose).toHaveBeenCalledTimes(1)
    const clearOrder = clearSession.mock.invocationCallOrder[0]
    const launchOrder = launchMiniApp.mock.invocationCallOrder[0]
    expect(clearOrder).toBeLessThan(launchOrder)
  })

  it('still closes any lingering webview even when no session marker is pending', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=example.com'))

    expect(clearSession).not.toHaveBeenCalled()
    expect(inAppBrowserClose).toHaveBeenCalledTimes(1)
    expect(launchMiniApp).toHaveBeenCalledTimes(1)
  })

  it('opens the warning modal for an untrusted url and aborts if the user cancels', async () => {
    isTrustedMiniAppUrl.mockReturnValueOnce(false)
    confirmUntrustedMiniApp.mockResolvedValueOnce(false)
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=unknown.example'))

    expect(confirmUntrustedMiniApp).toHaveBeenCalledWith({
      normalizedUrl: 'https://unknown.example/',
      rawUrl: 'unknown.example',
    })
    expect(launchMiniApp).not.toHaveBeenCalled()
  })

  it('launches an untrusted url after the user confirms in the warning modal', async () => {
    isTrustedMiniAppUrl.mockReturnValueOnce(false)
    confirmUntrustedMiniApp.mockResolvedValueOnce(true)
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=unknown.example'))

    expect(confirmUntrustedMiniApp).toHaveBeenCalledTimes(1)
    expect(launchMiniApp).toHaveBeenCalledTimes(1)
  })

  it('launches without showing the warning when the url is already trusted', async () => {
    isTrustedMiniAppUrl.mockReturnValueOnce(true)
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=known.example'))

    expect(confirmUntrustedMiniApp).not.toHaveBeenCalled()
    expect(launchMiniApp).toHaveBeenCalledTimes(1)
  })

  it('forwards the active UI language to the launcher', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=example.com'))

    expect(launchMiniApp).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }))
  })

  it('ignores nimiqpay://miniapp without url param', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp'))

    expect(launchMiniApp).not.toHaveBeenCalled()
  })

  it('ignores nimiqpay://miniapp with an invalid url param', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://miniapp?url=not%20a%20url'))

    expect(launchMiniApp).not.toHaveBeenCalled()
  })

  it('ignores nimiqpay:// with an unknown action host', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('nimiqpay://unknown?url=https://example.com'))

    expect(launchMiniApp).not.toHaveBeenCalled()
  })

  it.each([
    'nimiqpay://miniapp?url=javascript:alert(1)',
    'nimiqpay://miniapp?url=data:text/html,<h1>x</h1>',
    'nimiqpay://miniapp?url=file:///etc/passwd',
  ])('rejects dangerous schemes in url param: %s', async (event_) => {
    isTrustedMiniAppUrl.mockReturnValue(false)
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event(event_))
    expect(launchMiniApp).not.toHaveBeenCalled()
    expect(confirmUntrustedMiniApp).not.toHaveBeenCalled()
  })

  it.each([
    'nimiqpay://miniapp?url=http://192.168.1.1/',
    'nimiqpay://miniapp?url=http://10.0.0.1/',
    'nimiqpay://miniapp?url=http://127.0.0.1/',
    'nimiqpay://miniapp?url=http://localhost/',
    'nimiqpay://miniapp?url=https://localhost/',
    'nimiqpay://miniapp?url=https://router.lan/',
    'nimiqpay://miniapp?url=https://nas.internal/',
    `nimiqpay://miniapp?url=${encodeURIComponent('https://[::1]/')}`,
    `nimiqpay://miniapp?url=${encodeURIComponent('https://[::ffff:127.0.0.1]/')}`,
    `nimiqpay://miniapp?url=${encodeURIComponent('https://attacker@app.uniswap.org/')}`,
  ])('rejects unsafe hosts: %s', async (event_) => {
    isTrustedMiniAppUrl.mockReturnValue(false)
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event(event_))
    expect(launchMiniApp).not.toHaveBeenCalled()
    expect(confirmUntrustedMiniApp).not.toHaveBeenCalled()
  })

  it('forwards lightning: URLs to the payment flow', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('lightning:lnbc1p3xyz'))

    expect(initializeFlow).toHaveBeenCalledWith('Payment', {
      initialState: { qrCodeScanner: 'lightning:lnbc1p3xyz' },
      analyticsSource: 'lightning_deeplink',
    })
    expect(launchMiniApp).not.toHaveBeenCalled()
  })

  it('ignores unrelated URL schemes', async () => {
    const handleDeepLink = await loadHandler()
    await handleDeepLink(event('https://nimiq.com/somewhere'))

    expect(initializeFlow).not.toHaveBeenCalled()
    expect(launchMiniApp).not.toHaveBeenCalled()
  })

  it('waits until PIN is decrypted before routing', async () => {
    const decrypted = await getDecryptedRef()
    decrypted.value = false

    const handleDeepLink = await loadHandler()
    const pending = handleDeepLink(event('nimiqpay://miniapp?url=example.com'))
    await flushPromises()
    expect(launchMiniApp).not.toHaveBeenCalled()

    decrypted.value = true
    await pending

    expect(launchMiniApp).toHaveBeenCalledTimes(1)
  })
})
