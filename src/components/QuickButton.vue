<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

defineProps({
  showChevron: {
    type: Boolean,
    default: false,
  },
})

defineEmits<{ click: [] }>()

const ChevronRight = defineAsyncComponent(() => import('@/components/icons/chevron-right.vue'))
</script>

<template>
  <div class="mt-2 mb-14">
    <button class="flex items-center justify-center w-full text-sky gap-x-2" @click="$emit('click')">
      <span><slot /></span>
      <ChevronRight v-if="showChevron" class="w-[7px] text-sky/50" />
    </button>
  </div>
</template>
