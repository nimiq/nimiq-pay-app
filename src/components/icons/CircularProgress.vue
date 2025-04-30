<script setup lang="ts">
import CheckmarkIcon from '@/components/icons/check.vue'
import { computed, ref } from 'vue'

const props = defineProps({
  value: {
    type: Number,
    default: 0,
  },
  max: {
    type: Number,
    default: 100,
  },
  gap: {
    type: Number,
    default: 40,
  },
})

const circleRef = ref<SVGSVGElement | null>(null)
const backgroundRef = ref<SVGCircleElement | null>(null)
const progressRef = ref<SVGCircleElement | null>(null)

const radius = 88
const circumference = 2 * Math.PI * radius

const isCompleted = computed(() => props.value >= props.max)

const gapPortion = (props.gap / 360) * circumference
const availableCircle = circumference - gapPortion
const progressOffset = computed(() => availableCircle * (1 - props.value / props.max))
const progressDashOffset = computed(() => {
  if (isCompleted.value)
    return 0
  // Show a bit of the circle when the value is 0
  return progressOffset.value + gapPortion - (props.value === 0 ? 1 : 0)
})
const backgroundDashOffset = computed(() => availableCircle - (progressOffset.value - gapPortion))
</script>

<template>
  <div class="relative">
    <svg ref="circleRef" :class="value === 0 ? 'animate-spin' : '-rotate-90'" class="w-full h-full origin-center transition-transform" viewBox="0 0 200 200">
      <!-- Fixed gap with stroke-dasharray and stroke-dashoffset -->
      <!-- Both circles have the same radius of 88 (200/2 - stroke-width/2) -->
      <!-- Circumference is 2 * PI * radius ≈ 552.9 -->
      <circle ref="backgroundRef" class="progress-background" cx="100" cy="100" r="88" :style="{ 'stroke-dashoffset': backgroundDashOffset }" />
      <circle ref="progressRef" class="progress-value" cx="100" cy="100" r="88" :style="{ 'stroke-dashoffset': progressDashOffset }" :class="isCompleted ? 'stroke-algae' : 'stroke-sky'" />
    </svg>
    <Transition
      enter-active-class="transition-all duration-300 delay-300 ease-[cubic-bezier(0.5,0,0.15,1.4)]"
      enter-from-class="opacity-0 scale-90"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <CheckmarkIcon v-if="isCompleted" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-algae w-1/2 h-1/2" />
    </Transition>
  </div>
</template>

<style scoped>
circle {
  fill: none;
  stroke-linecap: round;
}

.progress-background {
  stroke: #1F2348;
  stroke-width: 12px;
  opacity: 0.2;
  /* The total circumference is 2 * PI * radius */
  /* For radius 88, circumference is ~552.9 */
  stroke-dasharray: 552.9;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.3s ease-in-out;
  transform: rotate(160deg) scale(-1, 1);
  transform-origin: center;
}

.progress-value {
  stroke-width: 16px;
  stroke-dasharray: 552.9;
  stroke-dashoffset: 552.9;
  transition: stroke-dashoffset 0.3s ease-in-out;
}
</style>
