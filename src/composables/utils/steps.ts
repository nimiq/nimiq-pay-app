import { defineAsyncComponent, h, reactive } from 'vue'
import { modalController } from '@ionic/vue'
import { renderToString } from 'vue/server-renderer'
import { QRScannerDataFormat } from '../useQRScanner'
import { Modal, useModal } from '@/composables/useModal'
import type { Flow, PaymentRequestData, State, StepInit } from '@/types/steps'
import { FlowName, PaymentMethod, StepName, defaultStepInitOptions, inputSteps } from '@/types/steps'

import FlowCmp from '@/components/Flow.vue'
import { Transfer } from '@/types/transactions'

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue'))
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue'))
const CodeInput = defineAsyncComponent(() => import('@/components/CodeInput.vue'))
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue'))
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue'))
const AllowNotifications = defineAsyncComponent(() => import('@/components/AllowNotifications.vue'))
const QRScanner = defineAsyncComponent(() => import('@/components/QRScanner.vue'))
const PaymentPreview = defineAsyncComponent(() => import('@/components/PaymentPreview.vue'))
const CategoryIcon = defineAsyncComponent(() => import('@/components/icons/categories/CategoryIcon.vue'))
const NimWithdraw = defineAsyncComponent(() => import('@/components/NimWithdraw.vue'))
const NimAddressInput = defineAsyncComponent(() => import('@/components/NimAddressInput.vue'))
const NimAddressDisplay = defineAsyncComponent(() => import('@/components/NimAddressDisplay.vue'))

const REFERRAL_CODE_REGEX = /^[a-zA-Z0-9]{6}$/
const PIN_CODE_REGEX = /^\d{4}$/
const PHONE_NUMBER_REGEX = /^\d{4,}$/

const promoCodeStep: StepInit = () => ({
  step: StepName.PromoCode,
  title: 'Enter your promo code',
  description: 'If you don\'t have one, you can skip this step.',
  main: BrickInput,
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
  main: BrickInput,
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
  main: AllowNotifications,
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
  main: OnBoardingScreen,
})

const onBoardingCashback2: StepInit = () => ({
  step: StepName.OnBoardingCashback2,
  title: 'Pay with CC Points',
  description: 'Pay with CC Points instead of NIM wherever they\'re accepted.',
  main: OnBoardingScreen,
})

const onBoardingCashback3: StepInit = () => ({
  step: StepName.OnBoardingCashback3,
  title: 'Get CC Points',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: OnBoardingScreen,
})

const onBoardingCashback4: StepInit = () => ({
  step: StepName.OnBoardingCashback4,
  title: 'Find places to pay with and earn CC Points',
  main: OnBoardingScreen,
})

const onBoardingBluecode1: StepInit = () => ({
  step: StepName.OnBoardingBluecode1,
  title: 'What\'s Bluecode?',
  description: 'Bluecode is a European payment service that now supports NIM.',
  main: OnBoardingScreen,
})

const onBoardingBluecode2: StepInit = () => ({
  step: StepName.OnBoardingBluecode2,
  title: 'Pay with Bluecode',
  description: 'Create a Bluecode Barcode and show it at the cashier to pay. ',
  main: OnBoardingScreen,
})

const onBoardingBluecode3: StepInit = () => ({
  step: StepName.OnBoardingBluecode3,
  title: 'Verify your ID',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: OnBoardingScreen,
})

const qrCodeScannerStep: StepInit<{ expect: QRScannerDataFormat }> = options => ({
  step: StepName.QRCodeScanner,
  title: 'Scan QR code',
  main: h(QRScanner, options?.props),
  beforeNext: async (_, { next, prev }) => {
    if (options?.props?.expect === QRScannerDataFormat.PaymentRequest)
      next()
    else // For Top Up and Withdrawal, we go back to the previous step
      prev()
  },
})

const paymentPreviewStep: StepInit = () => {
  let titleCmp = 'Payment preview' // Fall back
  return {
    step: StepName.PaymentPreview,
    get title() { return titleCmp },
    main: h(PaymentPreview),
    async beforeDisplay({ qrCodeScanner }) {
      if (!qrCodeScanner)
        return
      const { shopName: title = 'Payment preview', shopCategory: category } = qrCodeScanner as PaymentRequestData
      const iconInHTML = await renderToString(h(CategoryIcon, { style: 'width: 40px', category }))
      titleCmp = `${iconInHTML} ${title}`
    },
    beforeNext: async ({ paymentPreview: method, qrCodeScanner: _request }, { next }) => {
      if (_request instanceof String)
        throw new Error(`Request is a string: ${_request}`)
      const request = _request as PaymentRequestData

      // eslint-disable-next-line no-console
      console.log(`🤑  Initializing payment process with ${method}`, request)

      switch (method) {
        case PaymentMethod.NIM:
          await (await import('@/stores/transactions')).useTransactions().sendTx({ transfer: Transfer.UserPayment, ...request!, title: request?.shopName || 'Payment' })
          next()
          break
        case PaymentMethod.Points:
          if (!request?.message || !request?.rail)
            throw new Error(`You cannot pay with points without a message nor rail. Request: ${JSON.stringify(request)}`)

          await (await import('@/stores/points')).usePoints().payWithPoints({ rail: request.rail!, reference: request.message, recipient: request.recipient })
      }
    },
  }
}

const nimWithdrawalSelectionStep: StepInit = () => ({
  step: StepName.NimWithdrawalSelection,
  title: 'Withdraw',
  main: NimWithdraw,
  beforeNext: async ({ nimWithdrawalSelection: { amount, recipient } }, { next, err }) => {
    const remoteBalance = (await import('@/stores/remote-signer')).useRemoteSigner().remoteBalance
    const { formatCrypto } = (await import('@/stores/fiat')).useFiat()

    if (amount > remoteBalance) { err(`You don't have enough NIM. Your current balance is ${formatCrypto(remoteBalance, 'NIM')}`) }
    else if (amount && recipient) {
      // Didnt try it yet! But something like this should work
      const title = 'Withdraw? (this text will be in the transaction list of the sender, not in the message of the transaction)'
      await (await import('@/stores/transactions')).useTransactions().sendTx({ transfer: Transfer.UserPayment, recipient, amount, title })
      next()
    }
    // User clicked "Add NIM address", let him go, by calling next()
    else { next() }
  },
})

const nimAddressInputStep: StepInit = () => ({
  step: StepName.NimAddressInput,
  title: 'Nim address input',
  description: 'Witdhraw description?.',
  main: NimAddressInput,
  beforeNext: async ({ nimAddressInput }, { next, prev }) => {
    // The NIM Address Step is a special step:
    //   - if the address is ok, then we would go to the previous slide
    //   - if the address is empty, then the user clicked "Scan QR code"

    // TODO Validate address
    console.log(nimAddressInput)

    // Once the address is validated, go back to the previous step, which is the payment preview
    if (nimAddressInput)
      prev()
    else
      next()
  },
})

const nimAddressDisplay: StepInit = () => ({
  step: StepName.NimAddressDisplay,
  title: 'Send NIM to top up',
  description: 'Send a transaction to the address below. Top up as much as you like.',
  main: NimAddressDisplay,
})

export const closeModal = () => modalController.getTop().then(m => m.dismiss())

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
  [FlowName.NimOrPointsPayment]: [() => qrCodeScannerStep({ props: { expect: QRScannerDataFormat.PaymentRequest } }), paymentPreviewStep],
  [FlowName.NimWithdraw]: [nimWithdrawalSelectionStep, nimAddressInputStep, () => qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimiqAddress } })],
  [FlowName.NimTopUp]: [nimAddressDisplay, () => qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimCashlink } })],
}

const onDoneFlows: Record<FlowName, Flow['onDone']> = {
  [FlowName.Login]: async state => console.log(state.pinCode),
  [FlowName.Setup]: async (state, { goTo }) => {
    const err = await (await import('@/composables/useDecrypt')).useDecrypt().decrypt(state.pinCode!)
    if (err)
      console.error(err)

    goTo('/app')
    closeModal()
  },
  [FlowName.VerifyPhone]: async (_state) => {
    console.log('Verify phone done')
    useModal().showModal(Modal.Points)
  },
  [FlowName.SetupWithPromoCode]: closeModal,
  [FlowName.OnBoardingPoints]: () => useModal().showModal(Modal.Points),
  [FlowName.OnBoardingCashback]: closeModal,
  [FlowName.OnBoardingBluecode]: closeModal,
  [FlowName.NimOrPointsPayment]: closeModal, // The payment itself is handled in the step
  [FlowName.NimWithdraw]: closeModal, // The payment itself is handled in the step
  [FlowName.NimTopUp]: closeModal,
}

const flowsThatCanGoBack = [FlowName.NimWithdraw, FlowName.NimTopUp]
const canGoBack = (flow: FlowName) => flowsThatCanGoBack.includes(flow)

/**
 * It initializes the flow give the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export function initializeFlow(name: FlowName) {
  const isFullscreen = false

  // Initialize all the steps to undefined
  const state = reactive(Object.fromEntries(inputSteps.map(s => [s, undefined])) as unknown as State)
  const flow: Flow = { name, state, steps: flows[name].map(s => s()), onDone: onDoneFlows[name], canGoBack: canGoBack(name) }
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
