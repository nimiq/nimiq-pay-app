<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useInterval, usePointer, usePointerSwipe } from '@vueuse/core'
import { IonButton } from '@ionic/vue'
import { useCarousel } from '@/composables/useCarousel'
import { stepEmits } from '@/lib/flows/steps.types'
import { i18n } from '@/i18n/i18n-setup'

import NimPointsExchangeSvg from '@/assets/graphics/nim-points-exchange.svg'
import PayWithPointsSvg from '@/assets/graphics/pay-with-points.svg'
import CompletedTasksSvg from '@/assets/graphics/completed-tasks.svg'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ isVisible: Boolean })
defineEmits(stepEmits)

const steps = ref([
  {
    title: i18n.t('Welcome to Cryptocity Points'),
    description: i18n.t('Points are loyalty rewards you can earn and pay with.'),
    svg: NimPointsExchangeSvg,
  },
  {
    title: i18n.t('Pay with Points'),
    description: i18n.t('Pay with Cryptocity Points instead of NIM wherever they\'re accepted.'),
    svg: PayWithPointsSvg,
    isSvgFullWidth: true,
  },
  {
    title: i18n.t('Get Points'),
    description: i18n.t('Get Cryptocity Points as cashback rewards or complete challenges to earn them.'),
    svg: CompletedTasksSvg,
  },
])

const interval = 100
const msBeforeNextSlide = 5 * 1e3
const { counter, reset, pause, resume, isActive } = useInterval(interval, { controls: true, immediate: false })
const slideCounter = computed(() => counter.value / (msBeforeNextSlide / interval))

const scroller = ref<HTMLElement>()
const activeIndex = ref(0)
const { nextSlide, prevSlide } = useCarousel(scroller, { activeIndex })
const { isSwiping, direction } = usePointerSwipe(scroller)
const { pressure } = usePointer({ target: scroller })

const isLast = computed(() => activeIndex.value === steps.value.length - 1)

function next() {
  if (isLast.value) {
    pause()
  }
  else {
    nextSlide()
    reset()
  }
}

function prev() {
  if (activeIndex.value !== 0) {
    prevSlide()
    reset()
  }
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

watch(isSwiping, (value) => {
  if (value) {
    if (direction.value === 'left')
      next()
    else if (direction.value === 'right')
      prev()
  }
})

watch(pressure, (value) => {
  if (!props.isVisible)
    return
  if (value)
    pause()
  else
    resume()
})
</script>

<template>
  <Transition name="slide-fade" :duration="150">
    <div v-if="isVisible" class="fixed z-10 flex justify-center w-screen px-16 translate-x-1/2 top-6 right-1/2 gap-x-2" style="max-width: var(--width);">
      <div v-for="(_, i) in steps.length" :key="i" class="overflow-hidden h-[6px] w-full max-w-16 flex rounded-xl bg-space-space-300">
        <div class="bg-keppel will-change-[width] transition-[width] w-0 ease-in" :class="{ '!w-full': activeIndex > i || (activeIndex === i && !isActive && !pressure) }" :style="activeIndex === i ? `width: ${slideCounter * 100}%` : ''" />
      </div>
    </div>
  </Transition>
  <ul ref="scroller" class="flex w-[calc(100%+64px)] h-full overflow-x-hidden bg-white hide-scrollbar snap-x snap-mandatory gap-x-2">
    <li v-for="{ title, description, svg, isSvgFullWidth }, i in steps" :key="title + i" class="flex flex-col items-center w-full h-full py-6 shrink-0 snap-always [&>*]:px-8">
      <h2 class="flex items-center justify-center max-w-sm text-2xl font-bold text-center text-balance gap-x-3">
        {{ title }}
      </h2>
      <p class="mt-4 text-center text-pretty opacity-60">
        {{ description }}
      </p>
      <img v-if="svg" class="w-2/3 m-auto" :src="svg" :class="{ '!w-full !pl-0': isSvgFullWidth }">
    </li>
  </ul>
  <div class="sticky z-10 flex items-end pb-6">
    <!-- w-screen wont work, it will cause the setup flow to scroll into view too fast -->
    <IonButton class="w-[calc(100vw-64px)] text-base font-bold uppercase" style="max-width: var(--width);" @click.prevent="() => $emit('done', false)">
      {{ $t('Got it') }}
    </IonButton>
  </div>
</template>
