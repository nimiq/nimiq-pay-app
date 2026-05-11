import type { Component } from 'vue'
import type { flowHeightOptions } from '@/lib/flows/index'
import type { Step, StepInit } from '@/lib/flows/steps.types'
import type { ExternalTransaction } from '@/types/transactions'
import { isValidPhoneNumber } from 'libphonenumber-js'
import { computed, defineAsyncComponent, h, markRaw, ref } from 'vue'
import { hash } from '@/composables/useDecrypt'
import { useDevice } from '@/composables/useDevice'
import { QRDataFormat } from '@/composables/useStringParser'
import { i18n } from '@/i18n/i18n-setup'
import { isNakaEnabled } from '@/lib'
import { Asset, assetToCrypto } from '@/lib/assets'
import { defaultStepInitOptions, FlowName, StepName } from '@/lib/flows/steps.types'
import { sleep } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { MerchantCategory, Transfer, translateTransactionTitle } from '@/types/transactions'

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue'))
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue'))
const CodeInput = defineAsyncComponent(() => import('@/components/CodeInput.vue'))
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue'))
const GenericInput = defineAsyncComponent(() => import('@/components/GenericInput.vue'))
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue'))
const EnableNotifications = defineAsyncComponent(() => import('@/components/EnableNotifications.vue'))
const QRScanner = defineAsyncComponent(() => import('@/components/QRScanner.vue'))
const HoldNakaCardToReader = defineAsyncComponent(() => import('@/components/naka/HoldNakaCardToReader.vue'))
const BluecodeNotSupported = defineAsyncComponent(() => import('@/components/bluecode/BluecodeNotSupported.vue'))
const QRCodeDisplay = defineAsyncComponent(() => import('@/components/QRCodeDisplay.vue'))
const PaymentPreview = defineAsyncComponent(() => import('@/components/PaymentPreview.vue'))
const CategoryIcon = defineAsyncComponent(() => import('@/components/icons/categories/CategoryIcon.vue'))
const PaymentAmountInput = defineAsyncComponent(() => import('@/components/PaymentAmountInput.vue'))
const NimWithdraw = defineAsyncComponent(() => import('@/components/NimWithdraw.vue'))
const NimWithdrawConfirm = defineAsyncComponent(() => import('@/components/NimWithdrawConfirm.vue'))
const NimAddressInput = defineAsyncComponent(() => import('@/components/NimAddressInput.vue'))
const WithdrawalAddressList = defineAsyncComponent(() => import('@/components/WithdrawalAddressList.vue'))
const NimAddressDisplay = defineAsyncComponent(() => import('@/components/NimAddressDisplay.vue'))
const ConfirmAddressDeletion = defineAsyncComponent(() => import('@/components/ConfirmAddressDeletion.vue'))
const TransactionList = defineAsyncComponent(() => import('@/components/TransactionList.vue'))
const TransactionDetails = defineAsyncComponent(() => import('@/components/TransactionDetails.vue'))
const BackupIntroduction = defineAsyncComponent(() => import('@/components/BackupIntroduction.vue'))
const ShowWords = defineAsyncComponent(() => import('@/components/ShowWords.vue'))
const ValidateWords = defineAsyncComponent(() => import('@/components/ValidateWords.vue'))
const EnableBiometric = defineAsyncComponent(() => import('@/components/EnableBiometric.vue'))
const PaymentRequestManualInput = defineAsyncComponent(() => import('@/components/PaymentRequestManualInput.vue'))
const ComingSoon = defineAsyncComponent(() => import('@/components/ComingSoon.vue'))
const NakaOnboardingWhatIsNaka = defineAsyncComponent(() => import('@/components/naka/NakaOnboardingWhatIsNaka.vue'))
const NakaOnboardingVerifyId = defineAsyncComponent(() => import('@/components/naka/NakaOnboardingVerifyId.vue'))
const NakaCardIsReady = defineAsyncComponent(() => import('@/components/naka/NakaCardIsReady.vue'))
const NakaCardManagement = defineAsyncComponent(() => import('@/components/naka/NakaCardManagement.vue'))
const NakaCardDelete = defineAsyncComponent(() => import('@/components/naka/NakaCardDelete.vue'))

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

export const pinCodeStep: StepInit = async ({ flowName, goBackBy = 1 }) => {
  const { FlowName: Flow } = await import('@/lib/flows/steps.types')
  const isTxFlow = (f?: FlowName) => f && [Flow.Payment, Flow.NimWithdraw].includes(f)
  const isPinRequired = (f?: FlowName) => f && [Flow.AskForPin].includes(f)
  return {
    step: StepName.PinCode,
    get title() { return isTxFlow(flowName) || isPinRequired(flowName) ? i18n.t('Insert PIN to confirm') : i18n.t('Choose a PIN') },
    get description() { return isTxFlow(flowName) || isPinRequired(flowName) ? '' : i18n.t('Protect your Nimiq Pay app with a pin.') },
    goBackBy,
    main: markRaw(props => h(PinInput, { ...props, inputLength: 4, showLoading: isTxFlow(flowName), canUseBiometric: isTxFlow(flowName) || isPinRequired(flowName) })),
    beforeRender: async (state) => {
      // We only care about login/setup flows
      if (isTxFlow(flowName) || flowName === Flow.ChangePin || isPinRequired(flowName))
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
    beforeNext: async ({ pinCode }, { next, err }) => {
      const { useApp } = (await import('@/stores/app'))
      const { pinHash } = useApp()
      if (!pinCode) {
        err(i18n.t('Please enter a PIN code'))
      }
      else if (!PIN_CODE_REGEX.test(pinCode)) {
        if (import.meta.env.DEV)
          debugger // eslint-disable-line no-debugger
        err(i18n.t('Invalid PIN code'))
      }
      else if (pinHash && flowName !== FlowName.Setup && flowName !== FlowName.SetupWithPromoCode && flowName !== FlowName.Login && flowName !== FlowName.ChangePin) {
        if (pinHash !== hash(pinCode)) {
          err(i18n.t('Invalid PIN code'))
        }
        else {
          useApp().updatePinInputTs()
          next()
        }
      }
      else { next() }
    },
  } satisfies Step
}

export const pinCodeConfirmStep: StepInit = async ({ flowName }) => {
  const { FlowName: Flow } = await import('@/lib/flows/steps.types')
  return {
    step: StepName.PinCodeConfirm,
    get title() { return i18n.t('Confirm your PIN') },
    get description() { return i18n.t('Protect your Nimiq Pay app with a pin.') },
    main: markRaw(props => h(PinInput, { ...props, inputLength: 4 })),
    beforeNext: async (state, { next, navigateTo, err }) => {
      const { pinCode, pinCodeConfirm } = state
      if (!pinCodeConfirm) {
        err(i18n.t('Please confirm your PIN code'))
        return
      }
      else if (pinCodeConfirm !== pinCode) {
        err(i18n.t('PIN did not match'))
        return
      }

      // Don't nuke everything if we are changing the pin
      if (flowName === Flow.ChangePin)
        return next()

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

      const { isBiometricSupported } = (await import('@/composables/useBiometric')).useBiometric()

      if (isBiometricSupported.value) {
        next()
      }
      else {
        // Clear pin code from memory just in case
        // Since state is a JSON object, we take advantage of the fact that it's a reference
        state[StepName.PinCode] = ''
        state[StepName.PinCodeConfirm] = ''

        navigateTo({ skipAheadBy: 2 })
      }
    },
  } satisfies Step
}

export const pinCodeChange: StepInit = async () => {
  return {
    step: StepName.PinCodeChange,
    get title() { return i18n.t('Insert PIN to confirm') },
    main: markRaw(props => h(PinInput, { ...props, inputLength: 4, canUseBiometric: false })),
    beforeRender: async (state) => {
      // Clear pin code from memory just in case
      // Since state is a JSON object, we take advantage of the fact that it's a reference
      state[StepName.PinCodeChange] = ''
    },
    beforeNext: async ({ pinCodeChange }, { next, err }) => {
      const { useApp } = (await import('@/stores/app'))
      const { pinHash } = useApp()
      if (!pinCodeChange)
        err(i18n.t('Please enter a PIN code'))
      else if (!PIN_CODE_REGEX.test(pinCodeChange))
        err(i18n.t('Invalid PIN code'))
      else if (pinHash !== hash(pinCodeChange))
        err(i18n.t('Invalid PIN code'))
      else next()
    },
  } satisfies Step
}

export const enableBiometricStep: StepInit = async ({ skipAheadBy = 1, goBackBy = 1 } = defaultStepInitOptions) => ({
  step: StepName.EnableBiometric,
  get title() { return i18n.t('Biometric Authentication') },
  get description() { return useDevice().isIOS ? i18n.t('Unlock the app using Touch ID/Face ID instead of PIN') : i18n.t('Unlock the app using Fingerprint instead of PIN') },
  skipAheadBy,
  goBackBy,
  main: markRaw(EnableBiometric),
  beforeNext: async (state, { next, err }) => {
    const { pinCode } = state
    const { setPinToSecureStorage, isBiometricEnabled } = (await import('@/composables/useBiometric')).useBiometric()

    const { success, error } = await setPinToSecureStorage(pinCode)
    if (!success) {
      err(error || i18n.t('Cannot enable biometric'))
      isBiometricEnabled.value = false
      return
    }
    isBiometricEnabled.value = true

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

// export const onBoardingCashback1: StepInit = async () => ({
//   step: StepName.OnBoardingCashback1,
//   get title() { return i18n.t('What are Cryptocity Points?') },
//   get description() { return i18n.t('Cryptocity Points are loyalty reward points which you can earn and pay with. They are worth the same as NIM (1 Cryptocity Point : 1 NIM).') },
//   main: markRaw(OnBoardingScreen),
// } satisfies Step)

// export const onBoardingCashback2: StepInit = async () => ({
//   step: StepName.OnBoardingCashback2,
//   get title() { return i18n.t('Pay with Cryptocity Points') },
//   get description() { return i18n.t('Pay with Cryptocity Points instead of NIM wherever they\'re accepted.') },
//   main: markRaw(OnBoardingScreen),
// } satisfies Step)

// export const onBoardingCashback3: StepInit = async () => ({
//   step: StepName.OnBoardingCashback3,
//   get title() { return i18n.t('Get Cryptocity Points') },
//   get description() { return i18n.t('Get Cryptocity Points as cashback rewards or complete challenges to earn them.') },
//   main: markRaw(OnBoardingScreen),
// } satisfies Step)

// export const onBoardingCashback4: StepInit = async () => ({
//   step: StepName.OnBoardingCashback4,
//   get title() { return i18n.t('Find places to pay with, and earn Cryptocity Points') },
//   main: markRaw(OnBoardingScreen),
// } satisfies Step)

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

export const qrCodeScannerStep: StepInit<{ expect: QRDataFormat, overrideHeight?: flowHeightOptions }> = async ({ props: defaultProps, allowGoBack }) => {
  return {
    step: StepName.QRCodeScanner,
    get title() { return i18n.t('Scan QR code') },
    ariaLabel: 'Scan QR code',
    allowGoBack,
    overrideHeight: defaultProps?.overrideHeight,
    main: markRaw(props => h(QRScanner, { ...props, ...defaultProps })),
    async beforeRender(state, { navigateTo }) {
      const { qrCodeScanner } = state
      // If it's a string, assume that it's a payment request
      if (qrCodeScanner && typeof qrCodeScanner === 'string') {
        const { getPaymentRequestData } = (await import('@/composables/useStringParser')).useStringParser()
        const { data, error } = await getPaymentRequestData(qrCodeScanner)
        if (error || !data)
          // We don't throw an error here, as we don't want to stop the flow. Let the user scan the QR code again.
          return console.error('Error parsing QR code/invoice when opening from appUrlOpen/detected invoice:', error)
        state[StepName.QRCodeScanner] = data
        // TODO: idk why, but iOS needs to have the modal half open before scrolling works
        if (useDevice().isIOS)
          await sleep(100)
        if (data.amount === 0)
          navigateTo({ step: StepName.PaymentAmountInput })
        else
          navigateTo({ step: StepName.PaymentPreview })
      }
    },
    beforeNext: async (state, { prev, navigateTo }) => {
      document.body.classList.remove('native-qr-scanner-modal-open')
      if (defaultProps?.expect === QRDataFormat.PaymentRequest) {
        if (state.qrCodeScanner === undefined)
          navigateTo({ step: StepName.PaymentRequestManualInput })
        else if (typeof state.qrCodeScanner === 'object' && state.qrCodeScanner.amount === 0)
          navigateTo({ step: StepName.PaymentAmountInput })
        else
          navigateTo({ step: StepName.PaymentPreview })
      }
      else if (defaultProps?.expect === QRDataFormat.NimCashlink) {
        navigateTo({ step: StepName.PaymentRequestManualInput })
      }
      else { // For Top-Up and Withdrawal, we go back to the previous step
        prev()
      }
    },
    beforePrev: async () => {
      document.body.classList.remove('native-qr-scanner-modal-open')
    },
  } satisfies Step
}

export const holdNakaCardToReaderStep: StepInit = async () => ({
  step: StepName.HoldNakaCardToReader,
  main: markRaw(isNakaEnabled ? HoldNakaCardToReader : ComingSoon),
  beforeNext: async ({ holdNakaCardToReader: data }, { navigateTo, finalizeFlow }) => {
    const { request } = data
    if (request.meta?.requireUserConfirmation) {
      navigateTo({ step: StepName.PaymentPreview })
    }
    else {
      finalizeFlow()
    }
  },
} satisfies Step)

export const bluecodeNotAvailableStep: StepInit = async ({ allowGoBack }) => ({
  step: StepName.BluecodePayment,
  main: markRaw(BluecodeNotSupported),
  allowGoBack,
  beforeNext: async (_state, { navigateTo }) => {
    navigateTo({ step: StepName.PaymentPreview })
  },
} satisfies Step)

export const bluecodeNotAvailbleStep: StepInit = async ({ allowGoBack }) => ({
  step: StepName.BluecodePayment,
  main: markRaw(BluecodeNotSupported),
  allowGoBack,
  beforeNext: async (_state, { navigateTo }) => {
    navigateTo({ step: StepName.PaymentPreview })
  },
} satisfies Step)

export const paymentRequestManualInputStep: StepInit = async ({ allowGoBack }) => {
  return {
    step: StepName.PaymentRequestManualInput,
    get title() { return i18n.t('Enter payment request') },
    main: markRaw(PaymentRequestManualInput),
    allowGoBack,
    beforeNext: async (state, { next, navigateTo }) => {
      const request = state.paymentRequestManualInput
      state.qrCodeScanner = request

      if (request && typeof request !== 'string' && request.amount === 0) {
        useApp().activeAsset = request.asset || Asset.NIM
        navigateTo({ step: StepName.PaymentAmountInput })
        return
      }

      next()
    },
  } satisfies Step
}

export const paymentAmountInputStep: StepInit = async () => {
  const title = ref(i18n.t('Payment Request'))
  const merchantCategory = ref<MerchantCategory>()
  const titleIcon: Component = markRaw(props => h(CategoryIcon, { ...props, category: merchantCategory.value }))
  return {
    step: StepName.PaymentAmountInput,
    title,
    titleIcon,
    main: markRaw(PaymentAmountInput),
    async beforeRender({ qrCodeScanner }) {
      if (!qrCodeScanner || typeof qrCodeScanner === 'string')
        return
      title.value = qrCodeScanner.merchantName || i18n.t('Payment Request')
      merchantCategory.value = qrCodeScanner.merchantCategory
    },
    beforeNext: async (state, { navigateTo }) => {
      const amountUnits = state[StepName.PaymentAmountInput]
      if (!amountUnits || amountUnits <= 0)
        return

      // Update the payment request with the user-entered amount
      const request = state[StepName.QRCodeScanner]
      if (request && typeof request !== 'string') {
        state[StepName.QRCodeScanner] = { ...request, amount: amountUnits }
      }

      navigateTo({ step: StepName.PaymentPreview })
    },
  } satisfies Step
}

export const paymentPreviewStep: StepInit = async () => {
  // As refs to be reactive
  const title = ref(i18n.t('Payment preview'))
  const merchantCategory = ref<MerchantCategory>()
  const titleIcon: Component = markRaw(props => h(CategoryIcon, { ...props, category: merchantCategory.value }))
  return {
    step: StepName.PaymentPreview,
    title,
    ariaLabel: 'Payment preview',
    titleIcon,
    main: markRaw(PaymentPreview),
    autofocus: false, // Don't autofocus on the toggle button
    async beforeRender({ qrCodeScanner }) {
      if (!qrCodeScanner || typeof qrCodeScanner === 'string')
        return
      title.value = qrCodeScanner.merchantName || i18n.t('Payment preview')
      merchantCategory.value = qrCodeScanner.merchantCategory
    },
    beforeNext: async ({ qrCodeScanner: request }, { navigateTo, finalizeFlow }) => {
      // The request should be a PaymentRequestData, but we need to handle the case where it's a string
      if (typeof request === 'string')
        // No translation as not user-facing. Dev error which should not occur in production.
        throw new Error(`Request is a string: ${request}`)

      // We go to the next step, which it is the pin input, if it has been more than 5 minutes since the last pin input
      if ((await import('@/stores/app')).useApp().shouldAskPin())
        navigateTo({ step: StepName.PinCode })
      else
        finalizeFlow()
    },
  } satisfies Step
}

export const nimWithdrawalAmountSelectionStep: StepInit = async () => ({
  step: StepName.NimWithdrawalAmountSelectionStep,
  get title() { return i18n.t('Withdraw') },
  ariaLabel: 'Withdraw',
  main: markRaw(NimWithdraw),
  beforeNext: async ({ nimWithdrawalAmountSelectionStep: { amount } }, { next, err }) => {
    const app = useApp()
    const currentBalance = app.isNimiqAsset
      ? (await import('@/stores/remote-signer')).useRemoteSigner().remoteBalance
      : (await import('@/stores/polygon-usdt')).usePolygonUsdt().balance
    const { formatCrypto } = (await import('@/composables/useCurrencyFormatter')).useCurrencyFormatter()

    if (amount > currentBalance) {
      return err(i18n.t(
        app.isNimiqAsset
          ? 'You don\'t have enough NIM. Your current balance is {balance}.'
          : 'You don\'t have enough USDT. Your current balance is {balance}.',
        { balance: formatCrypto(currentBalance, { currency: assetToCrypto(app.activeAsset) }) },
      ))
    }

    next()
  },
} satisfies Step)

export const nimWithdrawalConfirmStep: StepInit = async () => ({
  step: StepName.NimWithdrawalConfirmStep,
  get title() { return i18n.t('Confirm Withdrawal') },
  ariaLabel: 'Confirm Withdrawal',
  main: markRaw(NimWithdrawConfirm),
  beforeNext: async (_state, { navigateTo, finalizeFlow }) => {
    if (useApp().shouldAskPin())
      return navigateTo({ step: StepName.PinCode })
    finalizeFlow()
  },
} satisfies Step)

export const nimWithdrawalAddressSelectionStep: StepInit = async () => ({
  get title() { return i18n.t('Choose an address') },
  ariaLabel: 'Choose an address',
  step: StepName.NimWithdrawalAddressSelectionStep,
  main: markRaw(WithdrawalAddressList),
  autofocus: false, // Don't autofocus on the search bar
  beforeNext: async ({ nimWithdrawalAddressSelectionStep }, { next, finalizeFlow }) => {
    if (!nimWithdrawalAddressSelectionStep) {
      // User clicked "Add NIM address"
      return next()
    }
    else {
      // User selected an address
      const { useApp } = (await import('@/stores/app'))
      useApp().withdrawalAddress = nimWithdrawalAddressSelectionStep
      finalizeFlow()
    }
  },
} satisfies Step)

export const confirmAddressDeletionStep: StepInit = async () => ({
  step: StepName.ConfirmAddressDeletion,
  main: markRaw(props => h(ConfirmAddressDeletion, props)),
} satisfies Step)

export const nimAddressInputStep: StepInit<{ overrideHeight: flowHeightOptions }> = async ({ props }) => ({
  step: StepName.NimAddressInput,
  get title() { return useApp().isNimiqAsset ? i18n.t('Send NIM to this address') : i18n.t('Send USDT to this address') },
  ariaLabel: 'Send to this address',
  get description() { return i18n.t('Copy or scan the address') },
  main: markRaw(NimAddressInput),
  autofocus: false, // Usually the user will scan the QR code
  overrideHeight: props?.overrideHeight,
  beforeNext: async ({ nimAddressInput }, { next, prev, err }) => {
    // The NIM Address Step is a special step:
    //   - if the address is ok, then we would go to the previous slide
    //   - if the address is empty, then the user clicked "Scan QR code"

    // Once the address is validated, go back to the previous step, which is the payment preview
    if (nimAddressInput) {
      if (!useApp().isNimiqAsset) {
        const { isValidEthAddress } = await import('@/lib/ethereum')
        if (!isValidEthAddress(nimAddressInput))
          err(i18n.t('Invalid USDT address'))
        else
          prev()
      }
      else {
        const { ValidationUtils } = (await import('@nimiq/utils'))
        if (!ValidationUtils.isValidAddress(nimAddressInput))
          err(i18n.t('Invalid Nimiq address'))
        else
          prev()
      }
    }
    else { next() }
  },
} satisfies Step)

export const nimAddressDisplay: StepInit = async () => ({
  step: StepName.NimAddressDisplay,
  get title() { return useApp().isNimiqAsset ? i18n.t('Send NIM to top up') : i18n.t('Receive USDT on Polygon') },
  ariaLabel: 'Top up address',
  get description() { return useApp().isNimiqAsset ? i18n.t('Send a transaction to the address below. Top up as much as you like.') : i18n.t('Send USDT on Polygon to the address below.') },
  main: markRaw(NimAddressDisplay),
  beforeNext: async ({ nimAddressDisplay }, { next, navigateTo }) => {
    if (!useApp().isNimiqAsset) {
      const { isValidEthAddress } = await import('@/lib/ethereum')
      if (nimAddressDisplay && isValidEthAddress(nimAddressDisplay))
        navigateTo({ step: StepName.QRCodeDisplay })
      else
        next()
    }
    else {
      const { ValidationUtils } = (await import('@nimiq/utils'))
      if (nimAddressDisplay && ValidationUtils.isValidAddress(nimAddressDisplay)) {
        navigateTo({ step: StepName.QRCodeDisplay })
      }
      else if (nimAddressDisplay === undefined) {
        navigateTo({ step: StepName.QRCodeScanner })
      }
      else {
        next()
      }
    }
  },
} satisfies Step)

export const qrCodeDisplayStep: StepInit<{ stringToQr: string }> = async options => ({
  step: StepName.QRCodeDisplay,
  get title() { return i18n.t('Scan QR code') },
  get description() { return i18n.t('Scan the QR code to send NIM to this address') },
  main: markRaw(props => h(QRCodeDisplay, { ...props, ...options?.props })),
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
    if (tx.value?.transfer === Transfer.UserPayment && tx.value?.senderType === Nimiq.AccountType.HTLC && tx.value?.recipientType === Nimiq.AccountType.Basic)
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

export const comingSoonStep: StepInit = async () => ({
  step: StepName.ComingSoon,
  get title() { return i18n.t('We\'re working on something special') },
  main: markRaw(ComingSoon),
} satisfies Step)

export const whatIsNakaStep: StepInit = async () => ({
  step: StepName.WhatIsNaka,
  get title() { return i18n.t('Pay with NAKA Card') },
  get description() { return i18n.t('NAKA works just like a credit card. Pay with NIM simply by tapping your phone wherever NAKA is accepted.') },
  main: markRaw(isNakaEnabled ? NakaOnboardingWhatIsNaka : ComingSoon),
} satisfies Step)

export const verifyYourIdNakaStep: StepInit = async () => ({
  step: StepName.VerifyYourIdNaka,
  get title() { return i18n.t('Verify your ID') },
  get description() { return i18n.t('Please verify yourself with SumSub to activate your NAKA Card.') },
  main: markRaw(isNakaEnabled ? NakaOnboardingVerifyId : ComingSoon),
} satisfies Step)

export const nakaCardIsReadyStep: StepInit = async () => ({
  step: StepName.NakaCardIsReady,
  main: markRaw(isNakaEnabled ? NakaCardIsReady : ComingSoon),
} satisfies Step)

export const nakaCardManagementStep: StepInit = async () => ({
  step: StepName.NakaCardManagement,
  main: markRaw(isNakaEnabled ? NakaCardManagement : ComingSoon),
} satisfies Step)

export const nakaCardDeleteStep: StepInit = async () => {
  return {
    step: StepName.NakaCardDelete,
    get title() { return i18n.t('Block card') },
    get description() { return i18n.t('Blocking your card will permanently disable it. Your funds will not be affected and will remain safely in your account. You can always create a new card after you have blocked your current one.') },
    main: markRaw(isNakaEnabled ? NakaCardDelete : ComingSoon),
  } satisfies Step
}
