import type { Ref, defineAsyncComponent } from 'vue'

export enum FlowName {
  Setup = 'setup',
  SetupWithPromoCode = 'setupWithPromoCode',
  Login = 'login',
  OnBoardingPoints = 'onBoardingPoints',
  OnBoardingCashback = 'onBoardingCashback',
  OnBoardingBluecode = 'onBoardingBluecode',
}

interface FlowOnDoneOptions {
  goTo: (path: string) => void
}

export interface Flow {
  name: FlowName
  state: State
  steps: Record<StepName, Step>
  onDone: (state: State, options: FlowOnDoneOptions) => Promise<void>
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

export const isInputStep = (step: StepName): step is InputStepName => inputSteps.includes(step)
export const isInfoStep = (step: StepName): step is InfoStepName => infoSteps.includes(step)

export type State = Record<InputStepName, Ref<string>>

export enum InputComponent {
  Bricks = 'bricks',
  Pin = 'pin',
}

export enum InfoComponent {
  OnBoarding = 'onBoarding',
}

interface BaseStep {
  title: string
  description?: string
  main: {
    component: ReturnType<typeof defineAsyncComponent>
    props?: Record<string, any>
  }
}

interface ValidateOptions {
  next: () => void
  err: (msg: string) => void
}
export interface InputStep extends BaseStep {
  step: InputStepName

  // Function that validates the input and calls next() or err() accordingly
  beforeNext: (state: State, options: ValidateOptions) => Promise<void>
}

export interface InfoStep extends BaseStep {
  step: InfoStepName
  beforeNext?: undefined // Just to be explicit, and avoid TS issues
}

export type Step = InputStep | InfoStep
