<script setup lang="ts">
import { type PropType, computed, nextTick, onMounted, reactive, ref, watchEffect } from 'vue'
import { useIntersectionObserver, useWindowSize } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonBackButton, IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { useRoute, useRouter } from 'vue-router'
import { isInfoStep, isInputStep } from '@/lib/flows/steps.types'
import type { Flow, InputStepName, OnDoneStepValue, StepName } from '@/lib/flows/steps.types'
import { useCarousel } from '@/composables/useCarousel'

const props = defineProps({
  flow: {
    type: Object as PropType<Flow>,
    required: true,
  },
})

const { path } = useRoute()
const { replace } = useRouter()
const { onDone: onFlowDone, onCancel: onFlowCancel, state, steps: stepsInFlow, canGoBack = true, activeStepIndex: activeIndex } = props.flow
const steps = ref(stepsInFlow)

const scroller = ref<HTMLElement>()
const { nextSlide, prevSlide } = useCarousel(scroller, useWindowSize().width, { activeIndex })
const isLast = computed(() => activeIndex.value === steps.value.length - 1)

const activeStep = computed(() => stepsInFlow[activeIndex.value])
const isActiveStepInfo = computed(() => isInfoStep(activeStep.value))
const isActiveStepInput = computed(() => isInputStep(activeStep.value))

const allowBack = computed(() => activeIndex.value > 0 && canGoBack)

type Errors = Record<InputStepName, string>
const errors = ref<Errors>(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors)
watchEffect(() => errors.value = reactive(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors))
const error = (step: StepName) => isActiveStepInput.value && isInputStep(activeStep.value) ? errors.value![step as InputStepName] : undefined

async function goToNext() {
  if (isLast.value) {
    onFlowDone!(state, { goTo: replace, path })
    return
  }
  await steps.value.at(activeIndex.value + 1)?.beforeDisplay?.(state)
  nextSlide()
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
      await activeStep.value.beforeNext(state, { next: goToNext, err, prev: prevSlide, finalizeFlow: () => onFlowDone!(state, { goTo: replace, path }) })
    else
      goToNext()
  }
}

function skip() {
  const { stepsToSkip = 1 } = activeStep.value
  if (!stepsToSkip)
    return
  steps.value = steps.value.filter((_, i) => i <= activeIndex.value || i >= activeIndex.value + stepsToSkip)
  nextTick().then(goToNext)
}

function onCancel() {
  onFlowCancel!(state, { path, goTo: replace })
}

const scrollerItems = ref<HTMLElement[]>([])

// We track the intersection of each step with a number from 0 to 1.
// The intersection list contains only the steps that have been already displayed.
const intersections = ref<number[]>([])
useIntersectionObserver(scrollerItems, ([{ intersectionRatio, target }]) => {
  const index = scrollerItems.value.indexOf(target as HTMLElement)
  intersections.value[index] = intersectionRatio
  if (intersectionRatio === 1 && index === activeIndex.value && isInputStep(activeStep.value) && activeStep.value.autofocus !== false)
    focus()
}, { threshold: [0, 0.5, 1] })

// Since the intersection observer only tracks the steps that have been already displayed,
// we need to fill the rest of the array with 0s.
const visibility = computed(() => intersections.value.concat(Array(steps.value.length - intersections.value.length).fill(0)))

function focus() {
  const input = scroller.value?.querySelector(`li:nth-child(${activeIndex.value + 1}) input`) as HTMLInputElement
  input?.focus()
}
</script>

<template>
  <IonHeader class="pt-1 ion-no-border">
    <IonToolbar>
      <IonButtons slot="start">
        <IonBackButton v-if="allowBack" default-href="/" @click.prevent="prevSlide" />
      </IonButtons>
      <IonButtons slot="end">
        <IonButton v-if="activeStep.canDismiss !== false" @click.stop="onCancel">
          <IonIcon :icon="close" size="large" class="text-white bg-[#DADADA] rounded-full w-6 h-6 p-[2px]" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>

  <ul ref="scroller" class="flex h-full overflow-x-hidden hide-scrollbar snap-x snap-mandatory">
    <li v-for="({ main, step, title, titleIcon, description, stepsToSkip }) in steps" ref="scrollerItems" :key="step" class="relative flex flex-col items-center w-full max-w-[100vw] h-full px-8 pt-4 shrink-0 snap-center snap-always">
      <h2 v-if="title" class="z-10 flex items-center justify-center mt-2 text-2xl font-bold text-center text-balance gap-x-3">
        <component :is="titleIcon" v-if="titleIcon" class="!w-10" />
        {{ title }}
      </h2>
      <p v-if="description" class="z-10 mt-4 text-center text-pretty opacity-60">
        {{ description }}
      </p>
      <component :is="main" v-bind="{ errorMsg: error(step), canSkip: !!stepsToSkip, state, isVisible: step === activeStep.step, visibility: visibility[activeIndex] }" :state="state" :error-msg="error(step)" v-on="{ focus, done: onStepDone, select: onStepDone, skip }" />
    </li>
  </ul>
</template>
