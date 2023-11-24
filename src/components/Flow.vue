<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watchEffect } from 'vue'
import type { PropType } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonIcon } from '@ionic/vue'
import { useRoute, useRouter } from 'vue-router'
import { isInfoStep, isInputStep } from '@/types/steps'
import type { Flow, InputStepName, StepName } from '@/types/steps'
import { useCarousel } from '@/composables/useCarousel'
import { cancelFlow } from '@/composables/utils/steps'

const props = defineProps({
  flow: {
    type: Object as PropType<Flow>,
    required: true,
  },
})

const { path } = useRoute()
const { replace } = useRouter()
const { onDone: onFlowDone, state, steps: stepsInFlow } = props.flow
const steps = ref(stepsInFlow)

const scroller = ref<HTMLElement>()
const { nextSlide, activeIndex } = useCarousel(scroller, useWindowSize().width)
const isLast = computed(() => activeIndex.value === steps.value.length - 1)

const activeStep = computed(() => stepsInFlow[activeIndex.value])
const isActiveStepInfo = computed(() => isInfoStep(activeStep.value))
const isActiveStepInput = computed(() => isInputStep(activeStep.value))
const step = computed(() => stepsInFlow[activeIndex.value])

type Errors = Record<InputStepName, string>
let errors: Errors = reactive(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors)
watchEffect(() => errors = reactive(Object.fromEntries(steps.value.filter(isInputStep).map(s => [s.step, ''])) as Errors))
const error = (step: StepName) => isActiveStepInput.value ? errors![step as InputStepName] : undefined

function goToNext() {
  isLast.value ? onFlowDone(state, { goTo: replace }) : nextSlide()
}

onMounted(autofocus)

async function onStepDone(value: any /* The types are a bit hard for this one */) {
  if (isActiveStepInfo.value) { goToNext() }
  else if (isActiveStepInput.value) {
    state[step.value.step as InputStepName] = value
    const err = (errorMsg: string) => errors![step.value.step as InputStepName] = errorMsg
    await step.value.beforeNext?.(state, { next: goToNext, err })
    autofocus(400)
  }
}

// Autofocus the first input found in step.main if there is any
async function autofocus(timeout = 200) {
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
</script>

<template>
  <button class="fixed top-4 right-4" @click.stop="cancelFlow(() => step.onCancel?.(state, { path, replace }))">
    <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-6 h-6 z-10" />
  </button>
  <ul ref="scroller" class="flex h-full overflow-x-hidden hide-scrollbar snap-x snap-mandatory">
    <li v-for="{ main, step, title, description, stepsToSkip } in steps" :key="step" class="flex flex-col w-screen h-full px-8 pt-16 shrink-0 snap-center snap-always gap-y-4">
      <h2 class="max-w-sm font-bold text-2xl text-center [text-wrap:balance] z-10" v-html="title" />
      <p class="[text-wrap:pretty] text-center opacity-60 z-10" v-html="description" />
      <div class="flex-1 w-full">
        <component :is="main" v-bind="{ errorMsg: error(step), canSkip: !!stepsToSkip, state }" :error-msg="error(step)" v-on="{ autofocus, done: onStepDone, skip }" />
      </div>
    </li>
  </ul>
</template>
