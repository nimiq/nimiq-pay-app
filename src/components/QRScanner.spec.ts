import { enableAutoUnmount, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

enableAutoUnmount(afterEach)

const { env, scanner } = vi.hoisted(() => ({
  env: { isMockEnabled: false },
  scanner: { start: vi.fn(), stop: vi.fn() },
}))

vi.mock('qr-scanner-wechat', () => ({ ready: vi.fn() }))
vi.mock('@/lib/index', () => ({ isDev: true }))
vi.mock('@/lib/mock-mode', () => ({
  get isMockEnabled() {
    return env.isMockEnabled
  },
}))
vi.mock('@/composables/useDevice', () => ({
  useDevice: () => ({ isWeb: false, isIOS: false }),
}))
vi.mock('@/composables/useStringParser', () => ({
  QRDataFormat: { PaymentRequest: 'payment-request', NimCashlink: 'nim-cashlink' },
}))
vi.mock('@/composables/useQRScanner', () => ({
  QRScannerState: { Idle: 'idle', Scanning: 'scanning', NoPermission: 'no-permission' },
  useQRScanner: () => ({
    setDummyData: vi.fn(),
    start: scanner.start,
    stop: scanner.stop,
    state: { value: 'idle' },
  }),
}))
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ setToast: vi.fn(), clearToast: vi.fn() }),
}))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (text: string) => text } }))

describe('qr scanner mock controls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    env.isMockEnabled = false
    scanner.start.mockReset()
    scanner.stop.mockReset()
    vi.resetModules()
  })

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
  })

  async function mountScanner(isVisible = false) {
    const { default: QRScanner } = await import('./QRScanner.vue')
    return shallowMount(QRScanner, {
      props: { isVisible, expect: 'payment-request' },
      global: { mocks: { $t: (text: string) => text } },
    })
  }

  it('shows dummy controls during normal development', async () => {
    expect((await mountScanner()).text()).toContain('Click here to use mockup data.')
  })

  it('hides dummy controls from screenshot mock mode', async () => {
    env.isMockEnabled = true
    expect((await mountScanner()).text()).not.toContain('Click here to use mockup data.')
  })

  it('stops the scanner on unmount while start() is still pending', async () => {
    scanner.start.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountScanner(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(scanner.start).toHaveBeenCalledTimes(1)

    wrapper.unmount()

    expect(scanner.stop).toHaveBeenCalledTimes(1)
  })

  it('does not start the scanner when unmounted before the debounced start fires', async () => {
    const wrapper = await mountScanner(true)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(500)

    expect(scanner.start).not.toHaveBeenCalled()
  })
})
