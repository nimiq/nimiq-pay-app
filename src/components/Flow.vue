<script setup lang="ts">
import type { PropType, Ref } from 'vue'
import type { CloseRole } from '@/composables/useModal'
import type { flowHeightOptions } from '@/lib/flows'
import type { Flow, FlowHookCb, InputStepName, NavigateToOptions, NavigationControl, OnDoneStepValue, State, Step } from '@/lib/flows/steps.types'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { IonBackButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { until, useIntersectionObserver } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { useCarousel } from '@/composables/useCarousel'
import { useLogger } from '@/composables/useLogger'
import { useModal } from '@/composables/useModal'
import { useSharedPinInput } from '@/composables/useSharedPinInput'

import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { inputSteps, isInputStep, StepName } from '@/lib/flows/steps.types'

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
  height: {
    type: String as PropType<flowHeightOptions>,
    required: true,
  },
})

const logger = useLogger('Flow.vue')

const { onDone: originalOnFlowDone, onCancel: originalOnFlowCancel, steps: stepsInFlow, flowName, initialStep } = props.flow!
const activeIndex = ref(Math.max(stepsInFlow.findIndex(s => s.step === initialStep), 0))
const historyStack: Ref<Step[]> = ref(stepsInFlow.slice(0, activeIndex.value + 1))

const emptyState = inputSteps.reduce((state, stepName) => ({ ...state, [stepName]: undefined }), {} as State)
const state = ref({ ...emptyState, ...props.initialState })

const { setToast } = useToast()

let lock = Promise.resolve() // Initially unlocked
const hasRunSuccessfully = new Map<string, boolean>() // Flag to track if the hook has run successfully

/**
 * Extends the flow handler to ensure that it only executes successfully once.
 * Once the handler has completed successfully (without errors), it prevents further execution.
 * This avoids re-calling onDone or onCancel after either has already been executed,
 * in particular to prevent onCancel from being executed on modal dismissal if onDone or onCancel has been
 * has already been triggered. Implements a promise-based locking system to manage execution flow and enforce a single
 * enforce a single successful execution.
 */
function makeFlowHandler(originalHandler?: FlowHookCb, role?: CloseRole): () => Promise<void> {
  // If no custom handler is not provided, the default behavior is to close the modal.
  if (!originalHandler)
    originalHandler = async () => {}

  const fn = async function (_err = defaultErrorHandler) {
    // Wait for the lock to be released before proceeding.
    await lock

    // Prevent execution if the hook has already run successfully.
    if (hasRunSuccessfully.get(flowName)) {
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
      const { prevent } = await originalHandler(state.value, { err, setToast }) || { prevent: false }
      if (!hasError)
        hasRunSuccessfully.set(flowName, true)

      // If no error occurred, proceed to close the modal unless it's already closing.
      if (!hasError && !props.isClosing && !prevent)
        await useModal().closeModal({ role })
    }
    catch (error) {
      // Without this, a throwing hook never reaches the step's error state and the PIN/Pay spinner never stops
      logger.error(`Unhandled error in ${flowName} ${role === 'cancel' ? 'onCancel' : 'onDone'} hook`, error)
      // A failed closeModal after a successful hook must not report the completed action as failed
      if (!hasRunSuccessfully.get(flowName))
        _err(i18n.t('Something went wrong'))
    }
    finally {
      // Release the lock for subsequent operations and reset the lock state.
      unlock!()
    }
  }
  return fn
}

const onFlowDone = makeFlowHandler(originalOnFlowDone, 'confirm')
const onFlowCancel = makeFlowHandler(originalOnFlowCancel, 'cancel')

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

// The single hidden input shared by the PIN steps (see useSharedPinInput). Only rendered/provided for flows
// that actually contain a PIN step, so non-PIN flows don't carry the input in their DOM. Kept in this modal so
// it is never inside a scrolling slide nor in the modal's inert background.
const hasPinStep = stepsInFlow.some(s => ([StepName.PinCode, StepName.PinCodeConfirm, StepName.PinCodeChange] as StepName[]).includes(s.step))
const sharedPin = useSharedPinInput()
const sharedPinInputEl = ref<HTMLInputElement>()
onMounted(() => {
  if (sharedPinInputEl.value)
    sharedPin.provideElement(sharedPinInputEl.value)
})
onBeforeUnmount(() => {
  if (sharedPinInputEl.value)
    sharedPin.releaseElement(sharedPinInputEl.value)
})

const activeStep = computed(() => historyStack.value[activeIndex.value])
// Get the element in screen knowing the active step using the li key
const activeStepScrollerItem = computed(() => scrollerItems.value[activeIndex.value])

const allowBack = computed(() => activeIndex.value > 0 && activeStep.value?.goBackBy !== -1 && activeStep.value?.allowGoBack !== false)

type Errors = Record<InputStepName, string>
const errors = ref<Errors>(Object.fromEntries(historyStack.value.filter(isInputStep).map(s => [s.step, ''])) as Errors)
watchEffect(() => errors.value = reactive(Object.fromEntries(historyStack.value.filter(isInputStep).map(s => [s.step, ''])) as Errors))

const stepCallbacks = computed(() => ({ err: defaultErrorHandler, finalizeFlow: onFlowDone, navigateTo, next: () => navigateTo(1), prev: () => navigateTo(-1) }))
const stepCompletionInProgress = ref<StepName | null>(null)

function getInputStepError(stepName: StepName) {
  return isInputStep(stepName) ? errors.value[stepName] : null
}

function isCurrentStepEmitter(stepName: StepName, eventName: string) {
  if (stepName === activeStep.value.step)
    return true

  logger.warn(`Ignoring ${eventName} from inactive step`, { emittedBy: stepName, activeStep: activeStep.value.step })
  return false
}

function getVisitedStepIndex(stepName: StepName) {
  return historyStack.value.findIndex(step => step.step === stepName)
}

function canHandleInactiveBackEvent(stepName: StepName, targetStep: StepName) {
  const stepVisitedIndex = getVisitedStepIndex(stepName)
  const targetVisitedIndex = getVisitedStepIndex(targetStep)

  // Some steps intentionally stay mounted to monitor state after navigation and may still need to force
  // an explicit rollback. Only allow those inactive emits to navigate backwards within the visited history.
  return stepVisitedIndex !== -1
    && targetVisitedIndex !== -1
    && targetVisitedIndex <= stepVisitedIndex
}

function defaultErrorHandler(errorMessage: string) {
  // Allow retry after a beforeNext error that doesn't navigate
  stepCompletionInProgress.value = null
  const activeStepName = activeStep.value.step
  if (isInputStep(activeStepName) && !props.isClosing) {
    errors.value[activeStepName] = errorMessage
    // Clear the error message after 10 seconds
    window.setTimeout(() => errors.value[activeStepName] = '', 10 * 1e3)
  }
  else { setToast({ message: errorMessage, type: 'error', duration: 10 * 1e3 }) }
  Haptics.notification({ type: NotificationType.Error })
    .catch(error => logger.error('Failed to trigger haptic feedback', error))
}

function shouldBlockNavigation(source: string) {
  if (!stepCompletionInProgress.value)
    return false

  logger.warn(`Ignoring ${source} while step completion is in progress`, {
    inProgress: stepCompletionInProgress.value,
    activeStep: activeStep.value.step,
  })
  return true
}

async function performNavigation(options: NavigateToOptions = 1, { allowDuringStepCompletion = false, source = 'navigateTo' }: { allowDuringStepCompletion?: boolean, source?: string } = {}) {
  if (!allowDuringStepCompletion && shouldBlockNavigation(source))
    return

  try {
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

    // For goBackBy, newIndex is a historyStack position — look up the step from historyStack
    // (not stepsInFlow) so we navigate to the step the user actually visited, even when
    // steps were skipped via navigateTo({ step }).
    const isGoBackBy = typeof options === 'object' && 'goBackBy' in options
    const newActiveStep = isGoBackBy
      ? historyStack.value[newIndex] ?? stepsInFlow.at(newIndex)
      : stepsInFlow.at(newIndex)
    if (!newActiveStep)
      return

    const isGoingForward = newIndex > activeIndex.value
    if (!isGoingForward && activeStep.value.beforePrev)
      await activeStep.value.beforePrev(state.value, stepCallbacks.value)

    await newActiveStep.beforeRender?.(state.value, stepCallbacks.value)

    if (isGoingForward) {
      historyStack.value.push(newActiveStep)
      activeIndex.value = historyStack.value.length - 1
      await nextTick()
      goToSlide(activeIndex.value)
    }
    else {
      // If the jump is more than one step, we remove the middle slides from the animation.
      if (activeIndex.value - newIndex > 1) {
        // Save the current step.
        const currentStep = historyStack.value[activeIndex.value]
        // Temporarily set history to only include the target and the current step.
        historyStack.value = [historyStack.value[newIndex], currentStep]
        // The current slide is now at index 1.
        activeIndex.value = 1
        await nextTick()
        // Animate from slide 1 (current) to slide 0 (target).
        goToSlide(0)
        // Wait for the scroll to start and finish.
        await until(isScrolling).toBe(true, { timeout: 1000 })
        await until(isScrolling).toBe(false, { timeout: 1000 })
        // Once finished, update historyStack to only contain the target.
        historyStack.value = [historyStack.value[0]]
        activeIndex.value = 0
      }
      else {
        // For adjacent navigation, ensure the target is in the history.
        const exists = historyStack.value.find(s => s.step === newActiveStep.step)
        if (!exists) {
          historyStack.value.splice(newIndex, 0, newActiveStep)
        }
        await nextTick()
        goToSlide(newIndex)
        await until(isScrolling).toBe(true, { timeout: 1000 })
        await until(isScrolling).toBe(false, { timeout: 1000 })
        historyStack.value = historyStack.value.slice(0, newIndex + 1)
        activeIndex.value = newIndex
      }
    }
  }
  finally {
    stepCompletionInProgress.value = null
  }
}

async function navigateTo(options: NavigateToOptions = 1) {
  await performNavigation(options)
}

async function navigateToVisitedStep(stepName: StepName, source = 'back') {
  const targetVisitedIndex = getVisitedStepIndex(stepName)
  if (targetVisitedIndex === -1) {
    logger.warn(`Ignoring ${source} to unvisited step`, { step: stepName, activeStep: activeStep.value.step })
    return
  }

  const goBackBy = activeIndex.value - targetVisitedIndex
  if (goBackBy <= 0)
    return

  await performNavigation({ goBackBy }, { source })
}

function makeSkipOrBackHandler(stepName: StepName, defaultNavigation: Pick<NavigationControl, 'goBackBy'> | Pick<NavigationControl, 'skipAheadBy'>) {
  return (stepCountOrName?: number | StepName) => {
    const isBackEvent = 'goBackBy' in defaultNavigation
    if (!isCurrentStepEmitter(stepName, isBackEvent ? 'back' : 'navigation')) {
      if (isBackEvent && typeof stepCountOrName === 'string' && canHandleInactiveBackEvent(stepName, stepCountOrName))
        navigateToVisitedStep(stepCountOrName, 'inactive back')
      return
    }

    if (!stepCountOrName)
      navigateTo(defaultNavigation)
    else if (typeof stepCountOrName === 'number')
      navigateTo(('skipAheadBy' in defaultNavigation ? 1 : -1) * stepCountOrName)
    else if (isBackEvent)
      navigateToVisitedStep(stepCountOrName)
    else
      navigateTo({ step: stepCountOrName }) // note that this does not guarantee navigation in the desired direction
  }
}

function makeStepDoneHandler(stepName: StepName) {
  return (value: OnDoneStepValue) => onStepDone(stepName, value)
}

function makeStepNavigateHandler(stepName: StepName) {
  return (value: NavigateToOptions) => {
    if (!isCurrentStepEmitter(stepName, 'navigateTo'))
      return

    navigateTo(value)
  }
}

function createStepDoneCallbacks(onCompletionStarted: () => void) {
  const nav = async (value: NavigateToOptions) => {
    onCompletionStarted()
    await performNavigation(value, { allowDuringStepCompletion: true, source: 'beforeNext' })
  }
  return {
    err: (errorMessage: string) => {
      onCompletionStarted()
      defaultErrorHandler(errorMessage)
    },
    finalizeFlow: async () => {
      onCompletionStarted()
      try {
        await onFlowDone()
      }
      finally {
        stepCompletionInProgress.value = null
      }
    },
    navigateTo: nav,
    next: () => nav(1),
    prev: () => nav(-1),
  }
}

const activeStepHandlers = computed(() => ({
  focus,
  done: makeStepDoneHandler(activeStep.value.step),
  select: makeStepDoneHandler(activeStep.value.step),
  blur,
  navigateTo: makeStepNavigateHandler(activeStep.value.step),
}))

// TODO revise this
const shouldAutofocus = computed(() => activeStep.value.autofocus || activeStep.value.autofocus === undefined)

onMounted(async () => {
  await stepsInFlow[activeIndex.value].beforeRender?.(state.value, stepCallbacks.value)

  if (shouldAutofocus.value)
    focus()
})

async function onStepDone(stepName: StepName, value: OnDoneStepValue) {
  if (props.isClosing)
    return
  if (!isCurrentStepEmitter(stepName, 'done'))
    return
  if (stepCompletionInProgress.value) {
    logger.warn('Ignoring duplicate step completion while navigation is in progress', {
      emittedBy: stepName,
      inProgress: stepCompletionInProgress.value,
    })
    return
  }

  stepCompletionInProgress.value = stepName
  const activeStepName = activeStep.value.step
  let completionStarted = false
  const stepDoneCallbacks = createStepDoneCallbacks(() => {
    completionStarted = true
  })

  try {
    if (isInputStep(activeStepName)) {
      // @ts-expect-error If the emit value is well typed, this should work
      state.value[activeStepName] = value
      errors.value[activeStepName] = '' // Clear error message
    }
    if (activeStep.value.beforeNext)
      await activeStep.value.beforeNext(state.value, stepDoneCallbacks)
    else
      // Next step
      await stepDoneCallbacks.next()
  }
  catch (error) {
    logger.error(`Unhandled error while completing step ${stepName}`, error)
    // Step emits ignore the returned promise, so rethrowing would leave the step spinner on with no message
    defaultErrorHandler(i18n.t('Something went wrong'))
  }
  finally {
    // Some steps intentionally no-op from beforeNext until input becomes valid. Release the guard if no
    // navigation, error, or flow-finalization path was started so the user can retry.
    if (!completionStarted && stepCompletionInProgress.value === stepName)
      stepCompletionInProgress.value = null
  }
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
  // PIN steps render no input in the slide — their input is the shared one (useSharedPinInput). Open it here,
  // when the step is fully visible, so the keyboard auto-opens like other input steps.
  sharedPin.focusActive()
}

function blur() {
  const { activeElement } = document
  if (activeElement instanceof HTMLElement)
    activeElement.blur()
  else
    logger.warn('Cannot blur', activeElement)
}

watch(() => activeStep.value.overrideHeight, async (newHeight, oldHeight) => {
  // If going from full to max, wait for scrolling to finish to prevent popping
  if (
    (oldHeight === 'h-full' && newHeight === 'h-max')
    || (oldHeight === 'h-full' && newHeight === undefined)
    || (oldHeight === undefined && newHeight === 'h-max')
  ) {
    await until(isScrolling).toBe(true, { timeout: 1000 })
    await until(isScrolling).toBe(false, { timeout: 1000 })
  }

  const modal = scroller.value?.parentElement?.parentElement // ion-page -> ion-modal
  if (!modal)
    return logger.warn('Cannot find modal element to override height')

  // Ionic zeroes --ion-safe-area-top on sheet modals and sets --ion-modal-offset-top to the root safe area instead,
  // so read that first. Otherwise the sheet grows under the status bar and its header can't be tapped (APP-328).
  const fullHeight = 'calc(100% - (var(--ion-modal-offset-top, var(--ion-safe-area-top)) + 10px))'
  if (newHeight)
    modal.style.setProperty('--height', newHeight === 'h-full' ? fullHeight : 'auto')
  else
    // Reset to default height
    modal.style.setProperty('--height', props.height === 'h-full' ? fullHeight : 'auto')
})
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
    <li v-for="({ main, step, title, titleIcon, description, skipAheadBy, goBackBy, ariaLabel }) in historyStack" ref="scrollerItems" :key="step" class="max-w-[100vw] w-full h-full flex flex-col relative shrink-0 snap-center snap-always px-8 overflow-y-auto">
      <h2 v-if="title" class="z-10 flex justify-center items-center gap-x-3 mt-3 text-2xl font-bold text-balance text-center small:mt-0" :aria-label="ariaLabel">
        <component :is="titleIcon" v-if="titleIcon" class="!w-10" />
        {{ title }}
      </h2>
      <p v-if="description" class="z-10 mt-4 text-pretty text-center opacity-60">
        {{ description }}
      </p>
      <div class="flex flex-col flex-1">
        <component
          :is="main"
          v-bind="{ errorMsg: getInputStepError(step), canSkip: !!skipAheadBy, state, isVisible: isStepVisible(step), isActive: activeStep.step === step, isScrolling, stepName: step }"
          v-on="{ focus, done: makeStepDoneHandler(step), select: makeStepDoneHandler(step), skip: makeSkipOrBackHandler(step, { skipAheadBy }), back: makeSkipOrBackHandler(step, { goBackBy }), blur, navigateTo: makeStepNavigateHandler(step), overrideHeight: (value: flowHeightOptions) => { logger.log('Override height for step:', { step, value }) } }"
        />
      </div>
    </li>
    <div class="absolute inset-x-0 bottom-0">
      <div class="z-[10000] relative">
        <slot name="default" v-bind="{ activeStep }" v-on="activeStepHandlers" />
      </div>
    </div>
  </ul>

  <!-- Single hidden input shared by the PIN steps. Lives here (inside the modal, outside the slide carousel)
       so focus never has to hand off between two inputs and the numeric keyboard appears (APP-157). Only
       rendered for flows that contain a PIN step. -->
  <input
    v-if="hasPinStep"
    ref="sharedPinInputEl" type="tel" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
    aria-label="PIN" class="caret-transparent sr-only"
  >

  <slot name="default" v-bind="{ activeStep }" v-on="activeStepHandlers" />
</template>

<style scoped>
/* When we call initializeFlow we setup some css classes */
:global(ion-modal.nimiq-modal-h-max) {
  --height: auto;
}
</style>
