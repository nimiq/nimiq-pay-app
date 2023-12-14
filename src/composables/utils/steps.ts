import type { Ref, VNode } from 'vue'
import { defineAsyncComponent, h, reactive, ref } from 'vue'
import { modalController } from '@ionic/vue'
import { renderToString } from 'vue/server-renderer'
import { QRScannerDataFormat } from '../useQRScanner'
import { Modal, useModal } from '@/composables/useModal'
import type { Flow, PaymentRequestData, State, StepInit } from '@/types/steps'
import { FlowName, PaymentMethod, StepName, defaultStepInitOptions, inputSteps } from '@/types/steps'

import FlowCmp from '@/components/Flow.vue'
import type { ExternalTransaction } from '@/types/transactions'
import { Transfer } from '@/types/transactions'

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue')) as unknown as VNode
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue')) as unknown as VNode
const CodeInput = defineAsyncComponent(() => import('@/components/CodeInput.vue')) as unknown as VNode
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue')) as unknown as VNode
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue')) as unknown as VNode
const EnableNotifications = defineAsyncComponent(() => import('@/components/EnableNotifications.vue')) as unknown as VNode
const QRScanner = defineAsyncComponent(() => import('@/components/QRScanner.vue')) as unknown as VNode
const PaymentPreview = defineAsyncComponent(() => import('@/components/PaymentPreview.vue')) as unknown as VNode
const CategoryIcon = defineAsyncComponent(() => import('@/components/icons/categories/CategoryIcon.vue')) as unknown as VNode
const NimWithdraw = defineAsyncComponent(() => import('@/components/NimWithdraw.vue')) as unknown as VNode
const NimAddressInput = defineAsyncComponent(() => import('@/components/NimAddressInput.vue')) as unknown as VNode
const NimAddressDisplay = defineAsyncComponent(() => import('@/components/NimAddressDisplay.vue')) as unknown as VNode
const TransactionList = defineAsyncComponent(() => import('@/components/TransactionList.vue')) as unknown as VNode
const TransactionDetails = defineAsyncComponent(() => import('@/components/TransactionDetails.vue')) as unknown as VNode

const REFERRAL_CODE_REGEX = /^[a-zA-Z0-9]{6}$/
const PIN_CODE_REGEX = /^\d{4}$/
const PHONE_NUMBER_REGEX = /\+(\d{1,4})[-.\s]?(?:[(](\d{1,3})[)][-.\s]?)?(\d{1,4})[-.\s]?(\d{1,4})[-.\s]?(\d{1,9})/

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
  title: 'Choose a PIN',
  description: 'Protect your NIM Pay app with a pin.',
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
  description: 'Protect your NIM Pay app with a pin.',
  main: h(PinInput, { inputLength: 4 }),
  beforeNext: async ({ pinCode, pinCodeConfirm }, { next, err }) => {
    if (!pinCodeConfirm) { err('Please confirm your PIN code'); return }
    else if (pinCodeConfirm !== pinCode) { err('PIN did not match'); return }

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
  description: 'You will receive a SMS with a verification code',
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
  description: 'Enter the code from the SMS sent to',
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
  main: EnableNotifications,
  onCancel: async (_state, { path, replace }) => { path === '/setup' && await replace?.('/app') },
})

const onBoardingPoints: StepInit = () => ({
  step: StepName.OnBoardingPoints,
  main: OnBoardingScreen,
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
  description: 'Get CC Points as cashback rewards or complete challenges to earn them.',
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
  description: 'Get CC Points as cashback rewards or complete challenges to earn them.',
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
    main: PaymentPreview,
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
          await (await import('@/stores/transactions')).useTransactions().sendTx({ ...request!, title: request?.shopName || 'Payment' })
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
  title: 'Send NIM to this address',
  description: 'Copy or scan the address',
  main: NimAddressInput,
  beforeNext: async ({ nimAddressInput }, { next, prev, err }) => {
    // The NIM Address Step is a special step:
    //   - if the address is ok, then we would go to the previous slide
    //   - if the address is empty, then the user clicked "Scan QR code"

    // Once the address is validated, go back to the previous step, which is the payment preview
    if (nimAddressInput) {
      const { ValidationUtils } = (await import('@nimiq/utils'))
      if (!ValidationUtils.isValidAddress(nimAddressInput))
        err('Invalid Nimiq address')
      else
        prev()
    }
    else { next() }
  },
})

const nimAddressDisplay: StepInit = () => ({
  step: StepName.NimAddressDisplay,
  title: 'Send NIM to top up',
  description: 'Send a transaction to the address below. Top up as much as you like.',
  main: NimAddressDisplay,
})

const transactionList: StepInit = () => {
  return {
    step: StepName.TransactionList,
    main: TransactionList,
    autofocus: false, // Don't autofocus on the search bar
  }
}

const transactionDetail: StepInit = () => {
  const titleCmp = ref<string>('Payment preview')
  const tx = ref() as Ref<ExternalTransaction>
  return {
    step: StepName.PaymentPreview,
    get title() { return titleCmp.value },
    main: h(TransactionDetails, { tx }),
    async beforeDisplay({ transactionList: selectedTx }) {
      const { shopName: title = 'Payment preview', shopCategory: category } = selectedTx
      const iconInHTML = await renderToString(h(CategoryIcon, { style: 'width: 40px', category }))
      titleCmp.value = `${iconInHTML} ${title}`
      tx.value = selectedTx
    },
  }
}

export const closeModal = () => modalController.getTop().then(m => m.dismiss())

const baseSetupSteps = [pinCodeStep, pinCodeConfirmStep, () => phoneNumberStep({ stepsToSkip: 2 }), phoneNumberConfirmStep, getNotifiedStep, onBoardingPoints]

const flows: Record<FlowName, StepInit[]> = {
  [FlowName.Login]: [recoveryWordsStep, ...baseSetupSteps],
  [FlowName.Setup]: [...baseSetupSteps],
  [FlowName.VerifyPhone]: [phoneNumberStep, phoneNumberConfirmStep, onBoardingPoints],
  [FlowName.SetupWithPromoCode]: [promoCodeStep, ...baseSetupSteps],
  [FlowName.OnBoardingPoints]: [onBoardingPoints],
  [FlowName.OnBoardingCashback]: [onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4],
  [FlowName.OnBoardingBluecode]: [onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3],
  [FlowName.NimOrPointsPayment]: [() => qrCodeScannerStep({ props: { expect: QRScannerDataFormat.PaymentRequest } }), paymentPreviewStep],
  [FlowName.NimWithdraw]: [nimWithdrawalSelectionStep, nimAddressInputStep, () => qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimiqAddress } })],
  [FlowName.NimTopUp]: [nimAddressDisplay, () => qrCodeScannerStep({ props: { expect: QRScannerDataFormat.NimCashlink } })],
  [FlowName.ViewTransactions]: [transactionList, transactionDetail],
  [FlowName.ViewTransactionDetail]: [transactionDetail],
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
  [FlowName.ViewTransactions]: closeModal,
  [FlowName.ViewTransactionDetail]: closeModal,
}

const flowsThatCanGoBack = [FlowName.Setup, FlowName.NimWithdraw, FlowName.NimTopUp, FlowName.ViewTransactions]
const canGoBack = (flow: FlowName) => flowsThatCanGoBack.includes(flow)

/**
 * It initializes the flow give the name opening a new modal with the flow component
 * which handles the carousel of steps.
 */
export async function initializeFlow(name: FlowName, initialState?: Partial<State>) {
  const isFullscreen = false

  // Initialize all the steps to undefined
  const state = reactive({ ...Object.fromEntries(inputSteps.map(s => [s, undefined])) as unknown as State, ...initialState })
  const flow: Flow = { name, state, steps: flows[name].map(s => s()), onDone: onDoneFlows[name], canGoBack: canGoBack(name) }
  await flow.steps.at(0)?.beforeDisplay?.(state)
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
