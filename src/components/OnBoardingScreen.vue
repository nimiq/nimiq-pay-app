<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useInterval, usePointer, usePointerSwipe, useWindowSize } from '@vueuse/core'
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
const interval = 100
const msBeforeNextSlide = 5 * 1e3
const { counter, reset, pause, resume } = useInterval(interval, { controls: true, immediate: false })
const slideCounter = computed(() => counter.value / (msBeforeNextSlide / interval))
const { pressure } = usePointer()

const scroller = ref<HTMLElement>()
const { isSwiping, direction } = usePointerSwipe(scroller)
const { nextSlide, prevSlide, activeIndex, goToSlide } = useCarousel(scroller, useWindowSize().width)
const isLast = computed(() => activeIndex.value === steps.value.length - 1)

function next() {
  if (isLast.value)
    goToSlide(0)
  else
    nextSlide()

  reset()
}

function prev() {
  if (activeIndex.value === 0)
    goToSlide(steps.value.length - 1)
  else
    prevSlide()

  reset()
}

watch(slideCounter, (value) => {
  if (counter.value === 0)
    return
  if (value % 1 === 0)
    next()
})

watch(() => props.isVisible, (value) => {
  if (value) {
    reset()
    resume()
  }
}, { immediate: true })

watch(activeIndex, (value) => {
  if (value === 0) {
    setTimeout(() => {
      reset()
      resume()
    }, 100)
  }
})

watch(isSwiping, (value) => {
  if (value) {
    if (direction.value === 'left')
      next()
    else if (direction.value === 'right')
      prev()
  }
})

watch(pressure, (value) => {
  if(!props.isVisible) return
  if (value)
    pause()
  else
    resume()
})

onMounted(() => {
  setTimeout(() => {
    isAnimating.value = true
  }, 100)
})
</script>

<template>
  <div v-if="isVisible" class="fixed z-10 flex justify-center w-screen px-16 translate-x-1/2 top-6 right-1/2 gap-x-2">
    <div v-for="(_, i) in steps.length" :key="i" class="overflow-hidden h-[6px] w-full max-w-16 flex rounded-xl bg-space-space-300">
      <div class="bg-keppel will-change-[width] transition-[width] w-0 ease-in" :class="{ '!w-full': activeIndex > i }" :style="activeIndex === i ? `width: ${slideCounter * 100}%` : ''" />
    </div>
  </div>
  <ul ref="scroller" class="flex w-screen h-full overflow-x-hidden bg-white hide-scrollbar snap-x snap-mandatory gap-x-2">
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
