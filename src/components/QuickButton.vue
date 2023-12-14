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
})

const ChevronRight = defineAsyncComponent(() => import('@/components/icons/chevron-right.vue'))
</script>

<template>
  <button class="flex items-center w-full mt-2 text-base font-bold mb-14 text-sky gap-x-2" :class="center && 'justify-center'">
    <span><slot /></span>
    <ChevronRight v-if="showChevron" class="w-[7px] text-sky/50" />
  </button>
</template>
