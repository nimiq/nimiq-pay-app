<script setup lang="ts">
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'
import { IonSearchbar, IonSkeletonText } from '@ionic/vue'
import { computedAsync } from '@vueuse/core'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import LoadingSpinnerIcon from '@/components/icons/loading-spinner.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { MiniAppHost } from '@/composables/useMiniAppHost'
import { useToast } from '@/composables/useToast'
import { trackDAppClosed, trackDAppOpened } from '@/lib/analytics'
import { requestUserConfirmation } from '@/lib/mini-app-confirmation'
import { getFaviconUrl } from '@/lib/site-metadata'
import { useMiniApps } from '@/stores/mini-apps'
import { normalizeMiniAppUrl, useMiniAppSearch } from './mini-app-search'

const logger = useLogger('MiniAppModal')
const evmRpcUrls: Record<string, string> = {
  '0x1': import.meta.env.VITE_ETHEREUM_RPC_URL,
  '0x89': import.meta.env.VITE_POLYGON_RPC_URL,
  '0xa4b1': import.meta.env.VITE_ARBITRUM_RPC_URL,
  '0xa': import.meta.env.VITE_OPTIMISM_RPC_URL,
  '0x2105': import.meta.env.VITE_BASE_RPC_URL,
  '0x38': import.meta.env.VITE_BNB_RPC_URL,
  '0xaa36a7': import.meta.env.VITE_SEPOLIA_RPC_URL,
}

// Pre-cache web3-provider script for instant injection when opening mini-apps
const web3ProviderScript = computedAsync(
  () => fetch('/web3-provider.js').then(res => res.text()),
  null,
)

const FALLBACK_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxZjIzNDgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0ibHVjaWRlIGx1Y2lkZS1nbG9iZS1pY29uIGx1Y2lkZS1nbG9iZSI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgMmExNC41IDE0LjUgMCAwIDAgMCAyMCAxNC41IDE0LjUgMCAwIDAgMC0yMCIvPjxwYXRoIGQ9Ik0yIDEyaDIwIi8+PC9zdmc+'

const { popularDApps, searchedDescriptions, descriptionTexts, ensureDescription, addRecentlyViewed } = useMiniApps()
const { recentDAppsWithDescriptions } = storeToRefs(useMiniApps())

const searchQuery = ref('')
const { filteredApps: filteredDApps } = useMiniAppSearch(searchQuery, popularDApps, descriptionTexts)
const normalizedSearchUrl = computed(() => normalizeMiniAppUrl(searchQuery.value))
const featuredLabel = computed(() => searchQuery.value.trim() ? 'Matching Apps' : 'Featured Apps')
const openingUrl = ref<string | null>(null)
const isOpeningAny = computed(() => openingUrl.value !== null)

const searchedUrlApp = computed(() => {
  const url = normalizedSearchUrl.value
  if (!url)
    return undefined

  const matchedFeaturedApp = popularDApps.find(dapp => normalizeMiniAppUrl(dapp.url) === url)
  const fallbackTitle = new URL(url).hostname

  return {
    url,
    title: matchedFeaturedApp?.name || fallbackTitle,
    description: searchedDescriptions[url]?.text || matchedFeaturedApp?.description,
    icon: matchedFeaturedApp?.icon || getFaviconUrl(url),
    isLoading: searchedDescriptions[url]?.status === 'loading',
  }
})

watch(normalizedSearchUrl, (url) => {
  if (url)
    void ensureDescription(url)
}, { immediate: true })

function isOpeningUrl(url: string): boolean {
  const normalizedUrl = normalizeMiniAppUrl(url)
  return !!normalizedUrl && openingUrl.value === normalizedUrl
}

function toUrlTestId(url: string): string {
  const normalizedUrl = normalizeMiniAppUrl(url) || url
  return normalizedUrl.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

async function openMiniApp(url?: string, title?: string, source: 'featured' | 'recent' | 'search' = 'search') {
  const searchedUrl = normalizeMiniAppUrl(searchQuery.value)
  const targetUrl = normalizeMiniAppUrl(url || searchedUrl || '')

  if (isOpeningAny.value)
    return

  if (!targetUrl) {
    useToast().setToast({
      message: 'Enter a valid app URL',
      type: 'error',
    })
    return
  }

  const appTitle = title || (searchedUrl ? searchedUrlApp.value?.title : undefined) || 'Mini App'
  let host: MiniAppHost | null = null
  openingUrl.value = targetUrl

  try {
    // Create the mini app host with configuration
    host = new MiniAppHost(InAppBrowser, {
      url: targetUrl,
      title: appTitle,
      requestUserConfirmation,
      evmRpcUrls,
    })

    // TODO: Webview opening and lifecycle handling could be moved into the MiniAppHost class constructor
    // Use pre-cached script if available, fallback to fetch if not yet loaded
    const cachedScript = web3ProviderScript.value
    const scriptContent = cachedScript !== null ? cachedScript : await fetch('/web3-provider.js').then(res => res.text())

    // Just in casa, clear cookies
    // TODO: think a better fix, some dApps use cookies to keep account session, maybe allow dapps approved in the past to get address without confirmation
    await InAppBrowser.clearAllCookies()

    await InAppBrowser.openWebView({
      url: targetUrl,
      title: appTitle,
      toolbarType: ToolBarType.NAVIGATION,
      preventDeeplink: true,
      showReloadButton: true,
      enabledSafeBottomMargin: true,
      useTopInset: true,
      activeNativeNavigationForWebview: true,
      isPresentAfterPageLoad: true,
      preShowScript: scriptContent,
      preShowScriptInjectionTime: 'documentStart',
    })
    await ScreenOrientation.unlock()

    const openedAt = Date.now()
    trackDAppOpened(targetUrl, appTitle, source)

    addRecentlyViewed({ url: targetUrl, name: appTitle, icon: getFaviconUrl(targetUrl), description: searchedUrlApp.value?.description })

    InAppBrowser.addListener('closeEvent', async () => {
      logger.log('Mini-app webview closed, destroying host')
      trackDAppClosed(targetUrl, appTitle, Date.now() - openedAt)
      await host?.destroy()
      await ScreenOrientation.lock({ orientation: 'portrait' })
    })
  }
  catch (err) {
    logger.error('Failed to open mini-app:', err)
    useToast().setToast({
      message: 'Could not open the mini-app webview',
      type: 'error',
    })

    if (host)
      await host.destroy()
  }
  finally {
    openingUrl.value = null
  }
}
</script>

<template>
  <ModalTemplate :close-all="true">
    <div class="w-full h-full flex flex-col gap-6">
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

      <button
        v-if="searchedUrlApp"
        data-testid="searched-dapp-button"
        class="flex items-center gap-3 text-left transition-opacity"
        :class="{ 'opacity-50 cursor-not-allowed': isOpeningAny }"
        :disabled="isOpeningAny"
        @click="openMiniApp(searchedUrlApp.url, searchedUrlApp.title, 'search')"
      >
        <div class="relative w-14 h-14 shrink-0">
          <img
            :src="searchedUrlApp.icon"
            :alt="searchedUrlApp.title"
            class="w-14 h-14 rounded-full object-contain bg-white/10 p-1 transition-opacity"
            :class="{ 'opacity-40': isOpeningUrl(searchedUrlApp.url) }"
            @error="($event.target as HTMLImageElement).src = FALLBACK_ICON"
          >
          <motion.div
            v-if="isOpeningUrl(searchedUrlApp.url)"
            :data-testid="`dapp-icon-loading-${toUrlTestId(searchedUrlApp.url)}`"
            class="absolute inset-0 flex items-center justify-center"
            :initial="{ opacity: 0, scale: 0.85 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.16, ease: 'easeOut' }"
          >
            <LoadingSpinnerIcon class="size-6" />
          </motion.div>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="font-bold text-base truncate">{{ searchedUrlApp.title }}</span>
          <span class="text-xs text-space/60 truncate">{{ searchedUrlApp.url }}</span>
          <span
            v-if="searchedUrlApp.description"
            class="text-sm text-space/50 truncate"
          >
            {{ searchedUrlApp.description }}
          </span>
          <IonSkeletonText v-else-if="searchedUrlApp.isLoading" :animated="true" class="h-4 w-3/4 rounded" />
        </div>
      </button>

      <!-- Recently Viewed (shown only when not searching) -->
      <template v-if="!searchQuery.trim() && recentDAppsWithDescriptions.length > 0">
        <p class="text-lg font-bold text-space text-left">
          Recently Viewed
        </p>
        <div class="flex flex-col gap-4 text-left">
          <button
            v-for="dapp in recentDAppsWithDescriptions"
            :key="dapp.url"
            class="flex items-center gap-3 text-left transition-opacity"
            :class="{ 'opacity-50 cursor-not-allowed': isOpeningAny }"
            :disabled="isOpeningAny"
            @click="openMiniApp(dapp.url, dapp.name, 'recent')"
          >
            <div class="relative w-14 h-14 shrink-0">
              <img
                :src="dapp.icon"
                :alt="dapp.name"
                class="w-14 h-14 rounded-full object-contain bg-white/10 p-1 transition-opacity"
                :class="{ 'opacity-40': isOpeningUrl(dapp.url) }"
                @error="($event.target as HTMLImageElement).src = FALLBACK_ICON"
              >
              <motion.div
                v-if="isOpeningUrl(dapp.url)"
                class="absolute inset-0 flex items-center justify-center"
                :initial="{ opacity: 0, scale: 0.85 }"
                :animate="{ opacity: 1, scale: 1 }"
                :transition="{ duration: 0.16, ease: 'easeOut' }"
              >
                <LoadingSpinnerIcon class="w-6 h-6 text-space" />
              </motion.div>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-bold text-base">{{ dapp.name }}</span>
              <motion.span
                :key="dapp.description || dapp.url"
                class="text-sm text-space/50 truncate"
                :initial="{ opacity: 0, y: 4 }"
                :animate="{ opacity: 1, y: 0 }"
                :transition="{ duration: 0.16, ease: 'easeOut' }"
              >
                {{ dapp.description || dapp.url }}
              </motion.span>
            </div>
          </button>
        </div>
      </template>

      <!-- Featured Apps -->
      <p class="text-lg font-bold text-space text-left">
        {{ featuredLabel }}
      </p>
      <div class="flex flex-col gap-4 text-left">
        <button
          v-for="dapp in filteredDApps"
          :key="dapp.url"
          :data-testid="`featured-dapp-button-${toUrlTestId(dapp.url)}`"
          class="flex items-center gap-3 text-left transition-opacity"
          :class="{ 'opacity-50 cursor-not-allowed': isOpeningAny }"
          :disabled="isOpeningAny"
          @click="openMiniApp(dapp.url, dapp.name, 'featured')"
        >
          <div class="relative w-14 h-14 shrink-0">
            <img
              :src="dapp.icon"
              :alt="dapp.name"
              class="w-14 h-14 rounded-full object-contain bg-white/10 p-1 transition-opacity"
              :class="{ 'opacity-40': isOpeningUrl(dapp.url) }"
              @error="($event.target as HTMLImageElement).src = FALLBACK_ICON"
            >
            <motion.div
              v-if="isOpeningUrl(dapp.url)"
              :data-testid="`dapp-icon-loading-${toUrlTestId(dapp.url)}`"
              class="absolute inset-0 flex items-center justify-center"
              :initial="{ opacity: 0, scale: 0.85 }"
              :animate="{ opacity: 1, scale: 1 }"
              :transition="{ duration: 0.16, ease: 'easeOut' }"
            >
              <LoadingSpinnerIcon class="w-6 h-6 text-space" />
            </motion.div>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-bold text-base">{{ dapp.name }}</span>
            <motion.span
              :key="dapp.description || dapp.url"
              :data-testid="`featured-dapp-subtitle-${toUrlTestId(dapp.url)}`"
              class="text-sm text-space/50 truncate"
              :initial="{ opacity: 0, y: 4 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.16, ease: 'easeOut' }"
            >
              {{ dapp.description || dapp.url }}
            </motion.span>
          </div>
        </button>
        <p
          v-if="filteredDApps.length === 0"
          class="text-sm text-space/60"
        >
          No apps found.
        </p>
      </div>
    </div>
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
