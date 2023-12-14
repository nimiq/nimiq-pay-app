import type { EmitsOptions, VNode } from 'vue'
import type { NavigationFailure, RouteLocationRaw } from 'vue-router'
import type { ExternalTransaction, Transaction, Transfer } from './transactions'

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

interface OnDoneFlowOptions {
  goTo: (path: RouteLocationRaw) => Promise<void | NavigationFailure | void>
  isCancelled: boolean
  path: string
}

export interface Flow {
  name: FlowName
  state: State
  steps: Step[]
  onDone: (state: State, options: OnDoneFlowOptions) => Promise<any>
  canGoBack?: boolean
}

export interface FlowInitOptions {
  initialState?: Partial<State>
}

export type FlowInit = (options?: FlowInitOptions) => Flow

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

export const isInputStep = (step: Step): step is InputStep => inputSteps.includes(step.step)
export const isInfoStep = (step: Step): step is InfoStep => infoSteps.includes(step.step)

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

export type SkippableStep = { stepsToSkip: number } | { stepsToSkip?: undefined }

type BaseStep = {
  title?: string
  description?: string
  main: VNode
  onCancel?: (state: State, { path }: { path?: string; replace?: (to: RouteLocationRaw) => Promise<void | NavigationFailure | undefined> }) => Promise<void> | undefined
  buttonLabel?: string
  beforeDisplay?: (state: State) => Promise<void> | undefined
  autofocus?: boolean
} & SkippableStep

interface BeforeNextOptions {
  next: () => void
  prev: () => void
  err: (msg: string) => void
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

export interface StepInitOptions<Props = undefined> {
  /**
   * Number of steps to skip if the user presses the skip button.
   * Use 1, to skip just the current step, 2 to skip the current step and the next one, etc.
   *
   * @default undefined
   */
  stepsToSkip?: number

  props?: Props
}

export type StepInit<Props = undefined> = (options?: StepInitOptions<Props>) => Step
export const defaultStepInitOptions: StepInitOptions = { stepsToSkip: undefined, props: undefined }

export type OnDoneStepValue = string | boolean | PaymentRequestData | PaymentMethod | ExternalTransaction

export const stepEmits: EmitsOptions = {
  done: (_: OnDoneStepValue) => undefined,
  select: (_: OnDoneStepValue) => undefined, // Just an alias for done
  skip: () => undefined,
  focus: () => undefined,
}

export type PaymentRequestData =
  Pick<Transaction, 'recipient' | 'amount' | 'message' | 'shopName' | 'shopCategory' | 'rail' | 'railPeerId' | 'fee'>
  & { transfer: Transfer.UserPayment | Transfer.UserPaymentToMerchant }

export interface NimWithdrawalSelection {
  amount: number
  recipient: string
}

export enum PaymentMethod {
  NIM = 'nim',
  Points = 'points',
}
