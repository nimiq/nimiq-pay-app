import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { Asset } from '@/lib/assets'
import { PaymentMethod, Transfer } from '@/types/transactions'
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
  polygonSendPayment: vi.fn(),
  isNimiqAsset: false,
  activeAsset: 'NIM',
  trackFeatureOpened: vi.fn(),
  trackWalletCreated: vi.fn(),
  trackWalletImported: vi.fn(),
  routerReplace: vi.fn(async () => {}),
  decrypt: vi.fn(async () => undefined),
  phoneNumberVerified: false,
  showModal: vi.fn(async () => {}),
  clearPinInputTs: vi.fn(),
  updatePinInputTs: vi.fn(),
  setEntropy: vi.fn(async () => {}),
  sendTx: vi.fn(),
  confirmNakaPayment: vi.fn(async () => ({})),
  setToast: vi.fn(),
  trackPaymentCompleted: vi.fn(),
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
    showModal: state.showModal,
  }),
  Modal: {},
}))

vi.mock('@/composables/useStringParser', () => ({
  QRDataFormat: {
    PaymentRequest: 'payment-request',
  },
}))

vi.mock('@/composables/useDecrypt', () => ({
  useDecrypt: () => ({
    decrypt: state.decrypt,
    clearPinInputTs: state.clearPinInputTs,
  }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    isNimiqAsset: state.isNimiqAsset,
    activeAsset: state.activeAsset,
    phoneNumberVerified: state.phoneNumberVerified,
    clearPinInputTs: state.clearPinInputTs,
    updatePinInputTs: state.updatePinInputTs,
    setEntropy: state.setEntropy,
    entropy: '',
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    primeTransferFee: state.primeTransferFee,
    primeHtlcFee: state.primeHtlcFee,
    sendPayment: state.polygonSendPayment,
  }),
}))

vi.mock('@/lib', () => ({
  isNakaEnabled: true,
}))

vi.mock('@/stores/naka', () => ({
  useNaka: () => ({ isCardActive: true, isCardLocked: false }),
}))

vi.mock('@/stores/transactions', () => ({
  useTransactions: () => ({ sendTx: state.sendTx }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ setToast: state.setToast }),
}))

vi.mock('@/lib/analytics', () => ({
  buildPaymentAnalyticsProps: vi.fn(() => ({})),
  finishPaymentAnalytics: vi.fn(analyticsState => analyticsState),
  trackPaymentCancelled: vi.fn(),
  trackPaymentCompleted: state.trackPaymentCompleted,
  trackPaymentFailed: vi.fn(),
  trackFeatureOpened: state.trackFeatureOpened,
  trackWalletCreated: state.trackWalletCreated,
  trackWalletImported: state.trackWalletImported,
}))

vi.mock('@/router', () => ({
  default: {
    replace: state.routerReplace,
  },
}))

vi.mock('./steps', () => {
  const step = {
    step: StepName.QRCodeScanner,
    main: defineComponent({
      template: '<div />',
    }),
  }

  return {
    recoveryWordsStep: vi.fn(async () => step),
    qrCodeScannerStep: vi.fn(async () => step),
    paymentRequestManualInputStep: vi.fn(async () => step),
    paymentPreviewStep: vi.fn(async () => step),
    pinCodeStep: vi.fn(async () => step),
    pinCodeConfirmStep: vi.fn(async () => step),
    enableBiometricStep: vi.fn(async () => step),
    getNotifiedStep: vi.fn(async () => step),
    promoCodeStep: vi.fn(async () => step),
    phoneNumberStep: vi.fn(async () => step),
    phoneNumberConfirmStep: vi.fn(async () => step),
    holdNakaCardToReaderStep: vi.fn(async () => step),
    bluecodeNotAvailableStep: vi.fn(async () => step),
    paymentAmountInputStep: vi.fn(async () => step),
    nimWithdrawalAmountSelectionStep: vi.fn(async () => step),
    nimWithdrawalConfirmStep: vi.fn(async () => step),
  }
})

interface CapturedFlow {
  onDone: (result: Record<string, unknown>, context: { err: ReturnType<typeof vi.fn>, setToast: ReturnType<typeof vi.fn> }) => Promise<void> | void
}

function getLastCreatedFlow(): CapturedFlow {
  const lastCall = (state.create.mock.calls as unknown[][]).at(-1)
  const config = lastCall?.[0] as { component: () => { props?: { flow?: CapturedFlow } } | undefined } | undefined
  const flow = config?.component()?.props?.flow

  if (!flow) {
    throw new Error('No flow captured')
  }

  return flow
}

describe('initializeFlow analytics and setup hooks', () => {
  beforeEach(() => {
    vi.resetModules()
    state.closeModal.mockClear()
    state.create.mockClear()
    state.primeTransferFee.mockClear()
    state.primeHtlcFee.mockClear()
    state.isNimiqAsset = false
    state.activeAsset = 'NIM'
    state.trackFeatureOpened.mockClear()
    state.trackWalletCreated.mockClear()
    state.trackWalletImported.mockClear()
    state.routerReplace.mockClear()
    state.decrypt.mockClear()
    state.phoneNumberVerified = false
    state.showModal.mockClear()
    state.sendTx.mockReset()
    state.sendTx.mockResolvedValue({ outcome: 'submitted', tx: { hash: 'payment-hash' }, serialized: 'serialized-payment' })
    state.polygonSendPayment.mockReset()
    state.polygonSendPayment.mockResolvedValue({ outcome: 'submitted', data: { tx: { hash: 'polygon-payment' }, serialized: 'polygon-payment' } })
    state.confirmNakaPayment.mockClear()
    state.setToast.mockClear()
    state.trackPaymentCompleted.mockClear()
  })

  it('warms the Polygon transfer fee snapshot without blocking payment flow initialization for USDT', async () => {
    const { initializeFlow } = await import('./index')

    await expect(initializeFlow(FlowName.Payment)).resolves.toBeTruthy()

    expect(state.closeModal).toHaveBeenCalledTimes(1)
    expect(state.primeTransferFee).toHaveBeenCalledTimes(1)
    expect(state.primeHtlcFee).toHaveBeenCalledTimes(1)
    expect(state.create).toHaveBeenCalledTimes(1)
  })

  it('tracks feature_opened for mapped flows when an analytics source is provided', async () => {
    const { initializeFlow } = await import('./index')

    await initializeFlow(FlowName.Payment, { analyticsSource: 'footer_pay_button' })

    expect(state.trackFeatureOpened).toHaveBeenCalledWith({
      featureName: 'pay',
      source: 'footer_pay_button',
      channel: 'flow',
      activeAsset: 'NIM',
    })
  })

  it('does not track feature_opened for unmapped flows', async () => {
    const { initializeFlow } = await import('./index')

    await initializeFlow(FlowName.Login, { analyticsSource: 'setup_entry' })

    expect(state.trackFeatureOpened).not.toHaveBeenCalled()
  })

  it('tracks wallet_created after successful setup completion', async () => {
    const { initializeFlow } = await import('./index')

    await initializeFlow(FlowName.Setup)
    const flow = getLastCreatedFlow()

    await flow.onDone({ [StepName.PinCode]: '1234' }, { err: vi.fn(), setToast: vi.fn() })

    expect(state.routerReplace).toHaveBeenCalledWith('/app')
    expect(state.trackWalletCreated).toHaveBeenCalledWith({
      entryMethod: 'create',
      hasReferralCode: false,
    })
  })

  it('tracks wallet_created for promo-code setup completion', async () => {
    const { initializeFlow } = await import('./index')

    await initializeFlow(FlowName.SetupWithPromoCode)
    const flow = getLastCreatedFlow()

    await flow.onDone({ [StepName.PinCode]: '1234' }, { err: vi.fn(), setToast: vi.fn() })

    expect(state.trackWalletCreated).toHaveBeenCalledWith({
      entryMethod: 'create_with_promo_code',
      hasReferralCode: true,
    })
  })

  it('tracks wallet_imported after successful login completion', async () => {
    const { initializeFlow } = await import('./index')

    await initializeFlow(FlowName.Login)
    const flow = getLastCreatedFlow()

    await flow.onDone({ [StepName.PinCode]: '1234' }, { err: vi.fn(), setToast: vi.fn() })

    expect(state.routerReplace).toHaveBeenCalledWith('/app')
    expect(state.trackWalletImported).toHaveBeenCalled()
    expect(state.routerReplace.mock.invocationCallOrder[0]).toBeLessThan(state.trackWalletImported.mock.invocationCallOrder[0])
  })

  it('does not confirm an uncertain Naka payment when final serialization is available', async () => {
    state.isNimiqAsset = true
    state.sendTx.mockResolvedValue({
      outcome: 'unknown',
      stagedTx: { hash: 'staged-payment' },
      stagedHash: 'staged-payment',
      serialized: 'serialized-uncertain-payment',
      error: 'response lost',
    })
    const { initializeFlow } = await import('./index')
    await initializeFlow(FlowName.Payment)
    const flow = getLastCreatedFlow()

    await flow.onDone({
      [StepName.HoldNakaCardToReader]: {
        request: {
          transfer: Transfer.UserPaymentToMerchant,
          recipient: 'NQ22 MERCHANT',
          amount: 10,
          paymentMethod: PaymentMethod.NakaCard,
        },
        confirmPayment: state.confirmNakaPayment,
      },
      [StepName.PaymentPreview]: {
        payWithPuntos: false,
        paymentAnalytics: { startedAt: 1, status: 'started' },
      },
    }, { err: vi.fn(), setToast: vi.fn() })

    expect(state.confirmNakaPayment).not.toHaveBeenCalled()
    expect(state.trackPaymentCompleted).not.toHaveBeenCalled()
    expect(state.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Do not retry'),
    }))
  })

  it('does not confirm or complete an uncertain Naka payment without final serialization', async () => {
    state.isNimiqAsset = true
    state.sendTx.mockResolvedValue({
      outcome: 'unknown',
      stagedTx: { hash: 'staged-payment' },
      stagedHash: 'staged-payment',
      error: 'response lost',
    })
    const { initializeFlow } = await import('./index')
    await initializeFlow(FlowName.Payment)
    const flow = getLastCreatedFlow()

    await flow.onDone({
      [StepName.HoldNakaCardToReader]: {
        request: {
          transfer: Transfer.UserPaymentToMerchant,
          recipient: 'NQ22 MERCHANT',
          amount: 10,
          paymentMethod: PaymentMethod.NakaCard,
        },
        confirmPayment: state.confirmNakaPayment,
      },
      [StepName.PaymentPreview]: {
        payWithPuntos: false,
        paymentAnalytics: { startedAt: 1, status: 'started' },
      },
    }, { err: vi.fn(), setToast: vi.fn() })

    expect(state.confirmNakaPayment).not.toHaveBeenCalled()
    expect(state.trackPaymentCompleted).not.toHaveBeenCalled()
    expect(state.setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Do not retry'),
    }))
    expect(state.sendTx).toHaveBeenCalledTimes(1)
  })

  it('does not report an uncertain withdrawal as failed or successful', async () => {
    state.isNimiqAsset = true
    state.sendTx.mockResolvedValue({
      outcome: 'unknown',
      stagedTx: { hash: 'staged-withdrawal' },
      stagedHash: 'staged-withdrawal',
      error: 'response lost',
    })
    const { initializeFlow } = await import('./index')
    await initializeFlow(FlowName.NimWithdraw)
    const flow = getLastCreatedFlow()
    const err = vi.fn()
    const setToast = vi.fn()

    await flow.onDone({
      [StepName.NimWithdrawalAmountSelectionStep]: {
        amount: 10,
        recipient: 'NQ22 RECIPIENT',
      },
    }, { err, setToast })

    expect(err).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Do not retry'),
    }))
    expect(setToast).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Withdrawal successful' }))
  })

  it('does not complete or fail an uncertain Polygon payment', async () => {
    state.activeAsset = Asset.USDT
    state.polygonSendPayment.mockResolvedValue({
      outcome: 'unknown',
      error: 'The transaction may have been sent and is still pending. Do not retry.',
    })
    const { initializeFlow } = await import('./index')
    await initializeFlow(FlowName.Payment)
    const flow = getLastCreatedFlow()
    const err = vi.fn()

    await flow.onDone({
      [StepName.QRCodeScanner]: {
        asset: Asset.USDT,
        transfer: Transfer.UserPaymentToMerchant,
        recipient: '0x00000000000000000000000000000000000000AA',
        amount: 1_000_000,
        merchantName: 'Coffee Shop',
      },
      [StepName.PaymentPreview]: {
        payWithPuntos: false,
        paymentAnalytics: { startedAt: 1, status: 'started' },
      },
    }, { err, setToast: vi.fn() })

    expect(err).not.toHaveBeenCalled()
    expect(state.setToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Do not retry') }))
    expect(state.trackPaymentCompleted).not.toHaveBeenCalled()
  })

  it('does not report an uncertain Polygon withdrawal as failed or successful', async () => {
    state.polygonSendPayment.mockResolvedValue({
      outcome: 'unknown',
      error: 'The transaction may have been sent and is still pending. Do not retry.',
    })
    const { initializeFlow } = await import('./index')
    await initializeFlow(FlowName.NimWithdraw)
    const flow = getLastCreatedFlow()
    const err = vi.fn()
    const setToast = vi.fn()

    await flow.onDone({
      [StepName.NimWithdrawalAmountSelectionStep]: {
        amount: 10,
        recipient: '0x00000000000000000000000000000000000000AA',
      },
    }, { err, setToast })

    expect(err).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Do not retry') }))
    expect(setToast).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Withdrawal successful' }))
  })
})
