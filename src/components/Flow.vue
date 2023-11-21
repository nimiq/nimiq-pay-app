<script setup lang="ts">
import { type PropType, computed, onMounted, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonButton, IonIcon } from '@ionic/vue'
import { useRoute, useRouter } from 'vue-router'
import type { Flow, InputStepName } from '@/types/steps'
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
const { onDone: onFlowDone, state, steps: rawSteps } = props.flow
const steps = computed(() => Object.values(rawSteps).map(s => s()))

const error = ref('')

const scroller = ref<HTMLElement>()

const { nextSlide, activeIndex, isLast, removeSlide } = useCarousel(scroller, useWindowSize().width)

const goToNext = () => isLast.value ? onFlowDone(state) : nextSlide()
const step = computed(() => steps.value[activeIndex.value])

onMounted(autofocus)

function onStepDone(value: string) {
  error.value = ''
  state[step.value.step as InputStepName] = value
  step.value.beforeNext?.(state, { next: goToNext, err: (message: string) => error.value = message })
  autofocus()
}

// Autofocus the first input found in step.main if there is any
async function autofocus() {
  setTimeout(() => {
    const input = scroller.value?.querySelector(`li:nth-child(${activeIndex.value + 1}) input`) as HTMLInputElement | null
    input?.focus()
  }, 200)
}

function onSkip(stepsToSkip: number) {
  const numberOfSteps = Object.keys(steps).length
  // Loop from the current active index + 1 for "stepsToSkip" times or until we reach the last step
  for (let i = activeIndex.value + 1; i < numberOfSteps && i < activeIndex.value + stepsToSkip + 1; i++)
    removeSlide(i)
  nextSlide()
}
</script>

<template>
  <button class="fixed top-4 right-4" @click.stop="cancelFlow(() => step.onCancel?.(state, { path, replace }))">
    <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-6 h-6" />
  </button>
  <ul ref="scroller" class="flex overflow-x-hidden hide-scrollbar snap-x snap-mandatory h-full">
    <li v-for="{ main, step, title, buttonLabel, description, skip, skipLabel } in steps" :key="step" class="flex flex-col w-screen pt-16 shrink-0 snap-center snap-always gap-y-4 px-8 h-full">
      <h2 class="max-w-sm font-bold text-2xl text-center [text-wrap:balance]">
        {{ title }}
      </h2>
      <p class="[text-wrap:pretty] text-center opacity-60" v-html="description" />
      <component :is="main" class="mx-auto" @done="onStepDone" />
      <p v-if="error" class="text-tomato text-center">
        {{ error }}
      </p>
      <div v-if="buttonLabel || skip" class="flex flex-col justify-center mt-auto">
        <IonButton v-if="buttonLabel" size="small" class="text-base font-bold">
          {{ buttonLabel }}
        </IonButton>
        <IonButton v-if="skip" fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="onSkip(skip)">
          {{ skipLabel }}
        </IonButton>
      </div>
    </li>
  </ul>
</template>
