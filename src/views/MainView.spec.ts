import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { Asset, Chain } from '@/lib/assets'

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
const pendingHtlcCreationTransactions = ref<{ transactionHash: string, state?: string }[]>([])
const hasPendingHtlcCreation = computed(() => pendingHtlcCreationTransactions.value.some(
  transaction => transaction.state !== 'included' && transaction.state !== 'confirmed',
))
const htlcCanBeExtended = ref(false)
const blocksUntilNextMacroBlock = ref(1)
const htlcHistoryChecked = ref<boolean | undefined>(true)
const htlcCheckHoldStartedAt = ref<number | undefined>()
const lastFundsBlockReason = ref()
const isProcessingRemote = ref(false)
const isSyncingWallets = ref(false)
const isConsensusNeeded = ref(false)
const isScannerActive = ref(false)
const localBalance = ref(0)
const htlcThreshold = ref(0)
const isUsdtMaintenanceActive = ref(false)
const usdtMaintenanceNotice = ref('USDT maintenance notice')

const updatePointsBalance = vi.fn()
const updateTasks = vi.fn()
const updatePointsStatus = vi.fn()
const initNotifications = vi.fn()
const syncWallets = vi.fn()
const loggerError = vi.fn()
const routerReplace = vi.fn()
const libState = vi.hoisted(() => ({
  isTestnet: false,
}))
const capture = vi.hoisted(() => vi.fn())
const capacitor = vi.hoisted(() => ({
  addListener: vi.fn(),
  removeListener: vi.fn(),
  readClipboard: vi.fn(),
}))
const stringParser = vi.hoisted(() => ({
  isPaymentRequest: vi.fn(),
  getPaymentRequestData: vi.fn(),
}))
const consensusWait = vi.hoisted(() => ({ promise: undefined as Promise<void> | undefined }))

enableAutoUnmount(afterEach)
afterEach(() => vi.useRealTimers())

vi.mock('@capawesome/capacitor-posthog', () => ({
  Posthog: { capture },
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: capacitor.addListener,
  },
}))

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: {
    read: capacitor.readClipboard,
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
      toBe: (value: unknown) => (value === 'established' && consensusWait.promise) || Promise.resolve(),
    }),
    useSwipe: () => ({
      lengthX: ref(0),
      isSwiping: ref(false),
    }),
  }
})

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
    name: 'PaymentRequestDetectedNotification',
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
    error: loggerError,
    log: vi.fn(),
  }),
}))

vi.mock('@/composables/useStringParser', () => ({
  useStringParser: () => stringParser,
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
  isDev: false,
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

vi.mock('@/stores/feature-flags', () => ({
  useFeatureFlags: () => ({ isUsdtMaintenanceActive, usdtMaintenanceNotice }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    locked,
    dbExists,
  }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localBalance,
    getEthAddress: () => ({ data: undefined }),
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
    hasPendingHtlcCreation,
    htlcCanBeExtended,
    blocksUntilNextMacroBlock,
    htlcHistoryChecked,
    htlcCheckHoldStartedAt,
    pendingHtlcCreationTransactions,
    lastFundsBlockReason,
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
    pendingHtlcCreationTransactions.value = []
    htlcCanBeExtended.value = false
    blocksUntilNextMacroBlock.value = 1
    htlcHistoryChecked.value = true
    htlcCheckHoldStartedAt.value = undefined
    isProcessingRemote.value = false
    isSyncingWallets.value = false
    isConsensusNeeded.value = false
    isScannerActive.value = false
    localBalance.value = 0
    htlcThreshold.value = 0
    isUsdtMaintenanceActive.value = false
    updatePointsBalance.mockReset()
    updateTasks.mockReset()
    updatePointsStatus.mockReset()
    updatePointsStatus.mockResolvedValue(undefined)
    initNotifications.mockReset()
    syncWallets.mockReset()
    syncWallets.mockResolvedValue(undefined)
    loggerError.mockReset()
    routerReplace.mockReset()
    libState.isTestnet = false
    capture.mockClear()
    capacitor.addListener.mockReset()
    capacitor.addListener.mockResolvedValue({ remove: capacitor.removeListener })
    capacitor.removeListener.mockReset()
    capacitor.readClipboard.mockReset()
    capacitor.readClipboard.mockResolvedValue({ type: '', value: '' })
    stringParser.isPaymentRequest.mockReset()
    stringParser.getPaymentRequestData.mockReset()
    consensusWait.promise = undefined
  })

  it('logs a rejected wallet sync instead of leaving it unhandled', async () => {
    const error = new Error('sync failed')
    syncWallets.mockRejectedValue(error)

    await mountComponent()
    await flushPromises()

    expect(loggerError).toHaveBeenCalledWith('Wallet sync failed', error)
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

  it('shows maintenance notice and disables USDT Pay', async () => {
    activeAsset.value = Asset.USDT
    usdtBalance.value = 1_000_000
    isUsdtMaintenanceActive.value = true

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.get('[data-testid="status-message"]').text()).toContain('USDT maintenance notice')
    expect(wrapper.get('[data-testid="home-footer"]').attributes('data-disabled')).toBe('true')
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

  it.each([10 * 1e5, 0])('keeps the processing banner hidden for an outgoing payment with remaining balance %s', async (balance) => {
    remoteBalance.value = balance
    isHtlcActive.value = balance > 0
    const wrapper = await mountComponent()
    isTransactionPending.value = true
    await flushPromises()

    expect(wrapper.text()).not.toContain('Processing funds')
    expect(wrapper.get('[data-testid="home-footer"]').attributes('data-disabled')).toBe('true')
  })

  it('keeps payment available while an included HTLC is monitored for finality', async () => {
    remoteBalance.value = 10 * 1e5
    isHtlcActive.value = true
    pendingHtlcCreationTransactions.value = [{ transactionHash: 'creation', state: 'included' }]
    const wrapper = await mountComponent()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Processing funds')
    expect(wrapper.get('[data-testid="home-footer"]').attributes('data-disabled')).toBe('false')
  })

  it.each(['drain', 'creation'])('shows processing during HTLC %s even while the previous signer is active', async (phase) => {
    remoteBalance.value = 10 * 1e5
    isHtlcActive.value = true
    if (phase === 'drain')
      isProcessingRemote.value = true
    else
      pendingHtlcCreationTransactions.value = [{ transactionHash: 'creation' }]
    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Processing funds')
  })

  it.each([60_000, 120_000])('preserves funds telemetry when switching assets after %s ms', async (switchAfterMs) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    isProcessingRemote.value = true
    await mountComponent()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(switchAfterMs)
    activeAsset.value = Asset.USDT
    await flushPromises()
    await vi.advanceTimersByTimeAsync(180_000 - switchAfterMs)

    expect(capture).toHaveBeenCalledExactlyOnceWith({
      event: 'funds_processing_stuck',
      properties: expect.objectContaining({ duration_ms: 120_000 }),
    })

    isProcessingRemote.value = false
    await flushPromises()
    activeAsset.value = Asset.NIM
    await flushPromises()

    expect(capture).toHaveBeenCalledTimes(2)
    expect(capture).toHaveBeenLastCalledWith({
      event: 'funds_processing_resolved',
      properties: expect.objectContaining({ duration_ms: 180_000, is_processing_remote: false }),
    })
  })

  it('does not show "Processing funds" when accumulating below threshold onto an active HTLC', async () => {
    // Below-threshold top-up onto an existing secured balance just accumulates (shown as "pending").
    isHtlcActive.value = true
    remoteBalance.value = 10 * 1e5
    localBalance.value = 2 * 1e5
    htlcThreshold.value = 5 * 1e5

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Processing funds')
  })

  it('shows "Processing funds" for a below-threshold deposit when no secured balance exists yet', async () => {
    // Fresh wallet: the deposit is forced into an HTLC immediately rather than kept pending.
    isHtlcActive.value = false
    remoteBalance.value = 0
    localBalance.value = 2 * 1e5
    htlcThreshold.value = 5 * 1e5

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.get('[data-testid="status-message"]').text()).toContain('Processing funds')
  })

  it('explains a held deposit instead of a short processing countdown', async () => {
    isHtlcActive.value = false
    remoteBalance.value = 0
    localBalance.value = 2 * 1e5
    htlcHistoryChecked.value = false
    htlcCheckHoldStartedAt.value = Date.now()

    const wrapper = await mountComponent()
    await flushPromises()

    expect(wrapper.get('[data-testid="status-message"]').text()).toContain('Checking your account')
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

  it('does not re-run payment request detection on resume while the same request waits for consensus', async () => {
    const pr = 'nimiq:NQ00?amount=1'
    let establishConsensus!: () => void
    consensusWait.promise = new Promise(resolve => establishConsensus = resolve)
    capacitor.readClipboard.mockResolvedValue({ type: 'text/plain', value: pr })
    stringParser.isPaymentRequest.mockReturnValue(true)
    stringParser.getPaymentRequestData.mockResolvedValue({ data: { recipient: 'NQ11', chain: Chain.Polygon } })

    await mountComponent()
    await flushPromises()
    const onResume = capacitor.addListener.mock.calls[0]![1] as () => Promise<void>
    const resumes = [onResume(), onResume()]
    await flushPromises()

    expect(stringParser.getPaymentRequestData).toHaveBeenCalledOnce()

    establishConsensus()
    await Promise.all(resumes)
    await flushPromises()

    expect(displayedPaymentRequests.value).toEqual([pr])
  })

  it('shows a dismissed request again on resume while it waits for consensus', async () => {
    const pr = 'nimiq:NQ00?amount=1'
    consensusWait.promise = new Promise(() => {})
    capacitor.readClipboard.mockResolvedValue({ type: 'text/plain', value: pr })
    stringParser.isPaymentRequest.mockReturnValue(true)
    stringParser.getPaymentRequestData.mockResolvedValue({ data: { recipient: 'NQ11', chain: Chain.Polygon } })

    const wrapper = await mountComponent()
    await flushPromises()
    wrapper.findComponent({ name: 'PaymentRequestDetectedNotification' }).vm.$emit('onContinue')
    // Leave transition removes the element on the next frame
    await vi.waitFor(() => expect(wrapper.find('[data-testid="payment-request-notification"]').exists()).toBe(false))

    const onResume = capacitor.addListener.mock.calls[0]![1] as () => Promise<void>
    await onResume()
    await flushPromises()

    expect(wrapper.find('[data-testid="payment-request-notification"]').exists()).toBe(true)
    expect(stringParser.getPaymentRequestData).toHaveBeenCalledOnce()
  })

  it('retries detection on a later resume after validation fails', async () => {
    const pr = 'nimiq:NQ00?amount=1'
    capacitor.readClipboard.mockResolvedValue({ type: 'text/plain', value: pr })
    stringParser.isPaymentRequest.mockReturnValue(true)
    stringParser.getPaymentRequestData.mockResolvedValueOnce({ error: 'network' })
    stringParser.getPaymentRequestData.mockResolvedValueOnce({ data: { recipient: 'NQ11', chain: Chain.Polygon } })

    await mountComponent()
    await flushPromises()
    const onResume = capacitor.addListener.mock.calls[0]![1] as () => Promise<void>
    await onResume()

    expect(stringParser.getPaymentRequestData).toHaveBeenCalledTimes(2)
    expect(displayedPaymentRequests.value).toEqual([pr])
  })

  it('removes the resume listener on unmount', async () => {
    const wrapper = await mountComponent()
    await flushPromises()

    wrapper.unmount()
    await flushPromises()

    expect(capacitor.addListener).toHaveBeenCalledWith('resume', expect.any(Function))
    expect(capacitor.removeListener).toHaveBeenCalledOnce()
  })
})
