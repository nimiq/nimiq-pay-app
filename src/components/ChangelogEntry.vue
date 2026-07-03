<script setup lang="ts">
import type { ChangelogEntry } from '@/composables/useChangelog'
import { useFormatTime } from '@/composables/useTime'

// `compact` de-emphasizes older versions rendered inside the collapsible.
defineProps<{ entry: ChangelogEntry, compact?: boolean }>()

function formatDate(date: string) {
  const ms = new Date(date).getTime()
  return Number.isNaN(ms) ? date : useFormatTime(ms, { dateStyle: 'medium', timeStyle: undefined })
}
</script>

<template>
  <section>
    <div class="flex items-baseline gap-2">
      <h2 class="font-bold" :class="compact ? 'text-base text-space/80' : 'text-lg text-space'">
        {{ $t('Version') }} {{ entry.version }}
      </h2>
      <span class="text-sm text-space/50">{{ formatDate(entry.date) }}</span>
    </div>

    <ul class="flex flex-col" :class="compact ? 'mt-3 gap-4' : 'mt-4 gap-5'">
      <li v-for="(highlight, i) in entry.highlights" :key="i">
        <h3 class="font-bold text-space" :class="compact ? 'text-[15px]' : 'text-base'">
          {{ highlight.title }}
        </h3>
        <p class="mt-1 leading-relaxed text-space/70" :class="compact ? 'text-[15px]' : 'text-base'">
          {{ highlight.description }}
        </p>
        <div v-if="highlight.howTo" class="mt-2 rounded-md bg-sky/[0.08] px-3 py-2">
          <p class="text-sm leading-relaxed text-space/80">
            <span class="font-bold text-sky">{{ $t('How to use:') }}</span>
            {{ highlight.howTo }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>
