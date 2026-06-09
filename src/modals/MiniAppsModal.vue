<script setup lang="ts">
import type { TypeFilterValue } from '@/components/MiniAppTypeFilter.vue'
import type { DAppOpenSource } from '@/lib/analytics'
import type { MiniAppMenuContext, MiniAppType } from '@/stores/mini-apps'
import { IonSearchbar, IonSkeletonText } from '@ionic/vue'
import { useStorageAsync } from '@vueuse/core'
import { AnimatePresence } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import MiniAppActionsSheet from '@/components/MiniAppActionsSheet.vue'
import MiniAppRow from '@/components/MiniAppRow.vue'
import MiniAppTypeFilter from '@/components/MiniAppTypeFilter.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow.vue'
import { launchMiniApp, openingMiniAppUrl, warmUpWeb3ProviderScript } from '@/lib/mini-app-launcher'
import { getFaviconUrl } from '@/lib/site-metadata'
import { kvPreferences, useApp } from '@/stores/app'
import { useMiniApps } from '@/stores/mini-apps'
import { normalizeMiniAppUrl, useMiniAppSearch } from './mini-app-search'

type InAppDAppSource = Exclude<DAppOpenSource, 'deeplink'>

onMounted(() => warmUpWeb3ProviderScript())

const store = useMiniApps()
const { popularDApps, featuredDApps, nonFeaturedDApps, isLoading, descriptionTexts, recentDAppsWithDescriptions } = storeToRefs(store)
const { searchedDescriptions, ensureDescription } = store

const recentDAppsWithTestIds = computed(() =>
  (recentDAppsWithDescriptions.value ?? []).map(dapp => ({ ...dapp, testId: toUrlTestId(dapp.url) })),
)
const { language, selectedFiat } = storeToRefs(useApp())

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
const hasAnyResults = computed(() =>
  filteredFeatured.value.length > 0 || filteredNonFeatured.value.length > 0 || filteredRecent.value.length > 0,
)
const filterEmptyLabel = computed(() =>
  typeFilter.value === 'nimiq' ? 'No Nimiq apps yet. Check back soon.' : 'No EVM apps yet. Check back soon.',
)
const normalizedSearchUrl = computed(() => normalizeMiniAppUrl(searchQuery.value))
const featuredLabel = computed(() => isSearching.value ? 'Matching Apps' : 'Featured Apps')
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
</script>

<template>
  <ModalTemplate :close-all="true">
    <div class="w-full h-full flex flex-col gap-6 pb-8">
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
      <template v-if="!searchQuery.trim() && filteredRecent.length > 0">
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
          {{ featuredLabel }}
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

    <MiniAppActionsSheet
      v-model:open="menuOpen"
      :context="menuContext"
      @remove="menuContext && store.removeRecentlyViewed(menuContext.app.url)"
    />
  </ModalTemplate>
</template>

<style scoped>
.mini-app-searchbar {
  --background: transparent;
  --border-radius: 9999px;
  --box-shadow: none;
  --placeholder-color: theme('colors.space.DEFAULT / 60%');
  --icon-color: theme('colors.space.DEFAULT / 40%');
  --clear-button-color: theme('colors.space.DEFAULT / 40%');
}
</style>
