import type { Slots } from 'vue'
import type { Result } from '../../types'
import type { PaymentSuccessMessage } from '../issuer-schemas/ws.schema'
import type { FeatureName } from '@/lib/analytics'
import type { Flow, FlowHookCb, FlowInit, PaymentRequestData, State, StepInitOptions } from '@/lib/flows/steps.types'
import type { PartialSendTxArgs } from '@/types/transactions'
import { modalController } from '@ionic/vue'
import { SumsubSdkStatus } from 'capacitor-sumsub-mobile-sdk'
import { defineAsyncComponent, h, ref } from 'vue'

import FlowCmp from '@/components/Flow.vue'

import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { i18n } from '@/i18n/i18n-setup'
import { isNakaEnabled } from '@/lib'
import {
  buildPaymentAnalyticsProps,
  finishPaymentAnalytics,
  reportCriticalError,
  trackFeatureOpened,
  trackPaymentCancelled,
  trackPaymentCompleted,
  trackPaymentFailed,
  trackWalletCreated,
  trackWalletImported,
} from '@/lib/analytics'
import { Asset, assetToPaymentMethod } from '@/lib/assets'
import { FlowName, StepName } from '@/lib/flows/steps.types'
import { isPaymentTransferType, PaymentMethod, Transfer } from '@/types/transactions'

const logger = useLogger('flows/index.ts')

const FEATURE_FLOW_MAP: Partial<Record<FlowName, FeatureName>> = {
  [FlowName.Payment]: 'pay',
  [FlowName.NimTopUp]: 'top_up',
  [FlowName.NimWithdraw]: 'withdraw',
  [FlowName.Backup]: 'backup',
  [FlowName.VerifyPhone]: 'verify_phone',
  [FlowName.NakaOnboarding]: 'naka_onboarding',
  [FlowName.NakaCardManagement]: 'naka_management',
}

async function completeWalletSetup(
  state: State,
  entryMethod: 'create' | 'create_with_promo_code',
  { err }: Parameters<NonNullable<Flow['onDone']>>[1],
) {
  const [
    { default: router },
    { useDecrypt },
    { useApp },
  ] = await Promise.all([import('@/router'), import('@/composables/useDecrypt'), import('@/stores/app')])
  const error = await useDecrypt().decrypt(state[StepName.PinCode])
  if (error)
    return err(error)

  // Clear the setup PIN from memory after it has been persisted.
  state[StepName.PinCode] = ''
  state[StepName.PinCodeConfirm] = ''

  await router.replace('/app')
  trackWalletCreated({
    entryMethod,
    hasReferralCode: entryMethod === 'create_with_promo_code',
  })

  const { phoneNumberVerified } = useApp()
  if (phoneNumberVerified) {
    await useModal().showModal(Modal.Points)
    return { prevent: true }
  }
}

const loginFlow: FlowInit = async () => {
  const { recoveryWordsStep, pinCodeStep, pinCodeConfirmStep, enableBiometricStep, getNotifiedStep /* onBoardingPoints */ } = await import('./steps')
  const flowName = FlowName.Login
  const steps = await Promise.all([
    recoveryWordsStep,
    pinCodeStep,
    pinCodeConfirmStep,
    enableBiometricStep,
    getNotifiedStep,
    /* onBoardingPoints */
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
    trackWalletImported()
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
  const { pinCodeStep, pinCodeConfirmStep, enableBiometricStep, getNotifiedStep /* onBoardingPoints */ } = await import('./steps')
  const flowName = FlowName.Setup
  const steps = await Promise.all([
    pinCodeStep,
    pinCodeConfirmStep,
    enableBiometricStep,
    getNotifiedStep,
    /* onBoardingPoints */
  ].map(s => s({ flowName })))
  const onDone: FlowHookCb = async (state, options) => completeWalletSetup(state, 'create', options)
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
  const { phoneNumberStep, phoneNumberConfirmStep /* onBoardingPoints */ } = await import('./steps')
  const flowName = FlowName.VerifyPhone
  const steps = await Promise.all([
    phoneNumberStep,
    phoneNumberConfirmStep,
    /* onBoardingPoints */
  ].map(s => s({ flowName })))
  const onDone: Flow['onDone'] = async () => {
    useModal().showModal(Modal.Points)
    return { prevent: true }
  }
  return { flowName, steps, onDone }
}

const setupWithPromoCodeFlow: FlowInit = async () => {
  const { promoCodeStep, pinCodeStep, pinCodeConfirmStep, enableBiometricStep, phoneNumberStep, phoneNumberConfirmStep, getNotifiedStep /* onBoardingPoints */ } = await import('./steps')
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
    // TODO: Re-enable when cc points are back
    // onBoardingPoints,
  ].map(s => s({ flowName })))
  const onDone: FlowHookCb = async (state, options) => completeWalletSetup(state, 'create_with_promo_code', options)
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

// const onBoardingCashbackFlow: FlowInit = async () => {
//   const { onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4 } = await import('./steps')
//   const flowName = FlowName.OnBoardingCashback
//   const steps = (await Promise.all([onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4].map(s => s({ flowName }))))
//   return { flowName, steps }
// }

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
    { holdNakaCardToReaderStep, qrCodeScannerStep, bluecodeNotAvailableStep, paymentRequestManualInputStep, paymentAmountInputStep, paymentPreviewStep, pinCodeStep },
    { QRDataFormat },
    { useApp },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser'), import('@/stores/app')])
  const isNakaAvailableForActiveAsset = isNakaEnabled && useApp().isNimiqAsset

  const { useNaka } = isNakaEnabled
    ? await import('@/stores/naka')
    : { useNaka: () => ({ isCardActive: false, isCardLocked: false }) }

  const hasActiveNakaCard = isNakaAvailableForActiveAsset && useNaka().isCardActive && !useNaka().isCardLocked
  const initialStep = hasActiveNakaCard ? StepName.HoldNakaCardToReader : StepName.QRCodeScanner

  const slotComponent = hasActiveNakaCard ? defineAsyncComponent(() => import('@/components/PaymentSelector.vue')) : undefined
  if (!useApp().isNimiqAsset) {
    const { usePolygonUsdt } = await import('@/stores/polygon-usdt')
    const polygonUsdt = usePolygonUsdt()
    void Promise.allSettled([
      polygonUsdt.primeTransferFee(),
      polygonUsdt.primeHtlcFee(),
    ]).then((results) => {
      if (results[0].status === 'rejected')
        logger.error('Failed to warm Polygon transfer fee snapshot', results[0].reason)
      if (results[1].status === 'rejected')
        logger.error('Failed to warm Polygon HTLC fee snapshot', results[1].reason)
    })
  }

  const flowName = FlowName.Payment
  const steps = (await Promise.all([
    hasActiveNakaCard ? (options: StepInitOptions) => holdNakaCardToReaderStep({ ...options, allowGoBack: false }) : undefined,
    (options: StepInitOptions) => qrCodeScannerStep({ ...options, allowGoBack: false, props: { expect: QRDataFormat.PaymentRequest } }),
    __ENABLE_BLUECODE__ ? (options: StepInitOptions) => bluecodeNotAvailableStep({ ...options, allowGoBack: false }) : undefined,
    paymentRequestManualInputStep,
    paymentAmountInputStep,
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
    if (payWithPuntos && isNimPaymentRequest) {
      const msg = 'User can only pay with puntos if they have scanned a payment request'
      reportCriticalError(new Error(msg), { flow: flowName })
      throw new Error(msg)
    }
    if (isBluecodePaymentRequest)
      throw new Error('Bluecode payments are not supported yet')
    if (isNakaPaymentRequest && !isNakaAvailableForActiveAsset)
      throw new Error('Naka payments are not supported yet')

    // Only one of the state can be true, otherwise the flow is not as expected
    if ([isNimPaymentRequest, isNakaPaymentRequest, isBluecodePaymentRequest].filter(Boolean).length > 1)
      throw new Error(`Multiple payment methods are active at the same time. Expected just one of ${{ payWithPuntos, nakaPaymentRequest, bluecodePaymentRequest }}`)

    // 2. Parse the payments parameters

    let payment:
      | { method: PaymentMethod.NIM | PaymentMethod.USDT | PaymentMethod.Points, request: PaymentRequestData }
      | { method: PaymentMethod.NakaCard, request: PaymentRequestData, confirmPayment: (serializedTx: string) => Promise<PaymentSuccessMessage> }
      | { method: PaymentMethod.Bluecode, request: Record<string, any> } // TODO Modify request to the needs
    if (isNimPaymentRequest)
      payment = { method: (payWithPuntos ? PaymentMethod.Points : assetToPaymentMethod(nimPaymentRequest.asset || Asset.NIM)) as PaymentMethod.NIM | PaymentMethod.USDT | PaymentMethod.Points, request: nimPaymentRequest }
    else if (isNakaPaymentRequest)
      payment = { method: PaymentMethod.NakaCard, ...nakaPaymentRequest }
    else if (isBluecodePaymentRequest)
      payment = { method: PaymentMethod.Bluecode, request: bluecodePaymentRequest }
    else
      throw new Error(`Unexpected payment method. Expected one of ${{ payWithPuntos, nakaPaymentRequest, bluecodePaymentRequest }}`)

    // 3. Do the payment

    const request = 'request' in payment ? payment.request : undefined
    const previewState = state[StepName.PaymentPreview]
    const analyticsProps = buildPaymentAnalyticsProps({
      asset: request?.asset || Asset.NIM,
      paymentMethod: payment.method,
      payWithPuntos: payment.method === PaymentMethod.Points,
      rail: request?.rail,
      amount: request?.amount || 0,
      transfer: request?.transfer,
    })
    const setPaymentAnalyticsStatus = (status: 'completed' | 'failed' | 'cancelled') => {
      if (previewState?.paymentAnalytics)
        previewState.paymentAnalytics = finishPaymentAnalytics(previewState.paymentAnalytics, status)
    }
    const failPayment = (errorMessage: string) => {
      setPaymentAnalyticsStatus('failed')
      trackPaymentFailed({ ...analyticsProps, error_reason: errorMessage })
      return err(errorMessage)
    }

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
        } as PartialSendTxArgs).catch((error) => {
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
          return failPayment(error)
        if (payment.method === PaymentMethod.NakaCard && data) {
          await payment.confirmPayment(data.serialized)
        }
        break
      }
      case PaymentMethod.USDT: {
        const request = payment.request
        const polygonQuote = state[StepName.PaymentPreview]?.polygonQuote
        if (!isPaymentTransferType(request.transfer)) {
          const errorMsg = i18n.t('USDT staking requests are not supported')
          return failPayment(errorMsg)
        }

        const polygonRequest = {
          ...request,
          transfer: request.transfer,
        }

        const { usePolygonUsdt } = await import('@/stores/polygon-usdt')
        const polygonTitle = request.merchantName
          ? markAsUnknownTransactionTitle(request.merchantName)
          : 'Payment'

        if (request.transfer === Transfer.UserPaymentToAtomicSwap) {
          const { error } = await usePolygonUsdt().sendSwapPayment(
            polygonRequest,
            polygonTitle,
          )
          if (error)
            return failPayment(error)
        }
        else {
          const { error } = await usePolygonUsdt().sendPayment(
            polygonRequest,
            polygonTitle,
            { quote: polygonQuote },
          )
          if (error)
            return failPayment(error)
        }
        break
      }
      case PaymentMethod.Points: {
        if (!payment.request.rail || !payment.request.paymentRef) {
          // No translation as not user-facing. Dev error which should not occur in production.
          const msg = `You cannot pay with points without a rail nor paymentRef. Request: ${JSON.stringify(payment.request)}`
          reportCriticalError(new Error(msg), { flow: flowName })
          throw new Error(msg)
        }

        const { usePoints } = await import('@/stores/points')
        const { error } = await usePoints().payWithPoints(payment.request)
        if (error)
          return failPayment(error)
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

    const paymentStartedAt = previewState?.paymentAnalytics?.startedAt || Date.now()
    setPaymentAnalyticsStatus('completed')
    trackPaymentCompleted({ ...analyticsProps, duration_ms: Date.now() - paymentStartedAt })

    const { useToast } = await import('@/composables/useToast')
    setTimeout(() => {
      useToast().setToast({ message: i18n.t('Payment successful') })
    }, 1000) // Allow the paymentPreview step to animate out before presenting the toast
  }
  const onCancel: Flow['onCancel'] = async (state) => {
    document.body.classList.remove('native-qr-scanner-modal-open')
    logger.log('🤑  Cancelling payment process')

    // Track cancellation only for attempts that were started and have not reached another terminal state.
    const previewState = state[StepName.PaymentPreview]
    if (previewState?.paymentAnalytics.status === 'started') {
      const qrData = state[StepName.QRCodeScanner]
      const nakaData = state[StepName.HoldNakaCardToReader]
      const request = (typeof qrData === 'object' && qrData) || (typeof nakaData === 'object' && nakaData?.request)
      if (request) {
        const payWithPuntos = !!previewState.payWithPuntos
        const method = payWithPuntos
          ? PaymentMethod.Points
          : nakaData ? PaymentMethod.NakaCard : assetToPaymentMethod(request.asset || Asset.NIM)
        trackPaymentCancelled({
          ...buildPaymentAnalyticsProps({
            asset: request.asset || Asset.NIM,
            paymentMethod: method,
            payWithPuntos,
            rail: request.rail,
            amount: request.amount || 0,
            transfer: request.transfer,
          }),
          cancelled_at_step: 'pin',
        })
        previewState.paymentAnalytics = finishPaymentAnalytics(previewState.paymentAnalytics, 'cancelled')
      }
    }
  }

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
    { nimWithdrawalAmountSelectionStep, nimWithdrawalConfirmStep, pinCodeStep },
  ] = await Promise.all([import('./steps')])
  const flowName = FlowName.NimWithdraw
  const steps = (await Promise.all([nimWithdrawalAmountSelectionStep, nimWithdrawalConfirmStep, pinCodeStep].map(s => s({ flowName }))))
  const onDone: Flow['onDone'] = async ({ nimWithdrawalAmountSelectionStep: { amount, recipient, polygonQuote } }, { err, setToast }) => {
    const [{ Transfer }, { useApp }, { usePolygonUsdt }, { sendTx }] = await Promise.all([
      import('@/types/transactions'),
      import('@/stores/app'),
      import('@/stores/polygon-usdt'),
      import('@/stores/transactions').then(t => t.useTransactions()),
    ])

    const title = 'Withdrawal' // translated at display time
    const { error } = useApp().isNimiqAsset
      ? await sendTx({ transfer: Transfer.UserPayment, recipient, amount, fee: 0, title })
      : await usePolygonUsdt().sendPayment({ transfer: Transfer.UserPayment, recipient, amount, fee: 0 }, title, { quote: polygonQuote })
    if (error)
      return err(`${i18n.t('Something went wrong')}.\n${error}`)

    setToast({ message: i18n.t('Withdrawal successful') })
  }
  return { flowName, steps, onDone }
}

const addressSelectionFlow: FlowInit = async () => {
  const [
    { nimWithdrawalAddressSelectionStep, nimAddressInputStep, qrCodeScannerStep },
    { QRDataFormat },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser')])
  const flowName = FlowName.AddressSelection
  const steps = (await Promise.all([
    nimWithdrawalAddressSelectionStep,
    (options: StepInitOptions) => nimAddressInputStep({ ...options, props: { overrideHeight: 'h-full' } }),
    (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.AssetAddress, overrideHeight: 'h-full' } }),
  ].map(s => s({ flowName }))))

  const onCancel: Flow['onCancel'] = async () => {
    // Remove transparency before closing to prevent the camera view to be visible behind the modal
    document.body.classList.remove('native-qr-scanner-modal-open')
  }

  return { flowName, steps, onCancel }
}

const addressDeletionFlow: FlowInit = async () => {
  const { confirmAddressDeletionStep } = await import('./steps')
  const flowName = FlowName.AddressDeletion
  const steps = (await Promise.all([confirmAddressDeletionStep].map(s => s({ flowName }))))
  return { flowName, steps }
}

const nimTopUpFlow: FlowInit = async () => {
  const [
    { nimAddressDisplay, qrCodeDisplayStep, qrCodeScannerStep },
    { QRDataFormat },
    { useApp },
  ] = await Promise.all([import('./steps'), import('@/composables/useStringParser'), import('@/stores/app')])
  const flowName = FlowName.NimTopUp
  const steps = !useApp().isNimiqAsset
    ? (await Promise.all([
        nimAddressDisplay,
        qrCodeDisplayStep,
      ].map(s => s({ flowName }))))
    : (await Promise.all([
        nimAddressDisplay,
        qrCodeDisplayStep,
        (options: StepInitOptions) => qrCodeScannerStep({ ...options, props: { expect: QRDataFormat.NimCashlink } }),
      ].map(s => s({ flowName }))))

  const onCancel: Flow['onCancel'] = async () => {
    // Remove transparency before closing to prevent the camera view to be visible behind the modal
    document.body.classList.remove('native-qr-scanner-modal-open')
  }

  return { flowName, steps, onCancel }
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

const askForPinFlow: FlowInit = async () => {
  const [
    { pinCodeStep },
  ] = await Promise.all([import('./steps')])
  const flowName = FlowName.AskForPin
  const steps = (await Promise.all([pinCodeStep].map(s => s({ flowName }))))
  return { flowName, steps }
}

const flows = {
  [FlowName.Login]: loginFlow,
  [FlowName.Setup]: setupFlow,
  [FlowName.VerifyPhone]: verifyPhoneFlow,
  [FlowName.SetupWithPromoCode]: setupWithPromoCodeFlow,
  [FlowName.OnBoardingPoints]: onBoardingPointsFlow,
  // [FlowName.OnBoardingCashback]: onBoardingCashbackFlow,
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
  [FlowName.AddressDeletion]: addressDeletionFlow,
  [FlowName.AskForPin]: askForPinFlow,

}

export type flowHeightOptions = 'h-full' | 'h-max'

interface InitializeFlowOptions {
  initialState?: Partial<State>

  /**
   * The height of the flow. In the future, if we want screen full height, we can add `h-screen` and modify
   * the logic in the modalControll.create to return `undefined`
   * @default 'h-full'
   */
  height?: flowHeightOptions
  isFullscreen?: boolean
  preventSwipe?: boolean
  isOnTop?: boolean
  analyticsSource?: string
}

/**
 * It initializes the flow given the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export async function initializeFlow(name: FlowName, options: InitializeFlowOptions = {}) {
  const { initialState, height = 'h-full', isFullscreen = false, preventSwipe = false, isOnTop = false, analyticsSource } = options

  // Close previous modal or flow, potentially invoking its cancel handler via canDismiss.
  if (!isOnTop)
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
    component: () => h(FlowCmp, { flow, initialState, isClosing: isClosing.value, height }, slots),
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
    initialBreakpoint: isFullscreen ? undefined : 1,
    breakpoints: isFullscreen ? undefined : [0, 1],
  })
  if (isFullscreen) {
    modal.style.setProperty('--border-radius', '0')
  }

  await modal.present()

  const featureName = FEATURE_FLOW_MAP[name]
  if (analyticsSource && featureName) {
    const { useApp } = await import('@/stores/app')
    trackFeatureOpened({
      featureName,
      source: analyticsSource,
      channel: 'flow',
      activeAsset: useApp().activeAsset,
    })
  }

  return modal
}
