<script setup lang="ts">
import type { MiniAppType } from '@/stores/mini-apps'
import { computed } from 'vue'

export type TypeFilterValue = 'all' | MiniAppType

const model = defineModel<TypeFilterValue>({ required: true })

// "EVM" matches the upstream awesome-list grouping (the `evm` array key), so the
// label stays correct if more EVM chains are added later.
const options: { label: string, value: TypeFilterValue }[] = [
  { label: 'All', value: 'all' },
  { label: 'Nimiq', value: 'nimiq' },
  { label: 'EVM', value: 'evm' },
]

const activeIndex = computed(() => {
  const i = options.findIndex(o => o.value === model.value)
  return i >= 0 ? i : 0
})

const sliderBackground = computed(() => {
  switch (model.value) {
    case 'nimiq': return 'var(--radial-gradient-gold)'
    case 'evm': return 'var(--radial-gradient-blue-evm)'
    default: return 'var(--radial-gradient-green)'
  }
})
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Filter mini apps by type"
    class="w-full p-1 bg-space/10 rounded-full"
  >
    <ul class="relative grid grid-cols-3 items-center">
      <span
        class="absolute h-full w-1/3 rounded-full left-0 top-0 transition-all duration-[350ms] ease-out motion-reduce:transition-none"
        :style="{ transform: `translateX(${activeIndex * 100}%)`, background: sliderBackground }"
        aria-hidden="true"
      />
      <li v-for="option in options" :key="option.value" class="z-10">
        <button
          type="button"
          role="radio"
          :aria-checked="model === option.value"
          class="uppercase font-bold tracking-wider text-xs py-2 px-2 rounded-full w-full transition-colors duration-300"
          :class="model === option.value ? 'text-white' : 'text-space/50'"
          @click="model = option.value"
        >
          {{ option.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
