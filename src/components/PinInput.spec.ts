import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSharedPinInput } from '@/composables/useSharedPinInput'
import { StepName } from '@/lib/flows/steps.types'
import PinInput from './PinInput.vue'

const state = vi.hoisted(() => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: vi.fn() },
  NotificationType: { Error: 'error' },
}))

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: { show: vi.fn(), hide: vi.fn() },
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    until: () => ({ toBe: vi.fn(async () => {}), toBeTruthy: vi.fn(async () => {}) }),
  }
})

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

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

const wrappers: VueWrapper[] = []
// Stand in for the single input Flow.vue renders and hands to the composable.
let sharedEl: HTMLInputElement

async function mountPin(props: Record<string, unknown>) {
  const wrapper = mount(PinInput, { props })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

function type(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
}

describe('pinInput', () => {
  beforeEach(() => {
    state.logger.log.mockClear()
    sharedEl = document.createElement('input')
    sharedEl.className = 'caret-transparent sr-only'
    document.body.appendChild(sharedEl)
    useSharedPinInput().provideElement(sharedEl)
  })

  afterEach(() => {
    while (wrappers.length) wrappers.pop()!.unmount()
    useSharedPinInput().releaseElement(sharedEl)
    sharedEl.remove()
  })

  it('routes typing to the active flow step via the shared input and emits done', async () => {
    const wrapper = await mountPin({ inputLength: 4, stepName: StepName.PinCode, isActive: true })

    type(sharedEl, '1234')
    await flushPromises()

    expect(wrapper.emitted('done')).toEqual([['1234']])
  })

  it('drops keystrokes while no flow step is active (mid-navigation)', async () => {
    const wrapper = await mountPin({ inputLength: 4, stepName: StepName.PinCodeConfirm, isActive: false })

    type(sharedEl, '1234')
    await flushPromises()

    expect(wrapper.emitted('done')).toBeUndefined()
    expect(sharedEl.value).toBe('')
    expect(wrapper.findAll('.opacity-40')).toHaveLength(4)
  })

  it('routes input to the active step only when two PIN steps are mounted', async () => {
    const enter = await mountPin({ inputLength: 4, stepName: StepName.PinCode, isActive: false })
    const confirm = await mountPin({ inputLength: 4, stepName: StepName.PinCodeConfirm, isActive: true })

    type(sharedEl, '4321')
    await flushPromises()

    expect(confirm.emitted('done')).toEqual([['4321']])
    expect(enter.emitted('done')).toBeUndefined()
  })

  it('blurs the shared input once no PIN step is active (balls not visible)', async () => {
    const wrapper = await mountPin({ inputLength: 4, stepName: StepName.PinCode, isActive: true })
    sharedEl.focus()
    expect(document.activeElement).toBe(sharedEl)

    // Leaving the PIN step (e.g. navigating to a non-PIN step or closing the flow) must blur.
    await wrapper.setProps({ isActive: false })
    await nextFrame()

    expect(document.activeElement).not.toBe(sharedEl)
  })

  it('accepts typing on the local input for standalone usage (no stepName)', async () => {
    const wrapper = await mountPin({ inputLength: 4 })
    const input = wrapper.find('input')

    await input.setValue('1234')
    await flushPromises()

    expect(wrapper.emitted('done')).toEqual([['1234']])
  })
})
