import type { WidgetData, WidgetManifest } from '@/lib/mini-app-widgets'
import type { NetworkMode } from '@/lib/network'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { isTestnet } from '@/lib'
import { fetchWidgetData } from '@/lib/mini-app-widgets'
import { kv, useApp } from '@/stores/app'
import { useLocalWallet } from '@/stores/local-wallet'
import { stripTrailingSlash } from '@/stores/mini-apps'

const logger = useLogger('MiniAppWidgets')

export interface HomeWidget {
  appUrl: string
  appName: string
  manifest: WidgetManifest
  /** Network the cached `data` was fetched on. */
  network: NetworkMode
  data?: WidgetData
  fetchedAt?: number
  /** Last failed refresh; cleared by the next successful one. */
  failedAt?: number
}

export const MAX_HOME_WIDGETS = 3
// Floor between automatic refreshes of one widget, also after a failure. Pull-to-refresh ignores it.
const MIN_REFRESH_INTERVAL_MS = 60_000

function isSameApp(a: string, b: string): boolean {
  return stripTrailingSlash(a) === stripTrailingSlash(b)
}

export const useMiniAppWidgets = defineStore('mini-app-widgets', () => {
  const network: NetworkMode = isTestnet ? 'testnet' : 'mainnet'

  // kv() so widgets and the address consent they carry clear on logout with other user data.
  const stored = useStorageAsync<HomeWidget[]>('miniAppWidgets', [], kv(), { writeDefaults: false })

  // Data cached on the other network is never shown; the next refresh replaces it.
  const widgets = computed(() => stored.value.map(widget => widget.network === network
    ? widget
    : { ...widget, data: undefined, fetchedAt: undefined }))

  const inFlight = reactive(new Set<string>())
  const lastAttemptAt = new Map<string, number>()

  const canAddWidget = computed(() => stored.value.length < MAX_HOME_WIDGETS)

  function isOnHome(appUrl: string): boolean {
    return stored.value.some(widget => isSameApp(widget.appUrl, appUrl))
  }

  function updateWidget(appUrl: string, patch: Partial<HomeWidget>) {
    // A widget removed while its request was in flight stays removed.
    stored.value = stored.value.map(widget => isSameApp(widget.appUrl, appUrl) ? { ...widget, ...patch } : widget)
  }

  function addWidget(app: { url: string, name: string }, manifest: WidgetManifest) {
    if (isOnHome(app.url) || !canAddWidget.value)
      return
    stored.value = [...stored.value, { appUrl: app.url, appName: app.name, manifest, network }]
    void refresh(app.url, true)
  }

  function removeWidget(appUrl: string) {
    stored.value = stored.value.filter(widget => !isSameApp(widget.appUrl, appUrl))
  }

  function isDue(widget: HomeWidget, now: number): boolean {
    if (now - (lastAttemptAt.get(widget.appUrl) ?? 0) < MIN_REFRESH_INTERVAL_MS)
      return false
    if (widget.network !== network || !widget.data || !widget.fetchedAt)
      return true
    if (now - widget.fetchedAt >= widget.data.refresh * 1000)
      return true
    // One extra refresh once a countdown runs out, so "ready in" turns into the next state.
    const untilMs = (widget.data.countdown?.until ?? Number.POSITIVE_INFINITY) * 1000
    return now >= untilMs && widget.fetchedAt < untilMs
  }

  /** Refreshes every widget that is due, or `appUrl`'s only. `force` skips the due check (pull-to-refresh). */
  async function refresh(appUrl?: string, force = false) {
    const now = Date.now()
    const due = stored.value.filter(widget =>
      (!appUrl || isSameApp(widget.appUrl, appUrl))
      && !inFlight.has(widget.appUrl)
      && (force || isDue(widget, now)))
    if (!due.length)
      return

    const params = {
      address: useLocalWallet().localAddress.toUserFriendlyAddress(),
      network,
      lang: useApp().language,
    }
    await Promise.all(due.map(async (widget) => {
      inFlight.add(widget.appUrl)
      lastAttemptAt.set(widget.appUrl, now)
      try {
        const data = await fetchWidgetData(widget.manifest, widget.appUrl, params)
        updateWidget(widget.appUrl, { data, network, fetchedAt: Date.now(), failedAt: undefined })
      }
      catch (error) {
        logger.warn('Widget refresh failed', widget.appUrl, error)
        updateWidget(widget.appUrl, { failedAt: Date.now() })
      }
      finally {
        inFlight.delete(widget.appUrl)
      }
    }))
  }

  return {
    widgets,
    canAddWidget,
    isOnHome,
    addWidget,
    removeWidget,
    refresh,
  }
})
