<script setup lang="ts">
defineProps({
  active: {
    type: Number,
    default: 0,
  },
  count: {
    type: Number,
    required: true,
  },
})

defineEmits<{
  (e: 'navigate', index: number): void
}>()
</script>

<template>
  <div class="flex px-4 mt-2 gap-x-1">
    <div v-for="(n, i) in count" :key="i" class="w-full h-[5px] bg-blue-100 rounded-full transition-colors" :class="{ 'bg-blue-300': active === i }" @click="$emit('navigate', i)" />
  </div>
</template>
