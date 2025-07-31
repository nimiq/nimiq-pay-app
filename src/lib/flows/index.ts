import type { Flow, FlowHookCb, FlowInit, State, StepInitOptions } from '@/lib/flows/steps.types'
import FlowCmp from '@/components/Flow.vue'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { i18n } from '@/i18n/i18n-setup'

import { FlowName, StepName } from '@/lib/flows/steps.types'
import { modalController } from '@ionic/vue'
import { h, ref } from 'vue'

const logger = useLogger('flows/index.ts')

const loginFlow: FlowInit = async () => {
  const { recoveryWordsStep, pinCodeStep, pinCodeConfirmStep, enableBiometricStep, getNotifiedStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.Login
  const steps = await Promise.all([
    recoveryWordsStep,
    pinCodeStep,
    pinCodeConfirmStep,
    enableBiometricStep,
    getNotifiedStep,
    onBoardingPoints,
  ].map(s => s({ flowName })))
  const onDone: Flow['onDone'] = async (state, { err }) => {
    const [
      { default: router },
      { useDecrypt },
      { useApp },
    ] = await Promise.all([import('@/router'), import('@/composables/useDecrypt'), import('@/stores/app')])
    const error = await useDecrypt().decrypt(state[StepName.PinCode])
    if (error) {
      err(error)
      return
    }

    // Clear pin code from memory just in case
    // Since state is a JSON object, we take advantage of the fact that it's a reference
    state[StepName.PinCode] = ''

    await router.replace('/app')
    const { phoneNumberVerified } = useApp()
    if (phoneNumberVerified) {
      await useModal().showModal(Modal.Points)
      return { prevent: true }
    }
  }
  const onCancel: Flow['onCancel'] = async () => {
    const [
      { default: router },
      { useApp },
    ] = await Promise.all([import('@/router'), import('@/stores/app')])
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await router.replace('/app')
  }
  return { flowName, steps, onDone, onCancel }
}

const setupFlow: FlowInit = async () => {
  const { pinCodeStep, pinCodeConfirmStep, enableBiometricStep, getNotifiedStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.Setup
  const steps = await Promise.all([pinCodeStep, pinCodeConfirmStep, enableBiometricStep, getNotifiedStep, onBoardingPoints].map(s => s({ flowName })))
  const onDone: FlowHookCb = async (state, { err }) => {
    const [
      { default: router },
      { useDecrypt },
      { useApp },
    ] = await Promise.all([import('@/router'), import('@/composables/useDecrypt'), import('@/stores/app')])
    const error = await useDecrypt().decrypt(state[StepName.PinCode])
    if (error)
      return err(error)

    await router.replace('/app')
    const { phoneNumberVerified } = useApp()
    if (phoneNumberVerified) {
      await useModal().showModal(Modal.Points)
      return { prevent: true }
    }
  }
  const onCancel: Flow['onCancel'] = async () => {
    const [
      { default: router },
      { useApp },
    ] = await Promise.all([import('@/router'), import('@/stores/app')])
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await router.replace('/app')
  }
  return { flowName, steps, onDone, onCancel }
}

const verifyPhoneFlow: FlowInit = async () => {
  const { phoneNumberStep, phoneNumberConfirmStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.VerifyPhone
  const steps = await Promise.all([phoneNumberStep, phoneNumberConfirmStep, onBoardingPoints].map(s => s({ flowName })))
  const onDone: Flow['onDone'] = async () => {
    useModal().showModal(Modal.Points)
    return { prevent: true }
  }
  return { flowName, steps, onDone }
}

const setupWithPromoCodeFlow: FlowInit = async () => {
  const { promoCodeStep, pinCodeStep, pinCodeConfirmStep, enableBiometricStep, phoneNumberStep, phoneNumberConfirmStep, getNotifiedStep, onBoardingPoints } = await import('./steps')
  const flowName = FlowName.SetupWithPromoCode
  const stepOptions: StepInitOptions = { goBackBy: 2, skipAheadBy: 2 }
  const steps = await Promise.all([
    promoCodeStep,
    pinCodeStep,
    pinCodeConfirmStep,
    enableBiometricStep,
    (options: StepInitOptions) => phoneNumberStep({ ...options, ...stepOptions }),
    phoneNumberConfirmStep,
    getNotifiedStep,
    onBoardingPoints,
  ].map(s => s({ flowName })))
  const onCancel: Flow['onCancel'] = async () => {
    const [
      { default: router },
      { useApp },
    ] = await Promise.all([import('@/router'), import('@/stores/app')])
    const hasLocalWallet = !!useApp().entropy
    if (hasLocalWallet)
      await router.replace('/app')
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
      await useModal().showModal(Modal.Points)
    else
      await initializeFlow(FlowName.VerifyPhone)
    return { prevent: true }
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
    { paymentPreviewStep, qrCodeScannerStep, pinCodeStep, paymentRequestManualInputStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])

  const flowName = FlowName.NimOrPointsPayment
  const steps = (await Promise.all([
    (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.PaymentRequest } }),
    paymentRequestManualInputStep,
    paymentPreviewStep,
    pinCodeStep,
  ].map(s => s({ flowName }))))

  const onDone: Flow['onDone'] = async (state, { err }) => {
    const { markAsUnknownTransactionTitle, PaymentMethod } = await import('@/types/transactions')

    const { [StepName.PaymentPreview]: method, [StepName.QRCodeScanner]: request } = state
    if (!request || typeof request === 'string')
      // No translation as not user-facing. Dev error which should not occur in production.
      throw new Error(`${flowName} flow expected a parsed payment request`)

    logger.log(`🤑  Initializing payment process with ${method}`, request)

    if (method === PaymentMethod.NIM) {
      const { useTransactions } = await import('@/stores/transactions')
      const { error } = await useTransactions().sendTx({
        ...request,
        title: request.merchantName
          ? markAsUnknownTransactionTitle(request.merchantName)
          : 'Payment', // translated at display time
      }).catch((error) => {
        logger.error('🤑  Transaction failed:', error)
        return ({
          error: i18n.t(
            'Transaction failed: {error}',
            { error: (error instanceof Error ? error.message : String(error)) || i18n.t('Unknown error') },
          ),
        })
      })
      if (error)
        return err(error)
    }
    else if (method === PaymentMethod.Points) {
      if (!request.rail || !request.paymentRef)
        // No translation as not user-facing. Dev error which should not occur in production.
        throw new Error(`You cannot pay with points without a rail nor paymentRef. Request: ${JSON.stringify(request)}`)

      const { usePoints } = await import('@/stores/points')
      const { error } = await usePoints().payWithPoints(request)
      if (error)
        return err(error)
    }

    const { useToast } = await import('@/composables/useToast')
    useToast().setToast({ message: i18n.t('Payment successful') })
  }
  const onCancel: Flow['onCancel'] = async () => {
    logger.log('🤑  Cancelling payment process')
  }
  return { flowName, steps, onDone, onCancel }
}

const nimWithdrawFlow: FlowInit = async () => {
  /**
   *    - User can input the amount in selection Step.
   *    - User can select the address or it can select "Add new", which triggers the nimAddressInputStep.
   *    - User can read a QR code with the address, which triggers the
   *      qrCodeScannerStep. Reading the QR code will autofill the value in the
   *      nimAddressInputStep.
   *    - The user then can select "Continue" from the nimAddressInputStep to go
   *      to selectionStep.
   *    - Clicking "Send" in selection Step might:
   *        - Open the pinCodeStep if the user is required to put the pin code.
   *          Check useApp().
   *        - Finish the flow if the user is not required to put the pin code.
   *  The flow looks like this:
                                   ┌────────┐
                                   │        ▼
       ┌────────► nimAddressInputStep      qrCodeScannerStep
       │           │               ▲        │
       │           │               └────────┘
       │           │
selectionStep ◄────┘
        │
        │
        └────► pinCodeStep
   */
  const [
    { nimWithdrawalSelectionStep, nimAddressInputStep, qrCodeScannerStep, pinCodeStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.NimWithdraw
  const steps = (await Promise.all([nimWithdrawalSelectionStep, nimAddressInputStep, (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimiqAddress } }), pinCodeStep].map(s => s({ flowName }))))
  const onDone: Flow['onDone'] = async ({ nimWithdrawalSelection: { amount, recipient } }, { err, setToast }) => {
    const [{ Transfer }, { sendTx }] = await Promise.all([
      import('@/types/transactions'),
      import('@/stores/transactions').then(t => t.useTransactions()),
    ])

    const title = 'Withdrawal' // translated at display time
    const { error } = await sendTx({ transfer: Transfer.UserPayment, recipient, amount, title })
    if (error)
      return err(`${i18n.t('Something went wrong')}.\n${error}`)

    setToast({ message: i18n.t('Withdrawal successful') })
  }
  return { flowName, steps, onDone }
}

const nimTopUpFlow: FlowInit = async () => {
  const [
    { nimAddressDisplay, qrCodeDisplayStep, qrCodeScannerStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.NimTopUp
  const steps = (await Promise.all([
    nimAddressDisplay,
    qrCodeDisplayStep,
    (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimCashlink } }),
  ].map(s => s({ flowName }))))
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

const backupFlow: FlowInit = async () => {
  const { backupIntroductionStep, showWordsStep, validateWordsStep } = await import('./steps')
  const flowName = FlowName.Backup
  const steps = (await Promise.all([backupIntroductionStep, showWordsStep, validateWordsStep].map(s => s({ flowName }))))
  const onDone: Flow['onDone'] = async () => {
    const { useApp } = await import('@/stores/app')
    useApp().hasDoneBackup = true
    const { useToast } = await import('@/composables/useToast')
    setTimeout(() => useToast().setToast({ message: i18n.t('Backup successful') }), 400) // Delay to allow the last step to animate out
  }
  return { flowName, steps, onDone }
}

const changePinFlow: FlowInit = async () => {
  const { pinCodeChange, pinCodeStep, pinCodeConfirmStep } = await import('./steps')
  const flowName = FlowName.ChangePin
  const stepOptions: StepInitOptions = { goBackBy: -1 }
  const steps = (await Promise.all([
    pinCodeChange,
    (options: StepInitOptions) => pinCodeStep({ ...options, ...stepOptions }),
    pinCodeConfirmStep,
  ].map(s => s({ flowName }))))
  const onDone: Flow['onDone'] = async (state, { err }) => {
    if (state[StepName.PinCode] !== state[StepName.PinCodeConfirm])
      return err(i18n.t('The PINs do not match'))

    const { useDecrypt } = await import('@/composables/useDecrypt')
    const error = await useDecrypt().changePin(state[StepName.PinCode], state[StepName.PinCodeChange])
    if (error)
      return err(error)

    const { useBiometric } = await import('@/composables/useBiometric')
    const { isBiometricEnabled, setPinToSecureStorage } = useBiometric()
    if (isBiometricEnabled.value)
      await setPinToSecureStorage(state[StepName.PinCode])

    const { useToast } = await import('@/composables/useToast')
    useToast().setToast({ message: i18n.t('PIN change successful') })
  }
  return { flowName, steps, onDone }
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
  [FlowName.Backup]: backupFlow,
  [FlowName.ChangePin]: changePinFlow,
}

/**
 * It initializes the flow given the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export async function initializeFlow(name: FlowName, initialState?: Partial<State>, preventSwipe = false) {
  // Close previous modal or flow, potentially invoking its cancel handler via canDismiss.
  await useModal().closeModal()

  const isFullscreen = false

  const flow = await flows[name]()

  logger.log(`🌊 Initializing flow ${name}`, flow)

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
    canDismiss: async (data?: any, role?) => {
      if (preventSwipe && role === 'gesture')
        return false // Prevent swipe to close if preventSwipe is true

      logger.log('🌊 Dismissing flow', flow)
      isClosing.value = true
      if (role === 'gesture') {
        // Close modal immediately on swipe gesture, instead of waiting for snap-back animation to finish animating the
        // gesture back, see handleCanDismiss in ion-modal.js. We don't await modal.dismiss() here, to avoid a deadlock
        // if canDismiss itself was called by an outer modal.dismiss(), as dismiss includes a lock that only allows one
        // parallel execution, which would block this recursive call of modal.dismiss(), until the outer call terminates
        modal.dismiss()
      }
      return true
    },
    initialBreakpoint: isFullscreen ? undefined : 1,
    breakpoints: isFullscreen ? undefined : [0, 1],
  })
  await modal.present()
}
