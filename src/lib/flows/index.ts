import type { Slots } from 'vue'
import type { Result } from '../../types'
import type { PaymentSuccessMessage } from '../issuer-schemas/ws.schema'
import type { Flow, FlowHookCb, FlowInit, PaymentRequestData, State, StepInitOptions } from '@/lib/flows/steps.types'
import { modalController } from '@ionic/vue'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { defineAsyncComponent, h, ref } from 'vue'

import FlowCmp from '@/components/Flow.vue'

import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { i18n } from '@/i18n/i18n-setup'
import { FlowName, StepName } from '@/lib/flows/steps.types'
import { PaymentMethod } from '@/types/transactions'

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

/**
 *
        ┌───Can go to───────┬───or go to───┐
        │                   │              ▼
┌────┐ ┌──┐ ┌────────┐ ┌────┴──────┐ ┌──────────────┐
│Naka│ │QR│ │Bluecode│ │ManualInput│ │PaymentPreview┼──►beforeNext() -> PayLogic
└─┬──┘ └──┘ └────┬───┘ └───────────┘ └──────────────┘
  │              │                         ▲
  └──────────────┴──────skips─to───────────┘
 * We have in the state 4 input steps used in the beforeNext to make the payment
 */
const paymentFlow: FlowInit = async () => {
  const [
    { holdNakaCardToReaderStep, qrCodeScannerStep, bluecodeNotAvailableStep, paymentRequestManualInputStep, paymentPreviewStep, pinCodeStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])

  const { useNaka } = __ENABLE_NAKA__
    ? await import('@/stores/naka')
    : { useNaka: () => ({ isCardActive: false, isCardLocked: false }) }

  const flowName = FlowName.Payment
  const steps = (await Promise.all([
    __ENABLE_NAKA__ ? (options: StepInitOptions) => holdNakaCardToReaderStep({ ...options, allowGoBack: false }) : undefined,
    (options: StepInitOptions) => qrCodeScannerStep({ ...options, allowGoBack: false, props: { expect: QRDataFormat.PaymentRequest } }),
    __ENABLE_BLUECODE__ ? (options: StepInitOptions) => bluecodeNotAvailableStep({ ...options, allowGoBack: false }) : undefined,
    paymentRequestManualInputStep,
    paymentPreviewStep,
    pinCodeStep,
  ].filter(s => s !== undefined).map(s => s({ flowName }))))

  const onDone: Flow['onDone'] = async (state, { err }) => {
    const { markAsUnknownTransactionTitle } = await import('@/types/transactions')

    const nimPaymentRequest = state[StepName.QRCodeScanner]
    const payWithPuntos = state[StepName.PaymentPreview]?.payWithPuntos
    const nakaPaymentRequest = state[StepName.HoldNakaCardToReader]
    const bluecodePaymentRequest = {} // state[StepName.BluecodePayment]

    // 1. Check wether the user has done the flow as expected and we don't have a surprise in the params

    const objectHasData = (obj: Record<string, unknown>) => typeof obj === 'object' && Object.keys(obj).length > 0

    if (typeof nimPaymentRequest === 'string' || (!nimPaymentRequest && !nakaPaymentRequest))
      throw new Error(`${flowName} flow expected a parsed payment request`)

    const isNimPaymentRequest = objectHasData(nimPaymentRequest)
    const isNakaPaymentRequest = objectHasData(nakaPaymentRequest)
    const isBluecodePaymentRequest = objectHasData(bluecodePaymentRequest)

    // No translation as not user-facing. Dev error which should not occur in production.
    if (payWithPuntos && isNimPaymentRequest)
      throw new Error('User can only pay with puntos if they have scanned a payment request')
    if (isBluecodePaymentRequest)
      throw new Error('Bluecode payments are not supported yet')
    if (isNakaPaymentRequest && !__ENABLE_NAKA__)
      throw new Error('Naka payments are not supported yet')

    // Only one of the state can be true, otherwise the flow is not as expected
    if ([isNimPaymentRequest, isNakaPaymentRequest, isBluecodePaymentRequest].filter(Boolean).length > 1)
      throw new Error(`Multiple payment methods are active at the same time. Expected just one of ${{ payWithPuntos, nakaPaymentRequest, bluecodePaymentRequest }}`)

    // 2. Parse the payments parameters

    let payment:
      | { method: PaymentMethod.NIM | PaymentMethod.Points, request: PaymentRequestData }
      | { method: PaymentMethod.NakaCard, request: PaymentRequestData, confirmPayment: (serializedTx: string) => Promise<PaymentSuccessMessage> }
      | { method: PaymentMethod.Bluecode, request: Record<string, any> } // TODO Modify request to the needs
    if (isNimPaymentRequest)
      payment = { method: payWithPuntos ? PaymentMethod.Points : PaymentMethod.NIM, request: nimPaymentRequest }
    else if (isNakaPaymentRequest)
      payment = { method: PaymentMethod.NakaCard, ...nakaPaymentRequest }
    else if (isBluecodePaymentRequest)
      payment = { method: PaymentMethod.Bluecode, request: bluecodePaymentRequest }
    else
      throw new Error(`Unexpected payment method. Expected one of ${{ payWithPuntos, nakaPaymentRequest, bluecodePaymentRequest }}`)

    // 3. Do the payment

    logger.log(`🤑  Initializing payment process with ${payment.method}`, payment)
    switch (payment.method) {
      case PaymentMethod.NIM:
      case PaymentMethod.NakaCard: {
        const { useTransactions } = await import('@/stores/transactions')
        const { error, data } = await useTransactions().sendTx({
          ...payment.request,
          title: payment.request.merchantName
            ? markAsUnknownTransactionTitle(payment.request.merchantName)
            : 'Payment', // translated at display time
        }).catch((error) => {
          logger.error('🤑  Transaction failed:', error)
          return {
            data: undefined,
            error: i18n.t(
              'Transaction failed: {error}',
              { error: (error instanceof Error ? error.message : String(error)) || i18n.t('Unknown error') },
            ),
          } satisfies Result<never, string>
        })
        if (error)
          return err(error)
        if (payment.method === PaymentMethod.NakaCard && data) {
          await payment.confirmPayment(data.serialized)
        }
        break
      }
      case PaymentMethod.Points: {
        if (!payment.request.rail || !payment.request.paymentRef)
        // No translation as not user-facing. Dev error which should not occur in production.
          throw new Error(`You cannot pay with points without a rail nor paymentRef. Request: ${JSON.stringify(payment.request)}`)

        const { usePoints } = await import('@/stores/points')
        const { error } = await usePoints().payWithPoints(payment.request)
        if (error)
          return err(error)
        break
      }
      case PaymentMethod.Bluecode: {
        throw new Error('Bluecode payments are not supported yet')
        // break
      }
      default: {
        throw new Error(`Unknown payment method`, payment)
      }
    }

    const { useToast } = await import('@/composables/useToast')
    setTimeout(() => {
      useToast().setToast({ message: i18n.t('Payment successful') })
    }, 1000) // Allow the paymentPreview step to animate out before presenting the toast
  }
  const onCancel: Flow['onCancel'] = async () => {
    // Remove transparency before closing to prevent the camera view to be visible behind the modal
    document.body.classList.remove('native-qr-scanner-modal-open')
    logger.log('🤑  Cancelling payment process')
  }

  const hasActiveNakaCard = useNaka().isCardActive && !useNaka().isCardLocked
  const initialStep = hasActiveNakaCard ? StepName.HoldNakaCardToReader : StepName.QRCodeScanner

  const slotComponent = defineAsyncComponent(() => import('@/components/PaymentSelector.vue'))

  return { flowName, steps, onDone, onCancel, initialStep, slotComponent } satisfies Flow
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
    { nimWithdrawalAmountSelectionStep, nimWithdrawalAddressSelectionStep, nimAddressInputStep, qrCodeScannerStep, pinCodeStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.NimWithdraw
  const steps = (await Promise.all([nimWithdrawalAmountSelectionStep, nimWithdrawalAddressSelectionStep, nimAddressInputStep, (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimiqAddress } }), pinCodeStep].map(s => s({ flowName }))))
  const onDone: Flow['onDone'] = async ({ nimWithdrawalAmountSelectionStep: { amount, recipient } }, { err, setToast }) => {
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

const addressSelectionFlow: FlowInit = async () => {
  const [
    { nimWithdrawalAddressSelectionStep },
  ] = await Promise.all([import('./steps')])
  const flowName = FlowName.AddressSelection
  const steps = (await Promise.all([
    nimWithdrawalAddressSelectionStep,
  ].map(s => s({ flowName }))))
  return { flowName, steps }
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

const comingSoonFlow: FlowInit = async () => {
  const { comingSoonStep } = await import('./steps')
  const flowName = FlowName.ComingSoon
  const steps = (await Promise.all([comingSoonStep].map(s => s({ flowName }))))
  return { flowName, steps }
}

const nakaOnboardFlow: FlowInit = async () => {
  const [
    { FlowName: Flow },
    { whatIsNakaStep, verifyYourIdNakaStep },
  ] = await Promise.all([
    import('@/lib/flows/steps.types'),
    import('./steps'),
  ])

  const flowName = Flow.NakaOnboarding
  const steps = await Promise.all([
    whatIsNakaStep({ flowName }),
    verifyYourIdNakaStep({ flowName }),
  ])

  const onCancel: Flow['onCancel'] = async () => {
    const { useKyc } = await import('@/stores/kyc')
    if (useKyc().sdkStatus === SumsubSdkStatus.PENDING)
      useKyc().checkKycInBackground()
  }

  return { flowName, steps, onCancel }
}

const nakaCardIsReadyFlow: FlowInit = async () => {
  const { nakaCardIsReadyStep } = await import('./steps')
  const flowName = FlowName.NakaCardIsReady
  const steps = await Promise.all([nakaCardIsReadyStep].map(s => s({ flowName })))
  return { flowName, steps }
}

const nakaCardManagementFlow: FlowInit = async () => {
  const [
    { nakaCardManagementStep, nakaCardDeleteStep },
    // { useNaka },
  ] = await Promise.all([
    import('./steps'),
    // import('@/stores/naka'),
  ] as const)
  // if (!useNaka().isCardActive)
  //   throw new Error('Naka card is not activated')

  const flowName = FlowName.NakaCardManagement
  const steps = await Promise.all([
    nakaCardManagementStep,
    nakaCardDeleteStep,
  ].map(s => s({ flowName })))
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
  [FlowName.Payment]: paymentFlow,
  [FlowName.NimWithdraw]: nimWithdrawFlow,
  [FlowName.NimTopUp]: nimTopUpFlow,
  [FlowName.ViewTransactions]: viewTransactionsFlow,
  [FlowName.ViewTransactionDetail]: viewTransactionDetailFlow,
  [FlowName.Backup]: backupFlow,
  [FlowName.ChangePin]: changePinFlow,
  [FlowName.ComingSoon]: comingSoonFlow,
  [FlowName.NakaOnboarding]: nakaOnboardFlow,
  [FlowName.NakaCardIsReady]: nakaCardIsReadyFlow,
  [FlowName.NakaCardManagement]: nakaCardManagementFlow,
  [FlowName.AddressSelection]: addressSelectionFlow,

}

interface InitializeFlowOptions {
  initialState?: Partial<State>

  /**
   * The height of the flow. In the future, if we want screen full height, we can add `h-screen` and modify
   * the logic in the modalControll.create to return `undefined`
   * @default 'h-full'
   */
  height?: 'h-full' | 'h-max'
  preventSwipe?: boolean
}

/**
 * It initializes the flow given the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export async function initializeFlow(name: FlowName, options: InitializeFlowOptions = {}) {
  const { initialState, height = 'h-full', preventSwipe = false } = options
  // Close previous modal or flow, potentially invoking its cancel handler via canDismiss.
  await useModal().closeModal()

  const flow = await flows[name]()

  logger.log(`🌊 Initializing flow ${name}`, flow)

  const isClosing = ref(false)

  // This function goes through the slot props and looks for any keys that start with "on:".
  // For each such key, we create a new key in camelCase (e.g. "on:navigateTo" becomes "onNavigateTo").
  // This is needed so that when we pass the props to Flow.vue, the events are received correctly.
  function processEventProps(props: any) {
    const newProps = { ...props }
    // Loop through keys that start with "on:" and create a new key for each event.
    for (const key in props) {
      if (key.startsWith('on:')) {
        const eventName = key.slice(3)
        newProps[`on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`] = props[key]
      }
    }
    return newProps
  }

  // Here we check if the flow has a slot component.
  // If it does, we need to pass the slotProps to it.
  // We use the processEventProps function to transform the events properly.
  // Without this, the events coming from Flow.vue might not work as expected.
  const slots = flow.slotComponent !== undefined
    ? {
      default: (slotProps) => {
        // Transform the event keys in slotProps so that events like "on:navigateTo" become "onNavigateTo"
        const newSlotProps = processEventProps(slotProps)
        return [h(flow.slotComponent!, newSlotProps)]
      },
    } satisfies Slots
    : {}

  const modal = await modalController.create({
    // Pass a render function that includes props for FlowCmp, instead of FlowCmp as component and the component's props
    // via componentProps, to make the props reactive. Passing the props to componentProps as reactive() did not work.
    // isClosing could also be passed as ref, but having a ref as a prop instead of the actual value is not the typical
    // vue way of doing things.
    component: () => h(FlowCmp, { flow, initialState, isClosing: isClosing.value }, slots),
    cssClass: `nimiq-modal-${height}`,
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
    initialBreakpoint: 1,
    breakpoints: [0, 1],
  })
  await modal.present()
}
