<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

defineProps({
  showChevron: {
    type: Boolean,
    default: false,
  },
  center: {
    type: Boolean,
    default: false,
  },
  chevronColor: {
    type: String,
  },
})

const ChevronRight = defineAsyncComponent(() => import('@/components/icons/chevron-right.vue'))
</script>

<template>
  <button class="flex items-center w-full my-2 text-base font-bold text-sky gap-x-2" :class="center && 'justify-center'">
    <span><slot /></span>
    <ChevronRight v-if="showChevron" class="w-[7px] text-space/50" :style="{ color: chevronColor }" />
  </button>
</template>
