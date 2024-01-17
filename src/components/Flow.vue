<script setup lang="ts">
import { type PropType, type Ref, computed, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { until, useIntersectionObserver, useScroll } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonBackButton, IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { useRouter } from 'vue-router'
import { isInfoStep, isInputStep } from '@/lib/flows/steps.types'
import type { Flow, InputStepName, OnDoneStepValue, Step, StepName } from '@/lib/flows/steps.types'
import { useCarousel } from '@/composables/useCarousel'

const props = defineProps({
  flow: {
    type: Object as PropType<Flow>,
    required: true,
  },
})

const { replace } = useRouter()
const { onDone: onFlowDone, onCancel: onFlowCancel, state, steps: stepsInFlow, canGoBack = true, activeStepIndex: activeIndex } = props.flow
const steps: Ref<Step[]> = ref([stepsInFlow[0]])

const scroller = ref<HTMLElement>()
const scrollerItems = ref<HTMLElement[]>([])
const slideWidth = computed(() => scrollerItems.value.at(activeIndex.value)?.clientWidth)
const { nextSlide, prevSlide, isScrolling } = useCarousel(scroller, slideWidth, { activeIndex })

const activeStep = computed(() => steps.value.slice(-1)[0])
const isActiveStepInfo = computed(() => isInfoStep(activeStep.value))
const isActiveStepInput = computed(() => isInputStep(activeStep.value))

const allowBack = computed(() => activeIndex.value > 0 && canGoBack)

type Errors = Record<InputStepName, string>
const errors = ref<Errors>(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors)
watchEffect(() => errors.value = reactive(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors))
const error = (step: StepName) => isActiveStepInput.value && isInputStep(activeStep.value) ? errors.value![step as InputStepName] : undefined

interface GoToNextOptions { err?: (errorMsg: string) => void; stepsToSkip?: number }
async function goToNext(options?: GoToNextOptions) {
  const { err = () => {}, stepsToSkip = 1 } = options || {}
  const currentIndex = stepsInFlow.findIndex(s => s.step === activeStep.value.step)
  const nextStep = stepsInFlow[currentIndex + stepsToSkip]
  if (!nextStep) {
    onFlowDone!(state, { goTo: replace, err })
    return
  }
  steps.value.push(nextStep)
  await steps.value.at(activeIndex.value + 1)?.beforeDisplay?.(state)
  nextSlide()
}

async function goToPrevious() {
  prevSlide()
  // Wait for the scroll to start and finish
  await until(isScrolling).toBe(true, { timeout: 3000 })
  await until(isScrolling).toBe(false, { timeout: 3000 })
  steps.value.pop()
}

// TODO revise this
const shouldAutofocus = computed(() => activeStep.value.autofocus || activeStep.value.autofocus === undefined)

onMounted(async () => shouldAutofocus.value && focus())

async function onStepDone(value: OnDoneStepValue) {
  if (isActiveStepInfo.value) {
    goToNext()
  }
  else if (isActiveStepInput.value) {
    // @ts-expect-error If the emit value is well typed, this should work
    state[activeStep.value.step as InputStepName] = value
    errors.value![activeStep.value.step as InputStepName] = '' // Clear error message
    const err = (errorMsg: string) => errors.value![activeStep.value.step as InputStepName] = errorMsg
    if (activeStep.value.beforeNext)
      await activeStep.value.beforeNext(state, { next: goToNext, err, prev: goToPrevious, finalizeFlow: () => onFlowDone!(state, { goTo: replace, err }), skip })
    else
      goToNext({ err })
  }
}

function skip() {
  const { stepsToSkip = 1 } = activeStep.value
  if (!stepsToSkip)
    return
  // Assuming there's no option to skip if you are in the last step
  goToNext({ stepsToSkip })
}

function onCancel() {
  onFlowCancel!(state, { goTo: replace })
}

// We track the intersection of each step with a number from 0 to 1.
useIntersectionObserver(scrollerItems, ([{ intersectionRatio, target }]) => {
  const index = scrollerItems.value.indexOf(target as HTMLElement)
  // TODO: remove when focus is working in every device (mobile + tablet)
  console.log({ index, intersectionRatio, activeIndex: activeIndex.value, target, autofocus: activeStep.value.autofocus })
  if (intersectionRatio === 1 && index === activeIndex.value && isInputStep(activeStep.value) && activeStep.value.autofocus !== false)
    focus()
  // If it's not input step or autofocus is false, blur the input previously focused
  else if (intersectionRatio === 1 && index === activeIndex.value)
    blur()
}, { threshold: [0, 0.5, 1] })

function focus() {
  const input = scroller.value?.querySelector(`li:nth-child(${activeIndex.value + 1}) input`) as HTMLInputElement
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
  <IonHeader class="pt-1 ion-no-border">
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
    <li v-for="({ main, step, title, titleIcon, description, stepsToSkip }) in steps" ref="scrollerItems" :key="step" class="relative flex flex-col items-center w-full max-w-[100vw] h-full px-8 pt-4 shrink-0 snap-center snap-always">
      <h2 v-if="title" class="z-10 flex items-center justify-center mt-2 text-2xl font-bold text-center text-balance gap-x-3">
        <component :is="titleIcon" v-if="titleIcon" class="!w-10" />
        {{ title }}
      </h2>
      <p v-if="description" class="z-10 mt-4 text-center text-pretty opacity-60">
        {{ description }}
      </p>
      <component :is="main" v-bind="{ errorMsg: error(step), canSkip: !!stepsToSkip, state, isVisible: step === activeStep.step, isScrolling }" :state="state" :error-msg="error(step)" v-on="{ focus, done: onStepDone, select: onStepDone, skip }" />
    </li>
  </ul>
</template>
