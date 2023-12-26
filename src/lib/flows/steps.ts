import type { Ref, VNode } from 'vue'
import { defineAsyncComponent, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { QRDataFormat } from '../../composables/useStringParser'
import type { PaymentRequestData, StepInit } from '@/lib/flows/steps.types'
import { StepName, defaultStepInitOptions } from '@/lib/flows/steps.types'

import type { ExternalTransaction } from '@/types/transactions'
import { Transfer } from '@/types/transactions'
import { PaymentMethod } from '@/types/database'

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue')) as unknown as VNode
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue')) as unknown as VNode
const CodeInput = defineAsyncComponent(() => import('@/components/CodeInput.vue')) as unknown as VNode
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue')) as unknown as VNode
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

const REFERRAL_CODE_REGEX = /^[a-zA-Z0-9]{6}$/
const PIN_CODE_REGEX = /^\d{4}$/
const PHONE_NUMBER_REGEX = /\+(\d{1,4})[-.\s]?(?:[(](\d{1,3})[)][-.\s]?)?(\d{1,4})[-.\s]?(\d{1,4})[-.\s]?(\d{1,9})/

export const promoCodeStep: StepInit = async () => ({
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

export const recoveryWordsStep: StepInit = async () => ({
  step: StepName.RecoveryWordsStep,
  title: 'Enter recovery words',
  main: BrickInput,
  beforeNext: async (_, { next }) => next(),
})

export const pinCodeStep: StepInit = async () => ({
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

export const pinCodeConfirmStep: StepInit = async () => ({
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

export const phoneNumberStep: StepInit = async ({ stepsToSkip } = defaultStepInitOptions) => ({
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
})

export const phoneNumberConfirmStep: StepInit = async () => ({
  step: StepName.PhoneNumberConfirm,
  title: 'Confirm your phone number',
  description: 'Enter the code from the SMS sent to',
  main: h(CodeInput, { inputLength: 6 }),
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
})

export const getNotifiedStep: StepInit = async () => ({
  step: StepName.GetNotified,
  title: 'Enable notifications',
  description: 'Get important info on transactions, top ups, security and more.',
  stepsToSkip: 1,
  main: EnableNotifications,
})

export const onBoardingPoints: StepInit = async () => ({
  step: StepName.OnBoardingPoints,
  main: OnBoardingScreen,
})

export const onBoardingCashback1: StepInit = async () => ({
  step: StepName.OnBoardingCashback1,
  title: 'What\'s Crypto City Points?',
  description: 'Crypto City Points (or CC Points) are a bonus currency worth the same as NIM.  ',
  main: OnBoardingScreen,
})

export const onBoardingCashback2: StepInit = async () => ({
  step: StepName.OnBoardingCashback2,
  title: 'Pay with CC Points',
  description: 'Pay with CC Points instead of NIM wherever they\'re accepted.',
  main: OnBoardingScreen,
})

export const onBoardingCashback3: StepInit = async () => ({
  step: StepName.OnBoardingCashback3,
  title: 'Get CC Points',
  description: 'Get CC Points as cashback rewards or complete challenges to earn them.',
  main: OnBoardingScreen,
})

export const onBoardingCashback4: StepInit = async () => ({
  step: StepName.OnBoardingCashback4,
  title: 'Find places to pay with and earn CC Points',
  main: OnBoardingScreen,
})

export const onBoardingBluecode1: StepInit = async () => ({
  step: StepName.OnBoardingBluecode1,
  title: 'What\'s Bluecode?',
  description: 'Bluecode is a European payment service that now supports NIM.',
  main: OnBoardingScreen,
})

export const onBoardingBluecode2: StepInit = async () => ({
  step: StepName.OnBoardingBluecode2,
  title: 'Pay with Bluecode',
  description: 'Create a Bluecode Barcode and show it at the cashier to pay. ',
  main: OnBoardingScreen,
})

export const onBoardingBluecode3: StepInit = async () => ({
  step: StepName.OnBoardingBluecode3,
  title: 'Verify your ID',
  description: 'Get CC Points as cashback rewards or complete challenges to earn them.',
  main: OnBoardingScreen,
})

export const qrCodeScannerStep: StepInit<{ expect: QRDataFormat }> = async (options) => {
  const { isWeb } = (await import('@/composables/useDevice')).useDevice()
  return {
    step: StepName.QRCodeScanner,
    title: 'Scan QR code',
    main: h(QRScanner, options?.props),
    canDismiss: !isWeb,
    beforeNext: async (_, { next, prev }) => {
      if (options?.props?.expect === QRDataFormat.PaymentRequest)
        next()
      else // For Top Up and Withdrawal, we go back to the previous step
        prev()
    },
  }
}

export const paymentPreviewStep: StepInit = async () => {
  let titleCmp = 'Payment preview' // Fall back
  return {
    step: StepName.PaymentPreview,
    get title() { return titleCmp },
    main: PaymentPreview,
    async beforeDisplay({ qrCodeScanner }) {
      if (!qrCodeScanner)
        return
      const { shopName: title = 'Payment preview', shopCategory: category } = qrCodeScanner as PaymentRequestData
      const iconInHTML = await renderToString(h(CategoryIcon, { style: 'width: 40px: height: 40px', category }))
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
          if (!request?.rail || !request?.railPeerId)
            throw new Error(`You cannot pay with points without a railPeerId nor rail. Request: ${JSON.stringify(request)}`)

          await (await import('@/stores/points')).usePoints().payWithPoints({ rail: request.rail!, reference: request.railPeerId, recipient: request.recipient })
          next()
          break
      }
    },
  }
}

export const nimWithdrawalSelectionStep: StepInit = async () => ({
  step: StepName.NimWithdrawalSelection,
  title: 'Withdraw',
  main: NimWithdraw,
  beforeNext: async ({ nimWithdrawalSelection: { amount, recipient } }, { next, err }) => {
    const remoteBalance = (await import('@/stores/remote-signer')).useRemoteSigner().remoteBalance
    const { formatCrypto } = (await import('@/composables/useCurrencyFormatter')).useCurrencyFormatter()

    if (amount > remoteBalance) { err(`You don't have enough NIM. Your current balance is ${formatCrypto(remoteBalance)}`) }
    else if (amount && recipient) {
      const title = 'Withdrawal'
      await (await import('@/stores/transactions')).useTransactions().sendTx({ transfer: Transfer.UserPayment, recipient, amount, title })
      next()
    }
    // User clicked "Add NIM address", let him go, by calling next()
    else { next() }
  },
})

export const nimAddressInputStep: StepInit = async () => ({
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

export const nimAddressDisplay: StepInit = async () => ({
  step: StepName.NimAddressDisplay,
  title: 'Send NIM to top up',
  description: 'Send a transaction to the address below. Top up as much as you like.',
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
  const titleCmp = ref<string>('Payment preview')
  const tx = ref() as Ref<ExternalTransaction>
  return {
    step: StepName.PaymentPreview,
    get title() { return titleCmp.value },
    main: h(TransactionDetails, { tx }),
    async beforeDisplay({ transactionList: selectedTx }) {
      const title = selectedTx.shopName || selectedTx.title || 'Transaction'
      const iconInHTML = await renderToString(h(CategoryIcon, { style: 'width: 40px', category: selectedTx.shopCategory }))
      titleCmp.value = `${iconInHTML} ${title}`
      tx.value = selectedTx
    },
  }
}
