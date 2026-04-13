<script setup lang="ts">
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import NimiqLogo from '@/components/icons/nimiq-logo.vue'
import UsdtLogo from '@/components/icons/usdt-logo.vue'
import { Asset } from '@/lib/assets'
import { useApp } from '@/stores/app'

const { activeAsset } = storeToRefs(useApp())

function toggleAsset() {
  activeAsset.value = activeAsset.value === Asset.NIM ? Asset.USDT : Asset.NIM
}
</script>

<template>
  <button class="flex items-center gap-x-2 p-1 rounded-full w-fit" style="background: var(--radial-gradient-blue-50);" aria-label="Switch asset" @click="toggleAsset">
    <div
      v-for="asset in [Asset.NIM, Asset.USDT]"
      :key="asset"
      class="asset-button size-9 rounded-full flex items-center justify-center relative"
      :class="{ inactive: activeAsset !== asset }"
    >
      <motion.div
        v-if="activeAsset === asset"
        layout-id="active-indicator"
        class="absolute inset-0 rounded-full bg-white"
        :transition="{ type: 'spring', stiffness: 500, damping: 35, duration: 0.3 }"
      />
      <component :is="asset === Asset.NIM ? NimiqLogo : UsdtLogo" class="relative z-10" :class="asset === Asset.NIM ? 'size-6' : 'size-7'" />
    </div>
  </button>
</template>

<style scoped>
.asset-button {
  transition: filter 0.25s ease;
}

.asset-button.inactive {
  filter: grayscale(1);
}
</style>
