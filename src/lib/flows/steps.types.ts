import type { Component, EmitsOptions, Ref } from 'vue'
import type { ExternalTransaction, Transaction, Transfer } from '../../types/transactions'

export enum FlowName {
  Setup = 'setup',
  SetupWithPromoCode = 'setupWithPromoCode',
  Login = 'login',
  VerifyPhone = 'verifyPhone',
  OnBoardingPoints = 'onBoardingPoints',
  OnBoardingCashback = 'onBoardingCashback',
  OnBoardingBluecode = 'onBoardingBluecode',
  NimOrPointsPayment = 'payment',
  NimWithdraw = 'nimWithdraw',
  NimTopUp = 'nimTopUp',
  ViewTransactions = 'viewTransactions',
  ViewTransactionDetail = 'viewTransactionDetail', // This is just a one-step flow
}

interface FlowHooksOptions {
  err: (msg: string) => void
}

export interface Flow {
  flowName: FlowName
  steps: Step[]

  // Function that will be called when the flow is supposed to be closed.
  // If it is not set, the flow will be closed automatically when the last step is done.
  onDone?: (state: State, options: FlowHooksOptions) => Promise<void>

  // Function that will be called when the flow is cancelled.
  // Also, the flow will be closed automatically when the last step is done.
  onCancel?: (options: FlowHooksOptions) => Promise<void>
}

export interface FlowInitOptions {
  // Currently none.
}

export type FlowInit = (options?: FlowInitOptions) => Promise<Flow>

export enum StepName {
  PromoCode = 'promoCode',
  PinCode = 'pinCode',
  PinCodeConfirm = 'pinCodeConfirm',
  PhoneNumber = 'phoneNumber',
  PhoneNumberConfirm = 'phoneNumberConfirm',
  RecoveryWordsStep = 'recoveryWordsStep',
  GetNotified = 'getNotified',
  OnBoardingPoints = 'onBoardingPoints',
  OnBoardingCashback1 = 'onBoardingCashback1',
  OnBoardingCashback2 = 'onBoardingCashback2',
  OnBoardingCashback3 = 'onBoardingCashback3',
  OnBoardingCashback4 = 'onBoardingCashback4',
  OnBoardingBluecode1 = 'onBoardingBluecode1',
  OnBoardingBluecode2 = 'onBoardingBluecode2',
  OnBoardingBluecode3 = 'onBoardingBluecode3',
  QRCodeScanner = 'qrCodeScanner',
  PaymentPreview = 'paymentPreview',
  NimWithdrawalSelection = 'nimWithdrawalSelection',
  NimAddressInput = 'nimAddressInput',
  NimAddressDisplay = 'nimAddressDisplay',
  TransactionList = 'transactionList',
  TransactionDetail = 'transactionDetail',
}

export const inputSteps: StepName[] = [StepName.PromoCode, StepName.PinCode, StepName.PinCodeConfirm, StepName.PhoneNumber, StepName.PhoneNumberConfirm, StepName.RecoveryWordsStep, StepName.QRCodeScanner, StepName.PaymentPreview, StepName.NimWithdrawalSelection, StepName.NimAddressInput, StepName.TransactionList]
export type InputStepName = StepName.PromoCode | StepName.PinCode | StepName.PinCodeConfirm | StepName.PhoneNumber | StepName.PhoneNumberConfirm | StepName.RecoveryWordsStep | StepName.QRCodeScanner | StepName.PaymentPreview | StepName.NimWithdrawalSelection | StepName.NimAddressInput | StepName.TransactionList
const infoSteps: StepName[] = [StepName.GetNotified, StepName.OnBoardingPoints, StepName.OnBoardingCashback1, StepName.OnBoardingCashback2, StepName.OnBoardingCashback3, StepName.OnBoardingCashback4, StepName.OnBoardingBluecode1, StepName.OnBoardingBluecode2, StepName.OnBoardingBluecode3, StepName.NimAddressDisplay, StepName.TransactionDetail]
export type InfoStepName = StepName.GetNotified | StepName.OnBoardingPoints | StepName.OnBoardingCashback1 | StepName.OnBoardingCashback2 | StepName.OnBoardingCashback3 | StepName.OnBoardingCashback4 | StepName.OnBoardingBluecode1 | StepName.OnBoardingBluecode2 | StepName.OnBoardingBluecode3 | StepName.NimAddressDisplay | StepName.TransactionList | StepName.TransactionDetail

export function isInputStep(step: Step | StepName): step is typeof step extends Step ? InputStep : InputStepName {
  const stepName = typeof step === 'string' ? step : step.step
  return inputSteps.includes(stepName)
}
export function isInfoStep(step: Step | StepName): step is typeof step extends Step ? InfoStep : InfoStepName {
  const stepName = typeof step === 'string' ? step : step.step
  return infoSteps.includes(stepName)
}

export interface State {
  [StepName.PromoCode]: string
  [StepName.PinCode]: string
  [StepName.PinCodeConfirm]: string
  [StepName.PhoneNumber]: string
  [StepName.PhoneNumberConfirm]: string
  [StepName.RecoveryWordsStep]: string[]
  [StepName.QRCodeScanner]: PaymentRequestData | string
  [StepName.PaymentPreview]: PaymentMethod
  [StepName.NimWithdrawalSelection]: NimWithdrawalSelection
  [StepName.NimAddressInput]: string
  [StepName.TransactionList]: ExternalTransaction // User selects a transaction
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
  title?: string | Ref<string>
  description?: string | Ref<string>
  titleIcon?: Component
  main: Component
  buttonLabel?: string
  beforeDisplay?: (state: State) => Promise<void> | undefined
  autofocus?: boolean
  canDismiss?: boolean
} & NavigationControl

interface BeforeNextOptions {
  next: () => Promise<void>
  prev: () => void
  err: (msg: string) => void
  finalizeFlow: () => Promise<void>
  skip: () => void
}
export type InputStep = BaseStep & {
  step: InputStepName

  // Function that validates the input and calls any of the callbacks
  beforeNext?: (state: State, options: BeforeNextOptions) => Promise<void>
}

export type InfoStep = BaseStep & {
  step: InfoStepName
  beforeNext?: undefined // Just to be explicit, and avoid TS issues
}

export type Step = InputStep | InfoStep

export type StepInitOptions<Props = undefined> = {
  flowName?: FlowName
  props?: Props
} & NavigationControl

export type StepInit<Props = undefined> = (options: StepInitOptions<Props>) => Promise<Step>
export const defaultStepInitOptions: StepInitOptions = { skipAheadBy: undefined, goBackBy: 1, props: undefined }

export type OnDoneStepValue = string | boolean | PaymentRequestData | PaymentMethod | ExternalTransaction

export const stepEmits: EmitsOptions = {
  done: (_: OnDoneStepValue) => undefined,
  select: (_: OnDoneStepValue) => undefined, // Just an alias for done
  skip: () => undefined,
  focus: () => undefined,
}

export type PaymentRequestData = Pick<Transaction, 'recipient' | 'amount' | 'message' | 'merchantName' | 'merchantCategory' | 'rail' | 'paymentRef' | 'fee' | 'fiatAmount' | 'fiatFeeAmount' | 'fiatCurrency'>
& {
  transfer: Transfer.UserPayment | Transfer.UserPaymentToMerchant
}

export interface NimWithdrawalSelection {
  amount: number
  recipient: string
}

export enum PaymentMethod {
  NIM = 'nim',
  Points = 'points',
}
