import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  device: { isIOS: false },
  enable: vi.fn(),
  disable: vi.fn(),
  addListener: vi.fn(),
  remove: vi.fn(),
  setToast: vi.fn(),
}))

vi.mock('@capawesome/capacitor-privacy-screen', () => ({
  PrivacyScreen: {
    enable: mocks.enable,
    disable: mocks.disable,
    addListener: mocks.addListener,
  },
}))
vi.mock('@ionic/vue', () => ({ IonButton: { template: '<button><slot /></button>' } }))
vi.mock('@/components/MnemonicDisplay.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => mocks.device }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), error: vi.fn() }) }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ setToast: mocks.setToast }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (key: string) => key } }))
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: () => ({ getWords: () => ({ data: ['word'] }) }) }))

async function mountShowWords(isVisible: boolean) {
  const { default: ShowWords } = await import('./ShowWords.vue')
  const wrapper = mount(ShowWords, { props: { isVisible }, global: { mocks: { $t: (key: string) => key } } })
  await flushPromises()
  return wrapper
}

describe('showWords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.device.isIOS = false
    mocks.addListener.mockResolvedValue({ remove: mocks.remove })
  })

  it('does not enable the privacy screen on Android, so screenshots stay allowed', async () => {
    const wrapper = await mountShowWords(false)
    await wrapper.setProps({ isVisible: true })
    await flushPromises()

    expect(mocks.enable).not.toHaveBeenCalled()
    expect(mocks.addListener).toHaveBeenCalledWith('screenshotTaken', expect.any(Function))
  })

  it('enables the privacy screen on iOS while visible and disables it on leave', async () => {
    mocks.device.isIOS = true
    const wrapper = await mountShowWords(false)
    expect(mocks.enable).not.toHaveBeenCalled()

    await wrapper.setProps({ isVisible: true })
    expect(mocks.enable).toHaveBeenCalledOnce()
    expect(mocks.enable).toHaveBeenCalledWith()

    await wrapper.setProps({ isVisible: false })
    expect(mocks.disable).toHaveBeenCalledOnce()
  })

  it('warns when a screenshot is taken', async () => {
    await mountShowWords(true)

    mocks.addListener.mock.calls[0]![1]()

    expect(mocks.setToast).toHaveBeenCalledWith({
      message: 'Store screenshot safely',
      type: 'warning',
      duration: 10000,
    })
  })

  it('only listens while visible and removes its own listener on leave', async () => {
    const wrapper = await mountShowWords(false)
    expect(mocks.addListener).not.toHaveBeenCalled()

    await wrapper.setProps({ isVisible: true })
    await flushPromises()
    expect(mocks.addListener).toHaveBeenCalledOnce()
    expect(mocks.remove).not.toHaveBeenCalled()

    await wrapper.setProps({ isVisible: false })
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledOnce()
  })

  it('removes the listener when unmounted while visible', async () => {
    const wrapper = await mountShowWords(true)

    wrapper.unmount()
    await flushPromises()

    expect(mocks.remove).toHaveBeenCalledOnce()
  })
})
