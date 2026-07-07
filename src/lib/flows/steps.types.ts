import type { Component, EmitsOptions, Ref } from 'vue'
import type { ExternalTransaction, PaymentMethod, Transaction, Transfer } from '../../types/transactions'
import type { PaymentSuccessMessage } from '../issuer-schemas/ws.schema'
import type { PaymentAnalyticsState } from '@/lib/analytics'
import type { flowHeightOptions } from '@/lib/flows/index'
import type { PolygonTransferQuote } from '@/lib/polygon/types'

export enum FlowName {
  Setup = 'setup',
  SetupWithPromoCode = 'setupWithPromoCode',
  Login = 'login',
  VerifyPhone = 'verifyPhone',
  OnBoardingPoints = 'onBoardingPoints',
  // OnBoardingCashback = 'onBoardingCashback',
  OnBoardingBluecode = 'onBoardingBluecode',
  Payment = 'payment',
  NimWithdraw = 'nimWithdraw',
  AddressSelection = 'addressSelection',
  AddressDeletion = 'addressDeletion',
  SaveAddress = 'saveAddress',
  NimTopUp = 'nimTopUp',
  ViewTransactions = 'viewTransactions',
  ViewTransactionDetail = 'viewTransactionDetail', // This is just a one-step flow
  Backup = 'backup',
  ChangePin = 'changePin',
  ComingSoon = 'comingSoon',
  NakaOnboarding = 'nakaOnboarding',
  NakaCardIsReady = 'nakaCardIsReady',
  NakaCardManagement = 'nakaCardManagement',
  AskForPin = 'askForPin',
}

interface FlowHookCbReturn {
  // Prevents the default behavior.
  // e.g. onDone will close the modal by default.
  prevent?: boolean
}
export type FlowHookCb = (state: State, options: { err: (msg: string) => void, setToast: (options: Toast) => void }) => Promise<FlowHookCbReturn | void>

export interface Flow {
  flowName: FlowName
  steps: Step[]

  // Function that will be called when the flow is supposed to be closed. If it
  // is not set, the flow will be closed automatically when the last step is
  // done.
  onDone?: FlowHookCb

  // Function that will be called when the flow is cancelled. Also, the flow
  // will be closed automatically when the last step is done.
  onCancel?: FlowHookCb

  // In which step the flow will start
  initialStep?: StepName

  // The component that will be filled in the defeault slot of Flow.vue
  slotComponent?: Component
}

export interface FlowInitOptions {
  // Currently none.
}

export type FlowInit = (options?: FlowInitOptions) => Promise<Flow>

export enum StepName {
  EnableBiometric = 'enableBiometric',
  PaymentRequestManualInput = 'paymentRequestManualInput',
  PaymentAmountInput = 'paymentAmountInput',
  PromoCode = 'promoCode',
  PinCode = 'pinCode',
  PinCodeConfirm = 'pinCodeConfirm',
  PinCodeChange = 'pinCodeChange',
  PhoneNumber = 'phoneNumber',
  PhoneNumberConfirm = 'phoneNumberConfirm',
  RecoveryWordsStep = 'recoveryWordsStep',
  GetNotified = 'getNotified',
  OnBoardingPoints = 'onBoardingPoints',
  // OnBoardingCashback1 = 'onBoardingCashback1',
  // OnBoardingCashback2 = 'onBoardingCashback2',
  // OnBoardingCashback3 = 'onBoardingCashback3',
  // OnBoardingCashback4 = 'onBoardingCashback4',
  OnBoardingBluecode1 = 'onBoardingBluecode1',
  OnBoardingBluecode2 = 'onBoardingBluecode2',
  OnBoardingBluecode3 = 'onBoardingBluecode3',
  QRCodeScanner = 'qrCodeScanner',
  HoldNakaCardToReader = 'holdNakaCardToReader',
  BluecodePayment = 'bluecodePayment',
  QRCodeDisplay = 'qrCodeDisplay',
  PaymentPreview = 'paymentPreview',
  NimWithdrawalAmountSelectionStep = 'nimWithdrawalAmountSelectionStep',
  NimWithdrawalAddressSelectionStep = 'nimWithdrawalAddressSelectionStep',
  NimWithdrawalConfirmStep = 'nimWithdrawalConfirmStep',
  NimAddressInput = 'nimAddressInput',
  NimAddressDisplay = 'nimAddressDisplay',
  ConfirmAddressDeletion = 'confirmAddressDeletion',
  TransactionList = 'transactionList',
  TransactionDetail = 'transactionDetail',
  BackupIntroduction = 'backupIntroduction',
  ShowWords = 'showWords',
  ValidateWords = 'validateWords',
  ComingSoon = 'comingSoon',
  WhatIsNaka = 'whatIsNaka',
  VerifyYourIdNaka = 'verifyYourIdNaka',
  NakaCardIsReady = 'nakaCardIsReady',
  NakaCardManagement = 'nakaCardManagement',
  NakaCardDelete = 'nakaDeleteCard',
}

export const inputSteps = [StepName.PromoCode, StepName.PinCode, StepName.PinCodeConfirm, StepName.PinCodeChange, StepName.PhoneNumber, StepName.PhoneNumberConfirm, StepName.NimAddressDisplay, StepName.RecoveryWordsStep, StepName.QRCodeScanner, StepName.PaymentPreview, StepName.NimWithdrawalAmountSelectionStep, StepName.NimWithdrawalAddressSelectionStep, StepName.NimAddressInput, StepName.TransactionList, StepName.PaymentRequestManualInput, StepName.PaymentAmountInput, StepName.HoldNakaCardToReader] as const
export type InputStepName = typeof inputSteps[number]
const infoSteps = [StepName.EnableBiometric, StepName.GetNotified, StepName.OnBoardingPoints, /* StepName.OnBoardingCashback1, StepName.OnBoardingCashback2, StepName.OnBoardingCashback3,  StepName.OnBoardingCashback4, */ StepName.OnBoardingBluecode1, StepName.OnBoardingBluecode2, StepName.OnBoardingBluecode3, StepName.TransactionDetail, StepName.BackupIntroduction, StepName.ShowWords, StepName.ValidateWords, StepName.WhatIsNaka, StepName.VerifyYourIdNaka, StepName.NakaCardIsReady, StepName.NakaCardDelete, StepName.NakaCardManagement, StepName.QRCodeDisplay, StepName.ComingSoon, StepName.BluecodePayment, StepName.ConfirmAddressDeletion, StepName.NimWithdrawalConfirmStep] as const
export type InfoStepName = typeof infoSteps[number]

export function isInputStep(step: Step | StepName): step is typeof step extends Step ? InputStep : InputStepName {
  const stepName = typeof step === 'string' ? step : step.step
  return inputSteps.includes(stepName as InputStepName)
}
export function isInfoStep(step: Step | StepName): step is typeof step extends Step ? InfoStep : InfoStepName {
  const stepName = typeof step === 'string' ? step : step.step
  return infoSteps.includes(stepName as InfoStepName)
}

export interface State {
  [StepName.PromoCode]: string
  [StepName.PinCode]: string
  [StepName.PinCodeConfirm]: string
  [StepName.PinCodeChange]: string
  [StepName.PhoneNumber]: string
  [StepName.PhoneNumberConfirm]: string
  [StepName.RecoveryWordsStep]: string[]
  [StepName.QRCodeScanner]: PaymentRequestData | string
  [StepName.HoldNakaCardToReader]: {
    request: PaymentRequestData
    confirmPayment: (serializedTx: string) => Promise<PaymentSuccessMessage>
  }
  [StepName.NimAddressDisplay]: string
  [StepName.ConfirmAddressDeletion]: string
  [StepName.HoldNakaCardToReader]: {
    request: PaymentRequestData
    confirmPayment: (serializedTx: string) => Promise<PaymentSuccessMessage>
  }
  [StepName.PaymentRequestManualInput]: PaymentRequestData | string
  [StepName.PaymentAmountInput]: number
  [StepName.PaymentPreview]: {
    payWithPuntos: boolean
    polygonQuote?: PolygonTransferQuote
    paymentAnalytics: PaymentAnalyticsState
  }
  [StepName.NimWithdrawalAmountSelectionStep]: NimWithdrawalSelection
  [StepName.NimWithdrawalAddressSelectionStep]: string // User selects a saved address
  [StepName.NimAddressInput]: string
  [StepName.TransactionList]: ExternalTransaction // User selects a transaction
  [StepName.ComingSoon]: string
}

export interface NavigationControl {
  /**
   * Defines how many steps to move forward when the skip action is triggered. A specific
   * number indicates how many steps to bypass, including the current one. For instance,
   * setting this to 1 means skipping just the current step, and setting it to 2 means skipping
   * the current step plus the next one.
   *
   * @default 1
   */
  skipAheadBy?: number

  /**
   * Determines the number of steps to move backward when the back action is engaged. To prevent
   * moving backwards, explicitly set this to -1. Setting this to 1 moves back to the
   * previous step, while 2 would move back two steps, including the current one.
   *
   * @default 1
   */
  goBackBy?: number
}

type BaseStep = {
  /**
   * Title of the modal
   */
  title?: string | Ref<string>

  /**
   * Language-independent label for the step title, used for testing.
   * When provided, this is set as the aria-label on the title element.
   */
  ariaLabel?: string

  /**
   * An icon for the title (e.g. ShopIcon when showing the `merchantName`)
   */
  titleIcon?: Component

  /**
   * Subline of the modal
   */
  description?: string | Ref<string>

  /**
   * The Vue component that will render in the slot of the carousel. It is where
   * the UI of the step itself is coded. It should emit at least `done` or
   * `select`.
   *
   * Learn more in `flows/README.md`
   */
  main: Component

  /**
   * Hook that will be triggered when the step has been marked as `active` but
   * right before the sliding animation has occurred. Useful for setting up
   * dynamic values of the UI (e.g. in the payment preview we would like to set
   * the title of the `merchantName`)
   */
  beforeRender?: (state: State, callbacks: StepCallbacks) => Promise<void> | undefined

  /**
   * Hook that will be triggered when the `main` component has emitted `done` or
   * `select`. If this function is not set, the default behaviour of the flow
   * will be to go to the very next step. If you need custom logic or validation
   * of the inputs (e.g. checking `pinCode` and `pinCodeConfirm` are the same) you
   * should declare that logic inside this hook. Use the `callbacks` to
   * programme the behaviour you want.
   */
  beforeNext?: (state: State, callbacks: StepCallbacks) => Promise<void>
  /**
   * Hook that will be triggered when the back button has been pressed. If this
   * function is not set, the default behaviour of the flow will be to go to the
   * previous step. If you need custom logic, you should declare that logic
   * inside this hook. Use the `callbacks` to programme the behaviour you want.
   */
  beforePrev?: (state: State, callbacks: StepCallbacks) => Promise<void>
} & NavigationControl

export type NavigateToOptions = number | { step: StepName } | Pick<NavigationControl, 'goBackBy' | 'skipAheadBy'>

export interface StepCallbacks {
  /**
   * Callback function to go to a specific slide of the flow. This function is
   * mainly used for creating branches in a flow. Either set `skipAheadBy` to go
   * to a specific step forward or `goBackBy` to go backwards.
   *
   * Read more about branching flows in the ./README.md
   */
  navigateTo: (p: NavigateToOptions) => void
  next: () => void // alias for navigateTo(1)
  prev: () => void // alias for navigateTo(-1)

  /**
   * Callback function to set an error in step. This will abort the flow
   * lifecycle and the error string will be passed down to the `main` component
   * of the step, which it is responsible to render the error message
   */
  err: (msg: string) => void

  /**
   * Callback function that will execute `done` hook of the flow and then it
   * will close the flow
   */
  finalizeFlow: () => Promise<void>
}

export type InputStep = BaseStep & {
  /**
   * Just for reference while debugging and references in the code
   */
  step: InputStepName

  /**
   * Whether or not the flow can autofocus in the first focusable element of the
   * main component when it gets activated. For example, if the step is the pin
   * input, we want to open the keyboard automatically
   */
  autofocus?: boolean
  /**
   * Whether or not the step should override the default max height of the modal
   * to `h-max` orf `h-full`. Useful when the flow has multiple steps with
   * different heights and we want to avoid the jumping effect when changing
   * steps.
   *
   * @default false
   */
  overrideHeight?: flowHeightOptions
}

export type InfoStep = BaseStep & {
  /**
   * Just for reference while debugging and references in the code
   */
  step: InfoStepName

  // Just to be explicit, and avoid TS issues
  autofocus?: undefined
  overrideHeight?: undefined
}

export type Step = (InputStep | InfoStep) & {
  /**
   * Whether or not the user can go back to the previous step.
   * Setting it to false will hide the back button.
   * @default true
   */
  allowGoBack?: boolean
}

export type StepInitOptions<Props = undefined> = {
  flowName?: FlowName
  props?: Props
} & NavigationControl & Pick<Step, 'allowGoBack'>

export type StepInit<Props = undefined> = (options: StepInitOptions<Props>) => Promise<Step>
export const defaultStepInitOptions: StepInitOptions = { skipAheadBy: undefined, goBackBy: 1, props: undefined }

export type OnDoneStepValue = string | boolean | PaymentRequestData | PaymentMethod | ExternalTransaction | NimWithdrawalSelection | { payWithPuntos: boolean, polygonQuote?: PolygonTransferQuote }

export const stepEmits: EmitsOptions = {
  done: (_: OnDoneStepValue) => true,
  select: (_: OnDoneStepValue) => true, // Just an alias for done
  skip: () => true,
  back: () => true,
  focus: () => true,
  navigateTo: (_: NavigateToOptions) => true,
}

// Complex types for State

export type PaymentRequestData = Pick<Transaction, 'recipient' | 'amount' | 'message' | 'merchantName' | 'merchantCategory' | 'rail' | 'paymentRef' | 'fee' | 'invoiced' | 'meta' | 'fiatAmount' | 'fiatFeeAmount' | 'fiatCurrency' | 'railMerchantId' | 'recipientType' | 'senderType' | 'recipientData' | 'senderData' | 'asset' | 'chain'>
  & {
    transfer: Transfer.UserPayment | Transfer.UserPaymentToMerchant | Transfer.UserPaymentToAtomicSwap | Transfer.Staking
    feeIncludedInAmount?: boolean
    swap?: {
      fees: { asset: string, amount: number, included: boolean, source: 'NETWORK' | 'SERVICE', percentage?: number }[]
    }
  }

// TODO Define fields
export type NakaPaymentData = Pick<Transaction, 'recipient' | 'amount' | 'message' | 'merchantName' | 'merchantCategory' | 'rail' | 'paymentRef' | 'fee' | 'invoiced' | 'meta' | 'fiatAmount' | 'fiatFeeAmount' | 'fiatCurrency'>

export interface NimWithdrawalSelection {
  amount: number
  recipient: string
  // Fiat amount the user entered in the amount step, shown verbatim on the confirm screen
  // so the confirmation matches what they just typed even if rates shift before signing.
  fiatAmount: number
  polygonQuote?: PolygonTransferQuote
}
