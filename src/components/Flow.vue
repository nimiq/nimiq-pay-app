<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watchEffect } from 'vue'
import type { PropType } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonBackButton, IonIcon } from '@ionic/vue'
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
const { onDone: onFlowDone, onCancel: onFlowCancel, state, steps: stepsInFlow, canGoBack = true } = props.flow
const steps = ref(stepsInFlow)

const scroller = ref<HTMLElement>()
const { nextSlide, activeIndex, prevSlide } = useCarousel(scroller, useWindowSize().width)
const isLast = computed(() => activeIndex.value === steps.value.length - 1)

const activeStep = computed(() => stepsInFlow[activeIndex.value])
const isActiveStepInfo = computed(() => isInfoStep(activeStep.value))
const isActiveStepInput = computed(() => isInputStep(activeStep.value))
const step = computed(() => stepsInFlow[activeIndex.value])

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

const shouldAutofocus = computed(() => activeStep.value.autofocus || activeStep.value.autofocus === undefined)

onMounted(async () => shouldAutofocus.value && focus())

async function onStepDone(value: OnDoneStepValue) {
  if (isActiveStepInfo.value) { goToNext() }
  else if (isActiveStepInput.value) {
    // @ts-expect-error If the emit value is well typed, this should work
    state[step.value.step as InputStepName] = value
    const err = (errorMsg: string) => errors.value![step.value.step as InputStepName] = errorMsg
    if (step.value.beforeNext)
      await step.value.beforeNext?.(state, { next: goToNext, err, prev: prevSlide })
    else
      goToNext()

    const nextStep = steps.value.at(activeIndex.value + 1)
    if (nextStep && isInputStep(nextStep) && nextStep.autofocus)
      focus(400)
  }
}

// Autofocus the first input found in step.main if there is any
async function focus(timeout = 200) {
  setTimeout(() => {
    const input = scroller.value?.querySelector(`li:nth-child(${activeIndex.value + 1}) input`) as HTMLInputElement | null
    input?.focus()
  }, timeout)
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
</script>

<template>
  <div class="fixed flex h-max inset-4 left-6">
    <IonBackButton v-if="allowBack" class="flex" @click.prevent="prevSlide" />
    <button class="ml-auto" @click.stop="onCancel">
      <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-6 h-6" />
    </button>
  </div>

  <ul ref="scroller" class="flex h-full overflow-x-hidden bg-white hide-scrollbar snap-x snap-mandatory">
    <li v-for="({ main, step, title, description, stepsToSkip }) in steps" :key="step" class="flex flex-col w-screen h-full px-8 pt-16 shrink-0 snap-center snap-always">
      <h2 v-if="title" class="max-w-sm font-bold text-2xl text-center [text-wrap:balance] flex gap-x-3 items-center justify-center" v-html="title" />
      <p v-if="description" class="[text-wrap:pretty] text-center opacity-60 mt-4" v-html="description" />
      <component :is="main" v-bind="{ errorMsg: error(step), canSkip: !!stepsToSkip, state, isVisible: step === activeStep.step }" :state="state" :error-msg="error(step)" v-on="{ focus, done: onStepDone, select: onStepDone, skip }" />
    </li>
  </ul>
</template>
