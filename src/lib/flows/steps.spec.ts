import type { State, StepCallbacks } from './steps.types'
import { describe, expect, it, vi } from 'vitest'
import { QRDataFormat } from '@/composables/useStringParser'
import { qrCodeScannerStep } from './steps'
import { FlowName } from './steps.types'

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
