<script setup lang="ts">
import type { TypeFilterValue } from '@/components/MiniAppTypeFilter.vue'
import type { DAppOpenSource } from '@/lib/analytics'
import type { CompetitionMiniApp } from '@/stores/competition-mini-apps'
import type { MiniAppMenuContext, MiniAppType } from '@/stores/mini-apps'
import { Browser } from '@capacitor/browser'
import { IonBackButton, IonButtons, IonSearchbar, IonSkeletonText, useBackButton } from '@ionic/vue'
import { useStorageAsync } from '@vueuse/core'
import { AnimatePresence, motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import CompetitionAppDetail from '@/components/competition/CompetitionAppDetail.vue'
import CompetitionSpotlight from '@/components/competition/CompetitionSpotlight.vue'
import MiniAppsCompetitionView from '@/components/competition/MiniAppsCompetitionView.vue'
import MiniAppActionsSheet from '@/components/MiniAppActionsSheet.vue'
import MiniAppRow from '@/components/MiniAppRow.vue'
import MiniAppTypeFilter from '@/components/MiniAppTypeFilter.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow.vue'
import { isMiniAppActive } from '@/composables/useMiniAppHost'
import { trackFeatureOpened } from '@/lib/analytics'
import { launchMiniApp, openingMiniAppUrl, warmUpWeb3ProviderScript } from '@/lib/mini-app-launcher'
import { getFaviconUrl } from '@/lib/site-metadata'
import { kvPreferences, useApp } from '@/stores/app'
import { useCompetitionMiniApps } from '@/stores/competition-mini-apps'
import { useMiniApps } from '@/stores/mini-apps'
import { normalizeMiniAppUrl, useMiniAppSearch } from './mini-app-search'

type InAppDAppSource = Exclude<DAppOpenSource, 'deeplink' | 'competition'>

const store = useMiniApps()
const { popularDApps, featuredDApps, nonFeaturedDApps, isLoading, descriptionTexts, recentDAppsWithDescriptions } = storeToRefs(store)
const { searchedDescriptions, ensureDescription } = store
const competitionStore = useCompetitionMiniApps()
const {
  newestCycle: competitionNewestCycle,
  newestCycleApps: competitionNewestCycleApps,
  isLoading: isCompetitionLoading,
} = storeToRefs(competitionStore)

const recentDAppsWithTestIds = computed(() =>
  (recentDAppsWithDescriptions.value ?? []).map(dapp => ({ ...dapp, testId: toUrlTestId(dapp.url) })),
)
const appStore = useApp()
const { language, selectedFiat, showAnimations } = storeToRefs(appStore)
const flowStep = shallowRef<'apps' | 'competition' | 'competitionDetail'>('apps')
const selectedCompetitionApp = ref<CompetitionMiniApp>()
const flowTransition = computed(() => ({ duration: showAnimations.value ? 0.22 : 0, ease: 'easeOut' as const }))
const flowOffset = computed(() => ({
  apps: '0%',
  competition: '-100%',
  competitionDetail: '-200%',
})[flowStep.value])
const isOpeningSelectedCompetitionApp = computed(() => !!selectedCompetitionApp.value
  && isOpeningUrl(selectedCompetitionApp.value.url))

// Keep native webview and nested competition navigation ahead of Ionic's modal dismissal.
const { unregister: unregisterHardwareBack } = useBackButton(101, () => {
  if (isMiniAppActive.value)
    return
  if (flowStep.value !== 'apps')
    backInMiniAppsFlow()
})
onBeforeUnmount(unregisterHardwareBack)

onMounted(() => warmUpWeb3ProviderScript())

const searchQuery = ref('')
const isSearching = computed(() => !!searchQuery.value.trim())
const typeFilter = useStorageAsync<TypeFilterValue>('miniAppsTypeFilter', 'all', kvPreferences())
function matchesType<T extends { type?: MiniAppType }>(dapp: T): boolean {
  return typeFilter.value === 'all' || dapp.type === typeFilter.value
}
const { filteredApps: searchHits } = useMiniAppSearch(searchQuery, popularDApps, descriptionTexts)
const filteredDApps = computed(() => searchHits.value.filter(matchesType))
const filteredFeatured = computed(() => featuredDApps.value.filter(matchesType))
const filteredNonFeatured = computed(() => nonFeaturedDApps.value.filter(matchesType))
const filteredRecent = computed(() => recentDAppsWithTestIds.value.filter(matchesType))
const isFilterActive = computed(() => typeFilter.value !== 'all')
const showCompetitionSpotlight = computed(() => !isSearching.value
  && typeFilter.value !== 'evm'
  && (isCompetitionLoading.value || competitionNewestCycleApps.value.length > 0))
const hasAnyResults = computed(() =>
  filteredFeatured.value.length > 0 || filteredNonFeatured.value.length > 0 || filteredRecent.value.length > 0,
)
const filterEmptyLabel = computed(() =>
  typeFilter.value === 'nimiq' ? 'No Nimiq apps yet. Check back soon.' : 'No EVM apps yet. Check back soon.',
)
const normalizedSearchUrl = computed(() => normalizeMiniAppUrl(searchQuery.value))
const isOpeningAny = computed(() => openingMiniAppUrl.value !== null)

const searchedUrlApp = computed(() => {
  const url = normalizedSearchUrl.value
  if (!url)
    return undefined

  const matchedFeaturedApp = popularDApps.value.find(dapp => normalizeMiniAppUrl(dapp.url) === url)
  const fallbackTitle = new URL(url).hostname

  return {
    url,
    title: matchedFeaturedApp?.name || fallbackTitle,
    description: searchedDescriptions[url]?.text || matchedFeaturedApp?.description,
    icon: matchedFeaturedApp?.icon || getFaviconUrl(url),
    type: matchedFeaturedApp?.type,
    isLoading: searchedDescriptions[url]?.status === 'loading',
  }
})

watch(normalizedSearchUrl, (url) => {
  if (url)
    void ensureDescription(url)
}, { immediate: true })

function isOpeningUrl(url: string): boolean {
  const normalizedUrl = normalizeMiniAppUrl(url)
  return !!normalizedUrl && openingMiniAppUrl.value === normalizedUrl
}

function toUrlTestId(url: string): string {
  const normalizedUrl = normalizeMiniAppUrl(url) || url
  return normalizedUrl.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

async function openMiniApp(url?: string, title?: string, source: InAppDAppSource = 'search') {
  const resolved = searchedUrlApp.value
  const targetUrl = url || resolved?.url || searchQuery.value
  const appTitle = title || (resolved ? resolved.title : undefined)
  await launchMiniApp({
    url: targetUrl,
    title: appTitle,
    source,
    description: resolved?.description,
    language: language.value,
    userFiat: selectedFiat.value,
  })
}

const menuOpen = ref(false)
const menuContext = ref<MiniAppMenuContext | null>(null)

function openMenu(context: MiniAppMenuContext) {
  menuContext.value = context
  menuOpen.value = true
}

function openCompetition() {
  trackFeatureOpened({
    featureName: 'mini_apps',
    source: 'competition_spotlight',
    channel: 'flow',
    activeAsset: appStore.activeAsset,
  })
  flowStep.value = 'competition'
}

function openCompetitionApp(app: CompetitionMiniApp) {
  selectedCompetitionApp.value = app
  flowStep.value = 'competitionDetail'
}

function backInMiniAppsFlow() {
  flowStep.value = flowStep.value === 'competitionDetail' ? 'competition' : 'apps'
}

async function launchCompetitionApp(app: CompetitionMiniApp) {
  await launchMiniApp({
    url: app.url,
    title: app.name,
    source: 'competition',
    description: app.description,
    icon: app.icon,
    language: language.value,
    userFiat: selectedFiat.value,
  })
}

async function openCompetitionExternal(url: string) {
  try {
    const target = new URL(url)
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
      return
    await Browser.open({ url: target.toString(), toolbarColor: '#0582CA' })
  }
  catch { /* Invalid or unavailable external links stay inert. */ }
}
</script>

<template>
  <ModalTemplate :close-all="true" :scroll-y="false">
    <template #leftButton>
      <IonButtons v-if="flowStep !== 'apps'" slot="start">
        <IonBackButton
          data-testid="competition-flow-back"
          default-href="/"
          @click.prevent="backInMiniAppsFlow"
        />
      </IonButtons>
    </template>

    <div class="mini-apps-flow -mx-6 h-full min-h-0 w-[calc(100%+3rem)] shrink-0 overflow-hidden">
      <motion.div
        class="flex h-full w-[300%]"
        :initial="false"
        :animate="{ marginLeft: flowOffset }"
        :transition="flowTransition"
      >
        <section
          data-testid="mini-apps-flow-apps"
          class="ion-content-scroll-host mini-apps-flow-step h-full w-1/3 shrink-0 overflow-y-auto"
          :class="{ 'pointer-events-none': flowStep !== 'apps' }"
          :aria-hidden="flowStep !== 'apps'"
          :inert="flowStep !== 'apps'"
        >
          <div class="flex min-h-full w-full flex-col gap-6 px-6 pb-8">
            <p class="text-2xl font-bold">
              Discover
            </p>

            <!-- Search Bar -->
            <IonSearchbar
              v-model="searchQuery"
              placeholder="Search or enter App URL"
              :debounce="300"
              inputmode="url"
              enterkeyhint="go"
              class="mini-app-searchbar p-0 border-2 text-left border-space/15 rounded-full"
              @keydown.enter="openMiniApp()"
            />

            <MiniAppTypeFilter v-model="typeFilter" data-testid="mini-app-type-filter" />

            <div v-if="showCompetitionSpotlight" class="-mx-6 w-[calc(100%+3rem)]">
              <CompetitionSpotlight
                :cycle="competitionNewestCycle"
                :entry-count="competitionNewestCycleApps.length"
                :preview-apps="competitionNewestCycleApps"
                :loading="isCompetitionLoading && competitionNewestCycleApps.length === 0"
                :show-animations="showAnimations"
                @open="openCompetition"
              />
            </div>

            <MiniAppRow
              v-if="searchedUrlApp"
              :dapp="{ url: searchedUrlApp.url, name: searchedUrlApp.title, icon: searchedUrlApp.icon, description: searchedUrlApp.description, type: searchedUrlApp.type }"
              :opening="isOpeningUrl(searchedUrlApp.url)"
              :disabled="isOpeningAny"
              :description-loading="searchedUrlApp.isLoading"
              button-testid="searched-dapp-button"
              :icon-loading-testid="`dapp-icon-loading-${toUrlTestId(searchedUrlApp.url)}`"
              :menu-testid="`searched-dapp-menu-${toUrlTestId(searchedUrlApp.url)}`"
              @open="openMiniApp(searchedUrlApp.url, searchedUrlApp.title, 'search')"
              @menu="openMenu"
            />

            <!-- Recently Viewed (shown only when not searching) -->
            <template v-if="!isSearching && filteredRecent.length > 0">
              <p class="text-lg font-bold text-space text-left">
                Recently Viewed
              </p>
              <div class="flex flex-col gap-4 text-left">
                <AnimatePresence :initial="false">
                  <SwipeToDeleteRow
                    v-for="dapp in filteredRecent"
                    :key="dapp.url"
                    :disabled="isOpeningAny"
                    :delete-label="`Remove ${dapp.name} from Recently Viewed`"
                    :delete-testid="`recent-dapp-delete-${dapp.testId}`"
                    @launch="openMiniApp(dapp.url, dapp.name, 'recent')"
                    @delete="store.removeRecentlyViewed(dapp.url)"
                  >
                    <MiniAppRow
                      :dapp="dapp"
                      :opening="isOpeningUrl(dapp.url)"
                      :disabled="isOpeningAny"
                      :tappable="false"
                      :removable="true"
                      :button-testid="`recent-dapp-button-${dapp.testId}`"
                      :menu-testid="`recent-dapp-menu-${dapp.testId}`"
                      @menu="openMenu"
                    />
                  </SwipeToDeleteRow>
                </AnimatePresence>
              </div>
            </template>

            <!-- Loading skeleton (first launch with no cache) -->
            <template v-if="isLoading">
              <p class="text-lg font-bold text-space text-left">
                Featured Apps
              </p>
              <div class="flex flex-col gap-4">
                <div v-for="i in 3" :key="i" class="flex items-center gap-3">
                  <IonSkeletonText :animated="true" class="w-14 h-14 rounded-full shrink-0" />
                  <div class="flex flex-col gap-1 flex-1">
                    <IonSkeletonText :animated="true" class="h-4 w-1/3 rounded" />
                    <IonSkeletonText :animated="true" class="h-3 w-2/3 rounded" />
                  </div>
                </div>
              </div>
            </template>

            <!-- When searching: single "Matching Apps" list -->
            <template v-else-if="isSearching">
              <p class="text-lg font-bold text-space text-left">
                Matching Apps
              </p>
              <div class="flex flex-col gap-4 text-left">
                <MiniAppRow
                  v-for="dapp in filteredDApps"
                  :key="dapp.url"
                  :dapp="dapp"
                  :opening="isOpeningUrl(dapp.url)"
                  :disabled="isOpeningAny"
                  :button-testid="`featured-dapp-button-${toUrlTestId(dapp.url)}`"
                  :subtitle-testid="`featured-dapp-subtitle-${toUrlTestId(dapp.url)}`"
                  :icon-loading-testid="`dapp-icon-loading-${toUrlTestId(dapp.url)}`"
                  :menu-testid="`search-result-menu-${toUrlTestId(dapp.url)}`"
                  @open="openMiniApp(dapp.url, dapp.name, 'featured')"
                  @menu="openMenu"
                />
                <p
                  v-if="filteredDApps.length === 0"
                  class="text-sm text-space/60"
                >
                  No apps found.
                </p>
              </div>
            </template>

            <!-- When not searching: Featured Apps + All Apps sections -->
            <template v-else>
              <!-- Featured Apps -->
              <template v-if="filteredFeatured.length > 0">
                <p class="text-lg font-bold text-space text-left">
                  Featured Apps
                </p>
                <div class="flex flex-col gap-4 text-left">
                  <MiniAppRow
                    v-for="dapp in filteredFeatured"
                    :key="dapp.url"
                    :dapp="dapp"
                    :opening="isOpeningUrl(dapp.url)"
                    :disabled="isOpeningAny"
                    :button-testid="`featured-dapp-button-${toUrlTestId(dapp.url)}`"
                    :subtitle-testid="`featured-dapp-subtitle-${toUrlTestId(dapp.url)}`"
                    :icon-loading-testid="`dapp-icon-loading-${toUrlTestId(dapp.url)}`"
                    :menu-testid="`featured-dapp-menu-${toUrlTestId(dapp.url)}`"
                    @open="openMiniApp(dapp.url, dapp.name, 'featured')"
                    @menu="openMenu"
                  />
                </div>
              </template>

              <!-- All Apps -->
              <template v-if="filteredNonFeatured.length > 0">
                <p class="text-lg font-bold text-space text-left">
                  All Apps
                </p>
                <div class="flex flex-col gap-4 text-left">
                  <MiniAppRow
                    v-for="dapp in filteredNonFeatured"
                    :key="dapp.url"
                    :dapp="dapp"
                    :opening="isOpeningUrl(dapp.url)"
                    :disabled="isOpeningAny"
                    :button-testid="`dapp-button-${toUrlTestId(dapp.url)}`"
                    :icon-loading-testid="`dapp-icon-loading-${toUrlTestId(dapp.url)}`"
                    :menu-testid="`dapp-menu-${toUrlTestId(dapp.url)}`"
                    @open="openMiniApp(dapp.url, dapp.name, 'featured')"
                    @menu="openMenu"
                  />
                </div>
              </template>

              <!-- Type-filter empty state (no recent + no featured + no non-featured under the active filter) -->
              <p
                v-if="isFilterActive && !hasAnyResults"
                class="text-sm text-space/60 text-center py-6"
              >
                {{ filterEmptyLabel }}
              </p>
            </template>
          </div>
        </section>

        <section
          data-testid="mini-apps-flow-competition"
          class="h-full w-1/3 shrink-0"
          :class="{ 'pointer-events-none': flowStep !== 'competition' }"
          :aria-hidden="flowStep !== 'competition'"
          :inert="flowStep !== 'competition'"
        >
          <MiniAppsCompetitionView @select="openCompetitionApp" />
        </section>

        <section
          data-testid="mini-apps-flow-competition-detail"
          class="h-full w-1/3 min-w-0 shrink-0 overflow-hidden px-6"
          :class="{ 'pointer-events-none': flowStep !== 'competitionDetail' }"
          :aria-hidden="flowStep !== 'competitionDetail'"
          :inert="flowStep !== 'competitionDetail'"
        >
          <CompetitionAppDetail
            v-if="selectedCompetitionApp"
            :key="selectedCompetitionApp.url"
            :app="selectedCompetitionApp"
            :opening="isOpeningSelectedCompetitionApp"
            @open="launchCompetitionApp"
            @open-external="openCompetitionExternal"
          />
        </section>
      </motion.div>
    </div>

    <MiniAppActionsSheet
      v-model:open="menuOpen"
      :context="menuContext"
      @remove="menuContext && store.removeRecentlyViewed(menuContext.app.url)"
    />
  </ModalTemplate>
</template>

<style scoped>
.mini-apps-flow {
  height: calc(100dvh - 5.5rem - var(--ion-safe-area-top, 0px) - var(--ion-safe-area-bottom, 0px));
}

.mini-app-searchbar {
  --background: transparent;
  --border-radius: 9999px;
  --box-shadow: none;
  --placeholder-color: theme('colors.space.DEFAULT / 60%');
  --icon-color: theme('colors.space.DEFAULT / 40%');
  --clear-button-color: theme('colors.space.DEFAULT / 40%');
}

.mini-apps-flow-step {
  scrollbar-width: none;
}

.mini-apps-flow-step::-webkit-scrollbar {
  display: none;
}
</style>
