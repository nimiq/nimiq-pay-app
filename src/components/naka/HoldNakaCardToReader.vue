<script setup lang="ts">
import NakaCard from '@/components/icons/naka-card.vue'
import { stepEmits } from '@/lib/flows/steps.types'

defineEmits(stepEmits)
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="flex flex-1 items-center justify-center">
      <NakaCard class="translate-y-[-50%]" />
    </div>
  </div>
</template>
