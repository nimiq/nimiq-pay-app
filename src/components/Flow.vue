<script setup lang="ts">
import { type PropType, computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { close } from 'ionicons/icons'
import { IonIcon } from '@ionic/vue'
import type { Flow, InputStepName } from '@/types/steps'
import { useCarousel } from '@/composables/useCarousel'
import { cancelFlow } from '@/composables/utils/steps'

const props = defineProps({
  flow: {
    type: Object as PropType<Flow>,
    required: true,
  },
})

const { name, onDone: onFlowDone, state, steps } = props.flow
const error = ref('')

const scroller = ref<HTMLElement>()

const { nextSlide, activeIndex, isLast } = useCarousel(scroller, useWindowSize().width)

const goToNext = () => isLast.value ? onFlowDone(state) : nextSlide()
const step = computed(() => Object.values(steps)[activeIndex.value])

function onStepDone(value: string) {
  error.value = ''
  state[step.value.step as InputStepName] = value
  step.value.beforeNext?.(state, { next: goToNext, err: (message: string) => error.value = message })
}
</script>

<template>
  <button class="fixed top-4 right-4" @click.stop="cancelFlow">
    <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-6 h-6" />
  </button>
  <ul ref="scroller" class="flex overflow-x-auto hide-scrollbar snap-x snap-mandatory">
    <li v-for="step in steps" :key="step.step" class="shrink-0 snap-center snap-always w-screen pt-16 flex flex-col gap-y-4">
      <h2 class="max-w-sm font-bold text-2xl text-center [text-wrap:balance]">
        {{ step.title }}
      </h2>
      <p class="[text-wrap:pretty] text-center opacity-60" v-html="step.description" />
      <component :is="step.main" class="mx-auto" @done="onStepDone" />
      <p v-if="error" class="text-tomato">
        {{ error }}
      </p>
    </li>
  </ul>
</template>
