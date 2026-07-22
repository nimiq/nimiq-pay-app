<script setup lang="ts">
import type { CompetitionMiniApp } from '@/stores/competition-mini-apps'
import { motion } from 'motion-v'
import { applyIconFallback } from '@/lib/mini-app-icons'

const props = defineProps<{
  app: CompetitionMiniApp
  index: number
  showAnimations: boolean
}>()

const emit = defineEmits<{
  select: [app: CompetitionMiniApp]
}>()

function fallbackImage(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image.src !== props.app.icon) {
    image.src = props.app.icon
    return
  }
  applyIconFallback(event, props.app.url)
}
</script>

<template>
  <motion.button
    type="button"
    :data-testid="`competition-entry-${index}`"
    class="poster group flex pb-4 w-full flex-col overflow-hidden rounded-lg bg-white text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
    :aria-label="$t('View {name}', { name: app.name })"
    :while-press="showAnimations ? { scale: 0.98 } : {}"
    :transition="{ duration: showAnimations ? 0.16 : 0, ease: 'easeOut' }"
    @click="emit('select', app)"
  >
    <div class="relative w-full pb-5">
      <div class="poster-thumbnail aspect-[16/9] w-full overflow-hidden bg-space/[0.06]">
        <img
          :src="app.thumbnail || app.icon"
          :alt="$t('{name} preview', { name: app.name })"
          class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          @error="fallbackImage"
        >
      </div>
      <img
        :src="app.icon"
        :alt="app.name"
        class="absolute bottom-0 left-2 size-10 rounded-lg bg-white object-contain p-1 shadow-[0_4px_12px_rgba(31,35,72,0.2)]"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @error="applyIconFallback($event, app.url)"
      >
    </div>

    <div class="flex flex-col px-3 pt-2 gap-1">
      <h3 class="text-sm font-bold leading-tight text-space">
        {{ app.name }}
      </h3>
      <p class="poster-tagline mt-1 text-xs leading-snug text-space/65">
        {{ app.tagline }}
      </p>
      <div class="mt-2 flex">
        <span class="rounded-full bg-sky/10 px-2 py-1 text-[0.625rem] font-bold leading-tight text-sky capitalize">
          {{ app.category }}
        </span>
      </div>
    </div>
  </motion.button>
</template>

<style scoped>
.poster {
  border: 1px solid rgb(31 35 72 / 10%);
  content-visibility: auto;
  contain-intrinsic-size: 14rem;
}

.poster-thumbnail {
  border-bottom-left-radius: 50% 12%;
  border-bottom-right-radius: 50% 12%;
}

.poster-tagline {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
