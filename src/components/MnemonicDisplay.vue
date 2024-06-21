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
  <ol class="grid grid-cols-2 gap-2 max-w-72 min-w-fit [counter-reset:custom-reset] mt-[76px]">
    <li
      v-for="(word, i) in recoveryWords" :key="word + i"
      class="[counter-increment:custom-counter] flex gap-1.5 px-1.5 py-2 leading-[18.5px] before:content-[counter(custom-counter,decimal-leading-zero)] before:text-space/60 before:font-bold before:tracking-tight break-all min-w-[136px]"
    >
      {{ word }}
    </li>
  </ol>
</template>
