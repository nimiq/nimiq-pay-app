import { type Component, computed, defineAsyncComponent, h, markRaw, ref } from 'vue'
import { isValidPhoneNumber } from 'libphonenumber-js/mobile'
import { QRDataFormat } from '../../composables/useStringParser'
import { usePayment } from '../../composables/usePayment'
import { FlowName, StepName, defaultStepInitOptions } from '@/lib/flows/steps.types'
import type { Step, StepInit } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'
import { type ExternalTransaction, MerchantCategory, Transfer, translateTransactionTitle } from '@/types/transactions'
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
const BackupIntroduction = defineAsyncComponent(() => import('@/components/BackupIntroduction.vue'))
const ShowWords = defineAsyncComponent(() => import('@/components/ShowWords.vue'))
const ValidateWords = defineAsyncComponent(() => import('@/components/ValidateWords.vue'))
const BitrefillWidget = defineAsyncComponent(() => import('@/components/BitrefillWidget.vue'))

const PIN_CODE_REGEX = /^\d{4}$/

export const promoCodeStep: StepInit = async () => ({
  step: StepName.PromoCode,
  get title() { return i18n.t('Enter your promo code') },
  get description() { return i18n.t('Enter your referral promo code.') },
  main: markRaw(props => h(GenericInput, { ...props, inputLength: 7 })),
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
} satisfies Step)

export const recoveryWordsStep: StepInit = async () => ({
  step: StepName.RecoveryWordsStep,
  get title() { return i18n.t('Enter recovery words') },
  main: markRaw(BrickInput),
  beforeNext: async (state, { next, err }) => {
    const { importWords } = (await import('@/stores/local-wallet')).useLocalWallet()
    const { error } = importWords(state.recoveryWordsStep)
    if (error) {
      err(error)
    }
    else {
      // Clear recovery words from memory just in case
      state[StepName.RecoveryWordsStep] = []
      next()
    }
  },
} satisfies Step)

export const pinCodeStep: StepInit = async ({ flowName }) => {
  const { FlowName: Flow } = await import('@/lib/flows/steps.types')
  const isTxFlow = (f?: FlowName) => f && [Flow.NimOrPointsPayment, Flow.NimWithdraw, Flow.Bitrefill].includes(f)
  return {
    step: StepName.PinCode,
    get title() { return isTxFlow(flowName) ? i18n.t('Insert PIN to confirm') : i18n.t('Choose a PIN') },
    get description() { return isTxFlow(flowName) ? '' : i18n.t('Protect your Nimiq Pay app with a pin.') },
    main: markRaw(props => h(PinInput, { ...props, inputLength: 4, showLoading: isTxFlow(flowName) })),
    beforeRender: async (state) => {
      // We only care about login/setup flows
      if (isTxFlow(flowName))
        return

      // If there is a pinHash, it means that the user is going backwards
      const { useApp } = (await import('@/stores/app'))
      // Clear pin code from memory just in case
      // Since state is a JSON object, we take advantage of the fact that it's a reference
      state[StepName.PinCode] = ''
      state[StepName.PinCodeConfirm] = ''
      useApp().clearPinInputTs()

      const { reset } = (await import('@/composables/useDecrypt')).useDecrypt()
      reset()
    },
    beforeNext: async (state, { next, err, navigateTo }) => {
      const { useApp } = (await import('@/stores/app'))
      const { pinHash } = useApp()
      const { pinCode } = state
      if (!pinCode) {
        err(i18n.t('Please enter a PIN code'))
      }
      else if (!PIN_CODE_REGEX.test(pinCode)) {
        if (import.meta.env.DEV)
          debugger // eslint-disable-line no-debugger,no-restricted-syntax
        err(i18n.t('Invalid PIN code'))
      }
      else if (pinHash && flowName !== FlowName.Setup && flowName !== FlowName.SetupWithPromoCode && flowName !== FlowName.Login) {
        if (pinHash !== hash(pinCode)) {
          err(i18n.t('Invalid PIN code'))
        }
        else {
          useApp().updatePinInputTs()
          if (flowName === FlowName.Bitrefill) {
            const { [StepName.PaymentPreview]: method, [StepName.BitrefillWidget]: request } = state
            if (!request)
              // No translation as not user-facing. Dev error which should not occur in production.
              throw new Error(`${flowName} flow expected a parsed payment request`)

            if (await usePayment().makePayment(method, request, err))
              navigateTo({ step: StepName.BitrefillWidget })
          }
          else { next() }
        }
      }
      else { next() }
    },
  } satisfies Step
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
      await (await import('@/stores/conn')).useConn().resetSecret()
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
} satisfies Step)

export const phoneNumberStep: StepInit = async ({ skipAheadBy, goBackBy } = defaultStepInitOptions) => ({
  step: StepName.PhoneNumber,
  get title() { return i18n.t('Verify your phone number') },
  get description() { return i18n.t('You will receive an SMS with a verification code') },
  main: markRaw(props => h(PhoneInput, { ...props, canSkip: !!skipAheadBy })),
  skipAheadBy,
  goBackBy,
  beforeNext: async ({ phoneNumber }, { next, err }) => {
    const { nextRequestCapTs } = (await import('@/stores/points')).usePoints()
    if (!phoneNumber) {
      err(i18n.t('Please enter a phone number'))
    }
    else if (!isValidPhoneNumber(phoneNumber)) {
      err(i18n.t('Invalid phone number'))
    }
    else if (nextRequestCapTs > Date.now()) {
      const minutes = Math.ceil((nextRequestCapTs - Date.now()) / 60 / 1000)
      err(i18n.tc('Please wait {time} minute before requesting a new code | Please wait {time} minutes before requesting a new code', minutes, { time: minutes }))
    }
    else {
      const res = await (await import('@/stores/points')).usePoints().authorize(phoneNumber)
      if (res && res.error)
        err(res.error)
      else next()
    }
  },
} satisfies Step)

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
} satisfies Step)

export const getNotifiedStep: StepInit = async ({ skipAheadBy = 1, goBackBy = 1 } = defaultStepInitOptions) => ({
  step: StepName.GetNotified,
  get title() { return i18n.t('Enable notifications') },
  get description() { return i18n.t('Get important info on transactions, top-ups, security and more.') },
  skipAheadBy,
  goBackBy,
  main: markRaw(EnableNotifications),
  beforeNext: async (_, { next, err }) => {
    const { registerNotifications } = (await import('@/composables/useNotifications')).useNotifications()
    const isRegistered = await registerNotifications()
    if (!isRegistered)
      err(i18n.t('Notifications cannot be enabled, skipping this step.'))

    next()
  },
} satisfies Step)

export const onBoardingPoints: StepInit = async () => ({
  step: StepName.OnBoardingPoints,
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const onBoardingCashback1: StepInit = async () => ({
  step: StepName.OnBoardingCashback1,
  get title() { return i18n.t('What are Cryptocity Points?') },
  get description() { return i18n.t('Cryptocity Points are loyalty reward points which you can earn and pay with. They are worth the same as NIM (1 Cryptocity Point : 1 NIM).') },
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const onBoardingCashback2: StepInit = async () => ({
  step: StepName.OnBoardingCashback2,
  get title() { return i18n.t('Pay with Cryptocity Points') },
  get description() { return i18n.t('Pay with Cryptocity Points instead of NIM wherever they\'re accepted.') },
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const onBoardingCashback3: StepInit = async () => ({
  step: StepName.OnBoardingCashback3,
  get title() { return i18n.t('Get Cryptocity Points') },
  get description() { return i18n.t('Get Cryptocity Points as cashback rewards or complete challenges to earn them.') },
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const onBoardingCashback4: StepInit = async () => ({
  step: StepName.OnBoardingCashback4,
  get title() { return i18n.t('Find places to pay with, and earn Cryptocity Points') },
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const onBoardingBluecode1: StepInit = async () => ({
  step: StepName.OnBoardingBluecode1,
  get title() { return i18n.t('What is Bluecode?') },
  get description() { return i18n.t('Bluecode is a European payment service that now supports NIM.') },
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const onBoardingBluecode2: StepInit = async () => ({
  step: StepName.OnBoardingBluecode2,
  get title() { return i18n.t('Pay with Bluecode') },
  get description() { return i18n.t('Create a Bluecode Barcode and show it at the cashier to pay.') },
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const onBoardingBluecode3: StepInit = async () => ({
  step: StepName.OnBoardingBluecode3,
  get title() { return i18n.t('Verify your ID') },
  get description() { return i18n.t('Get Cryptocity Points as cashback rewards or complete challenges to earn them.') },
  main: markRaw(OnBoardingScreen),
} satisfies Step)

export const qrCodeScannerStep: StepInit<{ expect: QRDataFormat }> = async (options) => {
  return {
    step: StepName.QRCodeScanner,
    get title() { return i18n.t('Scan QR code') },
    main: markRaw(props => h(QRScanner, { ...props, ...options?.props })),
    async beforeRender(state, { next }) {
      const { qrCodeScanner } = state
      // If it's a string, assume that it's a payment request
      if (qrCodeScanner && typeof qrCodeScanner === 'string') {
        const { getPaymentRequestData } = (await import('@/composables/useStringParser')).useStringParser()
        const { data, error } = await getPaymentRequestData(qrCodeScanner)
        if (error || !data)
          // We don't throw an error here, as we don't want to stop the flow. Let the user scan the QR code again.
          return console.error('Error parsing QR code when opening from appUrlOpen', error)
        state[StepName.QRCodeScanner] = data
        next()
      }
    },
    beforeNext: async (_, { next, prev }) => {
      if (options?.props?.expect === QRDataFormat.PaymentRequest)
        next()
      else if (options?.props?.expect === QRDataFormat.NimCashlink)
        next()
      else // For Top-Up and Withdrawal, we go back to the previous step
        prev()
    },
  } satisfies Step
}

export const paymentPreviewStep: StepInit = async ({ flowName }) => {
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
    async beforeRender({ qrCodeScanner, bitrefillWidget }) {
      if (!qrCodeScanner || typeof qrCodeScanner === 'string' || !bitrefillWidget)
        return
      title.value = (qrCodeScanner || bitrefillWidget).merchantName || i18n.t('Payment preview')
      merchantCategory.value = (qrCodeScanner || bitrefillWidget).merchantCategory
    },
    beforeNext: async (state, { next, navigateTo, err }) => {
      // The request should be a PaymentRequestData, but we need to handle the case where it's a string
      const stepNameWithThePaymentRequest = ({
        [FlowName.NimOrPointsPayment]: StepName.QRCodeScanner,
        [FlowName.Bitrefill]: StepName.BitrefillWidget,
      } as const)[flowName as string]
      if (!stepNameWithThePaymentRequest)
        // No translation as not user-facing. Dev error which should not occur in production.
        throw new Error(`No payment request step key found for flow: ${flowName}`)

      const { [stepNameWithThePaymentRequest]: request } = state
      if (typeof request === 'string')
        // No translation as not user-facing. Dev error which should not occur in production.
        throw new Error(`Request is a string: ${request}`)

      // If it has been more than 5 minutes since the last pin input, we go to the next step, which it is the pin input
      if ((await import('@/stores/app')).useApp().shouldAskPin()) {
        next()
      }
      else if (flowName === FlowName.Bitrefill) {
        const { [StepName.PaymentPreview]: method } = state
        if (!request)
          // No translation as not user-facing. Dev error which should not occur in production.
          throw new Error(`${flowName} flow expected a parsed payment request`)

        if (await usePayment().makePayment(method, request, err))
          navigateTo({ step: StepName.BitrefillWidget })
      }
      else { navigateTo({ skipAheadBy: 2 }) }
    },
  } satisfies Step
}

export const nimWithdrawalSelectionStep: StepInit = async () => ({
  step: StepName.NimWithdrawalSelection,
  get title() { return i18n.t('Withdraw') },
  main: markRaw(NimWithdraw),
  beforeNext: async ({ nimWithdrawalSelection: { amount, recipient } }, { next, err, finalizeFlow, navigateTo }) => {
    const remoteBalance = (await import('@/stores/remote-signer')).useRemoteSigner().remoteBalance
    const { formatCrypto } = (await import('@/composables/useCurrencyFormatter')).useCurrencyFormatter()
    const { Crypto } = (await import('@/stores/app'))

    if (amount > remoteBalance) {
      return err(i18n.t(
        'You don\'t have enough NIM. Your current balance is {balance}.',
        { balance: formatCrypto(remoteBalance, { currency: Crypto.NIM }) },
      ))
    }

    if (!amount || !recipient) {
      // User clicked "Add NIM address", let him go, by calling next()
      return next()
    }

    const { shouldAskPin } = (await import('@/stores/app')).useApp()
    if (shouldAskPin())
      return navigateTo({ step: StepName.PinCode })
    else
      finalizeFlow()
  },
} satisfies Step)

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
} satisfies Step)

export const nimAddressDisplay: StepInit = async () => ({
  step: StepName.NimAddressDisplay,
  get title() { return i18n.t('Send NIM to top up') },
  get description() { return i18n.t('Send a transaction to the address below. Top up as much as you like.') },
  main: markRaw(NimAddressDisplay),
} satisfies Step)

export const transactionList: StepInit = async () => ({
  step: StepName.TransactionList,
  main: markRaw(TransactionList),
  autofocus: false, // Don't autofocus on the search bar
} satisfies Step)

export const transactionDetail: StepInit = async () => {
  // As refs to be reactive
  const tx = ref<ExternalTransaction>()
  const title = computed(() => (tx.value
    ? tx.value.merchantName || translateTransactionTitle(tx.value.title)
    : null
  ) || i18n.t('Transaction'))
  const merchantCategory = computed(() => {
    if (tx.value?.transfer === Transfer.UserPaymentToMerchant || tx.value?.transfer === Transfer.UserPaymentToAtomicSwap)
      return tx.value?.merchantCategory
    if (tx.value?.transfer === Transfer.UserPayment && tx.value?.senderType === Nimiq.Account.Type.HTLC && tx.value?.recipientType === Nimiq.Account.Type.BASIC)
      return 'withdraw'
    if (tx.value?.transfer === Transfer.UserReceipt)
      return 'deposit'

    return MerchantCategory.Shop
  })
  const titleIcon: Component = markRaw(props => h(CategoryIcon, { ...props, category: merchantCategory.value }))
  return {
    step: StepName.PaymentPreview,
    title,
    titleIcon,
    main: markRaw(props => tx.value ? h(TransactionDetails, { ...props, tx: tx.value }) : []),
    async beforeRender({ transactionList: selectedTx }) {
      tx.value = selectedTx
    },
  } satisfies Step
}

export const backupIntroductionStep: StepInit = async () => ({
  step: StepName.BackupIntroduction,
  get title() { return i18n.t('There is no "Forgot password"') },
  get description() { return i18n.t('Create a backup. It\'s the only way to recover your account.') },
  main: markRaw(BackupIntroduction),
} satisfies Step)

export const showWordsStep: StepInit = async () => ({
  step: StepName.ShowWords,
  get title() { return i18n.t('Write down these words') },
  get description() { return i18n.t('Write the words below on a piece of paper in the exact order.\nKeep your recovery words safe and never share them with anyone!') },
  main: markRaw(ShowWords),
} satisfies Step)

export const validateWordsStep: StepInit = async () => ({
  step: StepName.ValidateWords,
  get title() { return i18n.t('Test your backup') },
  main: markRaw(ValidateWords),
  goBackBy: 1,
} satisfies Step)

export const bitrefillWidgetStep: StepInit = async () => ({
  step: StepName.BitrefillWidget,
  // get title() { return i18n.t('Shop') },
  // get description() { return i18n.t('Buy NIM with a credit card or other payment methods.') },
  main: markRaw(BitrefillWidget),
} satisfies Step)
