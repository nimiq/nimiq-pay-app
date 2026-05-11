<script setup lang="ts">
import type { MiniAppType } from '@/stores/mini-apps'
import { computed } from 'vue'
import EvmGlyph from '@/components/icons/evm-glyph.vue'
import NimiqHex from '@/components/icons/nimiq-hex.vue'

const props = defineProps<{ type: MiniAppType }>()

const background = computed(() =>
  props.type === 'nimiq' ? 'var(--radial-gradient-gold)' : 'var(--radial-gradient-blue-evm)',
)
</script>

<template>
  <div
    class="absolute bottom-0 right-0 size-5 rounded-full border-[1.5px] border-white flex items-center justify-center pointer-events-none"
    :style="{ background }"
    :aria-label="type === 'nimiq' ? 'Runs on Nimiq' : 'Runs on EVM'"
    role="img"
  >
    <NimiqHex v-if="type === 'nimiq'" class="size-2.5 text-white" />
    <EvmGlyph v-else class="size-2.5 text-white" />
  </div>
</template>
