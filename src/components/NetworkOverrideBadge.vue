<script setup lang="ts">
import { isNetworkOverridden, isTestnet } from '@/lib'
</script>

<template>
  <!-- z-[999998] sits one below the dev FAB (999999) so the FAB stays tappable on top. -->
  <!-- `top` uses env(safe-area-inset-top) so the pill clears the iOS Dynamic Island / Android status bar. -->
  <div
    v-if="isNetworkOverridden"
    class="network-override-badge fixed left-1/2 -translate-x-1/2 z-[999998] px-3 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase pointer-events-none"
    :class="isTestnet ? 'bg-orange-500 text-white' : 'bg-green-600 text-white'"
  >
    {{ isTestnet ? 'TESTNET' : 'MAINNET' }}
  </div>
</template>

<style scoped>
.network-override-badge {
  top: calc(env(safe-area-inset-top, 0px) + 4px);
}
</style>
