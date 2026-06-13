import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { Asset } from '@/lib/assets'

const activeAsset = ref<Asset>(Asset.NIM)
const isNimiqAsset = computed(() => activeAsset.value === Asset.NIM)
const displayedPaymentRequests = ref<string[]>([])
const phoneNumberVerified = ref(false)
const isRemoteOk = ref(true)
const isHtlcActive = ref(true)
const remoteBalance = ref(0)
const hasHtlcExpired = ref(false)
const locked = ref(false)
const dbExists = ref(true)
const pointsBalance = ref(0)
const consensus = ref<'established' | 'connecting'>('established')
const usdtBalance = ref(0)
const polygonConsensus = ref<'established' | 'connecting'>('established')
const isTransactionPending = ref(false)
const htlcCanBeExtended = ref(false)
const blocksUntilNextMacroBlock = ref(1)
const isProcessingRemote = ref(false)
const isSyncingWallets = ref(false)
const isConsensusNeeded = ref(false)
const isScannerActive = ref(false)
const localBalance = ref(0)
const htlcThreshold = ref(0)
const kycSdkStatus = ref('idle')

const updatePointsBalance = vi.fn()
const updateTasks = vi.fn()
const updatePointsStatus = vi.fn()
const updateNakaUser = vi.fn()
const initNotifications = vi.fn()
const syncWallets = vi.fn()
const checkKycInBackground = vi.fn()
const routerReplace = vi.fn()
const libState = vi.hoisted(() => ({
  isTestnet: false,
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
  },
}))

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: {
    read: vi.fn().mockResolvedValue({ type: '', value: '' }),
  },
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: vi.fn(),
  },
  ImpactStyle: {
    Light: 'Light',
  },
}))

vi.mock('@ionic/vue', () => ({
  IonPage: defineComponent({
    template: '<div><slot /></div>',
  }),
  IonRouterOutlet: defineComponent({
    template: '<div data-testid="router-outlet"><slot /></div>',
  }),
  IonTabs: defineComponent({
    template: '<div><slot /></div>',
  }),
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')

  return {
    refDebounced: <T>(value: T) => value,
    refThrottled: <T>(value: T) => value,
    until: () => ({
      toBe: vi.fn().mockResolvedValue(undefined),
    }),
    useSwipe: () => ({
      lengthX: ref(0),
      isSwiping: ref(false),
    }),
  }
})

vi.mock('capacitor-sumsub-mobile-sdk', () => ({
  SumsubSdkStatus: {
    PENDING: 'pending',
  },
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: routerReplace,
  }),
}))

vi.mock('@/components/icons/alert.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="alert-icon" />',
  }),
}))

vi.mock('@/components/icons/info.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="info-icon" />',
  }),
}))

vi.mock('@/components/icons/WorldIcon.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="world-icon" />',
  }),
}))

vi.mock('@/components/PaymentRequestDetectedNotification.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="payment-request-notification" />',
  }),
}))

vi.mock('@/components/StatusMessage.vue', () => ({
  default: defineComponent({
    props: {
      message: {
        type: String,
        required: true,
      },
    },
    template: '<div data-testid="status-message">{{ message }}</div>',
  }),
}))

vi.mock('@/components/TheHomeFooter.vue', () => ({
  default: defineComponent({
    props: {
      isPaymentDisabled: {
        type: Boolean,
        required: true,
      },
    },
    template: '<div data-testid="home-footer" :data-disabled="String(isPaymentDisabled)" />',
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    error: vi.fn(),
    log: vi.fn(),
  }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    init: initNotifications,
  }),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string) => value,
    tc: (value: string) => value,
  },
}))

vi.mock('@/lib', () => ({
  debounceDelay: 0,
  debounceMaxWait: 0,
  get isTestnet() {
    return libState.isTestnet
  },
}))

vi.mock('@/lib/utils', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    phoneNumberVerified,
    displayedPaymentRequests,
    isNimiqAsset,
    htlcThreshold,
  }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    locked,
    dbExists,
  }),
}))

vi.mock('@/stores/kyc', () => ({
  useKyc: () => ({
    sdkStatus: kycSdkStatus,
    checkKycInBackground,
  }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localBalance,
  }),
}))

vi.mock('@/stores/locks', () => ({
  useLocks: () => ({
    isProcessingRemote,
    isSyncingWallets,
    isConsensusNeeded,
    isScannerActive,
  }),
}))

vi.mock('@/stores/naka', () => ({
  useNaka: () => ({
    updateUser: updateNakaUser,
  }),
}))

vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({
    consensus,
  }),
}))

vi.mock('@/stores/points', () => ({
  usePoints: () => ({
    pointsBalance,
    updatePointsBalance,
    updateTasks,
    updateStatus: updatePointsStatus,
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    balance: usdtBalance,
    consensus: polygonConsensus,
  }),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    isRemoteOk,
    isHtlcActive,
    remoteBalance,
    hasHtlcExpired,
  }),
}))

vi.mock('@/stores/sync', () => ({
  useSync: () => ({
    isTransactionPending,
    htlcCanBeExtended,
    blocksUntilNextMacroBlock,
    syncWallets,
  }),
}))

async function mountComponent() {
  const { default: MainView } = await import('./MainView.vue')

  return mount(MainView, {
    global: {
      mocks: {
        $t: (value: string) => value,
      },
      stubs: {
        Transition: false,
      },
    },
  })
}

describe('mainView', () => {
  beforeEach(() => {
    activeAsset.value = Asset.NIM
    displayedPaymentRequests.value = []
    phoneNumberVerified.value = false
    isRemoteOk.value = true
    isHtlcActive.value = true
    remoteBalance.value = 0
    hasHtlcExpired.value = false
    locked.value = false
    dbExists.value = true
    pointsBalance.value = 0
    consensus.value = 'established'
    usdtBalance.value = 0
    polygonConsensus.value = 'established'
    isTransactionPending.value = false
    htlcCanBeExtended.value = false
    blocksUntilNextMacroBlock.value = 1
    isProcessingRemote.value = false
    isSyncingWallets.value = false
    isConsensusNeeded.value = false
    isScannerActive.value = false
    localBalance.value = 0
    htlcThreshold.value = 0
    kycSdkStatus.value = 'idle'
    updatePointsBalance.mockReset()
    updateTasks.mockReset()
    updatePointsStatus.mockReset()
    updatePointsStatus.mockResolvedValue(undefined)
    updateNakaUser.mockReset()
    initNotifications.mockReset()
    syncWallets.mockReset()
    checkKycInBackground.mockReset()
    routerReplace.mockReset()
    libState.isTestnet = false
  })

  it('does not show the NIM consensus banner when USDT is the active asset', async () => {
    activeAsset.value = Asset.USDT
    polygonConsensus.value = 'connecting'

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Establishing consensus...')
    expect(wrapper.get('[data-testid="status-message"]').text()).toContain('Connecting to Polygon')
  })

  it('keeps the Pay entry point enabled when USDT balance exists without a NIM deposit', async () => {
    activeAsset.value = Asset.USDT
    polygonConsensus.value = 'connecting'
    usdtBalance.value = 1_000_000
    isRemoteOk.value = false
    isHtlcActive.value = false
    remoteBalance.value = 0

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.get('[data-testid="home-footer"]').attributes('data-disabled')).toBe('false')
  })

  it('shows the USDT testnet warning instead of the Polygon connecting banner', async () => {
    activeAsset.value = Asset.USDT
    polygonConsensus.value = 'connecting'
    usdtBalance.value = 1_000_000
    libState.isTestnet = true

    const wrapper = await mountComponent()
    await flushPromises()

    const statusText = wrapper.get('[data-testid="status-message"]').text()
    expect(statusText).toContain('USDT is only available on mainnet. Switch to mainnet to use USDT.')
    expect(statusText).not.toContain('Connecting to Polygon')
    expect(wrapper.get('[data-testid="home-footer"]').attributes('data-disabled')).toBe('false')
  })

  it('does not show "Processing funds" when local balance is below the HTLC threshold', async () => {
    isHtlcActive.value = false
    remoteBalance.value = 0
    localBalance.value = 2 * 1e5
    htlcThreshold.value = 5 * 1e5

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Processing funds')
  })

  it('shows "Processing funds" once local balance reaches the HTLC threshold', async () => {
    isHtlcActive.value = false
    remoteBalance.value = 0
    localBalance.value = 5 * 1e5
    htlcThreshold.value = 5 * 1e5

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.get('[data-testid="status-message"]').text()).toContain('Processing funds')
  })
})
