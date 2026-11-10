<script setup lang="ts">
import type { WidgetView } from '@/stores/mini-app-widgets'
import type { MiniAppMenuContext } from '@/stores/mini-apps'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import AddWidgetsPill from '@/components/AddWidgetsPill.vue'
import MiniAppActionsSheet from '@/components/MiniAppActionsSheet.vue'
import MiniAppWidget from '@/components/MiniAppWidget.vue'
import { Modal, useModal } from '@/composables/useModal'
import { requestUserConfirmation } from '@/lib/mini-app-confirmation'
import { launchMiniApp } from '@/lib/mini-app-launcher'
import { WIDGET_GRID_CLASS } from '@/lib/mini-app-widgets'
import { useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { TICK_MS, useMiniAppWidgets } from '@/stores/mini-app-widgets'
import { useMiniApps } from '@/stores/mini-apps'

const widgets = useMiniAppWidgets()
const { ready, views } = storeToRefs(widgets)
const { isAppInBackground, isHomeVisible } = storeToRefs(useLocks())
const { showModal } = useModal()
const documentVisibility = useDocumentVisibility()
const isActive = computed(() => views.value.length > 0 && isHomeVisible.value && !isAppInBackground.value && documentVisibility.value === 'visible')

watch(isActive, (active) => {
  if (active)
    void widgets.tick()
}, { immediate: true })
useIntervalFn(() => {
  if (isActive.value)
    void widgets.tick()
}, TICK_MS)

const menuView = ref<WidgetView>()
const menuOpen = ref(false)
const menuContext = computed<MiniAppMenuContext | null>(() => {
  const view = menuView.value
  if (!view)
    return null
  return {
    app: { name: view.appName, url: view.scope, icon: view.appIcon },
    address: view.appAddress,
    shareable: view.url !== undefined,
    reportUrl: useMiniApps().getMiniAppReportUrl(view.scope),
    removable: false,
    widget: { size: view.size, sizes: view.sizes },
    newName: view.pendingAppName,
    sharesAddresses: view.sharesAddresses,
    newImages: view.pendingImages,
    newPermissions: view.pendingPermissions,
  }
})

function openMenu(view: WidgetView) {
  menuView.value = view
  menuOpen.value = true
}

async function allowPermissions(view: WidgetView) {
  const permissions = widgets.missingPermissions(view.scope, view.widgetId)
  if (!permissions.length)
    return
  if (await requestUserConfirmation({ type: 'widgetPermissions', url: view.scope, widgetName: widgets.widgetName(view.scope, view.widgetId) }))
    widgets.grantPermissions(view.scope, view.widgetId, permissions)
}

function openGallery(source: 'home_widgets' | 'home_widgets_empty') {
  showModal(Modal.MiniApps, { componentProps: { initialStep: 'widgets' }, analytics: { featureName: 'mini_apps', source } })
}

function open(view: WidgetView, url: string) {
  const app = useApp()
  void launchMiniApp({ url, title: view.launchTitle, source: 'home_widget', icon: view.appIcon, language: app.language, userFiat: app.selectedFiat })
}
</script>

<template>
  <section v-if="views.length" data-testid="home-widgets" class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-space">
        {{ $t('Widgets') }}
      </h2>
      <button
        type="button"
        data-testid="home-widgets-add"
        class="relative rounded-full px-3 py-1 text-sm font-bold before:absolute before:inset-x-0 before:content-[''] before:-inset-y-2 text-sky transition-colors active:bg-sky/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
        @click="openGallery('home_widgets')"
      >
        {{ $t('Add') }}
      </button>
    </div>
    <div :class="WIDGET_GRID_CLASS">
      <MiniAppWidget
        v-for="view in views"
        :key="view.key"
        :view="view"
        @open="url => open(view, url)"
        @menu="openMenu(view)"
      />
    </div>
    <MiniAppActionsSheet
      v-model:open="menuOpen"
      :context="menuContext"
      @size="size => { if (menuView) { widgets.setSize(menuView.scope, menuView.widgetId, size); void widgets.tick({ force: true }) } }"
      @remove-widget="menuView && widgets.remove(menuView.scope, menuView.widgetId)"
      @use-new-images="menuView && widgets.openImageReview(menuView.scope, menuView.widgetId)"
      @use-permissions="menuView && allowPermissions(menuView)"
      @stop-sharing="menuView && widgets.revokePermissions(menuView.scope, menuView.widgetId)"
      @use-new-name="menuView?.pendingAppName && widgets.approveName(menuView.scope, menuView.pendingAppName)"
    />
  </section>
  <AddWidgetsPill
    v-else-if="ready"
    data-testid="home-widgets-add-empty"
    @click="openGallery('home_widgets_empty')"
  >
    {{ $t('Add widgets') }}
  </AddWidgetsPill>
</template>
