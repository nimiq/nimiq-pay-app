import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { Asset } from '@/lib/assets'

const activeAsset = ref(Asset.NIM)
const isNimiqAsset = ref(true)
const phoneNumberVerified = ref(true)
const isCampaignActive = ref(false)
const liveChatEnabled = ref(false)
const liveChatShown = ref(false)
const hasCard = ref(true)
const isNakaAvailable = ref(true)
const nakaEnabled = ref(true)
const miniAppsEnabled = ref(false)

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(),
  },
}))

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({
    template: `<${tag}><slot /></${tag}>`,
  })

  return {
    IonButton: passthrough('button'),
    IonButtons: passthrough('div'),
    IonHeader: passthrough('header'),
    IonIcon: passthrough('span'),
    IonToolbar: passthrough('div'),
  }
})

vi.mock('@vueuse/core', () => ({
  onLongPress: vi.fn(),
}))

vi.mock('ionicons/icons', () => ({
  close: 'close',
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
vi.mock('@/components/icons/backup.vue', () => iconStub)
vi.mock('@/components/icons/credit-card.vue', () => iconStub)
vi.mock('@/components/icons/gift.vue', () => iconStub)
vi.mock('@/components/icons/live-chat.vue', () => iconStub)
vi.mock('@/components/icons/log-out.vue', () => iconStub)
vi.mock('@/components/icons/nimiq-outline.vue', () => iconStub)
vi.mock('@/components/icons/settings.vue', () => iconStub)
vi.mock('@/components/icons/top-up.vue', () => iconStub)
vi.mock('@/components/icons/withdraw.vue', () => iconStub)

const showModal = vi.fn()
const closeModal = vi.fn()
const initializeFlow = vi.fn()

vi.mock('@/composables/useModal', () => ({
  Modal: {
    Dev: 'Dev',
    MiniApps: 'MiniApps',
    Settings: 'Settings',
    LogoutConfirm: 'LogoutConfirm',
  },
  useModal: () => ({
    showModal,
    closeModal,
  }),
}))

vi.mock('@/lib', () => ({
  get isMiniAppsEnabled() {
    return miniAppsEnabled.value
  },
  get isNakaEnabled() {
    return nakaEnabled.value
  },
}))

vi.mock('@/lib/flows', () => ({
  initializeFlow,
}))

vi.mock('@/lib/flows/steps.types', () => ({
  FlowName: {
    NakaCardManagement: 'nakaManagement',
    NakaOnboarding: 'nakaOnboarding',
    VerifyPhone: 'verifyPhone',
    Backup: 'backup',
  },
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    phoneNumberVerified,
    activeAsset,
    isNimiqAsset,
  }),
}))

vi.mock('@/stores/feature-flags', () => ({
  useFeatureFlags: () => ({
    isNakaAvailable,
  }),
}))

vi.mock('@/stores/livechat', () => ({
  useLiveChat: () => ({
    enabled: liveChatEnabled,
    shown: liveChatShown,
  }),
}))

vi.mock('@/stores/naka', () => ({
  useNaka: () => ({
    hasCard,
  }),
}))

vi.mock('@/stores/points', () => ({
  usePoints: () => ({
    isCampaignActive,
  }),
}))

describe('menuModal', () => {
  beforeEach(() => {
    activeAsset.value = Asset.NIM
    isNimiqAsset.value = true
    phoneNumberVerified.value = true
    isCampaignActive.value = false
    liveChatEnabled.value = false
    liveChatShown.value = false
    hasCard.value = true
    isNakaAvailable.value = true
    nakaEnabled.value = true
    miniAppsEnabled.value = false
    showModal.mockReset()
    closeModal.mockReset()
    initializeFlow.mockReset()
  })

  it('keeps the NAKA card available on USDT', async () => {
    activeAsset.value = Asset.USDT
    isNimiqAsset.value = false

    const { default: MenuModal } = await import('./MenuModal.vue')
    const wrapper = mount(MenuModal, {
      global: {
        plugins: [createPinia()],
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('NAKA Card')
    expect(wrapper.text()).toContain('Support')
    expect(wrapper.text()).toContain('Payments')
    expect(wrapper.text()).not.toContain('Activate NAKA Card')
  })

  it('opens support for users without NAKA', async () => {
    nakaEnabled.value = false
    hasCard.value = false
    isNakaAvailable.value = false

    const { default: MenuModal } = await import('./MenuModal.vue')
    const wrapper = mount(MenuModal, {
      global: {
        plugins: [createPinia()],
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Support')
    expect(wrapper.text()).not.toContain('NAKA')

    await wrapper.findAll('.menu-item').find(item => item.text() === 'Support')!.trigger('click')

    expect(liveChatEnabled.value).toBe(true)
    expect(liveChatShown.value).toBe(true)
    expect(closeModal).toHaveBeenCalledOnce()
  })

  it('passes analytics metadata when opening mini apps from the menu', async () => {
    miniAppsEnabled.value = true

    const { default: MenuModal } = await import('./MenuModal.vue')
    const wrapper = mount(MenuModal, {
      global: {
        plugins: [createPinia()],
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await flushPromises()
    await wrapper.findAll('.menu-item').find(item => item.text() === 'Mini Apps')!.trigger('click')

    expect(showModal).toHaveBeenCalledWith('MiniApps', {
      analytics: {
        featureName: 'mini_apps',
        source: 'menu',
      },
    })
  })

  it('passes analyticsSource when opening backup from the menu', async () => {
    const { default: MenuModal } = await import('./MenuModal.vue')
    const wrapper = mount(MenuModal, {
      global: {
        plugins: [createPinia()],
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await flushPromises()
    await wrapper.findAll('.menu-item').find(item => item.text() === 'Backup Account')!.trigger('click')

    expect(initializeFlow).toHaveBeenCalledWith('backup', {
      analyticsSource: 'menu',
    })
  })

  it('passes analyticsSource when opening verify phone from rewards menu', async () => {
    phoneNumberVerified.value = false
    isCampaignActive.value = true

    const { default: MenuModal } = await import('./MenuModal.vue')
    const wrapper = mount(MenuModal, {
      global: {
        plugins: [createPinia()],
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await flushPromises()
    await wrapper.findAll('.menu-item').find(item => item.text() === 'Activate Cashback & Rewards')!.trigger('click')

    expect(initializeFlow).toHaveBeenCalledWith('verifyPhone', {
      analyticsSource: 'menu_rewards',
    })
  })

  it('passes analyticsSource when opening NAKA management from the menu', async () => {
    const { default: MenuModal } = await import('./MenuModal.vue')
    const wrapper = mount(MenuModal, {
      global: {
        plugins: [createPinia()],
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await flushPromises()
    await wrapper.findAll('.menu-item').find(item => item.text() === 'NAKA Card')!.trigger('click')

    expect(initializeFlow).toHaveBeenCalledWith('nakaManagement', {
      analyticsSource: 'menu',
    })
  })
})
