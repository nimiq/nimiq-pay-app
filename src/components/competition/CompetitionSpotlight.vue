<script setup lang="ts">
import type { CompetitionMiniApp } from '@/stores/competition-mini-apps'
import { IonSkeletonText } from '@ionic/vue'
import { motion } from 'motion-v'
import { computed } from 'vue'
import ChevronRightIcon from '@/components/icons/chevron-right.vue'
import { applyIconFallback } from '@/lib/mini-app-icons'
import { competitionCycleNumber } from '@/stores/competition-mini-apps'

const props = defineProps<{
  cycle?: string
  entryCount: number
  previewApps: CompetitionMiniApp[]
  loading: boolean
  showAnimations: boolean
}>()

const emit = defineEmits<{
  open: []
}>()

const previews = computed(() => props.previewApps.slice(0, 3))

function fallbackImage(event: Event, app: CompetitionMiniApp) {
  const image = event.currentTarget as HTMLImageElement
  if (image.src !== app.icon) {
    image.src = app.icon
    return
  }
  applyIconFallback(event, app.url)
}
</script>

<template>
  <button
    v-if="loading"
    type="button"
    data-testid="competition-spotlight-loading"
    :aria-label="$t('Open Mini Apps Competition')"
    class="h-44 w-full overflow-hidden rounded-xl bg-sky/10 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
    @click="emit('open')"
  >
    <IonSkeletonText :animated="true" class="h-4 w-20 rounded" />
    <IonSkeletonText :animated="true" class="mt-4 h-7 w-52 rounded" />
    <IonSkeletonText :animated="true" class="mt-3 h-4 w-32 rounded" />
  </button>

  <motion.button
    v-else
    type="button"
    data-testid="competition-spotlight"
    class="competition-spotlight relative min-h-44 w-[calc(100%-0.75rem)] overflow-hidden rounded-xl p-5 text-left text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
    :while-press="showAnimations ? { scale: 0.985 } : {}"
    :transition="{ duration: showAnimations ? 0.16 : 0, ease: 'easeOut' }"
    @click="emit('open')"
  >
    <div class="relative z-10 flex min-h-32 max-w-[62%] flex-col items-start">
      <span v-if="cycle" class="text-sm font-semibold text-white/80">
        {{ $t('Cycle {number}', { number: competitionCycleNumber(cycle) }) }}
      </span>
      <h2 class="mt-2 text-balance text-2xl font-bold leading-tight text-white">
        {{ $t('Mini Apps Competition') }}
      </h2>
      <p class="mt-2 text-sm font-semibold text-white/80">
        {{ $t('{count} entries', { count: entryCount }) }}
      </p>
      <span class="mt-auto flex items-center gap-1.5 text-sm font-bold">
        {{ $t('Explore entries') }}
        <ChevronRightIcon class="h-3.5 w-3.5" />
      </span>
    </div>

    <div class="absolute -right-4 bottom-2 top-2 w-[47%]" aria-hidden="true">
      <div
        v-for="(app, index) in previews"
        :key="app.url"
        class="preview-card absolute aspect-[4/3] w-[78%] overflow-hidden rounded-lg bg-white shadow-[0_10px_24px_rgba(31,35,72,0.24)]"
        :style="{
          right: `${index * 12}px`,
          top: `${index * 24}px`,
          transform: `rotate(${(index - 1) * 5}deg)`,
          zIndex: previews.length - index,
        }"
      >
        <img
          :src="app.thumbnail || app.icon"
          alt=""
          class="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          @error="fallbackImage($event, app)"
        >
        <img
          :src="app.icon"
          alt=""
          class="absolute bottom-2 left-2 size-9 rounded-lg bg-white object-contain p-1 shadow-[0_4px_10px_rgba(31,35,72,0.2)]"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          @error="applyIconFallback($event, app.url)"
        >
      </div>
    </div>
  </motion.button>
</template>

<style scoped>
.competition-spotlight {
  background: var(--radial-gradient-light-blue);
  box-shadow: 0 12px 26px rgb(31 35 72 / 18%);
}
</style>
