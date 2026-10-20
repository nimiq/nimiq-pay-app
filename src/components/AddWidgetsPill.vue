<script setup lang="ts">
import AddWidgetsIcon from '@/components/icons/add-widgets.vue'
</script>

<template>
  <button
    type="button"
    class="relative flex h-10 w-full items-center justify-center gap-2 rounded-full border border-solid border-space/[0.08] bg-space/[0.06] pl-3 pr-4 text-sm font-semibold text-space before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] transition-colors active:bg-space/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
  >
    <AddWidgetsIcon aria-hidden="true" class="size-[16.8px] shrink-0" />
    <slot />
  </button>
</template>
