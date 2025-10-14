<script setup lang="ts">
import { Identicon } from '@nimiq/vue3-components'
import IconHorizontalEllipsis from '@/components/icons/horizontal-ellipsis.vue'

defineProps({
  address: { type: String, required: true },
  identiconWidth: { type: String, default: 'w-10' },
  hideIdenticon: { type: Boolean, default: false },
})
</script>

<template>
  <div class="flex items-center gap-x-4">
    <Identicon v-if="!hideIdenticon" :address="address" :class="identiconWidth" />
    <div class="uppercase address flex items-center gap-x-2">
      <!-- First 4 characters -->
      <span>{{ address.slice(0, 4) }}</span>
      <!-- Ellipsis -->
      <IconHorizontalEllipsis class="w-6 text-space/30" />
      <!-- Last 4 characters -->
      <span>{{ address.slice(-4) }}</span>
    </div>
  </div>
</template>

<style scoped>
.address {
  font-family: 'Fira Mono', monospace;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: .2px;
}
</style>
