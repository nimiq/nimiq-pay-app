<script setup lang="ts">
import NakaCard from '@/components/icons/naka-card.vue'
import { stepEmits } from '@/lib/flows/steps.types'

const emit = defineEmits(stepEmits)

function setPaymentRequest() {
  emit('done', undefined)
}
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="flex flex-1 items-center justify-center">
      <NakaCard class="translate-y-[-50%]" />
    </div>
    <button class="mt-8 text-sm font-bold mb-16 italic text-blue-300" @click="setPaymentRequest">
      Fake read
    </button>
  </div>
</template>
