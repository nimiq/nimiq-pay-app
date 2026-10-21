import { ready } from 'qr-scanner-wechat'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQRScanner } from './useQRScanner'

const state = vi.hoisted(() => ({
  app: {
    activeAsset: 'NIM',
    get isNimiqAsset() {
      return this.activeAsset === 'NIM'
    },
  },
  getPaymentRequestData: vi.fn(),
  getPolygonAddress: vi.fn(),
  initializeFlow: vi.fn(),
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
  toast: {
    setToast: vi.fn(),
    clearToast: vi.fn(),
  },
  setUpCameraFeed: vi.fn(),
  tearDownCameraFeed: vi.fn(),
  interval: {
    pause: vi.fn(),
    resume: vi.fn(),
    callback: undefined as undefined | (() => Promise<void>),
  },
  device: { isWeb: true },
  cameraPreview: {
    start: vi.fn(),
    stop: vi.fn(),
    captureSample: vi.fn(),
  },
}))

vi.mock('@vueuse/core', async importOriginal => ({
  ...await importOriginal<typeof import('@vueuse/core')>(),
  useIntervalFn: (callback: () => Promise<void>) => {
    state.interval.callback = callback
    return state.interval
  },
}))

vi.mock('@capgo/camera-preview', () => ({
  CameraPreview: state.cameraPreview,
}))

vi.mock('qr-scanner-wechat', () => ({
  ready: vi.fn(),
  scan: vi.fn(),
}))

vi.mock('./useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (message: string) => message,
  },
}))

vi.mock('../lib', () => ({
  isDev: true,
}))

vi.mock('./useCameraFeed', () => ({
  useCameraFeed: () => ({
    setUpCameraFeed: state.setUpCameraFeed,
    tearDownCameraFeed: state.tearDownCameraFeed,
    hasPermission: ref(true),
  }),
}))

vi.mock('./useDevice', () => ({
  useDevice: () => state.device,
}))

vi.mock('./useStringParser', () => ({
  QRDataFormat: {
    NimiqAddress: 'nimiqAddress',
    AssetAddress: 'assetAddress',
    PaymentRequest: 'paymentRequest',
    NimCashlink: 'nimCashlink',
  },
  useStringParser: () => ({
    getCashlink: vi.fn(),
    getNimAddress: vi.fn(() => ({ data: undefined, error: undefined })),
    getPolygonAddress: state.getPolygonAddress,
    getPaymentRequestData: state.getPaymentRequestData,
  }),
}))

vi.mock('./useToast', () => ({
  useToast: () => state.toast,
}))

vi.mock('@/lib/flows', () => ({
  initializeFlow: state.initializeFlow,
}))

vi.mock('@/stores/app', () => ({
  useApp: () => state.app,
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: '',
  }),
}))

vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: () => ({
    claimCashlink: vi.fn(),
  }),
}))

describe('useQRScanner', () => {
  beforeEach(() => {
    state.app.activeAsset = 'NIM'
    state.getPaymentRequestData.mockReset()
    state.getPolygonAddress.mockReset()
    state.initializeFlow.mockReset()
    state.logger.log.mockReset()
    state.logger.error.mockReset()
    state.toast.setToast.mockReset()
    state.toast.clearToast.mockReset()
    state.setUpCameraFeed.mockReset()
    state.tearDownCameraFeed.mockReset()
    state.interval.pause.mockReset()
    state.interval.resume.mockReset()
    state.interval.callback = undefined
    state.device.isWeb = true
    state.cameraPreview.start.mockReset()
    state.cameraPreview.stop.mockReset()
    state.cameraPreview.captureSample.mockReset()

    state.getPaymentRequestData.mockImplementation(async (request: string) => {
      if (request === 'nimiq:NQ048XAKRA3761CA0CE5GKB670MDBJ8VN7FQ?amount=1&message=Ref%20%23YF8p&label=Maxiii&cpl_id=YF8pjO1y') {
        return {
          data: {
            recipient: 'NQ048XAKRA3761CA0CE5GKB670MDBJ8VN7FQ',
            amount: 100000,
            fee: 0,
            merchantCategory: 'shop',
            rail: 'cpl',
            paymentRef: 'YF8pjO1y',
            transfer: 'user-payment-to-merchant',
            asset: 'NIM',
            chain: 'Nimiq',
          },
          error: undefined,
        }
      }

      if (request === 'ethereum:0xc2132D05D31c914a87C6611C10748AEb04B58e8F@137/transfer?address=0xf569f89F3A5FDA94e4fCBBe7B7Baa16C29f4B134&uint256=140000') {
        return {
          data: {
            recipient: '0xf569f89F3A5FDA94e4fCBBe7B7Baa16C29f4B134',
            amount: 140000,
            fee: 0,
            merchantCategory: 'shop',
            rail: 'unknown',
            paymentRef: '',
            transfer: 'user-payment',
            asset: 'USDT',
            chain: 'Polygon',
          },
          error: undefined,
        }
      }

      throw new Error(`Unexpected request: ${request}`)
    })
    state.getPolygonAddress.mockReturnValue({ data: undefined, error: undefined })
  })

  it('uses the NIM payment mock when the active asset is not USDT', async () => {
    const onData = vi.fn()
    const onError = vi.fn()
    const cameraFeedContainer = ref(document.createElement('div'))

    const { setDummyData } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData,
      onError,
      cameraFeedContainer,
    })

    setDummyData()
    await vi.waitFor(() => {
      expect(state.getPaymentRequestData).toHaveBeenCalledWith('nimiq:NQ048XAKRA3761CA0CE5GKB670MDBJ8VN7FQ?amount=1&message=Ref%20%23YF8p&label=Maxiii&cpl_id=YF8pjO1y')
    })
    expect(onData).toHaveBeenCalledWith(expect.objectContaining({
      recipient: 'NQ048XAKRA3761CA0CE5GKB670MDBJ8VN7FQ',
      amount: 100000,
      asset: 'NIM',
      chain: 'Nimiq',
    }))
    expect(onError).not.toHaveBeenCalled()
  })

  it('uses the USDT payment preview mock when the active asset is USDT', async () => {
    state.app.activeAsset = 'USDT'

    const onData = vi.fn()
    const onError = vi.fn()
    const cameraFeedContainer = ref(document.createElement('div'))

    const { setDummyData } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData,
      onError,
      cameraFeedContainer,
    })

    setDummyData()
    await vi.waitFor(() => {
      expect(state.getPaymentRequestData).toHaveBeenCalledWith('ethereum:0xc2132D05D31c914a87C6611C10748AEb04B58e8F@137/transfer?address=0xf569f89F3A5FDA94e4fCBBe7B7Baa16C29f4B134&uint256=140000')
    })
    expect(onData).toHaveBeenCalledWith(expect.objectContaining({
      recipient: '0xf569f89F3A5FDA94e4fCBBe7B7Baa16C29f4B134',
      amount: 140000,
      asset: 'USDT',
      chain: 'Polygon',
    }))
    const mockPaymentRequest = onData.mock.calls[0][0]
    expect(mockPaymentRequest.fiatCurrency).toBeUndefined()
    expect(mockPaymentRequest.fiatFeeAmount).toBeUndefined()
    expect(mockPaymentRequest.feeIncludedInAmount).toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
  })

  it('emits at most one successful scan result per scanner session', async () => {
    vi.useFakeTimers()

    const onData = vi.fn()
    const onError = vi.fn()
    const cameraFeedContainer = ref(document.createElement('div'))

    const { setDummyData } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData,
      onError,
      cameraFeedContainer,
    })

    setDummyData()
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1)
    })

    await vi.advanceTimersByTimeAsync(1600)
    setDummyData()

    expect(state.getPaymentRequestData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('retries scans after the success callback rejects', async () => {
    vi.useFakeTimers()

    const onData = vi.fn()
      .mockRejectedValueOnce(new Error('Consumer failed'))
      .mockResolvedValueOnce(undefined)
    const onError = vi.fn()
    const cameraFeedContainer = ref(document.createElement('div'))

    const { setDummyData } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData,
      onError,
      cameraFeedContainer,
    })

    setDummyData()
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Consumer failed')
    })

    await vi.advanceTimersByTimeAsync(1600)
    setDummyData()
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(2)
    })

    expect(state.getPaymentRequestData).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('releases the camera and scan loop when stopped before start() finishes', async () => {
    let finishCameraSetup!: () => void
    state.setUpCameraFeed.mockReturnValue(new Promise<void>(resolve => finishCameraSetup = resolve))

    const { start, stop, state: scannerState } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData: vi.fn(),
      onError: vi.fn(),
      cameraFeedContainer: ref(document.createElement('div')),
    })

    const starting = start()
    const stopping = stop()
    finishCameraSetup()
    await Promise.all([starting, stopping])

    expect(state.tearDownCameraFeed).toHaveBeenCalledTimes(1)
    expect(state.interval.pause).toHaveBeenCalledTimes(1)
    expect(scannerState.value).toBe('idle')
  })

  it('starts again when start() follows a stop queued behind a pending start', async () => {
    let finishCameraSetup!: () => void
    state.setUpCameraFeed.mockReturnValueOnce(new Promise<void>(resolve => finishCameraSetup = resolve))

    const { start, stop, state: scannerState } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData: vi.fn(),
      onError: vi.fn(),
      cameraFeedContainer: ref(document.createElement('div')),
    })

    const operations = [start(), stop(), start()]
    finishCameraSetup()
    await Promise.all(operations)

    expect(state.interval.pause).toHaveBeenCalledTimes(1)
    expect(state.interval.resume).toHaveBeenCalledTimes(1)
    expect(scannerState.value).toBe('scanning')
  })

  it('does not stop the next scanner\'s native camera when a closed scanner finishes starting late', async () => {
    state.device.isWeb = false
    let finishCameraSetup!: () => void
    state.setUpCameraFeed.mockReturnValueOnce(new Promise<void>(resolve => finishCameraSetup = resolve))
    const options = {
      expect: 'paymentRequest' as any,
      onData: vi.fn(),
      onError: vi.fn(),
      cameraFeedContainer: ref(document.createElement('div')),
    }
    const closed = useQRScanner(options)
    const next = useQRScanner(options)

    const operations = [closed.start(), closed.stop(), next.start()]
    finishCameraSetup()
    await Promise.all(operations)

    const [firstStart, secondStart] = state.cameraPreview.start.mock.invocationCallOrder
    const [stop] = state.cameraPreview.stop.mock.invocationCallOrder
    expect(state.cameraPreview.stop).toHaveBeenCalledTimes(1)
    expect(firstStart).toBeLessThan(stop)
    expect(stop).toBeLessThan(secondStart)
    expect(next.state.value).toBe('scanning')
  })

  it('scans frames on mobile when the camera was already started by a previous session', async () => {
    state.device.isWeb = false
    state.cameraPreview.start.mockRejectedValue(new Error('camera already started'))
    state.cameraPreview.captureSample.mockRejectedValue(new Error('no frame'))

    const { start } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData: vi.fn(),
      onError: vi.fn(),
      cameraFeedContainer: ref(document.createElement('div')),
    })
    await start()
    await state.interval.callback!()

    expect(state.cameraPreview.captureSample).toHaveBeenCalledTimes(1)
  })

  it('releases the camera when start() fails after the camera feed was set up', async () => {
    vi.mocked(ready).mockRejectedValueOnce(new Error('model download failed'))

    const { start, state: scannerState } = useQRScanner({
      expect: 'paymentRequest' as any,
      onData: vi.fn(),
      onError: vi.fn(),
      cameraFeedContainer: ref(document.createElement('div')),
    })

    await expect(start()).rejects.toThrow('model download failed')
    expect(state.tearDownCameraFeed).toHaveBeenCalledTimes(1)
    expect(scannerState.value).toBe('idle')
  })
})
