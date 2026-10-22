import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import PinInput from '@/components/PinInput.vue'

const state = vi.hoisted(() => ({
  decrypt: vi.fn(),
  replace: vi.fn(async () => {}),
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn(), sendReport: vi.fn() },
}))

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({ template: `<${tag}><slot /></${tag}>` })
  return {
    IonContent: passthrough('div'),
    IonGrid: passthrough('div'),
    IonHeader: passthrough('header'),
    IonPage: passthrough('section'),
    IonToolbar: passthrough('div'),
  }
})

vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: vi.fn() },
  NotificationType: { Error: 'error' },
}))
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { show: vi.fn() } }))
vi.mock('@capgo/capacitor-inappbrowser', () => ({ InAppBrowser: { close: vi.fn(async () => {}) } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: state.replace }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (s: string) => s } }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => state.logger }))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => ({ isAndroid: false }) }))
vi.mock('@/composables/useDecrypt', () => ({
  useDecrypt: () => ({ decrypt: state.decrypt, decrypted: ref(false) }),
}))
vi.mock('@/composables/useMiniAppSession', () => ({
  clearSession: vi.fn(async () => {}),
  hasPendingSession: () => false,
  reconnectAndShow: vi.fn(async () => {}),
}))
vi.mock('@/stores/conn', () => ({ useConn: () => ({ dbExists: ref(true) }) }))
vi.mock('@/composables/useBiometric', () => ({
  useBiometric: () => ({
    updateBiometryInfo: vi.fn(async () => {}),
    addBiometricResumeListener: vi.fn(async () => {}),
    removeBiometricResumeListener: vi.fn(),
    getPinFromSecureStorage: vi.fn(async () => ({ success: false, error: null })),
    isBiometricEnabled: ref(false),
    isBiometricSupported: ref(false),
    BiometryErrorType: { userCancel: 'userCancel' },
  }),
}))

let wrapper: VueWrapper

async function mountPinView() {
  const { default: PinView } = await import('./PinView.vue')
  wrapper = mount(PinView, { global: { mocks: { $t: (s: string) => s } } })
  await flushPromises()
}

// Types into PinInput's own input, so its done emit and loading state run as on device.
async function typePin(pin = '1111') {
  // Let PinInput's delayed clearInput() run first, otherwise the same value doesn't re-trigger done.
  await vi.advanceTimersByTimeAsync(300)
  await wrapper.find('input').setValue(pin)
  await flushPromises()
}

// Same done emit a biometric result produces while a typed PIN is still unlocking.
async function emitDone(pin = '1111') {
  wrapper.findComponent(PinInput).vm.$emit('done', pin)
  await flushPromises()
}

describe('pinView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    state.decrypt.mockReset()
    state.replace.mockClear()
  })

  afterEach(() => {
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('ignores a second submit while an unlock is running', async () => {
    const { promise, resolve } = Promise.withResolvers<undefined>()
    state.decrypt.mockReturnValue(promise)
    await mountPinView()

    await typePin()
    expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true)
    await emitDone()
    expect(state.decrypt).toHaveBeenCalledTimes(1)

    resolve(undefined)
    await flushPromises()
    expect(state.replace).toHaveBeenCalledTimes(1)
    expect(state.replace).toHaveBeenCalledWith('/app')
  })

  it('joins the still-running decrypt when retrying after the unlock timeout', async () => {
    const { promise, resolve } = Promise.withResolvers<undefined>()
    state.decrypt.mockReturnValue(promise)
    await mountPinView()

    await typePin()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(wrapper.text()).toContain('Something went wrong decrypting the database. Try reloading the app.')
    expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)

    await typePin()
    expect(state.decrypt).toHaveBeenCalledTimes(1)

    resolve(undefined)
    await flushPromises()
    expect(state.replace).toHaveBeenCalledWith('/app')
  })

  it('shows an error instead of a stuck spinner when navigation fails', async () => {
    state.decrypt.mockResolvedValue(undefined)
    state.replace.mockResolvedValueOnce(new Error('Navigation aborted') as never)
    await mountPinView()

    await typePin()
    expect(wrapper.text()).toContain('Something went wrong decrypting the database. Try reloading the app.')
    expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
  })

  it('clears the loading spinner when the same error repeats', async () => {
    state.decrypt.mockResolvedValue('Invalid PIN')
    await mountPinView()

    await typePin()
    expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)

    // Retry before PinView's 2s timer resets errorMsg, so the message is identical.
    await typePin()
    expect(state.decrypt).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false)
  })
})
