import { reactive, ref } from 'vue'
import { modalController } from '@ionic/vue'
import { QRDataFormat } from '../../composables/useStringParser'
import { getNotifiedStep, nimAddressDisplay, nimAddressInputStep, nimWithdrawalSelectionStep, onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3, onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4, onBoardingPoints, paymentPreviewStep, phoneNumberConfirmStep, phoneNumberStep, pinCodeConfirmStep, pinCodeStep, promoCodeStep, qrCodeScannerStep, recoveryWordsStep, transactionDetail, transactionList } from './steps'
import { Modal, useModal } from '@/composables/useModal'
import type { Flow, FlowInit, State } from '@/lib/flows/steps.types'
import { FlowName, inputSteps } from '@/lib/flows/steps.types'

import FlowCmp from '@/components/Flow.vue'

const emptyState = () => reactive(Object.fromEntries(inputSteps.map(s => [s, undefined])) as unknown as State)

const loginFlow: FlowInit = async ({ closeFn }) => ({
  name: FlowName.Login,
  state: emptyState(),
  steps: await Promise.all([recoveryWordsStep(), pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()]),
  canGoBack: true,
  onDone: async (state, { goTo }) => {
    const err = await (await import('@/composables/useDecrypt')).useDecrypt().decrypt(state.pinCode!)
    if (err)
      console.error(err)

    goTo('/app')
    closeFn()
    useModal().showModal(Modal.Points)
  },
  onCancel: async (state, { goTo }) => {
    if (state.pinCode)
      goTo('/app')

    closeFn()
  },
})

const setupFlow: FlowInit = async ({ closeFn }) => ({
  name: FlowName.Setup,
  state: emptyState(),
  steps: await Promise.all([pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()]),
  onDone: async (state, { goTo }) => {
    const err = await (await import('@/composables/useDecrypt')).useDecrypt().decrypt(state.pinCode!)
    if (err)
      console.error(err)

    goTo('/app')
    closeFn()
    const { phoneNumberVerified } = await (await import('@/stores/app')).useApp()
    if (phoneNumberVerified) { useModal().showModal(Modal.Points) }
    else {
      await useModal().closeModal()
      initializeFlow(FlowName.VerifyPhone)
    }
  },
  onCancel: async (state, { goTo }) => {
    if (state.pinCode)
      goTo('/app')

    closeFn()
  },
})

const verifyPhoneFlow: FlowInit = async () => ({
  name: FlowName.VerifyPhone,
  state: emptyState(),
  steps: await Promise.all([phoneNumberStep(), phoneNumberConfirmStep(), onBoardingPoints()]),
  onDone: async () => useModal().showModal(Modal.Points),
})

const setupWithPromoCodeFlow: FlowInit = async () => ({
  name: FlowName.SetupWithPromoCode,
  state: emptyState(),
  steps: await Promise.all([promoCodeStep(), pinCodeStep(), pinCodeConfirmStep(), phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep(), getNotifiedStep(), onBoardingPoints()]),
})

const onBoardingPointsFlow: FlowInit = async () => ({
  name: FlowName.OnBoardingPoints,
  state: emptyState(),
  steps: await Promise.all([onBoardingPoints()]),
  onDone: async () => {
    const { phoneNumberVerified } = await (await import('@/stores/app')).useApp()
    if (phoneNumberVerified) { useModal().showModal(Modal.Points) }
    else {
      await useModal().closeModal()
      initializeFlow(FlowName.VerifyPhone)
    }
  },
})

const onBoardingCashbackFlow: FlowInit = async () => ({
  name: FlowName.OnBoardingCashback,
  state: emptyState(),
  steps: await Promise.all([onBoardingCashback1(), onBoardingCashback2(), onBoardingCashback3(), onBoardingCashback4()]),
})

const onBoardingBluecodeFlow: FlowInit = async () => ({
  name: FlowName.OnBoardingBluecode,
  state: emptyState(),
  steps: await Promise.all([onBoardingBluecode1(), onBoardingBluecode2(), onBoardingBluecode3()]),
})

const nimOrPointsPaymentFlow: FlowInit = async () => ({
  name: FlowName.NimOrPointsPayment,
  state: emptyState(),
  steps: await Promise.all([qrCodeScannerStep({ props: { expect: QRDataFormat.PaymentRequest } }), paymentPreviewStep()]),
})

const nimWithdrawFlow: FlowInit = async () => ({
  name: FlowName.NimWithdraw,
  state: emptyState(),
  steps: await Promise.all([nimWithdrawalSelectionStep(), nimAddressInputStep(), qrCodeScannerStep({ props: { expect: QRDataFormat.NimiqAddress } })]),
})

const nimTopUpFlow: FlowInit = async () => ({
  name: FlowName.NimTopUp,
  state: emptyState(),
  steps: await Promise.all([nimAddressDisplay(), qrCodeScannerStep({ props: { expect: QRDataFormat.NimCashlink } })]),
})

const viewTransactionsFlow: FlowInit = async () => ({
  name: FlowName.ViewTransactions,
  state: emptyState(),
  steps: await Promise.all([transactionList(), transactionDetail()]),
})

const viewTransactionDetailFlow: FlowInit = async ({ initialState }) => ({
  name: FlowName.ViewTransactionDetail,
  state: { ...emptyState(), ...initialState },
  steps: await Promise.all([transactionDetail()]),
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
 * It initializes the flow given the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export async function initializeFlow(name: FlowName, initialState?: Partial<State>) {
  const isFullscreen = false

  // Close the modal
  const closeFn = () => modalController.getTop().then(m => m.dismiss())

  const activeStepIndex = ref(0)
  const defaultInitialFlowValues: Pick<Flow, 'onDone' | 'onCancel' | 'activeStepIndex'> = { onDone: closeFn, onCancel: closeFn, activeStepIndex }

  const flowConfig = await flows[name]({ initialState, closeFn })
  const flow: Flow = { ...defaultInitialFlowValues, ...flowConfig }

  // eslint-disable-next-line no-console
  console.log(`🌊 Initializing flow ${name}`, flow)

  await flow.steps.at(0)?.beforeDisplay?.(flow.state)

  modalController.create({
    component: FlowCmp,
    handle: false,
    canDismiss: async () => {
      console.log('🌊 canDismiss', activeStepIndex.value, flow.steps.at(activeStepIndex.value)?.canDismiss)
      return flow.steps.at(activeStepIndex.value)?.canDismiss ?? true
    },
    initialBreakpoint: isFullscreen ? undefined : 1,
    breakpoints: isFullscreen ? undefined : [0, 1],
    componentProps: { flow },
  }).then(modal => modal.present())
}

export async function cancelFlow(beforeCancel: () => Promise<void>) {
  await beforeCancel()
}
