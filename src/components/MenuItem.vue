<script setup lang="ts">
import ArrowUpRightIcon from '@/components/icons/arrow-up-right.vue'
import ChevronRightIcon from '@/components/icons/chevron-right.vue'

defineProps<{
  icon: any
  title: string
  external?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

function onClick() {
  emit('click')
}
</script>

<template>
  <button class="flex gap-x-2 items-center" :aria-label="ariaLabel" @click="onClick">
    <component :is="icon" class="w-7 text-space" />
    <span class="w-full font-semibold text-lg text-left">
      {{ title }}
    </span>
    <ArrowUpRightIcon v-if="external" class="size-6 text-space" />
    <ChevronRightIcon v-else class="size-6 text-space" />
  </button>
</template>
