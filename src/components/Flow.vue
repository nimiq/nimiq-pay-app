<script setup lang="ts">
import { type PropType, computed, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { until, useIntersectionObserver } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonBackButton, IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { nextTick } from 'vue'
import { inputSteps, isInfoStep, isInputStep } from '@/lib/flows/steps.types'
import type { Flow, InputStepName, NavigationControl, OnDoneStepValue, State, StepName } from '@/lib/flows/steps.types'
import { useModal } from '@/composables/useModal'
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

const { onDone: originalOnFlowDone, onCancel: originalOnFlowCancel, steps: stepsInFlow } = props.flow!
const historyStack = ref([stepsInFlow[0]])
const activeIndex = ref(0)

const emptyState = inputSteps.reduce((state, stepName) => ({ ...state, [stepName]: undefined }), {} as State)
const state = ref({ ...emptyState, ...props.initialState })

// Avoid that onDone / onCancel can be called again, after one of the two was invoked or meant to be invoked (even if
// the handler is undefined). This is especially to avoid running onCancel on modal dismissal if onDone or onCancel were
// already called.
let didAnyFlowHandlerRun = false
function makeFlowHandler<T extends (...args: any) => Promise<void>>(originalHandler?: T): T {
  // Not an arrow function to be able to pass original `this` on.
  return async function (this: ThisType<T>, ...args: Parameters<T>) {
    if (!didAnyFlowHandlerRun) {
      didAnyFlowHandlerRun = true
      await originalHandler?.apply(this, args)
    }
    if (!props.isClosing) {
      // Ensure flow gets closed, in case the original handler did not dismiss the modal itself.
      await useModal().closeModal()
    }
  } as T
}
const onFlowDone = makeFlowHandler(originalOnFlowDone)
const onFlowCancel = makeFlowHandler(originalOnFlowCancel)

watch(() => props.isClosing, async () => {
  if (!props.isClosing)
    return
  // The flow's modal is being dismissed.
  // Invoke onFlowCancel for the case that no onFlowDone/onFlowCancel handler was invoked yet, e.g. if the flow/modal
  // dismissal was not triggered by a handler but, for example, a swipe gesture or modal.dismiss()
  await onFlowCancel({ err: defaultErrorHandler })
  // Out of abundance of caution, clear the state to clear any potential secrets. After the flow unmounts, the state
  // will be garbage collected anyway, but just for the case that some code still retains a reference to it, clear its
  // content.
  for (const stepName of Object.keys(state.value))
    delete state.value[stepName as keyof typeof state.value]
})

const scroller = ref<HTMLElement>()
const scrollerItems = ref<HTMLElement[]>([])
const { goToSlide, isScrolling } = useCarousel(scroller, { activeIndex })

const activeStep = computed(() => historyStack.value[activeIndex.value])
// Get the element in screen knowing the active step using the li key
const activeStepScrollerItem = computed(() => scrollerItems.value[activeIndex.value])

const allowBack = computed(() => activeIndex.value > 0 && activeStep.value?.goBackBy !== -1)

type Errors = Record<InputStepName, string>
const errors = ref<Errors>(Object.fromEntries(historyStack.value.filter(isInputStep).map(s => [s.step, ''])) as Errors)
watchEffect(() => errors.value = reactive(Object.fromEntries(historyStack.value.filter(isInputStep).map(s => [s.step, ''])) as Errors))

function getInputStepError(stepName: StepName) {
  return isInputStep(stepName) ? errors.value[stepName] : null
}

function defaultErrorHandler(errorMessage: string) {
  const activeStepName = activeStep.value.step
  if (isInputStep(activeStepName) && !props.isClosing)
    errors.value[activeStepName] = errorMessage
  else
    useToast().setToast({ message: errorMessage, error: true })
}

type GoToNextOptions = { err?: (errorMsg: string) => void } & Pick<NavigationControl, 'skipAheadBy'>
async function goToNext(options: GoToNextOptions = {}) {
  if (props.isClosing)
    return
  const { err = defaultErrorHandler, skipAheadBy = 1 } = options
  const currentIndex = stepsInFlow.findIndex(s => s.step === activeStep.value.step)
  const nextStep = stepsInFlow[currentIndex + skipAheadBy]
  if (!nextStep) {
    await onFlowDone(state.value, { err })
    return
  }
  await nextStep?.beforeRender?.(state.value)
  // @ts-expect-error nextStep is of type Step, which it is the same as the historyStack
  historyStack.value.push(nextStep)
  await nextTick()
  goToSlide(historyStack.value.length - 1)
}

type GoToPrevOptions = Pick<NavigationControl, 'goBackBy'>
async function goToPrev(options: GoToPrevOptions = {}) {
  if (props.isClosing)
    return
  const { goBackBy = 1 } = options
  const newIndex = activeIndex.value - goBackBy
  const prevStep = historyStack.value.at(newIndex)
  if (!prevStep) {
    console.warn('Cannot go back from', activeStep.value.step)
    return
  }

  await prevStep.beforeRender?.(state.value)

  // To have a smooth transition, we need to remove the steps between the prevStep and the activeStep
  // but keeping both of them
  historyStack.value.splice(newIndex + 1, activeIndex.value - newIndex - 1)

  // Go to the previous slide and wait for the scroll to start and finish
  goToSlide(newIndex)
  await until(isScrolling).toBe(true, { timeout: 3000 })
  await until(isScrolling).toBe(false, { timeout: 3000 })

  // Remove the last step in the historyStack, since it was the activeStep and
  // the transition is already done
  historyStack.value.pop()

  // We need to render the history stack in the template
  await nextTick()
}

// TODO revise this
const shouldAutofocus = computed(() => activeStep.value.autofocus || activeStep.value.autofocus === undefined)

onMounted(async () => {
  await stepsInFlow[activeIndex.value].beforeRender?.(state.value)

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
      const finalizeFlow = () => onFlowDone(state.value, { err })
      await activeStep.value.beforeNext(state.value, { next: goToNext, err, prev: goToPrev, finalizeFlow, skip })
    }
    else {
      goToNext()
    }
  }
}

function skip() {
  // Assuming there's no option to skip if you are in the last step
  if (activeStep.value.skipAheadBy)
    goToNext({ skipAheadBy: activeStep.value.skipAheadBy })
}

async function onCancel() {
  if (props.isClosing)
    return
  await onFlowCancel({ err: defaultErrorHandler })
}

const isActiveStepFullyVisible = ref(false)
// We track the intersection of each step, with 1 meaning the step is fully visible.
useIntersectionObserver(
  activeStepScrollerItem,
  ([{ intersectionRatio }]) => {
    isActiveStepFullyVisible.value = intersectionRatio === 1
    if (isActiveStepFullyVisible.value && isInputStep(activeStep.value) && activeStep.value.autofocus !== false)
      focus()
    // If it's not input step or autofocus is false, blur the input previously focused
    else if (isActiveStepFullyVisible.value)
      blur()

    // TODO: remove when focus is working in every device (mobile + tablet)
    console.log({ intersectionRatio, step: activeStep.value.step, activeIndex: activeIndex.value, autofocus: activeStep.value.autofocus, isActiveStepFullyVisible: isActiveStepFullyVisible.value }) // eslint-disable-line no-console
  },
  // Note: previously, we used [0, 0.5, 1] as threshold, meaning that the observer should be called whenever any of
  // those values is reached/passed. However, occasionally but seldom it happened that the callback for reaching 1 was
  // not called, but only a callback for example at 0.9xxx, which probably is the callback for passing the 0.5 threshold
  // just invoked late. It seemed like in such cases a separate callback for threshold 1 might have been skipped,
  // although I'm not sure why that should be. This caused isActiveStepFullyVisible not becoming true on rare occasion,
  // and for example the QRScanner of the pay flow not starting in such case.
  // Since setting 1 as single threshold, this issue was not observed anymore. But just 1 also results in less callbacks
  { threshold: 1, root: scroller },
)

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
  console.log('focus', input) // eslint-disable-line no-console
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
        <IonBackButton v-if="allowBack" default-href="/" @click.prevent="() => goToPrev({ goBackBy: activeStep.goBackBy })" />
      </IonButtons>
      <IonButtons slot="end">
        <IonButton v-if="activeStep.canDismiss !== false" @click.stop="onCancel">
          <IonIcon :icon="close" size="large" class="text-white bg-[#DADADA] rounded-full w-6 h-6 p-[2px]" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <ul ref="scroller" class="flex h-full mb-auto overflow-x-hidden hide-scrollbar snap-x snap-mandatory">
    <li v-for="({ main, step, title, titleIcon, description, skipAheadBy }) in historyStack" ref="scrollerItems" :key="step" class="relative flex flex-col items-center w-full max-w-[100vw] h-full px-8 pt-2 shrink-0 snap-center snap-always overflow-y-hidden">
      <h2 v-if="title" class="z-10 flex items-center justify-center mt-3 small:mt-0 text-2xl font-bold text-center text-balance gap-x-3">
        <component :is="titleIcon" v-if="titleIcon" class="!w-10" />
        {{ title }}
      </h2>
      <p v-if="description" class="z-10 mt-4 text-center text-pretty opacity-60">
        {{ description }}
      </p>
      <component
        :is="main"
        v-bind="{ errorMsg: getInputStepError(step), canSkip: !!skipAheadBy, state, isVisible: isStepVisible(step), isScrolling, stepName: step }"
        v-on="{ focus, done: onStepDone, select: onStepDone, skip }"
      />
    </li>
  </ul>
</template>
