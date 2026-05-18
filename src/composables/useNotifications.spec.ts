import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const state = vi.hoisted(() => ({
  isWeb: false,
  isAndroid: true,
  localNotificationsStatus: undefined as any,
  isHomeVisible: false,
  locked: false,
  schedule: vi.fn(async (_args: any) => {}),
  createChannel: vi.fn(async (_args: any) => {}),
  checkPermissions: vi.fn(async () => ({ display: 'prompt' as 'prompt' | 'granted' | 'denied' | 'prompt-with-rationale' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' as 'prompt' | 'granted' | 'denied' | 'prompt-with-rationale' })),
  addListener: vi.fn(async (_event: string, cb: (e: any) => Promise<void> | void) => {
    state.tapCallback = cb
    return { remove: vi.fn() }
  }),
  tapCallback: undefined as undefined | ((e: any) => Promise<void> | void),
  inAppBrowserClose: vi.fn(async () => {}),
  initializeFlow: vi.fn(),
  waitForUnlock: vi.fn(async () => undefined),
  transactions: [] as Array<{ hash: string }>,
  formatUsdtAmount: vi.fn((amount: number) => `${amount} USDT`),
  usePriceFormatted: vi.fn(() => '123.456 NIM'),
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: (args: any) => state.schedule(args),
    createChannel: (args: any) => state.createChannel(args),
    checkPermissions: () => state.checkPermissions(),
    requestPermissions: () => state.requestPermissions(),
    addListener: (event: string, cb: any) => state.addListener(event, cb),
  },
}))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(async () => ({ receive: 'granted' as const })),
    requestPermissions: vi.fn(async () => ({ receive: 'granted' as const })),
    addListener: vi.fn(),
    register: vi.fn(),
    createChannel: vi.fn(),
    unregister: vi.fn(),
    removeAllListeners: vi.fn(),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: [] })),
  },
}))

vi.mock('@capgo/inappbrowser', () => ({
  InAppBrowser: {
    close: () => state.inAppBrowserClose(),
  },
}))

vi.mock('@vueuse/core', () => ({
  computedAsync: (cb: any) => ref(cb()),
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/composables/useDevice', () => ({
  useDevice: () => ({
    get isWeb() { return state.isWeb },
    get isAndroid() { return state.isAndroid },
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/composables/useModal', () => ({
  Modal: {},
  useModal: () => ({ showModal: vi.fn() }),
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice: () => ({ crypto: { formatted: state.usePriceFormatted() } }),
}))

vi.mock('@/composables/useApi', () => ({
  useNotificationsApi: () => ({ getRemoteNotifications: vi.fn(async () => ({ data: [], error: null })) }),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (k: string, params?: Record<string, any>) => params ? `${k}::${JSON.stringify(params)}` : k },
}))

vi.mock('@/lib/flows', () => ({
  initializeFlow: (...args: any[]) => state.initializeFlow(...args),
}))

vi.mock('@/lib/flows/steps.types', () => ({
  FlowName: { ViewTransactionDetail: 'viewTransactionDetail' },
}))

vi.mock('@/lib/assets', () => ({
  Asset: { NIM: 'NIM', USDT: 'USDT' },
  formatUsdtAmount: (amount: number) => state.formatUsdtAmount(amount),
}))

vi.mock('@/stores/app', () => ({
  LocalNotificationsStatus: { GRANTED: 'granted', DENIED: 'denied', PROMPT: 'prompt' },
  PushNotificationsStatus: { GRANTED: 'granted', DENIED: 'denied', PROMPT: 'prompt' },
  useApp: () => ({
    localNotificationsStatus: state.localNotificationsStatus,
    pushNotificationsStatus: ref('granted'),
    closedNotifications: ref([]),
  }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    get locked() { return state.locked },
    waitForUnlock: state.waitForUnlock,
  }),
}))

vi.mock('@/stores/locks', () => ({
  useLocks: () => ({
    get isHomeVisible() { return state.isHomeVisible },
  }),
}))

vi.mock('@/stores/transactions', () => ({
  useTransactions: () => ({
    get transactions() { return state.transactions },
  }),
}))

function makeReceipt(overrides?: Partial<{ hash: string, amount: number, asset: string, timestamp: number }>) {
  return {
    hash: 'test-hash',
    amount: 12345,
    asset: 'NIM',
    timestamp: 1_700_000_000,
    transfer: 'UserReceipt',
    sender: 'sender-addr',
    recipient: 'recipient-addr',
    fee: 0,
    proofSize: 0,
    status: 'confirmed',
    title: 'Top-Up',
    ...overrides,
  } as any
}

describe('useNotifications — local notifications', () => {
  beforeEach(() => {
    vi.resetModules()
    state.isWeb = false
    state.isAndroid = true
    state.localNotificationsStatus = ref('granted')
    state.isHomeVisible = false
    state.locked = false
    state.schedule.mockReset()
    state.schedule.mockResolvedValue(undefined)
    state.createChannel.mockReset()
    state.createChannel.mockResolvedValue(undefined)
    state.checkPermissions.mockReset()
    state.checkPermissions.mockResolvedValue({ display: 'prompt' })
    state.requestPermissions.mockReset()
    state.requestPermissions.mockResolvedValue({ display: 'granted' })
    state.addListener.mockClear()
    state.tapCallback = undefined
    state.inAppBrowserClose.mockReset()
    state.inAppBrowserClose.mockResolvedValue(undefined)
    state.initializeFlow.mockReset()
    state.waitForUnlock.mockReset()
    state.waitForUnlock.mockResolvedValue(undefined)
    state.transactions = []
    state.formatUsdtAmount.mockClear()
    state.usePriceFormatted.mockClear()
    state.usePriceFormatted.mockReturnValue('123.456 NIM')
  })

  describe('scheduleIncomingPaymentNotification gates', () => {
    it('skips when isWeb', async () => {
      state.isWeb = true
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.schedule).not.toHaveBeenCalled()
    })

    it('skips when isHomeVisible', async () => {
      state.isHomeVisible = true
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.schedule).not.toHaveBeenCalled()
    })

    it('skips when DB locked', async () => {
      state.locked = true
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.schedule).not.toHaveBeenCalled()
    })

    it('skips when localNotificationsStatus !== GRANTED and request is denied', async () => {
      state.localNotificationsStatus = ref('denied')
      state.checkPermissions.mockResolvedValue({ display: 'denied' })
      state.requestPermissions.mockResolvedValue({ display: 'denied' })
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.schedule).not.toHaveBeenCalled()
    })

    it('requests permission and fires when localNotificationsStatus is PROMPT and request is granted', async () => {
      // Bug A regression: existing users with push granted but local never asked
      // must be prompted on first incoming tx, not silently skipped.
      state.localNotificationsStatus = ref('prompt')
      state.checkPermissions.mockResolvedValue({ display: 'prompt' })
      state.requestPermissions.mockResolvedValue({ display: 'granted' })
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.requestPermissions).toHaveBeenCalledTimes(1)
      expect(state.schedule).toHaveBeenCalledTimes(1)
    })

    it('fires when all gates pass (modal-over-Home: isHomeVisible=false)', async () => {
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.schedule).toHaveBeenCalledTimes(1)
      const arg = state.schedule.mock.calls[0]![0]
      expect(arg.notifications[0]).toMatchObject({
        title: 'Payment received',
        extra: { hash: 'test-hash' },
        channelId: 'incoming-payments',
      })
      expect(arg.notifications[0].body).toContain('You received {amount}')
      expect(typeof arg.notifications[0].id).toBe('number')
    })

    it('ensures the high-importance payments channel exists before scheduling on Android', async () => {
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.createChannel).toHaveBeenCalledTimes(1)
      expect(state.createChannel).toHaveBeenCalledWith(expect.objectContaining({
        id: 'incoming-payments',
        importance: 5,
      }))
    })

    it('does NOT call createChannel on iOS (channels are Android-only)', async () => {
      state.isAndroid = false
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt())
      expect(state.createChannel).not.toHaveBeenCalled()
      expect(state.schedule).toHaveBeenCalledTimes(1)
    })

    it('only creates the payments channel once across multiple notifications', async () => {
      const { useNotifications } = await import('./useNotifications')
      const notifs = useNotifications()
      await notifs.scheduleIncomingPaymentNotification(makeReceipt({ hash: 'a' }))
      await notifs.scheduleIncomingPaymentNotification(makeReceipt({ hash: 'b' }))
      await notifs.scheduleIncomingPaymentNotification(makeReceipt({ hash: 'c' }))
      expect(state.createChannel).toHaveBeenCalledTimes(1)
      expect(state.schedule).toHaveBeenCalledTimes(3)
    })

    it('formats USDT amount via formatUsdtAmount with raw minor units', async () => {
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt({ asset: 'USDT', amount: 5_000_000 }))
      expect(state.formatUsdtAmount).toHaveBeenCalledWith(5_000_000)
      expect(state.usePriceFormatted).not.toHaveBeenCalled()
    })

    it('formats NIM amount via usePrice', async () => {
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt({ asset: 'NIM', amount: 12345 }))
      expect(state.usePriceFormatted).toHaveBeenCalledTimes(1)
      expect(state.formatUsdtAmount).not.toHaveBeenCalled()
    })

    it('produces a deterministic id for the same hash', async () => {
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt({ hash: 'abc' }))
      const id1 = state.schedule.mock.calls[0]![0].notifications[0].id
      state.schedule.mockClear()
      await useNotifications().scheduleIncomingPaymentNotification(makeReceipt({ hash: 'abc' }))
      const id2 = state.schedule.mock.calls[0]![0].notifications[0].id
      expect(id1).toBe(id2)
      expect(id1).toBeGreaterThan(0)
    })
  })

  describe('requestLocalNotificationsPermission', () => {
    it('skips on web', async () => {
      state.isWeb = true
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().requestLocalNotificationsPermission()
      expect(state.checkPermissions).not.toHaveBeenCalled()
      expect(state.requestPermissions).not.toHaveBeenCalled()
    })

    it('skips request when already granted; sets status to GRANTED', async () => {
      state.checkPermissions.mockResolvedValue({ display: 'granted' })
      state.localNotificationsStatus = ref('prompt')
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().requestLocalNotificationsPermission()
      expect(state.requestPermissions).not.toHaveBeenCalled()
      expect(state.localNotificationsStatus.value).toBe('granted')
    })

    it('requests permission when not granted; sets DENIED on denial', async () => {
      state.checkPermissions.mockResolvedValue({ display: 'prompt' })
      state.requestPermissions.mockResolvedValue({ display: 'denied' })
      state.localNotificationsStatus = ref('prompt')
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().requestLocalNotificationsPermission()
      expect(state.requestPermissions).toHaveBeenCalledTimes(1)
      expect(state.localNotificationsStatus.value).toBe('denied')
    })

    it('sets GRANTED when permission newly granted', async () => {
      state.checkPermissions.mockResolvedValue({ display: 'prompt' })
      state.requestPermissions.mockResolvedValue({ display: 'granted' })
      state.localNotificationsStatus = ref('prompt')
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().requestLocalNotificationsPermission()
      expect(state.localNotificationsStatus.value).toBe('granted')
    })
  })

  describe('installLocalNotificationsTapHandler', () => {
    it('skips on web', async () => {
      state.isWeb = true
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().installLocalNotificationsTapHandler()
      expect(state.addListener).not.toHaveBeenCalled()
    })

    it('registers listener once', async () => {
      const { useNotifications } = await import('./useNotifications')
      const notifs = useNotifications()
      await notifs.installLocalNotificationsTapHandler()
      await notifs.installLocalNotificationsTapHandler()
      expect(state.addListener).toHaveBeenCalledTimes(1)
      expect(state.addListener.mock.calls[0][0]).toBe('localNotificationActionPerformed')
    })

    it('on tap: waits for unlock, closes Mini App, opens tx detail', async () => {
      state.transactions = [{ hash: 'abc-123' } as any]
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().installLocalNotificationsTapHandler()
      expect(state.tapCallback).toBeTypeOf('function')
      await state.tapCallback!({ notification: { extra: { hash: 'abc-123' } } })
      expect(state.waitForUnlock).toHaveBeenCalledTimes(1)
      expect(state.inAppBrowserClose).toHaveBeenCalledTimes(1)
      expect(state.initializeFlow).toHaveBeenCalledWith(
        'viewTransactionDetail',
        { initialState: { transactionList: { hash: 'abc-123' } } },
      )
    })

    it('on tap: missing hash is a no-op (no flow opened)', async () => {
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().installLocalNotificationsTapHandler()
      await state.tapCallback!({ notification: { extra: {} } })
      expect(state.initializeFlow).not.toHaveBeenCalled()
      expect(state.inAppBrowserClose).not.toHaveBeenCalled()
    })

    it('on tap: hash not found in store is a no-op (no flow opened)', async () => {
      state.transactions = []
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().installLocalNotificationsTapHandler()
      await state.tapCallback!({ notification: { extra: { hash: 'missing' } } })
      expect(state.initializeFlow).not.toHaveBeenCalled()
    })

    it('on tap: InAppBrowser.close throwing is swallowed', async () => {
      state.transactions = [{ hash: 'abc-123' } as any]
      state.inAppBrowserClose.mockRejectedValue(new Error('no webview'))
      const { useNotifications } = await import('./useNotifications')
      await useNotifications().installLocalNotificationsTapHandler()
      await state.tapCallback!({ notification: { extra: { hash: 'abc-123' } } })
      expect(state.initializeFlow).toHaveBeenCalledTimes(1)
    })
  })
})
