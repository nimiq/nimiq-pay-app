import { defineAsyncComponent, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Flow, State, Step } from '@/types/steps'
import { FlowName, StepName } from '@/types/steps'

const REFERRAL_CODE_REGEX = /^[a-zA-Z0-9]{6}$/
const PIN_CODE_REGEX = /^\d{4}$/
const PHONE_NUMBER_REGEX = /^\d{4,}$/

const BrickInput = defineAsyncComponent(() => import('@/components/BricksInput.vue'))
const PinInput = defineAsyncComponent(() => import('@/components/PinInput.vue'))
const PhoneInput = defineAsyncComponent(() => import('@/components/PhoneInput.vue'))
const OnBoardingScreen = defineAsyncComponent(() => import('@/components/OnBoardingScreen.vue'))

const promoCodeStep: Step = {
  step: StepName.PromoCode,
  title: 'Enter your promo code',
  description: 'If you don\'t have one, you can skip this step.',
  main: { component: BrickInput },
  beforeNext: async ({ promoCode }, { next, err }) => {
    if (!promoCode.value)
      err('Please enter a promo code')
    else if (!REFERRAL_CODE_REGEX.test(promoCode.value))
      err('Invalid promo code')
    else if (promoCode.value === '123456')
      err('This promo code is already used')
    else
      next()
  },
}

const recoveryWordsStep: Step = {
  step: StepName.RecoveryWordsStep,
  title: 'Enter recovery words',
  main: { component: BrickInput },
  beforeNext: async (_, { next }) => next(),
}

const pinCodeStep: Step = {
  step: StepName.PinCode,
  title: 'Choose PIN',
  description: 'Just a PIN.<br>No personal data needed.',
  main: { component: PinInput, props: { inputLength: 4 } },
  beforeNext: async ({ pinCode }, { next, err }) => {
    if (!pinCode.value)
      err('Please enter a PIN code')
    else if (!PIN_CODE_REGEX.test(pinCode.value))
      err('Invalid PIN code')
    else
      next()
  },
}

const pinCodeConfirmStep: Step = {
  step: StepName.PinCodeConfirm,
  title: 'Confirm your PIN',
  description: 'Just a PIN.<br>No personal data needed.',
  main: { component: PinInput, props: { inputLength: 4 } },
  beforeNext: async ({ pinCode, pinCodeConfirm }, { next, err }) => {
    if (!pinCodeConfirm.value) { err('Please confirm your PIN code'); return }
    else if (pinCodeConfirm.value !== pinCode.value) { err('PIN codes do not match'); return }

    // Nuke everything in case there was a previous encryption db
    const { sqlite } = (await import('@/stores/conn')).useConn()
    await sqlite.deleteOldDatabases()
    await sqlite.clearEncryptionSecret()
    console.log(storeToRefs((await import('@/stores/conn')).useConn()))

    const { decrypt, decrypted } = (await import('@/composables/useDecrypt')).useDecrypt()
    const decryptError = await decrypt(pinCode.value)
    if (decryptError) { err(decryptError); return }
    if (!decrypted.value) { err('There was an error'); return }
    next()
  },
}

const phoneNumberStep: Step = {
  step: StepName.PhoneNumber,
  title: 'Verify your phone number',
  description: 'It\'s so easy.<br>Just verify your phone number.',
  main: { component: PhoneInput },
  beforeNext: async ({ phoneNumber }, { next, err }) => {
    if (!phoneNumber.value)
      err('Please enter a phone number')
    else if (!PHONE_NUMBER_REGEX.test(phoneNumber.value))
      err('Invalid phone number')
    else
      next()
  },
}

const phoneNumberConfirmStep: Step = {
  step: StepName.PhoneNumberConfirm,
  title: 'Confirm your phone number',
  description: 'We\'ve sent you a code, please confirm',
  main: { component: BrickInput },
  beforeNext: async ({ phoneNumberConfirm }, { next, err }) => {
    if (!phoneNumberConfirm.value)
      err('Please enter a verification code')
    // TODO add more logic
    else
      next()
  },
}

const getNotifiedStep: Step = {
  step: StepName.GetNotified,
  title: 'Enable notifications',
  description: 'Get important info on transactions, top ups, security and more.',
  main: { component: BrickInput },
}

const onBoardingPoints1: Step = {
  step: StepName.OnBoardingPoints1,
  title: 'Welcome to Crypto City Points',
  description: 'Crypto City Points (or CC Points) are a bonus currency worth the same as NIM.',
  main: { component: OnBoardingScreen },
}

const onBoardingPoints2: Step = {
  step: StepName.OnBoardingPoints2,
  title: 'Pay with CC Points',
  description: 'Pay with CC Points instead of NIM wherever they\'re accepted.',
  main: { component: OnBoardingScreen },
}

const onBoardingPoints3: Step = {
  step: StepName.OnBoardingPoints3,
  title: 'Get CC Points',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: { component: OnBoardingScreen },
}

const onBoardingCashback1: Step = {
  step: StepName.OnBoardingCashback1,
  title: 'What\'s Crypto City Points?',
  description: 'Crypto City Points (or CC Points) are a bonus currency worth the same as NIM.  ',
  main: { component: OnBoardingScreen },
}

const onBoardingCashback2: Step = {
  step: StepName.OnBoardingCashback2,
  title: 'Pay with CC Points',
  description: 'Pay with CC Points instead of NIM wherever they\'re accepted.',
  main: { component: OnBoardingScreen },
}

const onBoardingCashback3: Step = {
  step: StepName.OnBoardingCashback3,
  title: 'Get CC Points',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: { component: OnBoardingScreen },
}

const onBoardingCashback4: Step = {
  step: StepName.OnBoardingCashback4,
  title: 'Find places to pay with and earn CC Points',
  description: 'The Nimiq crypto map is the perfect tool to find places that support CC Points.',
  main: { component: OnBoardingScreen },
}

const onBoardingBluecode1: Step = {
  step: StepName.OnBoardingBluecode1,
  title: 'What\'s Bluecode?',
  description: 'Bluecode is a European payment service that now supports NIM.',
  main: { component: OnBoardingScreen },
}

const onBoardingBluecode2: Step = {
  step: StepName.OnBoardingBluecode2,
  title: 'Pay with Bluecode',
  description: 'Create a Bluecode Barcode and show it at the cashier to pay. ',
  main: { component: OnBoardingScreen },
}

const onBoardingBluecode3: Step = {
  step: StepName.OnBoardingBluecode3,
  title: 'Verify your ID',
  description: 'Get CC Points as cash back rewards or complete challenges to earn them.',
  main: { component: OnBoardingScreen },
}

const baseSetupSteps = [pinCodeStep, pinCodeConfirmStep, phoneNumberStep, phoneNumberConfirmStep, getNotifiedStep]

const flows: Record<FlowName, Step[]> = {
  [FlowName.Login]: [recoveryWordsStep, ...baseSetupSteps],
  [FlowName.Setup]: [...baseSetupSteps],
  [FlowName.SetupWithPromoCode]: [promoCodeStep, ...baseSetupSteps],
  [FlowName.OnBoardingPoints]: [onBoardingPoints1, onBoardingPoints2, onBoardingPoints3],
  [FlowName.OnBoardingCashback]: [onBoardingCashback1, onBoardingCashback2, onBoardingCashback3, onBoardingCashback4],
  [FlowName.OnBoardingBluecode]: [onBoardingBluecode1, onBoardingBluecode2, onBoardingBluecode3],
}

const onDoneFlows: Record<FlowName, Flow['onDone']> = {
  [FlowName.Login]: async state => console.log(state.pinCode.value),
  [FlowName.Setup]: async (state, { goTo }) => {
    const err = await (await import('@/composables/useDecrypt')).useDecrypt().decrypt(state.pinCode.value)
    if (err)
      console.error(err)

    console.log('Redirecting to /app')
    goTo('/app')
  },
  [FlowName.SetupWithPromoCode]: async () => { console.log('Setup with promo code done'); return Promise.resolve() },
  [FlowName.OnBoardingPoints]: async () => { console.log('On boarding points done'); return Promise.resolve() },
  [FlowName.OnBoardingCashback]: async () => { console.log('On boarding cashback done'); return Promise.resolve() },
  [FlowName.OnBoardingBluecode]: async () => { console.log('On boarding bluecode done'); return Promise.resolve() },
}

export function getSteps(name: FlowName): Flow {
  const steps = Object.fromEntries(flows[name].map(step => [step.step, step])) as Record<StepName, Step>
  const state = Object.fromEntries(Object.keys(steps).map(step => [step, ref('')])) as State
  const onDone = onDoneFlows[name]
  return { name, state, steps, onDone }
}
