import { type Component, computed, defineAsyncComponent, h, markRaw, ref } from 'vue'
import { QRDataFormat } from '../../composables/useStringParser'
import { type StepInit, StepName, defaultStepInitOptions } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'
import { type ExternalTransaction, type MerchantCategory, Transfer, translateTransactionTitle } from '@/types/transactions'
import { useApp } from '@/stores/app'
import { hash } from '@/composables/useDecrypt'

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue'))
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue'))
const CodeInput = defineAsyncComponent(() => import('@/components/CodeInput.vue'))
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue'))
const GenericInput = defineAsyncComponent(() => import('@/components/GenericInput.vue'))
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue'))
const EnableNotifications = defineAsyncComponent(() => import('@/components/EnableNotifications.vue'))
const QRScanner = defineAsyncComponent(() => import('@/components/QRScanner.vue'))
const PaymentPreview = defineAsyncComponent(() => import('@/components/PaymentPreview.vue'))
const CategoryIcon = defineAsyncComponent(() => import('@/components/icons/categories/CategoryIcon.vue'))
const NimWithdraw = defineAsyncComponent(() => import('@/components/NimWithdraw.vue'))
const NimAddressInput = defineAsyncComponent(() => import('@/components/NimAddressInput.vue'))
const NimAddressDisplay = defineAsyncComponent(() => import('@/components/NimAddressDisplay.vue'))
const TransactionList = defineAsyncComponent(() => import('@/components/TransactionList.vue'))
const TransactionDetails = defineAsyncComponent(() => import('@/components/TransactionDetails.vue'))

const PIN_CODE_REGEX = /^\d{4}$/
const PHONE_NUMBER_REGEX = /\+(\d{1,4})[-.\s]?(?:[(](\d{1,3})[)][-.\s]?)?(\d{1,4})[-.\s]?(\d{1,4})[-.\s]?(\d{1,9})/

export const promoCodeStep: StepInit = async () => ({
  step: StepName.PromoCode,
  get title() { return i18n.t('Enter your promo code') },
  get description() { return i18n.t('Enter your referral promo code.') },
  main: markRaw(GenericInput),
  beforeNext: async ({ promoCode }, { next, err }) => {
    if (!promoCode) {
      err(i18n.t('Please enter a promo code'))
    }
    else {
      const { setReferralCode } = (await import('@/stores/app')).useApp()
      setReferralCode(promoCode)
      next()
    }
  },
})

export const recoveryWordsStep: StepInit = async () => ({
  step: StepName.RecoveryWordsStep,
  get title() { return i18n.t('Enter recovery words') },
  main: markRaw(BrickInput),
  beforeNext: async (state, { next, err }) => {
    const { importWords } = (await import('@/stores/local-wallet')).useLocalWallet()
    const { error } = importWords(state.recoveryWordsStep)
    if (error) { err(error) }
    else {
      // Clear recovery words from memory just in case
      state[StepName.RecoveryWordsStep] = []
      next()
    }
  },
})

export const pinCodeStep: StepInit = async ({ flowName }) => {
  const { FlowName } = await import('@/lib/flows/steps.types')
  return {
    step: StepName.PinCode,
    get title() { return flowName === FlowName.NimOrPointsPayment ? i18n.t('Insert PIN to confirm') : i18n.t('Choose a PIN') },
    get description() { return flowName === FlowName.NimOrPointsPayment ? '' : i18n.t('Protect your Nimiq Pay app with a pin.') },
    main: markRaw(props => h(PinInput, { ...props, inputLength: 4 })),
    beforeNext: async ({ pinCode }, { next, err }) => {
      if (!pinCode) {
        err(i18n.t('Please enter a PIN code'))
      }
      else if (!PIN_CODE_REGEX.test(pinCode)) {
        if (import.meta.env.DEV)
          debugger // eslint-disable-line no-debugger,no-restricted-syntax
        err(i18n.t('Invalid PIN code'))
      }
      else if (useApp().pinHash) {
        if (useApp().pinHash !== hash(pinCode)) {
          err(i18n.t('Invalid PIN code'))
        }
        else {
          useApp().updatePinInputTs()
          next()
        }
      }
      else { next() }
    },
  }
}

export const pinCodeConfirmStep: StepInit = async () => ({
  step: StepName.PinCodeConfirm,
  get title() { return i18n.t('Confirm your PIN') },
  get description() { return i18n.t('Protect your Nimiq Pay app with a pin.') },
  main: markRaw(props => h(PinInput, { ...props, inputLength: 4 })),
  beforeNext: async (state, { next, err }) => {
    const { pinCode, pinCodeConfirm } = state
    if (!pinCodeConfirm) {
      err(i18n.t('Please confirm your PIN code'))
      return
    }
    else if (pinCodeConfirm !== pinCode) {
      err(i18n.t('PIN did not match'))
      return
    }

    // Nuke everything in case there was a previous encryption db
    const { isWeb } = (await import('@/composables/useDevice')).useDevice()
    const { decrypt, decrypted } = (await import('@/composables/useDecrypt')).useDecrypt()

    if (!isWeb) {
      await (await import('@/stores/conn')).useConn().deleteDatabase(false)
      // Set it to false in case it was decrypted before, we are sure there's no encrypted db since we just deleted it
      decrypted.value = false
    }

    const decryptError = await decrypt(pinCode)
    if (decryptError) {
      err(decryptError)
      return
    }
    if (!decrypted.value) {
      err(i18n.t('Something went wrong decrypting the database'))
      return
    }

    // Clear pin code from memory just in case
    // Since state is a JSON object, we take advantage of the fact that it's a reference
    state[StepName.PinCode] = ''
    state[StepName.PinCodeConfirm] = ''

    next()
  },
})

export const phoneNumberStep: StepInit = async ({ stepsToSkip } = defaultStepInitOptions) => ({
  step: StepName.PhoneNumber,
  get title() { return i18n.t('Verify your phone number') },
  get description() { return i18n.t('You will receive an SMS with a verification code') },
  main: markRaw(props => h(PhoneInput, { ...props, canSkip: !!stepsToSkip })),
  stepsToSkip,
  beforeNext: async ({ phoneNumber }, { next, err }) => {
    if (!phoneNumber) {
      err(i18n.t('Please enter a phone number'))
    }
    else if (!PHONE_NUMBER_REGEX.test(phoneNumber)) {
      err(i18n.t('Invalid phone number'))
    }
    else {
      const res = await (await import('@/stores/points')).usePoints().authorize(phoneNumber)
      if (res && res.error)
        err(res.error)
      else next()
    }
  },
})

export const phoneNumberConfirmStep: StepInit = async () => ({
  step: StepName.PhoneNumberConfirm,
  get title() { return i18n.t('Confirm your phone number') },
  get description() { return i18n.t('Enter the code from the SMS sent to you.') },
  main: markRaw(props => h(CodeInput, { ...props, inputLength: 6, backButtonText: i18n.t('Resend') })),
  beforeNext: async ({ phoneNumberConfirm }, { next, prev, err }) => {
    if (!phoneNumberConfirm) {
      err(i18n.t('Please enter a verification code'))
    }
    else if (phoneNumberConfirm === 'back') {
      // User clicked "Resend"
      prev()
    }
    else {
      const res = await (await import('@/stores/points')).usePoints().verify(phoneNumberConfirm)
      if (res && res.error)
        err(res.error)
      else
        next()
    }
  },
})

export const getNotifiedStep: StepInit = async () => ({
  step: StepName.GetNotified,
  get title() { return i18n.t('Enable notifications') },
  get description() { return i18n.t('Get important info on transactions, top-ups, security and more.') },
  stepsToSkip: 1,
  main: markRaw(EnableNotifications),
})

export const onBoardingPoints: StepInit = async () => ({
  step: StepName.OnBoardingPoints,
  main: markRaw(OnBoardingScreen),
})

export const onBoardingCashback1: StepInit = async () => ({
  step: StepName.OnBoardingCashback1,
  get title() { return i18n.t('What are Cryptocity Points?') },
  get description() { return i18n.t('Cryptocity Points are loyalty reward points which you can earn and pay with. They are worth the same as NIM (1 Cryptocity Point : 1 NIM).') },
  main: markRaw(OnBoardingScreen),
})

export const onBoardingCashback2: StepInit = async () => ({
  step: StepName.OnBoardingCashback2,
  get title() { return i18n.t('Pay with Cryptocity Points') },
  get description() { return i18n.t('Pay with Cryptocity Points instead of NIM wherever they\'re accepted.') },
  main: markRaw(OnBoardingScreen),
})

export const onBoardingCashback3: StepInit = async () => ({
  step: StepName.OnBoardingCashback3,
  get title() { return i18n.t('Get Cryptocity Points') },
  get description() { return i18n.t('Get Cryptocity Points as cashback rewards or complete challenges to earn them.') },
  main: markRaw(OnBoardingScreen),
})

export const onBoardingCashback4: StepInit = async () => ({
  step: StepName.OnBoardingCashback4,
  get title() { return i18n.t('Find places to pay with, and earn Cryptocity Points') },
  main: markRaw(OnBoardingScreen),
})

export const onBoardingBluecode1: StepInit = async () => ({
  step: StepName.OnBoardingBluecode1,
  get title() { return i18n.t('What is Bluecode?') },
  get description() { return i18n.t('Bluecode is a European payment service that now supports NIM.') },
  main: markRaw(OnBoardingScreen),
})

export const onBoardingBluecode2: StepInit = async () => ({
  step: StepName.OnBoardingBluecode2,
  get title() { return i18n.t('Pay with Bluecode') },
  get description() { return i18n.t('Create a Bluecode Barcode and show it at the cashier to pay.') },
  main: markRaw(OnBoardingScreen),
})

export const onBoardingBluecode3: StepInit = async () => ({
  step: StepName.OnBoardingBluecode3,
  get title() { return i18n.t('Verify your ID') },
  get description() { return i18n.t('Get Cryptocity Points as cashback rewards or complete challenges to earn them.') },
  main: markRaw(OnBoardingScreen),
})

export const qrCodeScannerStep: StepInit<{ expect: QRDataFormat }> = async (options) => {
  const { isWeb } = (await import('@/composables/useDevice')).useDevice()
  return {
    step: StepName.QRCodeScanner,
    get title() { return i18n.t('Scan QR code') },
    main: markRaw(props => h(QRScanner, { ...props, ...options?.props })),
    canDismiss: !isWeb,
    beforeNext: async (_, { next, prev }) => {
      if (options?.props?.expect === QRDataFormat.PaymentRequest)
        next()
      else if (options?.props?.expect === QRDataFormat.NimCashlink)
        next()
      else // For Top-Up and Withdrawal, we go back to the previous step
        prev()
    },
  }
}

export const paymentPreviewStep: StepInit = async () => {
  // As refs to be reactive
  const title = ref(i18n.t('Payment preview'))
  const merchantCategory = ref<MerchantCategory>()
  const titleIcon: Component = markRaw(props => h(CategoryIcon, { ...props, category: merchantCategory.value }))
  return {
    step: StepName.PaymentPreview,
    title,
    titleIcon,
    main: markRaw(PaymentPreview),
    autofocus: false, // Don't autofocus on the toggle button
    async beforeDisplay({ qrCodeScanner }) {
      if (!qrCodeScanner || typeof qrCodeScanner === 'string')
        return
      title.value = qrCodeScanner.merchantName || i18n.t('Payment preview')
      merchantCategory.value = qrCodeScanner.merchantCategory
    },
    beforeNext: async ({ qrCodeScanner: _request }, { next, skip }) => {
      // The request should be a PaymentRequestData, but we need to handle the case where it's a string
      if (_request instanceof String)
        // No translation as not user-facing. Dev error which should not occur in production.
        throw new Error(`Request is a string: ${_request}`)

      // We go to the next step, which it is the pin input.
      // If the last time the user put the pin was less than 5 minutes ago, we skip the pin code step
      await next()
      if (!(await import('@/stores/app')).useApp().shouldAskPin())
        skip()
    },
  }
}

export const nimWithdrawalSelectionStep: StepInit = async () => ({
  step: StepName.NimWithdrawalSelection,
  get title() { return i18n.t('Withdraw') },
  main: markRaw(NimWithdraw),
  beforeNext: async ({ nimWithdrawalSelection: { amount, recipient } }, { next, err, finalizeFlow }) => {
    const remoteBalance = (await import('@/stores/remote-signer')).useRemoteSigner().remoteBalance
    const { formatCrypto } = (await import('@/composables/useCurrencyFormatter')).useCurrencyFormatter()

    if (amount > remoteBalance) {
      err(i18n.t(
        'You don\'t have enough NIM. Your current balance is {balance}.',
        { balance: formatCrypto(remoteBalance) },
      ))
    }
    else if (amount && recipient) {
      const title = 'Withdrawal' // translated at display time
      const { error } = await (await import('@/stores/transactions')).useTransactions().sendTx({ transfer: Transfer.UserPayment, recipient, amount, title })

      const { setToast } = (await import('@/composables/useToast')).useToast()

      if (error) {
        setToast({ message: `${i18n.t('Something went wrong')}.\n${error}`, error: !!error })
      }
      else {
        setToast({ message: i18n.t('Withdrawal successful') })
        await finalizeFlow()
      }
    }
    // User clicked "Add NIM address", let him go, by calling next()
    else { next() }
  },
})

export const nimAddressInputStep: StepInit = async () => ({
  step: StepName.NimAddressInput,
  get title() { return i18n.t('Send NIM to this address') },
  get description() { return i18n.t('Copy or scan the address') },
  main: markRaw(NimAddressInput),
  beforeNext: async ({ nimAddressInput }, { next, prev, err }) => {
    // The NIM Address Step is a special step:
    //   - if the address is ok, then we would go to the previous slide
    //   - if the address is empty, then the user clicked "Scan QR code"

    // Once the address is validated, go back to the previous step, which is the payment preview
    if (nimAddressInput) {
      const { ValidationUtils } = (await import('@nimiq/utils'))
      if (!ValidationUtils.isValidAddress(nimAddressInput))
        err(i18n.t('Invalid Nimiq address'))
      else
        prev()
    }
    else { next() }
  },
})

export const nimAddressDisplay: StepInit = async () => ({
  step: StepName.NimAddressDisplay,
  get title() { return i18n.t('Send NIM to top up') },
  get description() { return i18n.t('Send a transaction to the address below. Top up as much as you like.') },
  main: markRaw(NimAddressDisplay),
})

export const transactionList: StepInit = async () => ({
  step: StepName.TransactionList,
  main: markRaw(TransactionList),
  autofocus: false, // Don't autofocus on the search bar
})

export const transactionDetail: StepInit = async () => {
  // As refs to be reactive
  const tx = ref<ExternalTransaction>()
  const title = computed(() => (tx.value
    ? tx.value.merchantName || translateTransactionTitle(tx.value.title)
    : null
  ) || i18n.t('Transaction'))
  const merchantCategory = computed(() => tx.value?.merchantCategory)
  const titleIcon: Component = markRaw(props => h(CategoryIcon, { ...props, category: merchantCategory.value }))
  return {
    step: StepName.PaymentPreview,
    title,
    titleIcon,
    main: markRaw(props => tx.value ? h(TransactionDetails, { ...props, tx: tx.value }) : []),
    async beforeDisplay({ transactionList: selectedTx }) {
      tx.value = selectedTx
    },
  }
}
