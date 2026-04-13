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
}))

vi.mock('@capgo/camera-preview', () => ({
  CameraPreview: {},
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
    setUpCameraFeed: vi.fn(),
    tearDownCameraFeed: vi.fn(),
    hasPermission: ref(true),
  }),
}))

vi.mock('./useDevice', () => ({
  useDevice: () => ({
    isWeb: true,
  }),
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
})
