import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const phoneNumberVerified = ref(false)
const miniAppsEnabled = ref(false)
const showModal = vi.fn()
const closeModal = vi.fn()
const onLongPress = vi.fn()
const logDiagnostics = vi.fn(async () => {})
const sendReport = vi.fn()

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({
    template: `<${tag}><slot /></${tag}>`,
  })

  return {
    IonBackButton: passthrough('button'),
    IonButtons: passthrough('div'),
    IonItem: passthrough('div'),
    IonLabel: passthrough('span'),
    IonList: passthrough('div'),
  }
})

vi.mock('@vueuse/core', () => ({
  computedAsync: () => ref('1.2.3'),
  onLongPress,
  useTimeoutFn: () => ({ start: vi.fn(), stop: vi.fn() }),
}))

vi.mock('@/components/ModalTemplate.vue', () => ({
  default: defineComponent({
    template: '<div><slot name="leftButton" /><slot /></div>',
  }),
}))

vi.mock('@/components/MenuItem.vue', () => ({
  default: defineComponent({
    props: {
      title: {
        type: String,
        required: true,
      },
    },
    template: '<button class="menu-item">{{ title }}</button>',
  }),
}))

const iconStub = {
  default: defineComponent({
    template: '<span />',
  }),
}

vi.mock('@/components/icons/apps.vue', () => iconStub)
vi.mock('@/components/icons/credit-card.vue', () => iconStub)
vi.mock('@/components/icons/fingerprint.vue', () => iconStub)
vi.mock('@/components/icons/id-verification.vue', () => iconStub)
vi.mock('@/components/icons/settings.vue', () => iconStub)

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), sendReport }),
}))

vi.mock('@/composables/useModal', () => ({
  Modal: {
    SecretFeatures: 'SecretFeatures',
    SettingsGeneral: 'SettingsGeneral',
    SettingsSecurity: 'SettingsSecurity',
    SettingsPayments: 'SettingsPayments',
    SettingsMiniApps: 'SettingsMiniApps',
    SettingsAccount: 'SettingsAccount',
  },
  useModal: () => ({ showModal, closeModal }),
}))

vi.mock('@/lib', () => ({
  get isMiniAppsEnabled() {
    return miniAppsEnabled.value
  },
}))

vi.mock('@/lib/diagnostics', () => ({
  getBundleVersion: vi.fn(),
  logDiagnostics,
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({ phoneNumberVerified }),
}))

async function mountSettings() {
  const { default: SettingsModal } = await import('./SettingsModal.vue')
  const wrapper = mount(SettingsModal, {
    global: {
      mocks: {
        $t: (value: string) => value,
      },
    },
  })
  await flushPromises()
  return wrapper
}

function rowTitles(wrapper: Awaited<ReturnType<typeof mountSettings>>) {
  return wrapper.findAll('.menu-item').map(item => item.text())
}

describe('settingsModal', () => {
  beforeEach(() => {
    phoneNumberVerified.value = false
    miniAppsEnabled.value = false
    showModal.mockReset()
    closeModal.mockReset()
    onLongPress.mockReset()
    logDiagnostics.mockClear()
    sendReport.mockReset()
  })

  it('shows only the always-visible categories by default', async () => {
    const wrapper = await mountSettings()

    expect(rowTitles(wrapper)).toEqual(['General', 'Security', 'Payments'])
  })

  it('shows Mini Apps only when Mini Apps are enabled', async () => {
    miniAppsEnabled.value = true
    const wrapper = await mountSettings()

    expect(rowTitles(wrapper)).toEqual(['General', 'Security', 'Payments', 'Mini Apps'])
  })

  it('shows Account only when the phone number is verified', async () => {
    phoneNumberVerified.value = true
    const wrapper = await mountSettings()

    expect(rowTitles(wrapper)).toEqual(['General', 'Security', 'Payments', 'Account'])
  })

  it('removes the Account delete row once the phone number is no longer verified', async () => {
    phoneNumberVerified.value = true
    const { default: Account } = await import('./settings/Account.vue')
    const wrapper = mount(Account, {
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })
    const deleteRow = 'Delete Cryptocity Points account'
    expect(wrapper.text()).toContain(deleteRow)

    phoneNumberVerified.value = false
    await flushPromises()

    expect(wrapper.text()).not.toContain(deleteRow)
  })

  it.each([
    ['General', 'SettingsGeneral'],
    ['Security', 'SettingsSecurity'],
    ['Payments', 'SettingsPayments'],
    ['Mini Apps', 'SettingsMiniApps'],
    ['Account', 'SettingsAccount'],
  ])('opens %s as a stacked sub-screen', async (title, modal) => {
    miniAppsEnabled.value = true
    phoneNumberVerified.value = true
    const wrapper = await mountSettings()

    await wrapper.findAll('.menu-item').find(item => item.text() === title)!.trigger('click')

    expect(showModal).toHaveBeenCalledExactlyOnceWith(modal, { isOnTop: true })
  })

  it('keeps the version footer with its 5-tap Secret Features trigger', async () => {
    const wrapper = await mountSettings()
    const version = wrapper.find('code')

    expect(version.text()).toBe('v1.2.3')

    for (let tap = 0; tap < 4; tap++)
      await version.trigger('click')
    expect(showModal).not.toHaveBeenCalled()

    await version.trigger('click')
    expect(showModal).toHaveBeenCalledExactlyOnceWith('SecretFeatures')
  })

  it('keeps the 3s long-press log report on the version footer', async () => {
    await mountSettings()

    expect(onLongPress).toHaveBeenCalledOnce()
    const [, callback, options] = onLongPress.mock.calls[0]
    expect(options).toMatchObject({ delay: 3000 })

    await callback()
    expect(logDiagnostics).toHaveBeenCalledOnce()
    expect(sendReport).toHaveBeenCalledOnce()
  })
})
