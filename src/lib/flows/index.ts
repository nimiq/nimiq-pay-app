import { reactive, ref } from 'vue'
import { modalController } from '@ionic/vue'
import { Modal, useModal } from '@/composables/useModal'
import { FlowName, StepName, inputSteps } from '@/lib/flows/steps.types'
import type { Flow, FlowInit, State, StepInitOptions } from '@/lib/flows/steps.types'

import FlowCmp from '@/components/Flow.vue'
import { useDevice } from '@/composables/useDevice'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'

const loginFlow: FlowInit = async ({ closeFn, state }) => {
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
    closeFn()
    useModal().showModal(Modal.Points)
  }
  const onCancel: Flow['onCancel'] = async (state, { goTo }) => {
    const { useApp } = await import('@/stores/app')
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await goTo('/app')

    closeFn()
  }
  return { flowName, state, steps, onDone, onCancel }
}

const setupFlow: FlowInit = async ({ closeFn, state }) => {
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
    closeFn()
    const { phoneNumberVerified } = useApp()
    if (phoneNumberVerified) {
      useModal().showModal(Modal.Points)
    }
    else {
      await useModal().closeModal()
      initializeFlow(FlowName.VerifyPhone)
    }
  }
  const onCancel: Flow['onCancel'] = async (_state, { goTo }) => {
    const { useApp } = await import('@/stores/app')
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await goTo('/app')

    closeFn()
  }
  return { flowName, state, steps, onDone, onCancel }
}

const verifyPhoneFlow: FlowInit = async ({ state }) => {
  const { phoneNumberStep, phoneNumberConfirmStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.VerifyPhone
  const steps = await Promise.all([phoneNumberStep, phoneNumberConfirmStep, onBoardingPoints].map(s => s({ flowName })))
  const onDone: Flow['onDone'] = async () => useModal().showModal(Modal.Points)
  return { flowName, state, steps, onDone }
}

const setupWithPromoCodeFlow: FlowInit = async ({ state, closeFn }) => {
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
  const onCancel: Flow['onCancel'] = async (_state, { goTo }) => {
    const { useApp } = await import('@/stores/app')
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await goTo('/app')

    closeFn()
  }
  return { flowName, state, steps, onCancel }
}

const onBoardingPointsFlow: FlowInit = async ({ state, closeFn }) => {
  const { onBoardingPoints } = await import('./steps')
  const flowName = FlowName.OnBoardingPoints
  const steps = [await onBoardingPoints({ flowName })]
  const onDone: Flow['onDone'] = async () => {
    const { useApp } = await import('@/stores/app')
    const { phoneNumberVerified } = useApp()
    if (phoneNumberVerified) {
      useModal().showModal(Modal.Points)
    }
    else {
      await useModal().closeModal()
      initializeFlow(FlowName.VerifyPhone)
    }
  }
  const onCancel: Flow['onCancel'] = async () => {
    closeFn()
  }
  return { flowName, state, steps, onDone, onCancel }
}

const onBoardingCashbackFlow: FlowInit = async ({ state }) => {
  const { onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4 } = await import('./steps')
  const flowName = FlowName.OnBoardingCashback
  const steps = (await Promise.all([onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4].map(s => s({ flowName }))))
  return { flowName, state, steps }
}

const onBoardingBluecodeFlow: FlowInit = async ({ state }) => {
  const { onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3 } = await import('./steps')
  const flowName = FlowName.OnBoardingBluecode
  const steps = (await Promise.all([onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3].map(s => s({ flowName }))))

  return { flowName, state, steps }
}

const nimOrPointsPaymentFlow: FlowInit = async ({ state, closeFn }) => {
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
      else
        closeFn()
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
      else
        closeFn()
    }
  }
  const onCancel: Flow['onCancel'] = async (_state) => {
    console.log('🤑  Cancelling payment process')
    if (!useDevice().isWeb) {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
      await BarcodeScanner.removeAllListeners()
      await BarcodeScanner.stopScan()
    }
    closeFn()
  }
  return { flowName, state, steps, onDone, onCancel }
}

const nimWithdrawFlow: FlowInit = async ({ state }) => {
  const [
    { nimWithdrawalSelectionStep, nimAddressInputStep, qrCodeScannerStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.NimWithdraw
  const steps = (await Promise.all([nimWithdrawalSelectionStep, nimAddressInputStep, (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimiqAddress } })].map(s => s({ flowName }))))
  return { flowName, state, steps }
}

const nimTopUpFlow: FlowInit = async ({ state }) => {
  const [
    { nimAddressDisplay, qrCodeScannerStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.NimTopUp
  const steps = (await Promise.all([nimAddressDisplay, (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimCashlink } })].map(s => s({ flowName }))))
  return { flowName, state, steps }
}

const viewTransactionsFlow: FlowInit = async ({ state }) => {
  const { transactionList, transactionDetail } = await import('./steps')
  const flowName = FlowName.ViewTransactions
  const steps = (await Promise.all([transactionList, transactionDetail].map(s => s({ flowName }))))
  return { flowName, state, steps }
}

const viewTransactionDetailFlow: FlowInit = async ({ state }) => {
  const { transactionDetail } = await import('./steps')
  const flowName = FlowName.ViewTransactions
  const steps = (await Promise.all([transactionDetail({ flowName })]))
  return { flowName, state, steps }
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
  const isFullscreen = false

  // Close the modal
  const closeFn = () => modalController.getTop().then(m => m.dismiss({ programmatically: true }))

  const activeStepIndex = ref(0)
  const defaultInitialFlowValues: Pick<Flow, 'onDone' | 'onCancel' | 'activeStepIndex'> = { onDone: closeFn, onCancel: closeFn, activeStepIndex }

  const state = { ...reactive(Object.fromEntries(inputSteps.map(s => [s, undefined])) as unknown as State), ...initialState }
  const flowConfig = await flows[name]({ state, closeFn })
  const flow: Flow = { ...defaultInitialFlowValues, ...flowConfig }

  // eslint-disable-next-line no-console
  console.log(`🌊 Initializing flow ${name}`, flow)

  await flow.steps.at(0)?.beforeDisplay?.(flow.state)

  modalController.create({
    component: FlowCmp,
    handle: false,

    /**
     * This function is called when the modal is about to be dismissed.
     * It can be triggered by the user or programmatically by a flow.
     *
     * If the user is trying to dismiss the flow, we call the `onCancel` hook.
     * Then the flow might decide to close the modal or not. If it does close
     * the modal, the `canDismiss` function will be executed again, but this time
     * it will return immediately true.
     *
     * At the moment, we don't prevent any modal of being dismissed, so
     * all the triggers will return true, closing the modal.
     */
    canDismiss: async (data?: { programmatically: boolean }) => {
      if (data?.programmatically)
        return true

      // eslint-disable-next-line no-console
      console.log('🌊 Dismissing flow', flow)
      const { default: router } = await import('@/router/index')
      await flow.onCancel?.(flow.state, {
        goTo: path => router.replace(path),
        err(errorMessage: string) {
          useToast().setToast({ message: errorMessage, error: true })
        },
      })
      return true
    },
    initialBreakpoint: isFullscreen ? undefined : 1,
    breakpoints: isFullscreen ? undefined : [0, 1],
    componentProps: { flow },
  }).then(modal => modal.present())
}

export async function cancelFlow(beforeCancel: () => Promise<void>) {
  await beforeCancel()
}
