<script setup lang="ts">
import type { PropType } from 'vue'

defineProps({
  recoveryWords: {
    type: Array as PropType<string[]>,
    default: () => Array.from({ length: 12 }).fill(''),
  },
})
</script>

<template>
  <div class="grid w-full grid-cols-2 gap-2 max-w-72 min-w-fit">
    <div
      v-for="(word, i) in recoveryWords"
      :key="word + i"
      class="flex bg-[#F2F2F4] py-1 px-2 rounded w-full gap-2 min-w-min"
    >
      <span class="font-semibold text-space/60">{{ (i + 1).toString().padStart(2, '0') }}</span>
      <span class="break-all">{{ word }}</span>
    </div>
  </div>
</template>
