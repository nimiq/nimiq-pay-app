import { reactive } from 'vue'
import { modalController } from '@ionic/vue'
import { getNotifiedStep, nimAddressDisplay, nimAddressInputStep, nimWithdrawalSelectionStep, onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3, onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4, onBoardingPoints, paymentPreviewStep, phoneNumberConfirmStep, phoneNumberStep, pinCodeConfirmStep, pinCodeStep, promoCodeStep, qrCodeScannerStep, recoveryWordsStep, transactionDetail, transactionList } from './steps'
import { QRScannerDataFormat } from '@/composables/useQRScanner'
import { Modal, useModal } from '@/composables/useModal'
import type { Flow, FlowInit, State } from '@/lib/flows/steps.types'
import { FlowName, inputSteps } from '@/lib/flows/steps.types'

import FlowCmp from '@/components/Flow.vue'

const emptyState = () => reactive(Object.fromEntries(inputSteps.map(s => [s, undefined])) as unknown as State)

const loginFlow: FlowInit = () => ({
  name: FlowName.Login,
  state: emptyState(),
  steps: [recoveryWordsStep(), pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()],
  canGoBack: true,
})

const setupFlow: FlowInit = ({ closeFn }) => ({
  name: FlowName.Setup,
  state: emptyState(),
  steps: [pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()],
  onDone: async (state, { goTo }) => {
    const err = await (await import('@/composables/useDecrypt')).useDecrypt().decrypt(state.pinCode!)
    if (err)
      console.error(err)

    goTo('/app')
    closeFn()
  },
})

const verifyPhoneFlow: FlowInit = () => ({
  name: FlowName.VerifyPhone,
  state: emptyState(),
  steps: [phoneNumberStep(), phoneNumberConfirmStep(), onBoardingPoints()],
  onDone: async () => useModal().showModal(Modal.Points),
})

const setupWithPromoCodeFlow: FlowInit = () => ({
  name: FlowName.SetupWithPromoCode,
  state: emptyState(),
  steps: [promoCodeStep(), pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()],
})

const onBoardingPointsFlow: FlowInit = () => ({
  name: FlowName.OnBoardingPoints,
  state: emptyState(),
  steps: [onBoardingPoints()],
})

const onBoardingCashbackFlow: FlowInit = () => ({
  name: FlowName.OnBoardingCashback,
  state: emptyState(),
  steps: [onBoardingCashback1(), onBoardingCashback2(), onBoardingCashback3(), onBoardingCashback4()],
})

const onBoardingBluecodeFlow: FlowInit = () => ({
  name: FlowName.OnBoardingBluecode,
  state: emptyState(),
  steps: [onBoardingBluecode1(), onBoardingBluecode2(), onBoardingBluecode3()],
})

const nimOrPointsPaymentFlow: FlowInit = () => ({
  name: FlowName.NimOrPointsPayment,
  state: emptyState(),
  steps: [qrCodeScannerStep({ props: { expect: QRScannerDataFormat.PaymentRequest } }), paymentPreviewStep()],
})

const nimWithdrawFlow: FlowInit = () => ({
  name: FlowName.NimWithdraw,
  state: emptyState(),
  steps: [nimWithdrawalSelectionStep(), nimAddressInputStep(), qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimiqAddress } })],
})

const nimTopUpFlow: FlowInit = () => ({
  name: FlowName.NimTopUp,
  state: emptyState(),
  steps: [nimAddressDisplay(), qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimCashlink } })],
})

const viewTransactionsFlow: FlowInit = () => ({
  name: FlowName.ViewTransactions,
  state: emptyState(),
  steps: [transactionList(), transactionDetail()],
})

const viewTransactionDetailFlow: FlowInit = () => ({
  name: FlowName.ViewTransactionDetail,
  state: emptyState(),
  steps: [transactionDetail()],
})

const flows = {
  [FlowName.Login]: loginFlow,
  [FlowName.Setup]: setupFlow,
  [FlowName.VerifyPhone]: verifyPhoneFlow,
  [FlowName.SetupWithPromoCode]: setupWithPromoCodeFlow,
  [FlowName.OnBoardingPoints]: onBoardingPointsFlow,
  [FlowName.OnBoardingCashback]: onBoardingCashbackFlow,
  [FlowName.OnBoardingBluecode]: onBoardingBluecodeFlow,
  [FlowName.NimOrPointsPayment]: nimOrPointsPaymentFlow,
  [FlowName.NimWithdraw]: nimWithdrawFlow,
  [FlowName.NimTopUp]: nimTopUpFlow,
  [FlowName.ViewTransactions]: viewTransactionsFlow,
  [FlowName.ViewTransactionDetail]: viewTransactionDetailFlow,
}

/**
 * It initializes the flow give the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export async function initializeFlow(name: FlowName, initialState?: Partial<State>) {
  const isFullscreen = false

  // Close the modal
  const closeFn = () => modalController.getTop().then(m => m.dismiss())

  const defaultHooks: Pick<Flow, 'onDone' | 'onCancel'> = { onDone: closeFn, onCancel: closeFn }

  // Initialize all the steps to undefined
  const flow = { ...defaultHooks, ...flows[name]({ initialState, closeFn }) }
  await flow.steps.at(0)?.beforeDisplay?.(flow.state)

  modalController.create({
    component: FlowCmp,
    handle: false,
    canDismiss: true,
    initialBreakpoint: isFullscreen ? undefined : 1,
    breakpoints: isFullscreen ? undefined : [0, 1],
    componentProps: { flow },
  }).then(modal => modal.present())
}

export async function cancelFlow(beforeCancel: () => Promise<void>) {
  await beforeCancel()
}
