<script lang="ts" setup>
import InfoIcon from '@/components/icons/info.vue'

defineProps({
  message: { type: String, required: true },
  bgColor: { type: String, default: 'bg-[#F9EDE1]' },
  textColor: { type: String, default: 'text-pumpkin' },
  iconColor: { type: String, default: 'text-pumpkin/60' },
  iconSize: { type: String, default: 'size-4' },
  iconStroke: { type: String, default: 'stroke-[1.5]' },
  icon: { type: Object, default: () => InfoIcon },
})
</script>

<template>
  <div class="flex items-center justify-center gap-2 p-2" :class="bgColor">
    <component :is="icon" class="shrink-0" :class="[iconStroke, iconSize, iconColor]" />
    <p class="font-medium text-center" :class="textColor">
      {{ message }}
    </p>
  </div>
</template>
