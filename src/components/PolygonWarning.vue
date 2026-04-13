<script setup lang="ts">
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'radix-vue'
import InfoIcon from './icons/info.vue'

defineProps<{
  message: string
  tooltipMessage?: string
}>()
</script>

<template>
  <div aria-label="Polygon warning" class="text-center text-pretty">
    <p class="inline text-pumpkin font-semibold text-sm">
      <span>{{ message }}</span>
      <PopoverRoot v-if="tooltipMessage">
        <PopoverTrigger as-child>
          <span
            class="inline-flex align-[-2px] leading-none ml-1 cursor-pointer"
            aria-label="More info"
            role="button"
            tabindex="0"
          >
            <InfoIcon class="block w-3.5 h-3.5 text-pumpkin/60" />
          </span>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent class="bg-gradient-to-br from-space to-[#260133] font-semibold max-w-52 px-4 py-3 rounded z-50" align="center">
            <p class="text-sm text-white/80 text-justify text-balance">
              {{ tooltipMessage }}
            </p>
            <PopoverArrow class="fill-[#260133] pb-2" :height="16" :width="14" />
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </p>
  </div>
</template>
