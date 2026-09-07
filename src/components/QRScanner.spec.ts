import { enableAutoUnmount, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

enableAutoUnmount(afterEach)

const { env } = vi.hoisted(() => ({
  env: { isMockEnabled: false },
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
    start: vi.fn(),
    stop: vi.fn(),
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
    vi.resetModules()
  })

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
  })

  async function mountScanner() {
    const { default: QRScanner } = await import('./QRScanner.vue')
    return shallowMount(QRScanner, {
      props: { isVisible: false, expect: 'payment-request' },
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
})
