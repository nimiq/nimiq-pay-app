<script setup lang="ts">
import { type PropType, type Ref, computed, onMounted, reactive, ref, watchEffect } from 'vue'
import { until, useIntersectionObserver } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonBackButton, IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { useRouter } from 'vue-router'
import { closeModalSkippingFlowCancelHook } from '@/lib/flows'
import { inputSteps, isInfoStep, isInputStep } from '@/lib/flows/steps.types'
import type { Flow, InputStepName, OnDoneStepValue, State, Step, StepName } from '@/lib/flows/steps.types'
import { useCarousel } from '@/composables/useCarousel'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  flow: {
    type: Object as PropType<Flow>,
    required: true,
  },
  isClosing: {
    type: Boolean,
    required: true,
  },
  initialState: {
    type: Object as PropType<Partial<State>>,
    required: false,
  },
})

const { replace } = useRouter()
const { onDone: onFlowDone, onCancel: onFlowCancel, steps: stepsInFlow, canGoBack = true } = props.flow!
const steps: Ref<Step[]> = ref([stepsInFlow[0]])

const emptyState = inputSteps.reduce((state, stepName) => ({ ...state, [stepName]: undefined }), {} as State)
const state = ref({ ...emptyState, ...props.initialState })
const activeIndex = ref(0)

const scroller = ref<HTMLElement>()
const scrollerItems = ref<HTMLElement[]>([])
const { nextSlide, prevSlide, isScrolling } = useCarousel(scroller, { activeIndex })

const activeStep = computed(() => steps.value[steps.value.length - 1])
// Get the element in screen knowing the active step using the li key
const activeStepScrollerItem = computed(() => scrollerItems.value[activeIndex.value])

const allowBack = computed(() => activeIndex.value > 0 && canGoBack)

type Errors = Record<InputStepName, string>
const errors = ref<Errors>(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors)
watchEffect(() => errors.value = reactive(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors))

function getInputStepError(stepName: StepName) {
  return isInputStep(stepName) ? errors.value[stepName] : null
}

function defaultErrorHandler(errorMessage: string) {
  const activeStepName = activeStep.value.step
  if (isInputStep(activeStepName))
    errors.value[activeStepName] = errorMessage
  else
    useToast().setToast({ message: errorMessage, error: true })
}

interface GoToNextOptions { err?: (errorMsg: string) => void; stepsToSkip?: number }
async function goToNext(options?: GoToNextOptions) {
  if (props.isClosing)
    return
  const {
    err = defaultErrorHandler,
    stepsToSkip = 1,
  } = options || {}
  const currentIndex = stepsInFlow.findIndex(s => s.step === activeStep.value.step)
  const nextStep = stepsInFlow[currentIndex + stepsToSkip]
  if (!nextStep) {
    if (onFlowDone)
      await onFlowDone(state.value, { goTo: replace, err })
    if (!props.isClosing)
      // Ensure flow gets closed, in case onFlowDone is not set, or did not dismiss the modal itself.
      await closeModalSkippingFlowCancelHook()
    return
  }
  steps.value.push(nextStep)
  await steps.value.at(activeIndex.value + 1)?.beforeDisplay?.(state.value)
  nextSlide()
}

async function goToPrevious() {
  if (props.isClosing)
    return
  prevSlide()
  // Wait for the scroll to start and finish
  await until(isScrolling).toBe(true, { timeout: 3000 })
  await until(isScrolling).toBe(false, { timeout: 3000 })
  steps.value.pop()
}

// TODO revise this
const shouldAutofocus = computed(() => activeStep.value.autofocus || activeStep.value.autofocus === undefined)

onMounted(async () => {
  await stepsInFlow[activeIndex.value].beforeDisplay?.(state.value)

  if (shouldAutofocus.value)
    focus()
})

async function onStepDone(value: OnDoneStepValue) {
  if (props.isClosing)
    return
  const activeStepName = activeStep.value.step
  if (isInfoStep(activeStepName)) {
    goToNext()
  }
  else if (isInputStep(activeStepName)) {
    // @ts-expect-error If the emit value is well typed, this should work
    state.value[activeStepName] = value
    errors.value[activeStepName] = '' // Clear error message
    const err = defaultErrorHandler
    if (activeStep.value.beforeNext) {
      const finalizeFlow = async () => {
        if (onFlowDone)
          await onFlowDone(state.value, { goTo: replace, err })
        if (!props.isClosing)
          // Ensure flow gets closed, in case onFlowDone is not set, or did not dismiss the modal itself.
          await closeModalSkippingFlowCancelHook()
      }
      await activeStep.value.beforeNext(state.value, { next: goToNext, err, prev: goToPrevious, finalizeFlow, skip })
    }
    else {
      goToNext()
    }
  }
}

function skip() {
  const { stepsToSkip = 1 } = activeStep.value
  if (!stepsToSkip)
    return
  // Assuming there's no option to skip if you are in the last step
  goToNext({ stepsToSkip })
}

async function onCancel() {
  if (props.isClosing)
    return
  if (onFlowCancel)
    await onFlowCancel({ goTo: replace, err: defaultErrorHandler })
  if (!props.isClosing)
    // Ensure flow gets closed, in case onFlowCancel is not set, or did not dismiss the modal itself.
    await closeModalSkippingFlowCancelHook()
}

const isActiveStepFullyVisible = ref(false)
// We track the intersection of each step with a number from 0 to 1.
useIntersectionObserver(activeStepScrollerItem, ([{ intersectionRatio }]) => {
  isActiveStepFullyVisible.value = intersectionRatio === 1
  if (isActiveStepFullyVisible.value && isInputStep(activeStep.value) && activeStep.value.autofocus !== false)
    focus()
  // If it's not input step or autofocus is false, blur the input previously focused
  else if (isActiveStepFullyVisible.value)
    blur()

  // TODO: remove when focus is working in every device (mobile + tablet)
  console.log({ intersectionRatio, step: activeStep.value.step, activeIndex: activeIndex.value, autofocus: activeStep.value.autofocus, isActiveStepFullyVisible: isActiveStepFullyVisible.value })
}, { threshold: [0, 0.5, 1], root: scroller })

function isStepVisible(stepName: StepName) {
  return stepName === activeStep.value.step && isActiveStepFullyVisible.value
    // When the flow is closing, already allow steps to tear down before the modal slides down to close. This way, for
    // example animations can already be stopped, and we especially use this in QRScanner to remove styles applied to
    // the background page on native, before the modal unveils the background.
    && !props.isClosing
}

function focus() {
  const input = activeStepScrollerItem.value?.querySelector('input')
  // TODO: remove when focus is working in every device (mobile + tablet)
  console.log('focus', input)
  input?.focus()
}

function blur() {
  const { activeElement } = document
  if (activeElement instanceof HTMLElement)
    activeElement.blur()
  else
    console.warn('Cannot blur', activeElement)
}
</script>

<template>
  <IonHeader class="tall:pt-1 ion-no-border">
    <IonToolbar>
      <IonButtons slot="start">
        <IonBackButton v-if="allowBack" default-href="/" @click.prevent="goToPrevious" />
      </IonButtons>
      <IonButtons slot="end">
        <IonButton v-if="activeStep.canDismiss !== false" @click.stop="onCancel">
          <IonIcon :icon="close" size="large" class="text-white bg-[#DADADA] rounded-full w-6 h-6 p-[2px]" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <ul ref="scroller" class="flex h-full mb-auto overflow-x-hidden hide-scrollbar snap-x snap-mandatory">
    <li v-for="({ main, step, title, titleIcon, description, stepsToSkip }) in steps" ref="scrollerItems" :key="step" class="relative flex flex-col items-center w-full max-w-[100vw] h-full px-8 pt-2 shrink-0 snap-center snap-always overflow-y-hidden">
      <h2 v-if="title" class="z-10 flex items-center justify-center mt-3 small:mt-0 text-2xl font-bold text-center text-balance gap-x-3">
        <component :is="titleIcon" v-if="titleIcon" class="!w-10" />
        {{ title }}
      </h2>
      <p v-if="description" class="z-10 mt-4 text-center text-pretty opacity-60">
        {{ description }}
      </p>
      <component
        :is="main"
        v-bind="{ errorMsg: getInputStepError(step), canSkip: !!stepsToSkip, state, isVisible: isStepVisible(step), isScrolling, stepName: step }"
        v-on="{ focus, done: onStepDone, select: onStepDone, skip }"
      />
    </li>
  </ul>
</template>
