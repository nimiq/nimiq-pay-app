import { type VNode, computed, defineAsyncComponent, h, ref } from 'vue'
import { QRDataFormat } from '../../composables/useStringParser'
import { type PaymentRequestData, type StepInit, StepName, defaultStepInitOptions } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'
import { type ExternalTransaction, type ShopCategory, Transfer, markAsUnknownTransactionTitle, translateTransactionTitle } from '@/types/transactions'
import { PaymentMethod } from '@/types/database'

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue')) as unknown as VNode
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue')) as unknown as VNode
const CodeInput = defineAsyncComponent(() => import('@/components/CodeInput.vue')) as unknown as VNode
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue')) as unknown as VNode
const GenericInput = defineAsyncComponent(() => import('@/components/GenericInput.vue')) as unknown as VNode
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue')) as unknown as VNode
const EnableNotifications = defineAsyncComponent(() => import('@/components/EnableNotifications.vue')) as unknown as VNode
const QRScanner = defineAsyncComponent(() => import('@/components/QRScanner.vue')) as unknown as VNode
const PaymentPreview = defineAsyncComponent(() => import('@/components/PaymentPreview.vue')) as unknown as VNode // TODO This is not being used.
const CategoryIcon = defineAsyncComponent(() => import('@/components/icons/categories/CategoryIcon.vue')) as unknown as VNode
const NimWithdraw = defineAsyncComponent(() => import('@/components/NimWithdraw.vue')) as unknown as VNode
const NimAddressInput = defineAsyncComponent(() => import('@/components/NimAddressInput.vue')) as unknown as VNode
const NimAddressDisplay = defineAsyncComponent(() => import('@/components/NimAddressDisplay.vue')) as unknown as VNode
const TransactionList = defineAsyncComponent(() => import('@/components/TransactionList.vue')) as unknown as VNode
const TransactionDetails = defineAsyncComponent(() => import('@/components/TransactionDetails.vue')) as unknown as VNode

const PIN_CODE_REGEX = /^\d{4}$/
const PHONE_NUMBER_REGEX = /\+(\d{1,4})[-.\s]?(?:[(](\d{1,3})[)][-.\s]?)?(\d{1,4})[-.\s]?(\d{1,4})[-.\s]?(\d{1,9})/

export const promoCodeStep: StepInit = async () => ({
  step: StepName.PromoCode,
  get title() { return i18n.t('Enter your promo code') },
  get description() { return i18n.t('Enter your referral promo code.') },
  main: GenericInput,
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
  main: BrickInput,
  beforeNext: async ({ recoveryWordsStep }, { next, err }) => {
    const { importWords } = (await import('@/stores/local-wallet')).useLocalWallet()
    const { error } = importWords(recoveryWordsStep)
    if (error)
      err(error)
    else
      next()
  },
})

export const pinCodeStep: StepInit = async () => ({
  step: StepName.PinCode,
  get title() { return i18n.t('Choose a PIN') },
  get description() { return i18n.t('Protect your NIM Pay app with a pin.') },
  main: h(PinInput, { inputLength: 4 }),
  beforeNext: async ({ pinCode }, { next, err }) => {
    if (!pinCode) {
      err(i18n.t('Please enter a PIN code'))
    }
    else if (!PIN_CODE_REGEX.test(pinCode)) {
      if (import.meta.env.DEV)
        debugger // eslint-disable-line no-debugger,no-restricted-syntax
      err(i18n.t('Invalid PIN code'))
    }
    else { next() }
  },
})

export const pinCodeConfirmStep: StepInit = async () => ({
  step: StepName.PinCodeConfirm,
  get title() { return i18n.t('Confirm your PIN') },
  get description() { return i18n.t('Protect your NIM Pay app with a pin.') },
  main: h(PinInput, { inputLength: 4 }),
  beforeNext: async ({ pinCode, pinCodeConfirm }, { next, err }) => {
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
    if (!isWeb) {
      const { sqlite } = (await import('@/stores/conn')).useConn()
      await sqlite.deleteOldDatabases()
      await sqlite.clearEncryptionSecret()
    }

    const { decrypt, decrypted } = (await import('@/composables/useDecrypt')).useDecrypt()
    const decryptError = await decrypt(pinCode)
    if (decryptError) {
      err(decryptError)
      return
    }
    if (!decrypted) {
      err(i18n.t('There was an error'))
      return
    }
    next()
  },
})

export const phoneNumberStep: StepInit = async ({ stepsToSkip } = defaultStepInitOptions) => ({
  step: StepName.PhoneNumber,
  get title() { return i18n.t('Verify your phone number') },
  get description() { return i18n.t('You will receive a SMS with a verification code') },
  main: h(PhoneInput, { canSkip: !!stepsToSkip }),
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
        err(res.error || i18n.t('Error authorizing phone number'))
      else next()
    }
  },
})

export const phoneNumberConfirmStep: StepInit = async () => ({
  step: StepName.PhoneNumberConfirm,
  get title() { return i18n.t('Confirm your phone number') },
  get description() { return i18n.t('Enter the code from the SMS sent to') },
  main: h(CodeInput, { inputLength: 6, backButtonText: i18n.t('Resend') }),
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
        err(res.error || i18n.t('Error verifying phone number'))
      else
        next()
    }
  },
})

export const getNotifiedStep: StepInit = async () => ({
  step: StepName.GetNotified,
  get title() { return i18n.t('Enable notifications') },
  get description() { return i18n.t('Get important info on transactions, top ups, security and more.') },
  stepsToSkip: 1,
  main: EnableNotifications,
})

export const onBoardingPoints: StepInit = async () => ({
  step: StepName.OnBoardingPoints,
  main: OnBoardingScreen,
})

export const onBoardingCashback1: StepInit = async () => ({
  step: StepName.OnBoardingCashback1,
  get title() { return i18n.t('What\'s Crypto City Points?') },
  get description() { return i18n.t('Crypto City Points (or CC Points) are a bonus currency worth the same as NIM.') },
  main: OnBoardingScreen,
})

export const onBoardingCashback2: StepInit = async () => ({
  step: StepName.OnBoardingCashback2,
  get title() { return i18n.t('Pay with CC Points') },
  get description() { return i18n.t('Pay with CC Points instead of NIM wherever they\'re accepted.') },
  main: OnBoardingScreen,
})

export const onBoardingCashback3: StepInit = async () => ({
  step: StepName.OnBoardingCashback3,
  get title() { return i18n.t('Get CC Points') },
  get description() { return i18n.t('Get CC Points as cashback rewards or complete challenges to earn them.') },
  main: OnBoardingScreen,
})

export const onBoardingCashback4: StepInit = async () => ({
  step: StepName.OnBoardingCashback4,
  get title() { return i18n.t('Find places to pay with and earn CC Points') },
  main: OnBoardingScreen,
})

export const onBoardingBluecode1: StepInit = async () => ({
  step: StepName.OnBoardingBluecode1,
  get title() { return i18n.t('What\'s Bluecode?') },
  get description() { return i18n.t('Bluecode is a European payment service that now supports NIM.') },
  main: OnBoardingScreen,
})

export const onBoardingBluecode2: StepInit = async () => ({
  step: StepName.OnBoardingBluecode2,
  get title() { return i18n.t('Pay with Bluecode') },
  get description() { return i18n.t('Create a Bluecode Barcode and show it at the cashier to pay.') },
  main: OnBoardingScreen,
})

export const onBoardingBluecode3: StepInit = async () => ({
  step: StepName.OnBoardingBluecode3,
  get title() { return i18n.t('Verify your ID') },
  get description() { return i18n.t('Get CC Points as cashback rewards or complete challenges to earn them.') },
  main: OnBoardingScreen,
})

export const qrCodeScannerStep: StepInit<{ expect: QRDataFormat }> = async (options) => {
  const { isWeb } = (await import('@/composables/useDevice')).useDevice()
  return {
    step: StepName.QRCodeScanner,
    get title() { return i18n.t('Scan QR code') },
    main: h(QRScanner, options?.props),
    canDismiss: !isWeb,
    beforeNext: async (_, { next, prev }) => {
      if (options?.props?.expect === QRDataFormat.PaymentRequest)
        next()
      else if (options?.props?.expect === QRDataFormat.NimCashlink)
        next()
      else // For Top Up and Withdrawal, we go back to the previous step
        prev()
    },
  }
}

export const paymentPreviewStep: StepInit = async () => {
  // As refs to be reactive
  const title = ref(i18n.t('Payment preview'))
  const shopCategory = ref<ShopCategory>()
  const categoryIcon = h(CategoryIcon, { category: shopCategory.value })
  return {
    step: StepName.PaymentPreview,
    title,
    titleIcon: categoryIcon,
    main: PaymentPreview,
    async beforeDisplay({ qrCodeScanner }) {
      if (!qrCodeScanner || typeof qrCodeScanner === 'string')
        return
      title.value = qrCodeScanner.shopName || i18n.t('Payment preview')
      shopCategory.value = qrCodeScanner.shopCategory
    },
    beforeNext: async ({ paymentPreview: method, qrCodeScanner: _request }, { next, err }) => {
      if (_request instanceof String)
        // No translation as not user-facing. Dev error which should not occur in production.
        throw new Error(`Request is a string: ${_request}`)
      const request = _request as PaymentRequestData

      // eslint-disable-next-line no-console
      console.log(`🤑  Initializing payment process with ${method}`, request)

      switch (method) {
        case PaymentMethod.NIM:
          // TODO: handle error
          await (await import('@/stores/transactions')).useTransactions().sendTx({
            ...request!,
            title: request?.shopName
              ? markAsUnknownTransactionTitle(request.shopName)
              : 'Payment', // translated at display time
          })
          next()
          break
        case PaymentMethod.Points: {
          if (!request?.rail || !request?.railPeerId)
            // No translation as not user-facing. Dev error which should not occur in production.
            throw new Error(`You cannot pay with points without a railPeerId nor rail. Request: ${JSON.stringify(request)}`)

          const { error } = await (await import('@/stores/points')).usePoints().payWithPoints(request)
          if (error)
            err(error)
          else
            next()
          break
        }
      }
    },
  }
}

export const nimWithdrawalSelectionStep: StepInit = async () => ({
  step: StepName.NimWithdrawalSelection,
  get title() { return i18n.t('Withdraw') },
  main: NimWithdraw,
  beforeNext: async ({ nimWithdrawalSelection: { amount, recipient } }, { next, err }) => {
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
      await (await import('@/stores/transactions')).useTransactions().sendTx({ transfer: Transfer.UserPayment, recipient, amount, title })
      next()
    }
    // User clicked "Add NIM address", let him go, by calling next()
    else { next() }
  },
})

export const nimAddressInputStep: StepInit = async () => ({
  step: StepName.NimAddressInput,
  get title() { return i18n.t('Send NIM to this address') },
  get description() { return i18n.t('Copy or scan the address') },
  main: NimAddressInput,
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
  main: NimAddressDisplay,
})

export const transactionList: StepInit = async () => {
  return {
    step: StepName.TransactionList,
    main: TransactionList,
    autofocus: false, // Don't autofocus on the search bar
  }
}

export const transactionDetail: StepInit = async () => {
  // As refs to be reactive
  const tx = ref<ExternalTransaction>()
  const title = computed(() => (tx.value
    ? tx.value.shopName || translateTransactionTitle(tx.value.title)
    : null
  ) || i18n.t('Transaction'))
  const shopCategory = computed(() => tx.value?.shopCategory)
  const categoryIcon = h(CategoryIcon, { category: shopCategory.value })
  const main = h(TransactionDetails, { tx })
  return {
    step: StepName.PaymentPreview,
    title,
    titleIcon: categoryIcon,
    main,
    async beforeDisplay({ transactionList: selectedTx }) {
      tx.value = selectedTx
    },
  }
}
