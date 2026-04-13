import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { FlowName, StepName } from './steps.types'

const state = vi.hoisted(() => ({
  closeModal: vi.fn(async () => {}),
  create: vi.fn(async () => ({
    style: { setProperty: vi.fn() },
    present: vi.fn(async () => {}),
    dismiss: vi.fn(async () => {}),
  })),
  primeTransferFee: vi.fn(() => new Promise(() => {})),
  primeHtlcFee: vi.fn(() => new Promise(() => {})),
  isNimiqAsset: false,
}))

vi.mock('@ionic/vue', () => ({
  modalController: {
    create: state.create,
  },
  SumsubSdkStatus: {},
}))

vi.mock('@/components/Flow.vue', () => ({
  default: defineComponent({
    template: '<div />',
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    log: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/composables/useModal', () => ({
  useModal: () => ({
    closeModal: state.closeModal,
  }),
  Modal: {},
}))

vi.mock('@/composables/useStringParser', () => ({
  QRDataFormat: {
    PaymentRequest: 'payment-request',
  },
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    isNimiqAsset: state.isNimiqAsset,
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    primeTransferFee: state.primeTransferFee,
    primeHtlcFee: state.primeHtlcFee,
  }),
}))

vi.mock('@/lib', () => ({
  isNakaEnabled: false,
}))

vi.mock('./steps', () => {
  const step = {
    step: StepName.QRCodeScanner,
    main: defineComponent({
      template: '<div />',
    }),
  }

  return {
    qrCodeScannerStep: vi.fn(async () => step),
    paymentRequestManualInputStep: vi.fn(async () => step),
    paymentPreviewStep: vi.fn(async () => step),
    pinCodeStep: vi.fn(async () => step),
    holdNakaCardToReaderStep: vi.fn(async () => step),
    bluecodeNotAvailableStep: vi.fn(async () => step),
    paymentAmountInputStep: vi.fn(async () => step),
  }
})

describe('initializeFlow payment prewarm', () => {
  beforeEach(() => {
    vi.resetModules()
    state.closeModal.mockClear()
    state.create.mockClear()
    state.primeTransferFee.mockClear()
    state.primeHtlcFee.mockClear()
    state.isNimiqAsset = false
  })

  it('warms the Polygon transfer fee snapshot without blocking payment flow initialization for USDT', async () => {
    const { initializeFlow } = await import('./index')

    await expect(initializeFlow(FlowName.Payment)).resolves.toBeTruthy()

    expect(state.closeModal).toHaveBeenCalledTimes(1)
    expect(state.primeTransferFee).toHaveBeenCalledTimes(1)
    expect(state.primeHtlcFee).toHaveBeenCalledTimes(1)
    expect(state.create).toHaveBeenCalledTimes(1)
  })
})
