<script setup lang="ts">
import type { WidgetDefinition, WidgetSize } from '@/lib/mini-app-widgets'
import { IonSkeletonText } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import MiniAppWidget from '@/components/MiniAppWidget.vue'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { applyIconFallback } from '@/lib/mini-app-icons'
import { localizeDefinition, WIDGET_LIMITS, WIDGET_SIZES } from '@/lib/mini-app-widgets'
import { safeOrigin } from '@/lib/url-safety'
import { useApp } from '@/stores/app'
import { useMiniAppWidgets } from '@/stores/mini-app-widgets'
import { useMiniApps } from '@/stores/mini-apps'

const { active } = defineProps<{ active: boolean }>()

const widgets = useMiniAppWidgets()
const { recentlyViewedDApps } = storeToRefs(useMiniApps())
const toast = useToast()
const app = useApp()

const scopes = computed(() => widgets.galleryScopesFor([...new Set(recentlyViewedDApps.value.map(dapp => safeOrigin(dapp.url, '')).filter(Boolean))]))

watch([() => active, scopes], async ([isActive, list]) => {
  if (!isActive)
    return
  await widgets.loadGallery(list)
  const definitions = list.flatMap((scope) => {
    const file = widgets.galleryFiles.get(scope)
    return file && file !== 'loading' ? file.widgets : []
  })
  if (definitions.length)
    void widgets.resolvePreviews(definitions)
}, { immediate: true })

const isLoading = computed(() => scopes.value.some(scope => widgets.galleryFiles.get(scope) === 'loading'))

// Literal calls, so the i18n extraction finds every size name.
const sizeLabels = computed<Record<WidgetSize, string>>(() => ({ icon: i18n.t('Icon'), small: i18n.t('Small'), medium: i18n.t('Medium'), large: i18n.t('Large') }))

const sections = computed(() => scopes.value.flatMap((scope) => {
  const file = widgets.galleryFiles.get(scope)
  if (!file || file === 'loading' || !file.widgets.length)
    return []
  return [{
    scope,
    items: file.widgets.map((definition) => {
      const { name, description } = localizeDefinition(definition, app.language)
      return {
        definition,
        name,
        description,
        sizes: WIDGET_SIZES.filter(size => definition.sizes.includes(size)).map(size => sizeLabels.value[size]).join(' · '),
        view: widgets.previewView(scope, definition),
        onHome: widgets.isOnHome(scope, definition.id),
      }
    }),
  }]
}))

function add(scope: string, definition: WidgetDefinition) {
  if (!widgets.add(scope, definition))
    toast.setToast({ message: i18n.t('Home holds at most {count} widgets', { count: WIDGET_LIMITS.widgetsOnHome }), type: 'error' })
}
</script>

<template>
  <div class="flex min-h-full w-full flex-col gap-6 px-6 pb-8 text-left" data-testid="mini-app-widget-gallery">
    <p class="text-2xl font-bold">
      {{ $t('Widgets') }}
    </p>

    <section v-for="section in sections" :key="section.scope" class="flex flex-col gap-3" :data-testid="`gallery-app-${section.scope}`">
      <div class="flex min-w-0 items-center gap-2">
        <img :src="section.items[0]!.view.appIcon" alt="" class="size-6 shrink-0 rounded-full object-contain" referrerpolicy="no-referrer" @error="applyIconFallback($event, section.scope)">
        <p class="truncate text-lg font-bold text-space">
          {{ section.items[0]!.view.appName }}
        </p>
      </div>
      <div v-for="item in section.items" :key="item.definition.id" class="flex flex-col gap-3 rounded-2xl bg-space/[0.04] p-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-bold text-space">
              {{ item.name }}
            </p>
            <p v-if="item.description" class="text-sm text-space/60">
              {{ item.description }}
            </p>
            <p class="text-xs text-space/50">
              {{ item.sizes }}
            </p>
          </div>
          <button
            type="button"
            :data-testid="`gallery-add-${item.definition.id}`"
            :disabled="item.onHome"
            class="relative shrink-0 rounded-full px-4 py-1.5 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            :class="item.onHome ? 'bg-space/[0.06] text-space/50' : 'bg-sky text-white active:bg-sky/80'"
            @click="add(section.scope, item.definition)"
          >
            {{ item.onHome ? $t('On Home') : $t('Add') }}
          </button>
        </div>
        <div class="grid grid-cols-4 gap-3">
          <MiniAppWidget :view="item.view" preview />
        </div>
      </div>
    </section>

    <div v-if="isLoading" data-testid="gallery-loading" class="flex flex-col gap-3">
      <IonSkeletonText :animated="true" class="h-5 w-1/3 rounded" />
      <IonSkeletonText :animated="true" class="h-24 w-full rounded-2xl" />
    </div>

    <p class="text-center text-sm text-space/60">
      {{ $t('Only Mini Apps you\'ve opened appear here.') }}
    </p>
  </div>
</template>
