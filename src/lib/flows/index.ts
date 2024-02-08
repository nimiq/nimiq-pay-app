import { h, ref } from 'vue'
import { modalController } from '@ionic/vue'
import { Modal, useModal } from '@/composables/useModal'
import { FlowName, StepName } from '@/lib/flows/steps.types'
import type { Flow, FlowInit, State, StepInitOptions } from '@/lib/flows/steps.types'

import FlowCmp from '@/components/Flow.vue'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'

const loginFlow: FlowInit = async () => {
  const { recoveryWordsStep, pinCodeStep, pinCodeConfirmStep, phoneNumberStep, phoneNumberConfirmStep, getNotifiedStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.Login
  const steps = await Promise.all([
    recoveryWordsStep,
    pinCodeStep,
    pinCodeConfirmStep,
    (options: StepInitOptions) => phoneNumberStep({ ...options, stepsToSkip: 2 }),
    phoneNumberConfirmStep,
    getNotifiedStep,
    onBoardingPoints,
  ].map(s => s({ flowName })))
  const onDone: Flow['onDone'] = async (state, { goTo, err }) => {
    const { useDecrypt } = await import('@/composables/useDecrypt')
    const error = await useDecrypt().decrypt(state[StepName.PinCode])
    if (error) {
      err(error)
      return
    }

    // Clear pin code from memory just in case
    // Since state is a JSON object, we take advantage of the fact that it's a reference
    state[StepName.PinCode] = ''

    goTo('/app')
    useModal().showModal(Modal.Points)
  }
  const onCancel: Flow['onCancel'] = async ({ goTo }) => {
    const { useApp } = await import('@/stores/app')
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await goTo('/app')
  }
  return { flowName, steps, onDone, onCancel }
}

const setupFlow: FlowInit = async () => {
  const { pinCodeStep, pinCodeConfirmStep, phoneNumberStep, phoneNumberConfirmStep, getNotifiedStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.Setup
  const steps = await Promise.all([pinCodeStep, pinCodeConfirmStep, (options: StepInitOptions) => phoneNumberStep({ ...options, stepsToSkip: 2 }), phoneNumberConfirmStep, getNotifiedStep, onBoardingPoints].map(s => s({ flowName })))
  const onDone: Flow['onDone'] = async (state, { goTo, err }) => {
    const [
      { useDecrypt },
      { useApp },
    ] = await Promise.all([import('@/composables/useDecrypt'), import('@/stores/app')])
    const error = await useDecrypt().decrypt(state[StepName.PinCode])
    if (error) {
      err(error)
      return
    }

    goTo('/app')
    const { phoneNumberVerified } = useApp()
    if (phoneNumberVerified)
      await useModal().showModal(Modal.Points)
    else
      await initializeFlow(FlowName.VerifyPhone)
  }
  const onCancel: Flow['onCancel'] = async ({ goTo }) => {
    const { useApp } = await import('@/stores/app')
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await goTo('/app')
  }
  return { flowName, steps, onDone, onCancel }
}

const verifyPhoneFlow: FlowInit = async () => {
  const { phoneNumberStep, phoneNumberConfirmStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.VerifyPhone
  const steps = await Promise.all([phoneNumberStep, phoneNumberConfirmStep, onBoardingPoints].map(s => s({ flowName })))
  const onDone: Flow['onDone'] = async () => useModal().showModal(Modal.Points)
  return { flowName, steps, onDone }
}

const setupWithPromoCodeFlow: FlowInit = async () => {
  const { promoCodeStep, pinCodeStep, pinCodeConfirmStep, phoneNumberStep, phoneNumberConfirmStep, getNotifiedStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.SetupWithPromoCode
  const steps = await Promise.all([
    promoCodeStep,
    pinCodeStep,
    pinCodeConfirmStep,
    (options: StepInitOptions) => phoneNumberStep({ ...options, stepsToSkip: 2 }),
    phoneNumberConfirmStep,
    getNotifiedStep,
    onBoardingPoints,
  ].map(s => s({ flowName })))
  const onCancel: Flow['onCancel'] = async ({ goTo }) => {
    const { useApp } = await import('@/stores/app')
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await goTo('/app')
  }
  return { flowName, steps, onCancel }
}

const onBoardingPointsFlow: FlowInit = async () => {
  const { onBoardingPoints } = await import('./steps')
  const flowName = FlowName.OnBoardingPoints
  const steps = [await onBoardingPoints({ flowName })]
  const onDone: Flow['onDone'] = async () => {
    const { useApp } = await import('@/stores/app')
    const { phoneNumberVerified } = useApp()
    if (phoneNumberVerified)
      useModal().showModal(Modal.Points)
    else
      await initializeFlow(FlowName.VerifyPhone)
  }
  return { flowName, steps, onDone }
}

const onBoardingCashbackFlow: FlowInit = async () => {
  const { onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4 } = await import('./steps')
  const flowName = FlowName.OnBoardingCashback
  const steps = (await Promise.all([onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4].map(s => s({ flowName }))))
  return { flowName, steps }
}

const onBoardingBluecodeFlow: FlowInit = async () => {
  const { onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3 } = await import('./steps')
  const flowName = FlowName.OnBoardingBluecode
  const steps = (await Promise.all([onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3].map(s => s({ flowName }))))
  return { flowName, steps }
}

const nimOrPointsPaymentFlow: FlowInit = async () => {
  const [
    { paymentPreviewStep, qrCodeScannerStep, pinCodeStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])

  const flowName = FlowName.NimOrPointsPayment
  const steps = (await Promise.all([
    (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.PaymentRequest } }),
    paymentPreviewStep,
    pinCodeStep,
  ].map(s => s({ flowName }))))

  const onDone: Flow['onDone'] = async (state, { err }) => {
    const { markAsUnknownTransactionTitle, PaymentMethod } = await import('@/types/transactions')

    const { [StepName.PaymentPreview]: method, [StepName.QRCodeScanner]: request } = state
    if (!request || typeof request === 'string')
      // No translation as not user-facing. Dev error which should not occur in production.
      throw new Error(`${flowName} flow expected a parsed payment request`)

    // eslint-disable-next-line no-console
    console.log(`🤑  Initializing payment process with ${method}`, request)

    if (method === PaymentMethod.NIM) {
      const { useTransactions } = await import('@/stores/transactions')
      const { error } = await useTransactions().sendTx({
        ...request,
        title: request.merchantName
          ? markAsUnknownTransactionTitle(request.merchantName)
          : 'Payment', // translated at display time
      }).catch(error => ({ error: i18n.t(
        'Transaction failed: {error}',
        { error: error instanceof Error ? error.message : String(error) },
      ) }))
      if (error)
        err(error)
    }
    else if (method === PaymentMethod.Points) {
      if (!request.rail || !request.paymentRef)
        // No translation as not user-facing. Dev error which should not occur in production.
        throw new Error(`You cannot pay with points without a rail nor paymentRef. Request: ${JSON.stringify(request)}`)

      const { usePoints } = await import('@/stores/points')
      const { error } = await usePoints().payWithPoints(request)
        .catch(error => ({ error: i18n.t(
          'Transaction failed: {error}',
          { error: error instanceof Error ? error.message : String(error) },
        ) }))
      if (error)
        err(error)
    }
  }
  const onCancel: Flow['onCancel'] = async () => {
    console.log('🤑  Cancelling payment process') // eslint-disable-line no-console
  }
  return { flowName, steps, onDone, onCancel }
}

const nimWithdrawFlow: FlowInit = async () => {
  const [
    { nimWithdrawalSelectionStep, nimAddressInputStep, qrCodeScannerStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.NimWithdraw
  const steps = (await Promise.all([nimWithdrawalSelectionStep, nimAddressInputStep, (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimiqAddress } })].map(s => s({ flowName }))))
  return { flowName, steps }
}

const nimTopUpFlow: FlowInit = async () => {
  const [
    { nimAddressDisplay, qrCodeScannerStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.NimTopUp
  const steps = (await Promise.all([nimAddressDisplay, (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimCashlink } })].map(s => s({ flowName }))))
  return { flowName, steps }
}

const viewTransactionsFlow: FlowInit = async () => {
  const { transactionList, transactionDetail } = await import('./steps')
  const flowName = FlowName.ViewTransactions
  const steps = (await Promise.all([transactionList, transactionDetail].map(s => s({ flowName }))))
  return { flowName, steps }
}

const viewTransactionDetailFlow: FlowInit = async () => {
  const { transactionDetail } = await import('./steps')
  const flowName = FlowName.ViewTransactions
  const steps = (await Promise.all([transactionDetail({ flowName })]))
  return { flowName, steps }
}

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
  // Close previous modal or flow, potentially invoking its cancel handler via canDismiss.
  await useModal().closeModal()

  const isFullscreen = false

  const flow = await flows[name]()

  // eslint-disable-next-line no-console
  console.log(`🌊 Initializing flow ${name}`, flow)

  const isClosing = ref(false)

  const modal = await modalController.create({
    // Pass a render function that includes props for FlowCmp, instead of FlowCmp as component and the component's props
    // via componentProps, to make the props reactive. Passing the props to componentProps as reactive() did not work.
    // isClosing could also be passed as ref, but having a ref as a prop instead of the actual value is not the typical
    // vue way of doing things.
    component: () => h(FlowCmp, { flow, initialState, isClosing: isClosing.value }),
    handle: false,

    /**
     * This function is called when the modal is about to be dismissed.
     * It can be triggered by the user or programmatically by a flow.
     *
     * At the moment, we don't prevent any modal of being dismissed, so
     * all the triggers will return true, closing the modal.
     */
    canDismiss: async (data?: { skipCancelHook: boolean }, role?) => {
      const wasAlreadyClosing = isClosing.value
      isClosing.value = true
      if (data?.skipCancelHook || wasAlreadyClosing)
        return true

      // eslint-disable-next-line no-console
      console.log('🌊 Dismissing flow', flow)
      const { default: router } = await import('@/router/index')
      await flow.onCancel?.({
        goTo: path => router.replace(path),
        err(errorMessage: string) {
          useToast().setToast({ message: errorMessage, error: true })
        },
      })
      if (role === 'gesture') {
        // Close modal immediately on swipe gesture, instead of waiting for snap-back animation to finish animating the
        // gesture back, see handleCanDismiss in ion-modal.js. We don't await modal.dismiss() here, to avoid a deadlock
        // if canDismiss itself was called by an outer modal.dismiss(), as dismiss includes a lock that only allows one
        // parallel execution, which would block this recursive call of modal.dismiss() to resolve, until the outer call
        // terminates.
        modal.dismiss()
      }
      return true
    },
    initialBreakpoint: isFullscreen ? undefined : 1,
    breakpoints: isFullscreen ? undefined : [0, 1],
  })
  await modal.present()
}

export async function closeModalSkippingFlowCancelHook() {
  const modal = await modalController.getTop()
  if (!modal)
    return
  await modal.dismiss({ skipCancelHook: true })
}
