import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const isBiometricEnabled = ref(false)
let dismiss = Promise.withResolvers<void>()
const showModal = vi.fn(async () => ({ onDidDismiss: () => dismiss.promise }))

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({
    template: `<${tag}><slot /></${tag}>`,
  })

  return {
    IonItem: passthrough('div'),
    IonLabel: passthrough('span'),
    IonList: passthrough('div'),
    IonToggle: defineComponent({
      props: { checked: Boolean },
      emits: ['ionChange'],
      template: '<input type="checkbox" class="toggle" :checked="checked" @click="$emit(\'ionChange\', { detail: { checked: $event.target.checked }, target: $event.target })">',
    }),
  }
})

vi.mock('@/composables/useBiometric', () => ({
  useBiometric: () => ({
    isBiometricSupported: ref(true),
    isBiometricEnabled,
    updateBiometryInfo: vi.fn(),
  }),
}))

vi.mock('@/composables/useModal', () => ({
  Modal: { EnableBiometric: 'EnableBiometric' },
  useModal: () => ({ showModal }),
}))

vi.mock('@/lib/flows', () => ({ initializeFlow: vi.fn() }))

async function mountSecurity() {
  const { default: SettingsSecurity } = await import('./SettingsSecurity.vue')
  return mount(SettingsSecurity, { global: { mocks: { $t: (value: string) => value } } })
}

describe('settingsSecurity', () => {
  beforeEach(() => {
    isBiometricEnabled.value = false
    dismiss = Promise.withResolvers<void>()
    showModal.mockClear()
  })

  it('turns the biometric toggle back off when the enable modal is dismissed without enabling', async () => {
    const wrapper = await mountSecurity()
    const toggle = wrapper.find<HTMLInputElement>('input.toggle')

    await toggle.trigger('click')
    expect(toggle.element.checked).toBe(true)
    expect(showModal).toHaveBeenCalledExactlyOnceWith('EnableBiometric', { isOnTop: true })

    dismiss.resolve()
    await flushPromises()

    expect(toggle.element.checked).toBe(false)
  })

  it('keeps the biometric toggle on when the enable modal enabled biometrics', async () => {
    const wrapper = await mountSecurity()
    const toggle = wrapper.find<HTMLInputElement>('input.toggle')

    await toggle.trigger('click')
    isBiometricEnabled.value = true
    dismiss.resolve()
    await flushPromises()

    expect(toggle.element.checked).toBe(true)
  })
})
