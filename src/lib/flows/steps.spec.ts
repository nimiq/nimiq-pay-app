import type { State, StepCallbacks } from './steps.types'
import { describe, expect, it, vi } from 'vitest'
import { QRDataFormat } from '@/composables/useStringParser'
import { paymentRequestManualInputStep, qrCodeScannerStep } from './steps'
import { FlowName, StepName } from './steps.types'

vi.mock('@/stores/app', () => ({
  useApp: vi.fn(),
}))

vi.mock('@/composables/useStringParser', () => ({
  QRDataFormat: {
    NimiqAddress: 'nimiqAddress',
    AssetAddress: 'assetAddress',
    PaymentRequest: 'paymentRequest',
    NimCashlink: 'nimCashlink',
  },
}))

describe('qrCodeScannerStep', () => {
  it('finalizes the top-up flow after scanning a Cashlink', async () => {
    const callbacks = {
      navigateTo: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      err: vi.fn(),
      finalizeFlow: vi.fn(async () => {}),
    } satisfies StepCallbacks
    const step = await qrCodeScannerStep({
      flowName: FlowName.NimTopUp,
      props: { expect: QRDataFormat.NimCashlink },
    })

    await step.beforeNext?.({} as State, callbacks)

    expect(callbacks.finalizeFlow).toHaveBeenCalledOnce()
    expect(callbacks.navigateTo).not.toHaveBeenCalled()
    expect(callbacks.next).not.toHaveBeenCalled()
    expect(callbacks.prev).not.toHaveBeenCalled()
  })
})

describe('paymentRequestManualInputStep', () => {
  it('sends a fixed-amount request to the preview, not the amount input', async () => {
    const callbacks = {
      navigateTo: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      err: vi.fn(),
      finalizeFlow: vi.fn(async () => {}),
    } satisfies StepCallbacks
    const step = await paymentRequestManualInputStep({ flowName: FlowName.Payment })
    const state = { paymentRequestManualInput: { amount: 100_000 } } as State

    await step.beforeNext?.(state, callbacks)

    expect(callbacks.navigateTo).toHaveBeenCalledExactlyOnceWith({ step: StepName.PaymentPreview })
    expect(callbacks.next).not.toHaveBeenCalled()
    expect(state.qrCodeScanner).toBe(state.paymentRequestManualInput)
  })
})
