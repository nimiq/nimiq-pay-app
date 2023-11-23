import { defineAsyncComponent, h, ref } from 'vue'
import { modalController } from '@ionic/vue'
import { Modal, useModal } from '@/composables/useModal'
import type { Flow, State, StepInit } from '@/types/steps'
import { FlowName, PaymentMethod, StepName, defaultStepInitOptions } from '@/types/steps'

// @ts-expect-error The component is fine
import FlowCmp from '@/components/Flow.vue'
import { Transfer } from '@/types/transactions'

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue'))
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue'))
const CodeInput = defineAsyncComponent(() => import('@/components/CodeInput.vue'))
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue'))
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue'))
const AllowNotifications = defineAsyncComponent(() => import('@/components/AllowNotifications.vue'))
// @ts-expect-error The component is fine
const QRCodeScanner = defineAsyncComponent(() => import('@/components/QRCodeScanner.vue'))
// @ts-expect-error The component is fine
const PaymentPreview = defineAsyncComponent(() => import('@/components/PaymentPreview.vue'))

const REFERRAL_CODE_REGEX = /^[a-zA-Z0-9]{6}$/
const PIN_CODE_REGEX = /^\d{4}$/
const PHONE_NUMBER_REGEX = /^\d{4,}$/

const promoCodeStep: StepInit = () => ({
  step: StepName.PromoCode,
  title: 'Enter your promo code',
  description: 'If you don\'t have one, you can skip this step.',
  main: h(BrickInput),
  beforeNext: async ({ promoCode }, { next, err }) => {
    if (!promoCode)
      err('Please enter a promo code')
    else if (!REFERRAL_CODE_REGEX.test(promoCode))
      err('Invalid promo code')
    else
      next()
  },
})

const recoveryWordsStep: StepInit = () => ({
  step: StepName.RecoveryWordsStep,
  title: 'Enter recovery words',
  main: h(BrickInput),
  beforeNext: async (_, { next }) => next(),
})

const pinCodeStep: StepInit = () => ({
  step: StepName.PinCode,
  title: 'Choose PIN',
  description: 'Just a PIN.<br>No personal data needed.',
  main: h(PinInput, { inputLength: 4 }),
  beforeNext: async ({ pinCode }, { next, err }) => {
    if (!pinCode)
      err('Please enter a PIN code')
    else if (!PIN_CODE_REGEX.test(pinCode))
      err('Invalid PIN code')
    else
      next()
  },
})

const pinCodeConfirmStep: StepInit = () => ({
  step: StepName.PinCodeConfirm,
  title: 'Confirm your PIN',
  description: 'Just a PIN.<br>No personal data needed.',
  main: h(PinInput, { inputLength: 4 }),
  beforeNext: async ({ pinCode, pinCodeConfirm }, { next, err }) => {
    if (!pinCodeConfirm) { err('Please confirm your PIN code'); return }
    else if (pinCodeConfirm !== pinCode) { err('PIN codes do not match'); return }

    // Nuke everything in case there was a previous encryption db
    const { isWeb } = (await import('@/composables/useDevice')).useDevice()
    if (!isWeb) {
      const { sqlite } = (await import('@/stores/conn')).useConn()
      await sqlite.deleteOldDatabases()
      await sqlite.clearEncryptionSecret()
    }

    const { decrypt, decrypted } = (await import('@/composables/useDecrypt')).useDecrypt()
    const decryptError = await decrypt(pinCode)
    if (decryptError) { err(decryptError); return }
    if (!decrypted) { err('There was an error'); return }
    next()
  },
})

const phoneNumberStep: StepInit = ({ stepsToSkip } = defaultStepInitOptions) => ({
  step: StepName.PhoneNumber,
  title: 'Verify your phone number',
  description: 'It\'s so easy.<br>Just verify your phone number.',
  main: h(PhoneInput, { canSkip: !!stepsToSkip }),
  stepsToSkip,
  beforeNext: async ({ phoneNumber }, { next, err }) => {
    if (!phoneNumber) { err('Please enter a phone number') }
    else if (!PHONE_NUMBER_REGEX.test(phoneNumber)) { err('Invalid phone number') }
    else {
      const res = await (await import('@/stores/points')).usePoints().authorize(phoneNumber)
      if (res && res.error)
        err(res.error || 'Error authorizing phone number')
      else next()
    }
  },
  onCancel: async (_state, { path, replace }) => { path === '/setup' && await replace?.('/app') },
})

const phoneNumberConfirmStep: StepInit = () => ({
  step: StepName.PhoneNumberConfirm,
  title: 'Confirm your phone number',
  description: 'We\'ve sent you a code, please confirm',
  main: h(CodeInput, { inputLength: 8 }),
  beforeNext: async ({ phoneNumberConfirm }, { next, err }) => {
    if (!phoneNumberConfirm) { err('Please enter a verification code') }
    else {
      const res = await (await import('@/stores/points')).usePoints().verify(phoneNumberConfirm)
      if (res && res.error)
        err(res.error || 'Error verifying phone number')
      else
        next()
    }
  },
  onCancel: async (_state, { path, replace }) => { path === '/setup' && await replace?.('/app') },

})

const getNotifiedStep: StepInit = () => ({
  step: StepName.GetNotified,
  title: 'Enable notifications',
  description: 'Get important info on transactions, top ups, security and more.',
  stepsToSkip: 1,
  main: h(AllowNotifications),
  onCancel: async (_state, { path, replace }) => { path === '/setup' && await replace?.('/app') },
})

const onBoardingPoints1: StepInit = () => ({
  step: StepName.OnBoardingPoints1,
  title: 'Welcome to Crypto City Points',
  description: 'Crypto City Points (or CC Points) are a bonus currency worth the same as NIM.',
  main: h(OnBoardingScreen),
})

const onBoardingPoints2: StepInit = () => ({
  step: StepName.OnBoardingPoints2,
  title: 'Pay with CC Points',
  description: 'Pay with CC Points instead of NIM wherever they\'re accepted.',
  main: h(OnBoardingScreen),
})

const onBoardingPoints3: StepInit = () => ({
  step: StepName.OnBoardingPoints3,
  title: 'Get CC Points',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: h(OnBoardingScreen),
})

const onBoardingCashback1: StepInit = () => ({
  step: StepName.OnBoardingCashback1,
  title: 'What\'s Crypto City Points?',
  description: 'Crypto City Points (or CC Points) are a bonus currency worth the same as NIM.  ',
  main: h(OnBoardingScreen),
})

const onBoardingCashback2: StepInit = () => ({
  step: StepName.OnBoardingCashback2,
  title: 'Pay with CC Points',
  description: 'Pay with CC Points instead of NIM wherever they\'re accepted.',
  main: h(OnBoardingScreen),
})

const onBoardingCashback3: StepInit = () => ({
  step: StepName.OnBoardingCashback3,
  title: 'Get CC Points',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: h(OnBoardingScreen),
})

const onBoardingCashback4: StepInit = () => ({
  step: StepName.OnBoardingCashback4,
  title: 'Find places to pay with and earn CC Points',
  main: h(OnBoardingScreen),
})

const onBoardingBluecode1: StepInit = () => ({
  step: StepName.OnBoardingBluecode1,
  title: 'What\'s Bluecode?',
  description: 'Bluecode is a European payment service that now supports NIM.',
  main: h(OnBoardingScreen),
})

const onBoardingBluecode2: StepInit = () => ({
  step: StepName.OnBoardingBluecode2,
  title: 'Pay with Bluecode',
  description: 'Create a Bluecode Barcode and show it at the cashier to pay. ',
  main: h(OnBoardingScreen),
})

const onBoardingBluecode3: StepInit = () => ({
  step: StepName.OnBoardingBluecode3,
  title: 'Verify your ID',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: h(OnBoardingScreen),
})

const qrCodeScannerStep: StepInit = () => ({
  step: StepName.QRCodeScanner,
  title: 'Scan QR code',
  main: h(QRCodeScanner),
})

const paymentPreviewStep: StepInit = () => {
  const title = ref<string>('')
  return {
    step: StepName.PaymentPreview,
    title,
    main: h(PaymentPreview),
    async beforeDisplay({ qrCodeScanner }) { title.value = qrCodeScanner?.locationName || 'Payment preview' }, // TODO Add icon
  }
}

const baseSetupSteps = [pinCodeStep, pinCodeConfirmStep, () => phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep, getNotifiedStep]
const onBoardingPointsSteps = [onBoardingPoints1, onBoardingPoints2, onBoardingPoints3]

const flows: Record<FlowName, StepInit[]> = {
  [FlowName.Login]: [recoveryWordsStep, ...baseSetupSteps],
  [FlowName.Setup]: [...baseSetupSteps],
  [FlowName.VerifyPhone]: [phoneNumberStep, phoneNumberConfirmStep, ...onBoardingPointsSteps],
  [FlowName.SetupWithPromoCode]: [promoCodeStep, ...baseSetupSteps],
  [FlowName.OnBoardingPoints]: [...onBoardingPointsSteps],
  [FlowName.OnBoardingCashback]: [onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4],
  [FlowName.OnBoardingBluecode]: [onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3],
  [FlowName.NimOrPointsPayment]: [qrCodeScannerStep, paymentPreviewStep],
}

const onDoneFlows: Record<FlowName, Flow['onDone']> = {
  [FlowName.Login]: async state => console.log(state.pinCode),
  [FlowName.Setup]: async (state, { goTo }) => {
    const err = await (await import('@/composables/useDecrypt')).useDecrypt().decrypt(state.pinCode!)
    if (err)
      console.error(err)

    goTo('/app')
  },
  [FlowName.VerifyPhone]: () => useModal().showModal(Modal.Points),
  [FlowName.SetupWithPromoCode]: async () => { console.log('Setup with promo code done'); return Promise.resolve() },
  [FlowName.OnBoardingPoints]: () => useModal().showModal(Modal.Points),
  [FlowName.OnBoardingCashback]: async () => { console.log('On boarding cashback done'); return Promise.resolve() },
  [FlowName.OnBoardingBluecode]: async () => { console.log('On boarding bluecode done'); return Promise.resolve() },
  [FlowName.NimOrPointsPayment]: async (state, { goTo }) => {
    const merchantPaymentInfo = state[StepName.QRCodeScanner]!
    switch (state[StepName.PaymentPreview]) {
      case PaymentMethod.Nim:
        await (await import('@/stores/transactions')).useTransactions().sendTx({ transfer: Transfer.UserPayment, ...merchantPaymentInfo })
        break
      case PaymentMethod.Points:
        if (!merchantPaymentInfo.message)
          throw new Error(`You cannot pay with points without a message. ${JSON.stringify(merchantPaymentInfo)}`)

        // TODO Check this is correct
        await (await import('@/stores/points')).usePoints().payWithPoints({ type: 'TODO', reference: merchantPaymentInfo.message, destination: merchantPaymentInfo.recipient })
    }
    goTo('/app')
  },
}

export function getFlow(name: FlowName): Flow {
  const steps = flows[name].map(step => step())
  const state = Object.fromEntries(Object.keys(steps).map(step => [step, undefined])) as State
  const onDone = onDoneFlows[name]
  return { name, state, steps, onDone }
}

/**
 * It initializes the flow give the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export function initializeFlow(name: FlowName) {
  const isFullscreen = false
  modalController.create({
    component: FlowCmp,
    handle: false,
    canDismiss: true,
    initialBreakpoint: isFullscreen ? undefined : 1,
    breakpoints: isFullscreen ? undefined : [0, 1],
    componentProps: { flow: getFlow(name) },
  }).then(modal => modal.present())
}

export async function cancelFlow(beforeCancel: Function) {
  await beforeCancel()
  const modal = await modalController.getTop()
  await modal.dismiss()
}
