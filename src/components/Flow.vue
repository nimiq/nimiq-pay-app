<script setup lang="ts">
import type { PropType, Ref } from 'vue'
import type { CloseRole } from '@/composables/useModal'
import type { flowHeightOptions } from '@/lib/flows'
import type { Flow, FlowHookCb, InputStepName, NavigateToOptions, NavigationControl, OnDoneStepValue, State, Step } from '@/lib/flows/steps.types'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { IonBackButton, IonButtons, IonHeader, IonIcon, IonToolbar, useBackButton } from '@ionic/vue'
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

const { onDone: originalOnFlowDone, onCancel: originalOnFlowCancel, steps: stepsInFlow, flowName, initialStep, backButtonNavigates } = props.flow!
const activeIndex = ref(Math.max(stepsInFlow.findIndex(s => s.step === initialStep), 0))
const historyStack: Ref<Step[]> = ref(stepsInFlow.slice(0, activeIndex.value + 1))

const emptyState = inputSteps.reduce((state, stepName) => ({ ...state, [stepName]: undefined }), {} as State)
const state = ref({ ...emptyState, ...props.initialState })

const { setToast } = useToast()

let lock = Promise.resolve()
const hasRunSuccessfully = new Map<string, boolean>()

function makeFlowHandler(originalHandler?: FlowHookCb, role?: CloseRole): () => Promise<void> {
  if (!originalHandler)
    originalHandler = async () => {}

  const fn = async function (_err = defaultErrorHandler) {
    await lock

    if (hasRunSuccessfully.get(flowName)) {
      logger.warn(`${flowName} hook has already completed successfully and cannot be run again.`)
      return
    }

    let unlock
    lock = new Promise(resolve => unlock = resolve)

    try {
      let hasError = false
      const err = (message: string) => {
        _err(message)
        hasError = true
      }

      const { prevent } = await originalHandler(state.value, { err, setToast }) || { prevent: false }
      if (!hasError)
        hasRunSuccessfully.set(flowName, true)

      if (!hasError && !props.isClosing && !prevent)
        await useModal().closeModal({ role })
    }
    catch (error) {
      logger.error(`Unhandled error in ${flowName} ${role === 'cancel' ? 'onCancel' : 'onDone'} hook`, error)
      if (!hasRunSuccessfully.get(flowName))
        _err(i18n.t('Something went wrong'))
    }
    finally {
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
  await onFlowCancel()
  for (const stepName of Object.keys(state.value))
    delete state.value[stepName as keyof typeof state.value]
})

const scroller = ref<HTMLElement>()
const scrollerItems = ref<HTMLElement[]>([])
const { goToSlide, isScrolling } = useCarousel(scroller, { activeIndex })

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
const activeStepScrollerItem = computed(() => scrollerItems.value[activeIndex.value])

const allowBack = computed(() => activeIndex.value > 0 && activeStep.value?.goBackBy !== -1 && activeStep.value?.allowGoBack !== false)

// Runs before Ionic's overlay handler (100), which would dismiss the whole flow. Only acts while this flow is
// the topmost overlay, so an open select alert or a flow stacked on top still closes first.
if (backButtonNavigates) {
  const { unregister } = useBackButton(101, (processNextHandler) => {
    const modal = scroller.value?.closest('ion-modal')
    const overlays = Array.from(document.querySelectorAll('ion-modal, ion-alert, ion-action-sheet, ion-popover, ion-picker, ion-loading'))
      .filter(el => !el.classList.contains('overlay-hidden'))
    if (!allowBack.value || !modal || overlays.at(-1) !== modal)
      return processNextHandler()
    navigateTo({ goBackBy: activeStep.value.goBackBy || 1 })
  })
  onBeforeUnmount(unregister)
}

type Errors = Record<InputStepName, string>
const errors = ref<Errors>(Object.fromEntries(historyStack.value.filter(isInputStep).map(s => [s.step, ''])) as Errors)
watchEffect(() => errors.value = reactive(Object.fromEntries(historyStack.value.filter(isInputStep).map(s => [s.step, ''])) as Errors))

const stepCallbacks = computed(() => ({ err: defaultErrorHandler, finalizeFlow: onFlowDone, navigateTo, next: () => navigateTo(1), prev: () => navigateTo(-1) }))
const stepCompletionInProgress = ref<StepName | null>(null)
const navigationInProgress = ref(false)

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

  return stepVisitedIndex !== -1
    && targetVisitedIndex !== -1
    && targetVisitedIndex <= stepVisitedIndex
}

function defaultErrorHandler(errorMessage: string) {
  stepCompletionInProgress.value = null
  const activeStepName = activeStep.value.step
  if (isInputStep(activeStepName) && !props.isClosing) {
    errors.value[activeStepName] = errorMessage
    window.setTimeout(() => errors.value[activeStepName] = '', 10 * 1e3)
  }
  else { setToast({ message: errorMessage, type: 'error', duration: 10 * 1e3 }) }
  Haptics.notification({ type: NotificationType.Error })
    .catch(error => logger.error('Failed to trigger haptic feedback', error))
}

function shouldBlockNavigation(source: string, allowDuringStepCompletion = false) {
  if (!navigationInProgress.value && (allowDuringStepCompletion || !stepCompletionInProgress.value))
    return false

  logger.warn(`Ignoring ${source} while step completion or navigation is in progress`, {
    inProgress: stepCompletionInProgress.value,
    navigationInProgress: navigationInProgress.value,
    activeStep: activeStep.value.step,
  })
  return true
}

async function performNavigation(options: NavigateToOptions = 1, { allowDuringStepCompletion = false, source = 'navigateTo' }: { allowDuringStepCompletion?: boolean, source?: string } = {}) {
  if (shouldBlockNavigation(source, allowDuringStepCompletion))
    return

  navigationInProgress.value = true
  try {
    if (props.isClosing)
      return

    const currentIndex = stepsInFlow.findIndex(s => s.step === activeStep.value?.step)
    let newIndex: number = currentIndex + 1

    if (typeof options === 'number') {
      newIndex = options < 0 ? activeIndex.value + options : currentIndex + options
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

    const isGoBackBy = typeof options === 'number' ? options < 0 : 'goBackBy' in options
    const newActiveStep = isGoBackBy
      ? historyStack.value[newIndex] ?? stepsInFlow.at(newIndex)
      : stepsInFlow.at(newIndex)
    if (!newActiveStep)
      return

    const visitedIndex = getVisitedStepIndex(newActiveStep.step)
    const isGoingForward = visitedIndex === -1 && newIndex > currentIndex
    const targetIndex = visitedIndex === -1 ? activeIndex.value : visitedIndex
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
      if (activeIndex.value - targetIndex > 1) {
        const currentStep = historyStack.value[activeIndex.value]
        historyStack.value = [newActiveStep, currentStep]
        activeIndex.value = 1
        await nextTick()
        goToSlide(0)
        await until(isScrolling).toBe(true, { timeout: 1000 })
        await until(isScrolling).toBe(false, { timeout: 1000 })
        historyStack.value = [historyStack.value[0]]
        activeIndex.value = 0
      }
      else {
        if (visitedIndex === -1)
          historyStack.value.splice(targetIndex, 0, newActiveStep)
        await nextTick()
        goToSlide(targetIndex)
        await until(isScrolling).toBe(true, { timeout: 1000 })
        await until(isScrolling).toBe(false, { timeout: 1000 })
        historyStack.value = historyStack.value.slice(0, targetIndex + 1)
        activeIndex.value = targetIndex
      }
    }
  }
  finally {
    navigationInProgress.value = false
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
      navigateTo({ step: stepCountOrName })
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
  if (shouldBlockNavigation(`done from ${stepName}`))
    return

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
      errors.value[activeStepName] = ''
    }
    if (activeStep.value.beforeNext)
      await activeStep.value.beforeNext(state.value, stepDoneCallbacks)
    else
      await stepDoneCallbacks.next()
  }
  catch (error) {
    logger.error(`Unhandled error while completing step ${stepName}`, error)
    defaultErrorHandler(i18n.t('Something went wrong'))
  }
  finally {
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
useIntersectionObserver(
  activeStepScrollerItem,
  ([{ intersectionRatio }]) => {
    isActiveStepFullyVisible.value = intersectionRatio === 1
    if (isActiveStepFullyVisible.value && isInputStep(activeStep.value) && activeStep.value.autofocus !== false)
      focus()
    else if (isActiveStepFullyVisible.value)
      blur()

    logger.log({ intersectionRatio, step: activeStep.value.step, activeIndex: activeIndex.value, autofocus: activeStep.value.autofocus, isActiveStepFullyVisible: isActiveStepFullyVisible.value })
  },
  { threshold: 1, root: scroller },
)

function isStepVisible(stepName: StepName) {
  return ((activeIndex.value === 0 && stepName === stepsInFlow.at(0)?.step) || (stepName === activeStep.value?.step && isActiveStepFullyVisible.value))
    && !props.isClosing
    && !navigationInProgress.value
}

function focus() {
  const input = activeStepScrollerItem.value?.querySelector('input')
  logger.log('focus', input)
  input?.focus()
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
  if (
    (oldHeight === 'h-full' && newHeight === 'h-max')
    || (oldHeight === 'h-full' && newHeight === undefined)
    || (oldHeight === undefined && newHeight === 'h-max')
  ) {
    await until(isScrolling).toBe(true, { timeout: 1000 })
    await until(isScrolling).toBe(false, { timeout: 1000 })
  }

  const modal = scroller.value?.parentElement?.parentElement
  if (!modal)
    return logger.warn('Cannot find modal element to override height')

  // Ionic zeroes --ion-safe-area-top on sheet modals and sets --ion-modal-offset-top to the root safe area instead,
  // so read that first. Otherwise the sheet grows under the status bar and its header can't be tapped (APP-328).
  const fullHeight = 'calc(100% - (var(--ion-modal-offset-top, var(--ion-safe-area-top)) + 10px))'
  if (newHeight)
    modal.style.setProperty('--height', newHeight === 'h-full' ? fullHeight : 'auto')
  else
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

  <!-- Lives here (inside the modal, outside the slide carousel) so focus never has to hand off between two inputs
       and the numeric keyboard appears (APP-157). -->
  <input
    v-if="hasPinStep"
    ref="sharedPinInputEl" type="tel" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
    aria-label="PIN" class="caret-transparent sr-only"
  >

  <slot name="default" v-bind="{ activeStep }" v-on="activeStepHandlers" />
</template>

<style scoped>
:global(ion-modal.nimiq-modal-h-max) {
  --height: auto;
}
</style>
