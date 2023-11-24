import type { EmitsOptions, MaybeRef, VNode } from 'vue'
import type { NavigationFailure, RouteLocationRaw } from 'vue-router'
import type { Transaction } from './transactions'

export enum FlowName {
  Setup = 'setup',
  SetupWithPromoCode = 'setupWithPromoCode',
  Login = 'login',
  VerifyPhone = 'verifyPhone',
  OnBoardingPoints = 'onBoardingPoints',
  OnBoardingCashback = 'onBoardingCashback',
  OnBoardingBluecode = 'onBoardingBluecode',
  NimOrPointsPayment = 'payment',
}

interface OnDoneFlowOptions {
  goTo: (path: RouteLocationRaw) => Promise<void | NavigationFailure | void>
}

export interface Flow {
  name: FlowName
  state: State
  steps: Step[]
  onDone: (state: State, options: OnDoneFlowOptions) => Promise<void>
}

export enum StepName {
  PromoCode = 'promoCode',
  PinCode = 'pinCode',
  PinCodeConfirm = 'pinCodeConfirm',
  PhoneNumber = 'phoneNumber',
  PhoneNumberConfirm = 'phoneNumberConfirm',
  RecoveryWordsStep = 'recoveryWordsStep',
  GetNotified = 'getNotified',
  OnBoardingPoints1 = 'onBoardingPoints1',
  OnBoardingPoints2 = 'onBoardingPoints2',
  OnBoardingPoints3 = 'onBoardingPoints3',
  OnBoardingCashback1 = 'onBoardingCashback1',
  OnBoardingCashback2 = 'onBoardingCashback2',
  OnBoardingCashback3 = 'onBoardingCashback3',
  OnBoardingCashback4 = 'onBoardingCashback4',
  OnBoardingBluecode1 = 'onBoardingBluecode1',
  OnBoardingBluecode2 = 'onBoardingBluecode2',
  OnBoardingBluecode3 = 'onBoardingBluecode3',
  QRCodeScanner = 'qrCodeScanner',
  PaymentPreview = 'paymentPreview',
}

const inputSteps: StepName[] = [StepName.PromoCode, StepName.PinCode, StepName.PinCodeConfirm, StepName.PhoneNumber, StepName.PhoneNumberConfirm, StepName.RecoveryWordsStep, StepName.QRCodeScanner, StepName.PaymentPreview]
export type InputStepName = StepName.PromoCode | StepName.PinCode | StepName.PinCodeConfirm | StepName.PhoneNumber | StepName.PhoneNumberConfirm | StepName.RecoveryWordsStep | StepName.QRCodeScanner | StepName.PaymentPreview
const infoSteps: StepName[] = [StepName.GetNotified, StepName.OnBoardingPoints1, StepName.OnBoardingPoints2, StepName.OnBoardingPoints3, StepName.OnBoardingCashback1, StepName.OnBoardingCashback2, StepName.OnBoardingCashback3, StepName.OnBoardingCashback4, StepName.OnBoardingBluecode1, StepName.OnBoardingBluecode2, StepName.OnBoardingBluecode3]
export type InfoStepName = StepName.GetNotified | StepName.OnBoardingPoints1 | StepName.OnBoardingPoints2 | StepName.OnBoardingPoints3 | StepName.OnBoardingCashback1 | StepName.OnBoardingCashback2 | StepName.OnBoardingCashback3 | StepName.OnBoardingCashback4 | StepName.OnBoardingBluecode1 | StepName.OnBoardingBluecode2 | StepName.OnBoardingBluecode3

export const isInputStep = (step: Step): step is InputStep => inputSteps.includes(step.step)
export const isInfoStep = (step: Step): step is InfoStep => infoSteps.includes(step.step)

export type State = {
  // All the InputSteps have a value in the state
  // By default, the value is a string, but it can differ for each step
  [K in StepName]?: (K extends StepName.QRCodeScanner ? PaymentRequestData : K extends StepName.PaymentPreview ? PaymentMethod : string)
}

export type SkippableStep = { stepsToSkip: number } | { stepsToSkip?: undefined }

type BaseStep = {
  title: MaybeRef<string>
  description?: string
  main: VNode
  onCancel?: (state: State, { path }: { path?: string; replace?: (to: RouteLocationRaw) => Promise<void | NavigationFailure | undefined> }) => Promise<void> | undefined
  buttonLabel?: string
  beforeDisplay?: (state: State) => Promise<void> | undefined
} & SkippableStep

interface ValidateOptions {
  next: () => void
  err: (msg: string) => void
}
export type InputStep = BaseStep & {
  step: InputStepName

  // Function that validates the input and calls next() or err() accordingly
  beforeNext?: (state: State, options: ValidateOptions) => Promise<void>
}

export type InfoStep = BaseStep & {
  step: InfoStepName
  beforeNext?: undefined // Just to be explicit, and avoid TS issues
}

export type Step = InputStep | InfoStep

export interface StepInitOptions {
  /**
   * Number of steps to skip if the user presses the skip button.
   * Use 1, to skip just the current step, 2 to skip the current step and the next one, etc.
   *
   * @default undefined
   */
  stepsToSkip?: number
}

export type StepInit = (options?: StepInitOptions) => Step
export const defaultStepInitOptions: StepInitOptions = { stepsToSkip: undefined }

export type OnDoneStepValue = string | boolean | PaymentRequestData | PaymentMethod

export const stepEmits: EmitsOptions = {
  done: (_: OnDoneStepValue) => undefined,
  skip: () => undefined,
  autofocus: () => undefined,
}

export type PaymentRequestData = Pick<Transaction, 'recipient' | 'amount' | 'message' | 'locationName' | 'rail' | 'railPeerId' | 'fee'>

export enum PaymentMethod {
  NIM = 'nim',
  Points = 'points',
}
