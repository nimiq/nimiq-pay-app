import { type Ref, defineAsyncComponent } from 'vue'

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

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue'))
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue'))
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue'))
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue'))

export const stepComponent: Record<StepName, ReturnType<typeof defineAsyncComponent>> = {
  [StepName.PromoCode]: BrickInput,
  [StepName.PinCode]: PinInput,
  [StepName.PinCodeConfirm]: PinInput,
  [StepName.PhoneNumber]: PhoneInput,
  [StepName.PhoneNumberConfirm]: BrickInput,
  [StepName.RecoveryWordsStep]: BrickInput,
  [StepName.GetNotified]: BrickInput,
  [StepName.OnBoardingPoints1]: OnBoardingScreen,
  [StepName.OnBoardingPoints2]: OnBoardingScreen,
  [StepName.OnBoardingPoints3]: OnBoardingScreen,
  [StepName.OnBoardingCashback1]: OnBoardingScreen,
  [StepName.OnBoardingCashback2]: OnBoardingScreen,
  [StepName.OnBoardingCashback3]: OnBoardingScreen,
  [StepName.OnBoardingCashback4]: OnBoardingScreen,
  [StepName.OnBoardingBluecode1]: OnBoardingScreen,
  [StepName.OnBoardingBluecode2]: OnBoardingScreen,
  [StepName.OnBoardingBluecode3]: OnBoardingScreen,
}

export type InputStepName = StepName.PromoCode | StepName.PinCode | StepName.PinCodeConfirm | StepName.PhoneNumber | StepName.PhoneNumberConfirm | StepName.RecoveryWordsStep
export type InfoStepName = StepName.GetNotified | StepName.OnBoardingPoints1 | StepName.OnBoardingPoints2 | StepName.OnBoardingPoints3 | StepName.OnBoardingCashback1 | StepName.OnBoardingCashback2 | StepName.OnBoardingCashback3 | StepName.OnBoardingCashback4 | StepName.OnBoardingBluecode1 | StepName.OnBoardingBluecode2 | StepName.OnBoardingBluecode3

export const isInputStep = (step: StepName): step is InputStepName => Object.values(StepName).includes(step)
export const isInfoStep = (step: StepName): step is InfoStepName => Object.values(StepName).includes(step)

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
