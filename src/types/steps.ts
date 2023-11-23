import type { EmitsOptions, VNode } from 'vue'
import type { NavigationFailure, RouteLocationRaw } from 'vue-router'

export enum FlowName {
  Setup = 'setup',
  SetupWithPromoCode = 'setupWithPromoCode',
  Login = 'login',
  VerifyPhone = 'verifyPhone',
  OnBoardingPoints = 'onBoardingPoints',
  OnBoardingCashback = 'onBoardingCashback',
  OnBoardingBluecode = 'onBoardingBluecode',
}

interface OnDoneFlowOptions {
  goTo: (path: RouteLocationRaw) => Promise<void | NavigationFailure | void>
}

export interface Flow {
  name: FlowName
  state: State
  steps: Record<StepName, StepInit>
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
}

const inputSteps: StepName[] = [StepName.PromoCode, StepName.PinCode, StepName.PinCodeConfirm, StepName.PhoneNumber, StepName.PhoneNumberConfirm, StepName.RecoveryWordsStep]
export type InputStepName = StepName.PromoCode | StepName.PinCode | StepName.PinCodeConfirm | StepName.PhoneNumber | StepName.PhoneNumberConfirm | StepName.RecoveryWordsStep
const infoSteps: StepName[] = [StepName.GetNotified, StepName.OnBoardingPoints1, StepName.OnBoardingPoints2, StepName.OnBoardingPoints3, StepName.OnBoardingCashback1, StepName.OnBoardingCashback2, StepName.OnBoardingCashback3, StepName.OnBoardingCashback4, StepName.OnBoardingBluecode1, StepName.OnBoardingBluecode2, StepName.OnBoardingBluecode3]
export type InfoStepName = StepName.GetNotified | StepName.OnBoardingPoints1 | StepName.OnBoardingPoints2 | StepName.OnBoardingPoints3 | StepName.OnBoardingCashback1 | StepName.OnBoardingCashback2 | StepName.OnBoardingCashback3 | StepName.OnBoardingCashback4 | StepName.OnBoardingBluecode1 | StepName.OnBoardingBluecode2 | StepName.OnBoardingBluecode3

export const isInputStep = (step: Step): step is InputStep => inputSteps.includes(step.step)
export const isInfoStep = (step: Step): step is InfoStep => infoSteps.includes(step.step)

export type State = Record<InputStepName, string>

export type SkippableStep = { stepsToSkip: number } | { stepsToSkip?: undefined }

type BaseStep = {
  title: string
  description?: string
  main: VNode
  onCancel?: (state: State, { path }: { path?: string; replace?: (to: RouteLocationRaw) => Promise<void | NavigationFailure | undefined> }) => Promise<void> | undefined
  buttonLabel?: string
} & SkippableStep

interface ValidateOptions {
  next: () => void
  err: (msg: string) => void
}
export type InputStep = BaseStep & {
  step: InputStepName

  // Function that validates the input and calls next() or err() accordingly
  beforeNext: (state: State, options: ValidateOptions) => Promise<void>
}

export type InfoStep = BaseStep & {
  step: InfoStepName
  beforeNext?: undefined // Just to be explicit, and avoid TS issues
}

export type Step = InputStep | InfoStep

interface StepInitOptions {
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

export const stepEmits: EmitsOptions = {
  done: (_: string) => undefined,
  skip: () => undefined,
  autofocus: () => undefined,
}
