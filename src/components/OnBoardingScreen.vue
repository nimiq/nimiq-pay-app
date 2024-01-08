<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useInterval, useWindowSize } from '@vueuse/core'
import { IonButton } from '@ionic/vue'
import { useCarousel } from '@/composables/useCarousel'
import { stepEmits } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'

import NimPointsExchangeSvg from '@/assets/graphics/nim-points-exchange.svg'
import PayWithPointsSvg from '@/assets/graphics/pay-with-points.svg'
import CompletedTasksSvg from '@/assets/graphics/completed-tasks.svg'

const props = defineProps({
  isVisible: Boolean,
})

defineEmits(stepEmits)

const steps = ref([
  {
    title: i18n.t('Welcome to Crypto City Points'),
    description: i18n.t('Points are a loyalty rewards you can earn and pay with.'),
    svg: NimPointsExchangeSvg,
    button: i18n.t('Go To Points'),
  },
  {
    title: i18n.t('Pay with Points'),
    description: i18n.t('Pay with Points instead of NIM wherever they\'re accepted.'),
    svg: PayWithPointsSvg,
    isSvgFullWidth: true,
    button: i18n.t('Got It'),
  },
  {
    title: i18n.t('Get Points'),
    description: i18n.t('Get Points as cashback rewards or complete challenges to earn them.'),
    svg: CompletedTasksSvg,
    button: i18n.t('Got It'),
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
  <ul ref="scroller" class="flex w-screen h-full overflow-x-hidden bg-white hide-scrollbar snap-x snap-mandatory gap-x-2" @pointerdown="pause" @pointerup="resume">
    <li v-for="{ title, description, svg, isSvgFullWidth, button }, i in steps" :key="i" class="flex flex-col items-center w-full h-full py-6 shrink-0 snap-center snap-always [&>*]:px-8">
      <h2 class="flex items-center justify-center max-w-sm text-2xl font-bold text-center text-balance gap-x-3">
        {{ title }}
      </h2>
      <p class="mt-4 text-center text-pretty opacity-60">
        {{ description }}
      </p>
      <img v-if="svg" class="w-2/3 m-auto" :src="svg" :class="{ '!w-full !pl-0': isSvgFullWidth }">
      <IonButton class="w-full mt-auto text-base font-bold uppercase" @click.prevent="() => $emit('done', false)">
        {{ button }}
      </IonButton>
    </li>
  </ul>
</template>
