<script setup lang="ts">
import type { MiniAppMenuContext, RowDApp } from '@/stores/mini-apps'
import { IonSkeletonText } from '@ionic/vue'
import { motion } from 'motion-v'
import HorizontalEllipsisIcon from '@/components/icons/horizontal-ellipsis.vue'
import LoadingSpinnerIcon from '@/components/icons/loading-spinner.vue'
import MiniAppTypeBadge from '@/components/MiniAppTypeBadge.vue'
import { MINI_APP_FALLBACK_ICON as FALLBACK_ICON } from '@/lib/mini-app-icons'
import { useMiniApps } from '@/stores/mini-apps'

const props = withDefaults(defineProps<{
  dapp: RowDApp
  opening?: boolean
  disabled?: boolean
  removable?: boolean
  // When false, the open area is a plain div so a parent (e.g. SwipeToDeleteRow) owns the tap.
  tappable?: boolean
  descriptionLoading?: boolean
  buttonTestid?: string
  subtitleTestid?: string
  iconLoadingTestid?: string
  menuTestid?: string
}>(), {
  opening: false,
  disabled: false,
  removable: false,
  tappable: true,
  descriptionLoading: false,
})

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'menu', context: MiniAppMenuContext): void
}>()

// Kebab is always shown: Share applies to every Mini App; Report/Remove are gated per-row.
// reportUrl is resolved lazily at tap time — no per-row store lookup during list render.
function onMenu() {
  emit('menu', {
    app: { name: props.dapp.name, url: props.dapp.url, icon: props.dapp.icon },
    reportUrl: useMiniApps().getMiniAppReportUrl(props.dapp.url),
    removable: props.removable,
  })
}

function onImgError(event: Event) {
  (event.target as HTMLImageElement).src = FALLBACK_ICON
}
</script>

<template>
  <div class="flex items-center gap-3">
    <component
      :is="tappable ? 'button' : 'div'"
      :type="tappable ? 'button' : undefined"
      :data-testid="buttonTestid"
      class="flex items-center gap-3 flex-1 min-w-0 text-left transition-opacity select-none"
      :class="{ 'opacity-50': disabled, 'cursor-not-allowed': tappable && disabled }"
      :disabled="tappable && disabled"
      @click="tappable && emit('open')"
    >
      <div class="relative w-14 h-14 shrink-0">
        <img
          :src="dapp.icon"
          :alt="dapp.name"
          class="w-14 h-14 rounded-full object-contain bg-white/10 p-1 transition-opacity pointer-events-none"
          :class="{ 'opacity-40': opening }"
          draggable="false"
          @error="onImgError"
        >
        <motion.div
          v-if="opening"
          :data-testid="iconLoadingTestid"
          class="absolute inset-0 flex items-center justify-center"
          :initial="{ opacity: 0, scale: 0.85 }"
          :animate="{ opacity: 1, scale: 1 }"
          :transition="{ duration: 0.16, ease: 'easeOut' }"
        >
          <LoadingSpinnerIcon class="w-6 h-6 text-space" />
        </motion.div>
        <MiniAppTypeBadge v-if="dapp.type" :type="dapp.type" />
      </div>
      <div class="flex flex-col min-w-0">
        <span class="font-bold text-base">{{ dapp.name }}</span>
        <IonSkeletonText v-if="descriptionLoading" :animated="true" class="h-4 w-3/4 rounded" />
        <motion.span
          v-else
          :key="dapp.description || dapp.url"
          :data-testid="subtitleTestid"
          class="text-sm text-space/50 truncate"
          :initial="{ opacity: 0, y: 4 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.16, ease: 'easeOut' }"
        >
          {{ dapp.description || dapp.url }}
        </motion.span>
      </div>
    </component>

    <button
      type="button"
      :data-testid="menuTestid"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-label="`More actions for ${dapp.name}`"
      class="shrink-0 -mr-2 grid place-items-center w-11 h-11 rounded-full text-space/40 transition-colors active:bg-space/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky disabled:opacity-40"
      @click.stop="onMenu"
    >
      <HorizontalEllipsisIcon class="w-5 h-[5px]" />
    </button>
  </div>
</template>
