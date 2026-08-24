<script setup lang="ts">
import type { CompetitionMiniApp } from '@/stores/competition-mini-apps'
import { IonButton, IonSearchbar } from '@ionic/vue'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import CompetitionAppPoster from '@/components/competition/CompetitionAppPoster.vue'
import AppsIcon from '@/components/icons/apps.vue'
import { useApp } from '@/stores/app'
import { competitionCycleNumber, useCompetitionMiniApps } from '@/stores/competition-mini-apps'

const emit = defineEmits<{
  select: [app: CompetitionMiniApp]
}>()

const store = useCompetitionMiniApps()
const { apps, cycles, isLoading, hasLoaded, hasRefreshError } = storeToRefs(store)
const appStore = useApp()
const { showAnimations } = storeToRefs(appStore)
const activeCycle = shallowRef<string>()
const searchQuery = shallowRef('')
const activeCategory = shallowRef('all')
const scrollContainer = useTemplateRef<HTMLDivElement>('scrollContainer')

const cycleApps = computed(() => activeCycle.value
  ? apps.value.filter(app => app.cycle === activeCycle.value)
  : [])
const categories = computed(() => [...new Set(cycleApps.value.map(app => app.category))]
  .sort((a, b) => a.localeCompare(b)))
const activeApps = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()

  return cycleApps.value.filter((app) => {
    const matchesCategory = activeCategory.value === 'all' || app.category === activeCategory.value
    if (!matchesCategory || !query)
      return matchesCategory

    return [app.name, app.tagline, app.description, app.category, app.teamName, ...app.teamMembers]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query)
  })
})
const isInitialLoading = computed(() => (isLoading.value || !hasLoaded.value) && apps.value.length === 0)
const showError = computed(() => hasLoaded.value && hasRefreshError.value && apps.value.length === 0)

watch(cycles, (availableCycles) => {
  if (!activeCycle.value || !availableCycles.includes(activeCycle.value))
    activeCycle.value = availableCycles[0]
}, { immediate: true })

watch(activeCycle, () => {
  searchQuery.value = ''
  activeCategory.value = 'all'
})

onMounted(() => {
  void store.load()
})

function selectCycle(cycle: string) {
  if (cycle === activeCycle.value)
    return
  activeCycle.value = cycle
  if (scrollContainer.value)
    scrollContainer.value.scrollTop = 0
}
</script>

<template>
  <div ref="scrollContainer" class="ion-content-scroll-host competition-scroll h-full min-h-0 w-full overflow-x-hidden overflow-y-auto text-left">
    <div v-if="isInitialLoading" data-testid="competition-loading" class="flex min-h-full flex-col">
      <div class="mt-4 h-32 w-full animate-pulse rounded-xl bg-sky/10 motion-reduce:animate-none" />
      <div class="mx-6 mt-8 h-7 w-36 animate-pulse rounded bg-space/[0.06] motion-reduce:animate-none" />
      <div class="mx-6 mt-4 grid grid-cols-2 gap-3">
        <div v-for="index in 4" :key="index" class="h-64 animate-pulse rounded-xl bg-space/[0.06] motion-reduce:animate-none" />
      </div>
    </div>

    <div v-else-if="showError" data-testid="competition-error" class="flex min-h-full flex-col items-center justify-center px-5 text-center">
      <h1 class="text-2xl font-bold text-space">
        {{ $t('Competition entries could not be loaded') }}
      </h1>
      <p class="mt-2 text-space/70">
        {{ $t('Check your connection and try again.') }}
      </p>
      <IonButton class="mt-6" @click="store.load()">
        {{ $t('Try again') }}
      </IonButton>
    </div>

    <template v-else>
      <motion.div
        :key="`cycle-${activeCycle || 'empty'}`"
        :initial="showAnimations ? { opacity: 0.75 } : false"
        :animate="{ opacity: 1 }"
        :transition="{ duration: showAnimations ? 0.2 : 0, ease: 'easeOut' }"
      >
        <section class="competition-marquee relative mt-4 min-h-32 w-[calc(100%-0.75rem)] mx-auto overflow-hidden rounded-xl px-6 py-4 text-white shadow-card">
          <div class="relative z-10 flex min-h-24 items-center gap-4">
            <div class="grid size-16 shrink-0 place-items-center rounded-xl bg-white text-sky shadow-card">
              <AppsIcon class="size-8" />
            </div>
            <div>
              <h1 class="text-balance text-xl font-bold leading-tight text-white">
                {{ $t('Mini Apps Competition') }}
              </h1>
              <p class="mt-2 max-w-[26ch] text-sm leading-relaxed text-white/85">
                {{ $t('Meet the builders creating new experiences for Nimiq Pay.') }}
              </p>
            </div>
          </div>
        </section>

        <nav v-if="cycles.length > 1" class="cycle-rail hide-scrollbar relative z-10 mx-3 -mt-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-2 shadow-card" role="tablist" :aria-label="$t('Competition cycles')">
          <button
            v-for="cycle in cycles"
            :key="cycle"
            type="button"
            role="tab"
            class="min-h-12 shrink-0 rounded-lg px-5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            :class="cycle === activeCycle ? 'active-cycle text-white' : 'text-space/70 hover:bg-space/[0.06]'"
            :aria-selected="cycle === activeCycle"
            @click="selectCycle(cycle)"
          >
            {{ $t('Cycle {number}', { number: competitionCycleNumber(cycle) }) }}
          </button>
        </nav>

        <div class="px-6">
          <div v-if="activeCycle" class="mt-6 flex flex-col gap-3">
            <IonSearchbar
              v-model="searchQuery"
              data-testid="competition-search"
              :placeholder="$t('Search submissions')"
              :aria-label="$t('Search submissions')"
              :debounce="0"
              inputmode="search"
              enterkeyhint="search"
              class="competition-searchbar p-0 border-2 text-left border-space/15 rounded-full"
            />

            <nav
              v-if="categories.length"
              :aria-label="$t('Filter submissions by category')"
              class="hide-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 pb-1"
            >
              <button
                v-for="(category, index) in ['all', ...categories]"
                :key="category"
                type="button"
                :data-testid="`competition-category-${index}`"
                :aria-pressed="activeCategory === category"
                class="min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
                :class="activeCategory === category ? 'bg-space text-white' : 'bg-space/[0.06] text-space/70'"
                @click="activeCategory = category"
              >
                {{ category === 'all' ? $t('All') : category }}
              </button>
            </nav>
          </div>

          <div v-if="activeCycle" class="mt-8 flex items-center gap-2">
            <h2 class="text-xl font-bold text-space">
              {{ $t('Submissions') }}
            </h2>
            <span data-testid="competition-submission-count" aria-hidden="true" class="rounded-md bg-space/[0.06] px-2 py-1 text-sm font-bold text-space/50">
              {{ activeApps.length }}
            </span>
            <span
              data-testid="competition-results-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              class="sr-only"
            >
              {{ $t('Matching submissions: {count}', { count: activeApps.length }) }}
            </span>
          </div>

          <div v-if="activeApps.length" class="competition-grid mt-4 grid gap-3 pb-8">
            <CompetitionAppPoster
              v-for="(app, index) in activeApps"
              :key="app.url"
              :app="app"
              :index="index"
              :show-animations="showAnimations"
              @select="emit('select', $event)"
            />
          </div>

          <div v-else-if="cycleApps.length" class="flex min-h-64 flex-col items-center justify-center text-center">
            <h2 class="text-xl font-bold text-space">
              {{ $t('No matching submissions') }}
            </h2>
            <p class="mt-2 text-space/70">
              {{ $t('Try another search or category.') }}
            </p>
          </div>

          <div v-else class="flex min-h-64 flex-col items-center justify-center text-center">
            <h2 class="text-xl font-bold text-space">
              {{ $t('No entries in this cycle yet') }}
            </h2>
            <p class="mt-2 text-space/70">
              {{ $t('Check back when the next entries arrive.') }}
            </p>
          </div>
        </div>
      </motion.div>
    </template>
  </div>
</template>

<style scoped>
.competition-scroll {
  scrollbar-width: none;
}

.competition-scroll::-webkit-scrollbar {
  display: none;
}

.competition-searchbar {
  --background: transparent;
  --border-radius: 9999px;
  --box-shadow: none;
  --placeholder-color: theme('colors.space.DEFAULT / 60%');
  --icon-color: theme('colors.space.DEFAULT / 40%');
  --clear-button-color: theme('colors.space.DEFAULT / 40%');
}

.competition-marquee {
  background: var(--radial-gradient-light-blue);
}

.competition-marquee::after {
  position: absolute;
  right: -4rem;
  bottom: -6rem;
  width: 15rem;
  height: 15rem;
  border-radius: 9999px;
  background: rgb(255 255 255 / 7%);
  content: '';
}

.active-cycle {
  background: var(--radial-gradient-light-blue);
}

.competition-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
}
</style>
