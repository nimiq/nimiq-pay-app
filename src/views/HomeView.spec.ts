import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const localNotifications = ref([{ id: 'first', title: 'First notification' }])

enableAutoUnmount(afterEach)

const slotStub = defineComponent({ template: '<div><slot /></div>' })

vi.mock('@ionic/vue', () => ({
  IonBackdrop: slotStub,
  IonButton: slotStub,
  IonButtons: slotStub,
  IonContent: slotStub,
  IonGrid: slotStub,
  IonHeader: slotStub,
  IonPage: slotStub,
  IonRefresher: slotStub,
  IonRefresherContent: slotStub,
  IonRow: slotStub,
  IonToolbar: slotStub,
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/components/BackupNotification.vue', () => ({ default: slotStub }))
vi.mock('@/components/icons/cryptocity-logo.vue', () => ({ default: slotStub }))
vi.mock('@/components/icons/menu.vue', () => ({ default: slotStub }))
vi.mock('@/components/LiveChat.vue', () => ({ default: slotStub }))
vi.mock('@/components/LiveChatBadge.vue', () => ({ default: slotStub }))
vi.mock('@/components/NotificationCard.vue', () => ({ default: slotStub }))
vi.mock('@/components/TheHomeAmounts.vue', () => ({ default: slotStub }))
vi.mock('@/components/TheHomeTransactions.vue', () => ({ default: slotStub }))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/composables/useMiniAppHost', () => ({ isMiniAppActive: ref(false) }))
vi.mock('@/composables/useModal', () => ({ Modal: {}, useModal: () => ({ showModal: vi.fn() }) }))
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    addLocalNotification: vi.fn(),
    localNotifications,
    removeLocalNotification: vi.fn(),
  }),
}))
vi.mock('@/composables/usePolygonSync', () => ({ usePolygonSync: () => ({ triggerNow: vi.fn() }) }))
vi.mock('@/composables/usePrice', () => ({ toCoins: (value: number) => value }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (value: string) => value } }))
vi.mock('@/lib/analytics', () => ({ trackUpdatingConnection: vi.fn() }))
vi.mock('@/lib/flows', () => ({ initializeFlow: vi.fn() }))
vi.mock('@/lib/mock-mode', () => ({ isMockEnabled: false }))
vi.mock('@/lib/utils', () => ({ promiseWithTimeout: vi.fn(), sleep: vi.fn() }))

vi.mock('@/stores/app', () => ({
  Crypto: { NIM: 'nim' },
  useApp: () => ({
    phoneNumberVerified: ref(true),
    referralCode: ref(''),
    hasDoneBackup: ref(true),
    showAnimations: ref(false),
    isNimiqAsset: ref(true),
  }),
}))
vi.mock('@/stores/feature-flags', () => ({
  useFeatureFlags: () => ({ isUsdtMaintenanceActive: ref(false), isCryptocityPointsEnabled: ref(false) }),
}))
vi.mock('@/stores/livechat', () => ({
  useLiveChat: () => ({ enabled: ref(false), shown: ref(false), initFromBackground: vi.fn() }),
}))
vi.mock('@/stores/locks', () => ({
  useLocks: () => ({ isUpdatingTransactions: ref(false), isHomeVisible: ref(false) }),
}))
vi.mock('@/stores/points', () => ({
  usePoints: () => ({
    pointsBalance: ref(0),
    isCampaignActive: ref(false),
    updatePointsBalance: vi.fn(),
    updateStatus: vi.fn(),
    redeemReferral: vi.fn(),
    getReferralInfo: vi.fn(async () => ({ data: null, error: null })),
  }),
}))
vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({ isRemoteOk: ref(true), hasHtlcExpired: ref(false) }),
}))
vi.mock('@/stores/sync', () => ({
  useSync: () => ({ htlcHistoryChecked: ref(true), htlcCheckHoldStartedAt: ref(undefined) }),
}))
vi.mock('@/stores/transactions', () => ({ useTransactions: () => ({ refreshFromDb: vi.fn() }) }))

describe('homeView notifications', () => {
  it('scrolls the notification list element to the first notification on mount', async () => {
    const scrollTo = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollTo', { value: scrollTo, configurable: true })
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollTo')
    })
    const errors: unknown[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      try {
        callback(0)
      }
      catch (error) {
        errors.push(error)
      }
      return 0
    })

    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })

    const { default: HomeView } = await import('./HomeView.vue')
    mount(HomeView, { global: { mocks: { $t: (value: string) => value, $tc: (value: string) => value } } })
    await flushPromises()

    expect(errors).toEqual([])
    expect(scrollTo).toHaveBeenCalledWith({ left: expect.any(Number), behavior: 'smooth' })
    expect(scrollTo.mock.contexts[0]).toBeInstanceOf(HTMLUListElement)
  })
})
