import { reactive } from 'vue'
import { modalController } from '@ionic/vue'
import { QRScannerDataFormat } from '../useQRScanner'
import { getNotifiedStep, nimAddressDisplay, nimAddressInputStep, nimWithdrawalSelectionStep, onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3, onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4, onBoardingPoints, paymentPreviewStep, phoneNumberConfirmStep, phoneNumberStep, pinCodeConfirmStep, pinCodeStep, promoCodeStep, qrCodeScannerStep, recoveryWordsStep, transactionDetail, transactionList } from './steps'
import { Modal, useModal } from '@/composables/useModal'
import type { FlowInit, State } from '@/types/steps'
import { FlowName, inputSteps } from '@/types/steps'

import FlowCmp from '@/components/Flow.vue'

export const closeModal = () => modalController.getTop().then(m => m.dismiss())

const emptyState = () => reactive(Object.fromEntries(inputSteps.map(s => [s, undefined])) as unknown as State)

const loginFlow: FlowInit = () => ({
  name: FlowName.Login,
  state: emptyState(),
  steps: [recoveryWordsStep(), pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()],
  onDone: async state => console.log(state.pinCode),
  canGoBack: true,
})

const setupFlow: FlowInit = () => ({
  name: FlowName.Setup,
  state: emptyState(),
  steps: [pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()],
  onDone: async (state, { goTo }) => {
    const err = await (await import('@/composables/useDecrypt')).useDecrypt().decrypt(state.pinCode!)
    if (err)
      console.error(err)

    goTo('/app')
    closeModal()
  },
  canGoBack: true,
})

const verifyPhoneFlow: FlowInit = () => ({
  name: FlowName.VerifyPhone,
  state: emptyState(),
  steps: [phoneNumberStep(), phoneNumberConfirmStep(), onBoardingPoints()],
  onDone: async (_state) => {
    console.log('Verify phone done')
    useModal().showModal(Modal.Points)
  },
  canGoBack: true,
})

const setupWithPromoCodeFlow: FlowInit = () => ({
  name: FlowName.SetupWithPromoCode,
  state: emptyState(),
  steps: [promoCodeStep(), pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()],
  onDone: closeModal,
  canGoBack: true,
})

const onBoardingPointsFlow: FlowInit = () => ({
  name: FlowName.OnBoardingPoints,
  state: emptyState(),
  steps: [onBoardingPoints()],
  onDone: closeModal,
  canGoBack: true,
})

const onBoardingCashbackFlow: FlowInit = () => ({
  name: FlowName.OnBoardingCashback,
  state: emptyState(),
  steps: [onBoardingCashback1(), onBoardingCashback2(), onBoardingCashback3(), onBoardingCashback4()],
  onDone: closeModal,
  canGoBack: true,
})

const onBoardingBluecodeFlow: FlowInit = () => ({
  name: FlowName.OnBoardingBluecode,
  state: emptyState(),
  steps: [onBoardingBluecode1(), onBoardingBluecode2(), onBoardingBluecode3()],
  onDone: closeModal,
  canGoBack: true,
})

const nimOrPointsPaymentFlow: FlowInit = () => ({
  name: FlowName.NimOrPointsPayment,
  state: emptyState(),
  steps: [qrCodeScannerStep({ props: { expect: QRScannerDataFormat.PaymentRequest } }), paymentPreviewStep()],
  onDone: closeModal,
  canGoBack: true,
})

const nimWithdrawFlow: FlowInit = () => ({
  name: FlowName.NimWithdraw,
  state: emptyState(),
  steps: [nimWithdrawalSelectionStep(), nimAddressInputStep(), qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimiqAddress } })],
  onDone: closeModal,
  canGoBack: true,
})

const nimTopUpFlow: FlowInit = () => ({
  name: FlowName.NimTopUp,
  state: emptyState(),
  steps: [nimAddressDisplay(), qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimCashlink } })],
  onDone: closeModal,
  canGoBack: true,
})

const viewTransactionsFlow: FlowInit = () => ({
  name: FlowName.ViewTransactions,
  state: emptyState(),
  steps: [transactionList(), transactionDetail()],
  onDone: closeModal,
  canGoBack: true,
})

const viewTransactionDetailFlow: FlowInit = () => ({
  name: FlowName.ViewTransactionDetail,
  state: emptyState(),
  steps: [transactionDetail()],
  onDone: closeModal,
  canGoBack: true,
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

  // Initialize all the steps to undefined
  const flow = flows[name]({ initialState })
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
  closeModal()
}
