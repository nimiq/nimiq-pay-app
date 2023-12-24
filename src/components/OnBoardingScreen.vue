<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useInterval, useWindowSize } from '@vueuse/core'
import { IonButton } from '@ionic/vue'
import { useCarousel } from '@/composables/useCarousel'
import {stepEmits} from '@/lib/flows/steps.types'

import NimPointsExchangeSvg from '@/assets/graphics/nim-points-exchange.svg'
import PayWithPointsSvg from '@/assets/graphics/pay-with-points.svg'
import CompletedTasksSvg from '@/assets/graphics/completed-tasks.svg'

const props = defineProps({
  isVisible: Boolean,
})

defineEmits(stepEmits)

const steps = ref([
  {
    title: 'Welcome to Crypto City Points',
    description: 'Points are a loyalty rewards you can earn and pay with.',
    svg: NimPointsExchangeSvg,
    button: 'Go To Points',
  },
  {
    title: 'Pay with Points',
    description: 'Pay with Points instead of NIM wherever they\'re accepted.',
    svg: PayWithPointsSvg,
    isSvgFullWidth: true,
    button: 'Got It',
  },
  {
    title: 'Get Points',
    description: 'Get Points as cashback rewards or complete challenges to earn them.',
    svg: CompletedTasksSvg,
    button: 'Got It',
  },
])

const isAnimating = ref(false)
const interval = 5 * 1e3
const msBeforeNextSlide = ref(interval)
const { counter, reset, pause, resume } = useInterval(interval, { controls: true, immediate: false })

const scroller = ref<HTMLElement>()
const { nextSlide, activeIndex, goToSlide } = useCarousel(scroller, useWindowSize().width)
const isLast = computed(() => activeIndex.value === steps.value.length - 1)

function next() {
  if (isLast.value) {
    msBeforeNextSlide.value = 0
    // Give time for the bars to reset to 0 without animation
    setTimeout(() => {
      goToSlide(0)
      reset()
      msBeforeNextSlide.value = interval
    }, 100)
  }
  else { nextSlide() }
}

watch(counter, (value) => {
  if (value !== 0)
    next()
})

watch(() => props.isVisible, (value) => {
  if (value) {
    reset()
    resume()
  }
}, { immediate: true })

onMounted(() => {
  setTimeout(() => {
    isAnimating.value = true
  }, 100)
})
</script>

<template>
  <div v-if="isVisible" class="absolute flex justify-center translate-x-1/2 top-4 right-1/2 gap-x-2">
    <div v-for="(_, i) in steps.length" :key="i" class="overflow-hidden h-[6px] w-16 flex rounded-xl bg-space-space-300">
      <div :style="`transition-duration: ${msBeforeNextSlide}ms`" class="bg-keppel will-change-[width] transition-[width] ease-in" :class="activeIndex >= i && counter < steps.length && isAnimating ? 'w-full' : 'w-0'" />
    </div>
  </div>
  <ul ref="scroller" class="flex h-full -mx-8 overflow-x-hidden bg-white hide-scrollbar snap-x snap-mandatory gap-x-2" @pointerdown="pause" @pointerup="resume">
    <li v-for="{ title, description, svg, isSvgFullWidth, button }, i in steps" :key="i" class="flex flex-col items-center w-full h-full py-6 shrink-0 snap-center snap-always [&>*]:px-8">
      <h2 class="max-w-sm font-bold text-2xl text-center text-balance flex gap-x-3 items-center justify-center" v-html="title" />
      <p class="text-pretty text-center opacity-60 mt-4" v-html="description" />
      <img v-if="svg" class="w-2/3 m-auto" :src="svg" :class="{ '!w-full !pl-0': isSvgFullWidth }">
      <IonButton class="w-full mt-auto text-base font-bold uppercase" @click.prevent="() => $emit('done')">
        {{ button }}
      </IonButton>
    </li>
  </ul>
</template>
