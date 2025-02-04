<script setup lang="ts">
import type { Flow, FlowHookCb, InputStepName, NavigateToOptions, NavigationControl, OnDoneStepValue, State, StepName } from '@/lib/flows/steps.types'
import { useCarousel } from '@/composables/useCarousel'
import { useLogger } from '@/composables/useLogger'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { inputSteps, isInputStep } from '@/lib/flows/steps.types'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { IonBackButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { until, useIntersectionObserver } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { computed, onMounted, type PropType, reactive, ref, watch, watchEffect } from 'vue'
import { nextTick } from 'vue'

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

const logger = useLogger('Flow.vue')

const { onDone: originalOnFlowDone, onCancel: originalOnFlowCancel, steps: stepsInFlow, flowName } = props.flow!
const historyStack = ref([stepsInFlow[0]])
const activeIndex = ref(0)

const emptyState = inputSteps.reduce((state, stepName) => ({ ...state, [stepName]: undefined }), {} as State)
const state = ref({ ...emptyState, ...props.initialState })

const { setToast } = useToast()

let lock = Promise.resolve() // Initially unlocked
let hasRunSuccessfully = false // Flag to track if the hook has run successfully

/**
 * Extends the flow handler to ensure that it only executes successfully once.
 * Once the handler has completed successfully (without errors), it prevents further execution.
 * This avoids re-calling onDone or onCancel after either has already been executed,
 * in particular to prevent onCancel from being executed on modal dismissal if onDone or onCancel has been
 * has already been triggered. Implements a promise-based locking system to manage execution flow and enforce a single
 * enforce a single successful execution.
 */
function makeFlowHandler(originalHandler?: FlowHookCb): () => Promise<void> {
  // If no custom handler is not provided, the default behavior is to close the modal.
  if (!originalHandler)
    originalHandler = async () => useModal().closeModal()

  const fn = async function (_err = defaultErrorHandler) {
    // Wait for the lock to be released before proceeding.
    await lock

    // Prevent execution if the hook has already run successfully.
    if (hasRunSuccessfully) {
      logger.warn(`${flowName} hook has already completed successfully and cannot be run again.`)
      return
    }

    // Lock the execution by replacing the lock promise with a new, unresolved promise.
    let unlock
    lock = new Promise(resolve => unlock = resolve)

    try {
      let hasError = false
      const err = (message: string) => {
        _err(message)
        hasError = true
      }

      // Execute the original handler with the provided state and utilities.
      const { prevent } = await originalHandler!(state.value, { err, setToast }) || { prevent: false }
      if (!hasError)
        hasRunSuccessfully = true

      // If no error occurred, proceed to close the modal unless it's already closing.
      if (!hasError && !props.isClosing && !prevent)
        await useModal().closeModal()
    }
    finally {
      // Release the lock for subsequent operations and reset the lock state.
      unlock!()
    }
  }
  return fn
}

const onFlowDone = makeFlowHandler(originalOnFlowDone)
const onFlowCancel = makeFlowHandler(originalOnFlowCancel)

watch(() => props.isClosing, async () => {
  if (!props.isClosing)
    return
  // The flow's modal is being dismissed.
  // Invoke onFlowCancel for the case that no onFlowDone/onFlowCancel handler was invoked yet, e.g. if the flow/modal
  // dismissal was not triggered by a handler but, for example, a swipe gesture or modal.dismiss()
  await onFlowCancel()
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

const stepCallbacks = computed(() => ({ err: defaultErrorHandler, finalizeFlow: onFlowDone, navigateTo, next: navigateTo, prev: () => navigateTo(-1) }))

function getInputStepError(stepName: StepName) {
  return isInputStep(stepName) ? errors.value[stepName] : null
}

function defaultErrorHandler(errorMessage: string) {
  const activeStepName = activeStep.value.step
  if (isInputStep(activeStepName) && !props.isClosing) {
    errors.value[activeStepName] = errorMessage
    // Clear the error message after 10 seconds
    window.setTimeout(() => errors.value[activeStepName] = '', 10 * 1e3)
  }
  else { setToast({ message: errorMessage, type: 'error', duration: 10 * 1e3 }) }
  try {
    Haptics.notification({ type: NotificationType.Error })
  }
  catch (error) {
    logger.error('Failed to trigger haptic feedback', error)
  }
}

/**
 * Change the active step to the given step or relative index:
 *
 * 1. Get the new active index
 * 2. If the new active step index is out of upper bounds, we will call
 *    onFlowDone. If the step index is out of lower bounds, we will call
 *    onFlowCancel and print a warning.
 * 3. If the new active step index is within bounds, we will call the
 *    beforeRender of the new active step
 * 4. We update the history stack:
 *    1. If we are going forward, we will push the new active step to the
 *       history stack.
 *    2. Otherwise, we will remove the steps between the new active step and the
 *       current active step, and then we will remove the last step of the
 *       history stack, since it was the active step and the transition is
 *       already done.
 */
async function navigateTo(options: NavigateToOptions = 1) {
  if (props.isClosing)
    return
  const currentIndex = stepsInFlow.findIndex(s => s.step === activeStep.value?.step)
  let newIndex: number = currentIndex + 1
  if (typeof options === 'number') {
    newIndex = currentIndex + options
  }
  else if ('step' in options) {
    const stepIndex = stepsInFlow.findIndex(s => s.step === options.step)
    if (stepIndex === -1) {
      logger.warn(`Step ${options.step} not found in flow`)
      return
    }
    newIndex = stepIndex
  }
  else if ('goBackBy' in options && options.goBackBy) {
    newIndex = activeIndex.value - options.goBackBy
  }
  else if ('skipAheadBy' in options && options.skipAheadBy) {
    newIndex = currentIndex + options.skipAheadBy
  }

  if (!Number.isInteger(newIndex) || newIndex < 0)
    throw new Error(`Cannot navigate to index ${newIndex}`)
  else if (newIndex >= stepsInFlow.length)
    return await onFlowDone()

  const newActiveStep = stepsInFlow.at(newIndex)
  if (!newActiveStep)
    return

  await newActiveStep?.beforeRender?.(state.value, stepCallbacks.value)

  const isGoingForward = newIndex > activeIndex.value
  if (isGoingForward) {
    // @ts-expect-error nextStep is of type Step, which it is the same as the historyStack
    historyStack.value.push(newActiveStep)
    await nextTick()
    goToSlide(historyStack.value.length - 1) // Moving forwards means moving to the last slide
  }
  else {
    // To have a smooth transition, we need to remove the steps between the prevStep and the activeStep
    // but keeping both of them
    historyStack.value.splice(newIndex + 1, activeIndex.value - newIndex - 1)

    // We need to render the history stack in the template
    await nextTick()

    // Go to the previous slide and wait for the scroll to start and finish
    goToSlide(newIndex)
    await until(isScrolling).toBe(true, { timeout: 1000 })
    await until(isScrolling).toBe(false, { timeout: 1000 })

    // Remove the last step in the historyStack, since it was the activeStep and
    // the transition is already done
    historyStack.value.pop()
  }
}

function makeSkipOrBackHandler(defaultNavigation: Pick<NavigationControl, 'goBackBy'> | Pick<NavigationControl, 'skipAheadBy'>) {
  return (stepCountOrName?: number | StepName) => {
    if (!stepCountOrName)
      navigateTo(defaultNavigation)
    else if (typeof stepCountOrName === 'number')
      navigateTo(('skipAheadBy' in defaultNavigation ? 1 : -1) * stepCountOrName)
    else
      navigateTo({ step: stepCountOrName }) // note that this does not guarantee navigation in the desired direction
  }
}

// TODO revise this
const shouldAutofocus = computed(() => activeStep.value.autofocus || activeStep.value.autofocus === undefined)

onMounted(async () => {
  await stepsInFlow[activeIndex.value].beforeRender?.(state.value, stepCallbacks.value)

  if (shouldAutofocus.value)
    focus()
})

async function onStepDone(value: OnDoneStepValue) {
  if (props.isClosing)
    return
  const activeStepName = activeStep.value.step

  if (isInputStep(activeStepName)) {
    // @ts-expect-error If the emit value is well typed, this should work
    state.value[activeStepName] = value
    errors.value[activeStepName] = '' // Clear error message
  }
  if (activeStep.value.beforeNext)
    await activeStep.value.beforeNext(state.value, stepCallbacks.value)
  else
    // Next step
    navigateTo(1)
}

async function onCancel() {
  if (props.isClosing)
    return
  await onFlowCancel()
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
    logger.log({ intersectionRatio, step: activeStep.value.step, activeIndex: activeIndex.value, autofocus: activeStep.value.autofocus, isActiveStepFullyVisible: isActiveStepFullyVisible.value })
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
  return ((activeIndex.value === 0 && stepName === stepsInFlow.at(0)?.step) || (stepName === activeStep.value?.step && isActiveStepFullyVisible.value))
    // When the flow is closing, already allow steps to tear down before the modal slides down to close. This way, for
    // example animations can already be stopped, and we especially use this in QRScanner to remove styles applied to
    // the background page on native, before the modal unveils the background.
    && !props.isClosing
}

function focus() {
  const input = activeStepScrollerItem.value?.querySelector('input')
  // TODO: remove when focus is working in every device (mobile + tablet)
  logger.log('focus', input)
  input?.focus()
}

function blur() {
  const { activeElement } = document
  if (activeElement instanceof HTMLElement)
    activeElement.blur()
  else
    logger.warn('Cannot blur', activeElement)
}
</script>

<template>
  <IonHeader class="ion-no-border tall:pt-1">
    <IonToolbar>
      <IonButtons slot="start">
        <IonBackButton
          v-if="allowBack" default-href="/" @click.prevent="() =>
            navigateTo({ goBackBy: activeStep.goBackBy || 1 })"
        />
      </IonButtons>
      <IonButtons slot="end">
        <button aria-label="close flow modal" class="px-3 py-2" @click.stop="onCancel">
          <IonIcon :icon="close" size="large" class="bg-[#DADADA] p-[2px] w-6 h-6 text-white rounded-full" />
        </button>
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <ul ref="scroller" class="hide-scrollbar mb-auto h-full overflow-x-hidden flex snap-x snap-mandatory">
    <li v-for="({ main, step, title, titleIcon, description, skipAheadBy, goBackBy }) in historyStack" ref="scrollerItems" :key="step" class="max-w-[100vw] w-full h-full flex flex-col relative shrink-0 snap-center snap-always px-8 overflow-y-auto">
      <h2 v-if="title" class="z-10 flex justify-center items-center gap-x-3 mt-3 text-2xl font-bold text-balance text-center small:mt-0">
        <component :is="titleIcon" v-if="titleIcon" class="!w-10" />
        {{ title }}
      </h2>
      <p v-if="description" class="z-10 mt-4 text-pretty text-center opacity-60">
        {{ description }}
      </p>
      <div class="flex flex-col flex-1">
        <component
          :is="main"
          v-bind="{ errorMsg: getInputStepError(step), canSkip: !!skipAheadBy, state, isVisible: isStepVisible(step), isScrolling, stepName: step }"
          v-on="{ focus, done: onStepDone, select: onStepDone, skip: makeSkipOrBackHandler({ skipAheadBy }), back: makeSkipOrBackHandler({ goBackBy }), blur }"
        />
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* When we call initializeFlow we setup some css classes */
:global(ion-modal.nimiq-modal-h-max) {
  --height: auto;
}
</style>
