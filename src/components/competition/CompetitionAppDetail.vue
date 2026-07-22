<script setup lang="ts">
import type { CompetitionMiniApp } from '@/stores/competition-mini-apps'
import { IonButton } from '@ionic/vue'
import { computed } from 'vue'
import ArrowUpRightIcon from '@/components/icons/arrow-up-right.vue'
import { useFormatTime } from '@/composables/useTime'
import { applyIconFallback } from '@/lib/mini-app-icons'
import { competitionCycleNumber } from '@/stores/competition-mini-apps'

const props = defineProps<{
  app: CompetitionMiniApp
  opening: boolean
}>()

const emit = defineEmits<{
  open: [app: CompetitionMiniApp]
  openExternal: [url: string]
}>()

const builderName = computed(() => props.app.teamName || props.app.githubLogin)
const xUrl = computed(() => props.app.xAccount
  ? `https://x.com/${encodeURIComponent(props.app.xAccount)}`
  : undefined)
const submittedDate = computed(() => {
  if (!props.app.submittedAt)
    return undefined
  const timestamp = Date.parse(props.app.submittedAt)
  return Number.isNaN(timestamp)
    ? undefined
    : useFormatTime(timestamp, { dateStyle: 'medium', timeStyle: undefined })
})

function fallbackToIcon(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image.src !== props.app.icon) {
    image.src = props.app.icon
    return
  }
  applyIconFallback(event, props.app.url)
}
</script>

<template>
  <article data-testid="competition-detail" class="flex h-full max-h-full w-full min-h-0 min-w-0 flex-col overflow-hidden text-left">
    <div
      data-testid="competition-detail-scroll"
      class="ion-content-scroll-host hide-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-8"
    >
      <header>
        <div class="aspect-video overflow-hidden rounded-lg bg-space/[0.06] ring-1 ring-inset ring-space/10">
          <img
            data-testid="competition-thumbnail"
            :src="app.thumbnail || app.icon"
            :alt="$t('{name} preview', { name: app.name })"
            class="h-full w-full"
            :class="app.thumbnail ? 'object-cover' : 'object-contain p-8'"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            @error="fallbackToIcon"
          >
        </div>

        <div class="mt-4 flex items-center gap-3">
          <img
            :src="app.icon"
            alt=""
            class="size-14 shrink-0 rounded-lg bg-space/[0.06] object-contain p-1 ring-1 ring-inset ring-space/10"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            @error="applyIconFallback($event, app.url)"
          >
          <div class="min-w-0">
            <p class="text-sm font-bold text-space/50">
              {{ $t('Cycle {number}', { number: competitionCycleNumber(app.cycle) }) }}
            </p>
            <h1 class="text-balance text-2xl font-bold leading-tight text-space">
              {{ app.name }}
            </h1>
          </div>
        </div>
      </header>

      <div class="mt-5 flex flex-wrap gap-2">
        <span class="rounded-full bg-sky/10 px-3 py-1.5 text-sm font-bold text-sky">{{ app.category }}</span>
        <span v-if="app.pricing" class="rounded-full bg-space/[0.06] px-3 py-1.5 text-sm font-bold text-space/70">{{ app.pricing }}</span>
      </div>

      <p class="mt-5 text-lg font-bold leading-snug text-space">
        {{ app.tagline }}
      </p>
      <p class="mt-3 text-base leading-relaxed text-space/70">
        {{ app.description }}
      </p>

      <section v-if="app.screenshots.length" class="mt-9">
        <h2 class="mb-4 text-lg font-bold text-space">
          {{ $t('App previews') }}
        </h2>
        <ul
          class="hide-scrollbar flex w-full max-w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
          :aria-label="$t('App screenshots')"
        >
          <li
            v-for="(screenshot, index) in app.screenshots"
            :key="screenshot"
            class="aspect-[9/16] w-[72%] shrink-0 snap-center overflow-hidden rounded-xl bg-space/[0.06] md:w-[42%]"
          >
            <img
              data-testid="competition-screenshot"
              :src="screenshot"
              :alt="$t('{name} screenshot {number}', { name: app.name, number: index + 1 })"
              class="h-full w-full object-contain"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="fallbackToIcon"
            >
          </li>
        </ul>
      </section>

      <section v-if="builderName || app.teamMembers.length || submittedDate" class="mt-9 rounded-xl bg-space/[0.06] p-4">
        <h2 class="text-sm font-bold text-space/50">
          {{ $t('Builder') }}
        </h2>
        <p v-if="builderName" class="mt-1 text-lg font-bold text-space">
          {{ builderName }}
        </p>
        <p v-if="app.teamMembers.length" class="mt-1 text-sm text-space/70">
          {{ app.teamMembers.join(', ') }}
        </p>
        <p v-if="submittedDate" class="mt-2 text-sm text-space/50">
          {{ $t('Submitted {date}', { date: submittedDate }) }}
        </p>
      </section>

      <div v-if="app.repositoryUrl || app.videoUrl || xUrl" class="mt-6 grid gap-2">
        <button
          v-if="app.repositoryUrl"
          type="button"
          class="flex min-h-12 items-center justify-between rounded-xl bg-space/[0.06] px-4 font-bold text-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
          @click="emit('openExternal', app.repositoryUrl)"
        >
          {{ $t('Source code') }}
          <ArrowUpRightIcon class="h-4 w-4" />
        </button>
        <button
          v-if="app.videoUrl"
          type="button"
          class="flex min-h-12 items-center justify-between rounded-xl bg-space/[0.06] px-4 font-bold text-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
          @click="emit('openExternal', app.videoUrl)"
        >
          {{ $t('Watch demo') }}
          <ArrowUpRightIcon class="h-4 w-4" />
        </button>
        <button
          v-if="xUrl"
          type="button"
          class="flex min-h-12 items-center justify-between rounded-xl bg-space/[0.06] px-4 font-bold text-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
          @click="emit('openExternal', xUrl)"
        >
          {{ $t('View on X') }}
          <ArrowUpRightIcon class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div data-testid="competition-detail-action" class="competition-detail-action z-10 w-full shrink-0 bg-white pt-3">
      <IonButton
        data-testid="competition-open"
        class="m-0 w-full"
        expand="block"
        :disabled="opening"
        @click="emit('open', app)"
      >
        {{ opening ? $t('Opening…') : $t('Open {name}', { name: app.name }) }}
      </IonButton>
    </div>
  </article>
</template>

<style scoped>
.competition-detail-action {
  padding-bottom: calc(0.75rem + max(var(--ion-safe-area-bottom, 0px), env(safe-area-inset-bottom, 0px)));
}
</style>
