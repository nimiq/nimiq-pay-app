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
const registration = ref<{ nakaIdentification?: string } | null>({ nakaIdentification: 'kyc-started' })
const isNakaAvailable = ref(true)

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
  isMiniAppsEnabled: false,
  isNakaEnabled: true,
}))

vi.mock('@/lib/flows', () => ({
  initializeFlow,
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
    registration,
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
    registration.value = { nakaIdentification: 'kyc-started' }
    isNakaAvailable.value = true
    showModal.mockReset()
    closeModal.mockReset()
    initializeFlow.mockReset()
  })

  it('keeps NAKA menu entries available on USDT when card and support state are present', async () => {
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
    expect(wrapper.text()).toContain('NAKA Support')
    expect(wrapper.text()).toContain('Payments')
    expect(wrapper.text()).not.toContain('Activate NAKA Card')
  })
})
