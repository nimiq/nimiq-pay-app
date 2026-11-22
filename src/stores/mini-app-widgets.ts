import type { WidgetChain } from '@/lib/mini-app-widget-chain'
import type { FetchOutcome } from '@/lib/mini-app-widget-sources'
import type {
  WidgetChart,
  WidgetContent,
  WidgetDefinition,
  WidgetDemo,
  WidgetFile,
  WidgetImage,
  WidgetPermission,
  WidgetRefresh,
  WidgetSize,
  WidgetState,
  WidgetTone,
  WidgetValue,
} from '@/lib/mini-app-widgets'
import type { NetworkMode } from '@/lib/network'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { hasMiniAppSession, isMiniAppActive } from '@/lib/mini-app-active'
import { MINI_APP_FALLBACK_ICON } from '@/lib/mini-app-icons'
import { createWidgetChain, evaluateTrigger, needsLookup } from '@/lib/mini-app-widget-chain'
import { canDownloadWidgets } from '@/lib/mini-app-widget-download'
import { fetchWidgetFile, fetchWidgetImage, fetchWidgetRefresh, findWidgetFile } from '@/lib/mini-app-widget-sources'
import { imageIn, imagesInState, localizeDefinition, WIDGET_LIMITS, widgetScopeCandidates } from '@/lib/mini-app-widgets'
import { safeOrigin } from '@/lib/url-safety'
import { kv, useApp } from '@/stores/app'
import { useFeatureFlags } from '@/stores/feature-flags'
import { stripTrailingSlash, useMiniApps } from '@/stores/mini-apps'
import { useNimiqNetwork } from '@/stores/nimiq-network'

const logger = useLogger('MiniAppWidgets')

export interface HomeWidget {
  /** The folder the widget file was found in, ending in `/`. Identity, not a security boundary. */
  scope: string
  widgetId: string
  network: NetworkMode
  size: WidgetSize
  definition: WidgetDefinition
  definitionCheckedAt: number
  /** A name the widget file now declares and the user has not approved; `definition` keeps the approved one. */
  pendingAppName?: string
  /** undefined means the resting state. */
  state?: WidgetState
  /** The last image its card could draw, kept until the one it wants now is ready. */
  shownImage?: WidgetImage
  /** What the user allowed it to send, kept from install: a file cannot widen it. */
  grants?: WidgetPermission[]
  /** What the user stopped sending, which is not offered to them again unasked. */
  stopped?: WidgetPermission[]
  /** Sent with its refreshes and with the images that ask for it: set by the Mini App, never shown or read back. */
  token?: string
  /** New with each different token, to tell tokens apart without storing anything made from one. */
  tokenId?: number
  /** Why refreshes, and images with the token, stopped, until the Mini App sends a state or a token. */
  halted?: 'reconnect' | 'gone'
  /** Until when the server asked not to be contacted. */
  retryNotBefore?: number
  /** New with each state, token or install, so that an answer to an older request is ignored. */
  revision?: number
  refreshDueAt?: number
  lastAttemptAt?: number
  failures: number
  updatedAt: number
}

interface FolderCheck {
  scope: string | null
  checkedAt: number
}

export interface WidgetView {
  key: string
  scope: string
  widgetId: string
  appName: string
  /** The site the widget comes from, when the name does not already say it. */
  appAddress?: string
  /** The catalog name or the address: a declared name never reaches the signing sheets of the launched Mini App. */
  launchTitle: string
  pendingAppName?: string
  appIcon: string
  size: WidgetSize
  sizes: WidgetSize[]
  label?: string
  value: WidgetValue
  info?: string
  tone: WidgetTone
  progress?: number
  /** `left` is a demo's, which holds still. */
  countdown?: { label: string, until: number } | { label: string, left: number }
  rows: { label: string, value: WidgetValue, url?: string }[]
  chart?: WidgetChart
  url?: string
  /** After repeated refresh failures: when the content last updated. */
  staleSince?: number
  reconnect?: boolean
  sharesAddresses?: boolean
  pendingPermissions?: boolean
  stoppedPermissions?: boolean
  background?: { kind: 'image', src: string } | { kind: 'chart', chart: WidgetChart }
}

interface ImagePin { image: WidgetImage, scope: string, token?: string, tokenId?: number, notBefore?: number }
/** `refused`: the tokens that got a 401 or 403, when that is what the last attempt got. */
interface ImageFailure { count: number, retryAt: number, refused?: number[] }

interface TickOptions { chain?: WidgetChain, at?: number, force?: boolean }

export const TICK_MS = 15_000
export const STALE_AFTER_FAILURES = 3
const CHAIN_CHECK_MS = 30_000
const DAY_MS = 24 * 60 * 60_000
const RECHECK_MS = 60 * 60_000
const MAX_BACKOFF_MS = 30 * 60_000
const MIN_FORCED_REFRESH_GAP_MS = 60_000
const DOWNLOADS_AT_ONCE = 6
const DOWNLOADS_AT_ONCE_PER_SITE = 3
const IMAGE_RETRY_MS = 5 * 60_000
const MAX_IMAGE_RETRY_MS = 6 * 60 * 60_000
const WIDGETS_KEY = 'miniAppWidgets'
const IMAGE_FETCHES_KEY = 'miniAppWidgetImageFetches'
const IMAGE_FAILURES_KEY = 'miniAppWidgetImageFailures'
const imageKey = (id: string) => `miniAppWidgetImage:${id}`
// Per site: by hash alone, naming another site's image would show from the missing request whether the user has it.
const imageId = ({ url, sha256 }: WidgetImage) => `${new URL(url).origin} ${sha256}`

// Widgets stored before live values were removed: Home cannot draw them. Quotes inside texts are escaped, so only keys match.
const REMOVED_VALUES_RE = /"live":\{"(?:nimiqBalance|nimiqStake|usdtBalance|price|priceChange)"|"priceHistory":/
// Dropped while reading, as Home draws whatever the read returns, before `onReady` runs.
const storedSerializer = {
  read(raw: string): HomeWidget[] {
    const all: HomeWidget[] = JSON.parse(raw)
    return REMOVED_VALUES_RE.test(raw) ? all.filter(widget => !REMOVED_VALUES_RE.test(JSON.stringify(widget))) : all
  },
  write: (all: HomeWidget[]) => JSON.stringify(all),
}

function ungranted(widget: HomeWidget): WidgetPermission[] {
  return (widget.definition.permissions ?? []).filter(permission => !widget.grants?.includes(permission))
}

function waitingPermissions(widget: HomeWidget): WidgetPermission[] {
  return ungranted(widget).filter(permission => !widget.stopped?.includes(permission))
}

function withinBudgets(log: Record<string, number[]>, origin: string, at: number, budgets: readonly { windowMs: number, max: number }[]): boolean {
  const times = log[origin] ?? []
  return budgets.every(({ windowMs, max }) => times.filter(time => at - time < windowMs).length < max)
}

function withFetch(log: Record<string, number[]>, origin: string, at: number): Record<string, number[]> {
  const recent = Object.entries(log).map(([key, times]) => [key, times.filter(time => at - time < DAY_MS)] as const)
  const kept = Object.fromEntries(recent.filter(([, times]) => times.length))
  return { ...kept, [origin]: [...(kept[origin] ?? []), at] }
}

// By URL too: anyone can copy a hash and point it at a bad URL. Not by token, or rotating one would retry a broken image each time.
const failureKey = (image: WidgetImage) => `${imageId(image)} ${image.url}${image.sendToken ? ' token' : ''}`
// Also by token: only one of the widgets that name an image may have one the site takes.
const pinKey = ({ image, tokenId }: ImagePin) => `${failureKey(image)} ${tokenId ?? ''}`

function uniqueImages(pinned: ImagePin[]): ImagePin[] {
  return [...new Map(pinned.map(entry => [pinKey(entry), entry])).values()]
}

async function inTurns<T>(items: T[], work: (item: T) => Promise<unknown>) {
  const waiting = [...items]
  await Promise.all(Array.from({ length: DOWNLOADS_AT_ONCE }, async () => {
    for (let item = waiting.shift(); item !== undefined; item = waiting.shift())
      await work(item)
  }))
}

export function widgetKey(scope: string, widgetId: string): string {
  return `${scope}#${widgetId}`
}

export function shownState(widget: HomeWidget, now: number): WidgetState | undefined {
  const state = widget.state
  return state && (state.expiresAt === undefined || now < state.expiresAt) ? state : undefined
}

function originOf(scope: string): string {
  return new URL(scope).origin
}

function refreshOf(state: WidgetState | undefined, definition: WidgetDefinition): WidgetRefresh | undefined {
  return state ? state.refresh : definition.refresh
}

function addressOf(scope: string): string {
  const url = new URL(scope)
  return stripTrailingSlash(`${url.hostname}${url.pathname}`)
}

function byLongestWaiting(list: HomeWidget[]): HomeWidget[] {
  return [...list].sort((a, b) => (a.refreshDueAt ?? 0) - (b.refreshDueAt ?? 0))
}

function dueAt(state: WidgetState | undefined, definition: WidgetDefinition, at: number): number | undefined {
  const refresh = refreshOf(state, definition)
  // Random, so devices do not all ask a server at the same moment.
  return refresh ? at + refresh.every * 1000 + Math.random() * WIDGET_LIMITS.refreshJitterS * 1000 : undefined
}

export const useMiniAppWidgets = defineStore('mini-app-widgets', () => {
  const network: NetworkMode = isTestnet ? 'testnet' : 'mainnet'
  // Home waits for the first read, so the empty state never flashes for someone who has widgets.
  const ready = ref(false)
  // kv() so widgets clear on logout with the rest of the account.
  const stored = useStorageAsync<HomeWidget[]>(WIDGETS_KEY, [], kv(), { writeDefaults: false, serializer: storedSerializer, onReady: () => ready.value = true })
  // Launch folder → its search result, for the gallery; misses are kept too, so a site without widgets is not searched on every launch.
  const checks = useStorageAsync<Record<string, FolderCheck>>('miniAppWidgetChecks', {}, kv(), { writeDefaults: false })
  // No refresh before the read: it would go past the budget, and its record would be overwritten by the read.
  const fetchesRead = ref(false)
  // Stored, so a restart does not reset a Mini App's refresh budget.
  const fetches = useStorageAsync<Record<string, number[]>>('miniAppWidgetFetches', {}, kv(), { writeDefaults: false, onReady: () => fetchesRead.value = true })
  const imageFetchesRead = ref(false)
  // Stored like the refreshes. Gallery previews are outside it, as the user opens them.
  const imageFetches = useStorageAsync<Record<string, number[]>>(IMAGE_FETCHES_KEY, {}, kv(), { writeDefaults: false, onReady: () => {
    imageFetchesRead.value = true
    void keepImages()
  } })
  const imageFailuresRead = ref(false)
  // Noted before each attempt, and stored: Nimiq Pay reloads after 2 minutes in the background, and a huge image can end it mid-download.
  const imageFailures = useStorageAsync<Record<string, ImageFailure>>(IMAGE_FAILURES_KEY, {}, kv(), { writeDefaults: false, onReady: () => {
    imageFailuresRead.value = true
    void keepImages()
  } })
  const widgets = computed(() => stored.value.filter(w => w.network === network))
  const canAdd = computed(() => widgets.value.length < WIDGET_LIMITS.widgetsOnHome)
  function isBlocked(scope: string): boolean {
    if (!canDownloadWidgets())
      return true
    const blocked = useFeatureFlags().blockedWidgetOrigins
    return blocked.includes('*') || blocked.includes(safeOrigin(scope))
  }
  const running = computed(() => widgets.value.filter(w => !isBlocked(w.scope) && w.halted !== 'gone'))

  function canAddTo(scope: string): boolean {
    return !isBlocked(scope) && canAdd.value && listForOrigin(originOf(scope)).length < WIDGET_LIMITS.widgetsPerMiniApp
  }
  const now = ref(Date.now())
  // Block-height countdowns count from the head seen at the last tick, so they do not jump when the head moves between ticks.
  const head = ref({ height: useNimiqNetwork().height, at: now.value })
  const galleryFiles = reactive(new Map<string, WidgetFile | null | 'loading'>())
  // The gallery and `add` can use a file long after it was read.
  const filesReadAt = new Map<string, number>()
  // By image id. Kept images are read from the encrypted database; previews only live while the gallery is open.
  const images = reactive(new Map<string, string>())
  const previews = reactive(new Map<string, string>())
  // Not in the database, so that a failing one is not looked up again at every tick.
  const absentImages = new Set<string>()
  const reading = new Set<string>()
  const downloading = new Set<string>()
  // By pin, to stop one whose token went: during a preflight, the token itself hasn't left yet.
  const tokenRequests = new Map<string, AbortController>()
  // Saved instead of downloaded, so that they outlast the gallery.
  const takenPreviews = new Map<string, string>()
  let previewSession = 0
  // From the clock, so that it stays above any stored revision after a restart.
  let lastRevision = Date.now()
  const discoveries = new Map<string, Promise<FetchOutcome<{ scope: string, file: WidgetFile }>>>()
  const inFlight = new Set<string>()
  let current: Promise<void> | undefined
  let queued: { options: TickOptions, promise: Promise<void> } | undefined
  let chainStart = 0
  let lastChainCheckAt = Number.NEGATIVE_INFINITY

  function observe(at: number) {
    now.value = at
    head.value = { height: useNimiqNetwork().height, at }
  }
  // Nothing ticks while Home has no widgets, and a gallery preview's countdown needs the height.
  watch(() => useNimiqNetwork().height > 0, known => known && observe(Date.now()))

  function isWidget(w: HomeWidget, scope: string, widgetId: string): boolean {
    return w.network === network && w.scope === scope && w.widgetId === widgetId
  }

  function find(scope: string, widgetId: string) {
    return stored.value.find(w => isWidget(w, scope, widgetId))
  }

  function isOnHome(scope: string, widgetId: string): boolean {
    return !!find(scope, widgetId)
  }

  function listForScope(scope: string): string[] {
    return widgets.value.filter(w => w.scope === scope).map(w => w.widgetId)
  }

  function listForOrigin(origin: string): string[] {
    return widgets.value.filter(w => originOf(w.scope) === origin).map(w => w.widgetId)
  }

  // Maps by identity, so a widget removed while a request was in flight stays removed.
  function patch(scope: string, widgetId: string, change: (w: HomeWidget) => Partial<HomeWidget>) {
    stored.value = stored.value.map(w => isWidget(w, scope, widgetId) ? { ...w, ...change(w) } : w)
  }

  function replaceState(scope: string, widgetId: string, state: WidgetState | undefined, at: number) {
    patch(scope, widgetId, w => ({ state, failures: 0, updatedAt: at, refreshDueAt: dueAt(state, w.definition, at), revision: ++lastRevision }))
  }

  function grantable(definition: WidgetDefinition, permissions: readonly WidgetPermission[] = []): WidgetPermission[] {
    return permissions.filter(permission => definition.permissions?.includes(permission))
  }

  function askablePermissions(scope: string, widgetId: string): WidgetPermission[] {
    const widget = find(scope, widgetId)
    return widget ? ungranted(widget) : []
  }

  /** The ones the Mini App added since the user last decided, as opposed to ones the user stopped. */
  function missingPermissions(scope: string, widgetId: string): WidgetPermission[] {
    const widget = find(scope, widgetId)
    return widget ? waitingPermissions(widget) : []
  }

  function grantPermissions(scope: string, widgetId: string, permissions: WidgetPermission[]) {
    patch(scope, widgetId, w => ({ grants: grantable(w.definition, [...new Set([...(w.grants ?? []), ...permissions])]), stopped: w.stopped?.filter(p => !permissions.includes(p)) }))
  }

  function revokePermissions(scope: string, widgetId: string) {
    patch(scope, widgetId, w => ({ grants: [], stopped: [...new Set([...(w.stopped ?? []), ...(w.grants ?? [])])] }))
  }

  function add(scope: string, definition: WidgetDefinition, grants: WidgetPermission[] = []): boolean {
    if (isOnHome(scope, definition.id))
      return true
    if (!canAddTo(scope))
      return false
    const at = Date.now()
    const hasSiblings = listForScope(scope).length > 0
    // The user has seen it, and the gallery may close before it is stored.
    for (const id of Object.values(definition.images ?? {}).map(imageId)) {
      const preview = previews.get(id)
      if (preview)
        takenPreviews.set(id, preview)
    }
    stored.value = [...stored.value, {
      scope,
      widgetId: definition.id,
      network,
      size: definition.sizes[0]!,
      definition: approvedDefinition(scope, definition),
      grants: grantable(definition, grants),
      revision: ++lastRevision,
      definitionCheckedAt: filesReadAt.get(scope) ?? at,
      // A resting state with a refresh fetches its first content right away.
      refreshDueAt: definition.refresh ? at : undefined,
      failures: 0,
      updatedAt: at,
    }]
    void keepImages()
    if (hasSiblings)
      offerName(scope, definition.appName)
    return true
  }

  function update(scope: string, widgetId: string, state: WidgetState | null): boolean {
    if (!isOnHome(scope, widgetId))
      return false
    replaceState(scope, widgetId, state ?? undefined, Date.now())
    patch(scope, widgetId, () => ({ halted: undefined }))
    return true
  }

  function setToken(scope: string, widgetId: string, token: string | null): boolean {
    if (!isOnHome(scope, widgetId))
      return false
    patch(scope, widgetId, w => ({ token: token ?? undefined, tokenId: w.token === token ? w.tokenId : ++lastRevision, halted: undefined, refreshDueAt: w.halted ? Date.now() : w.refreshDueAt, revision: ++lastRevision }))
    return true
  }

  function remove(scope: string, widgetId: string) {
    removeWhere(w => isWidget(w, scope, widgetId))
  }

  function removeForOrigin(origin: string) {
    removeWhere(w => w.network === network && originOf(w.scope) === origin)
  }

  function setSize(scope: string, widgetId: string, size: WidgetSize) {
    if (find(scope, widgetId)?.definition.sizes.includes(size))
      patch(scope, widgetId, () => ({ size }))
  }

  function cacheFile(scope: string, file: WidgetFile, readAt: number) {
    galleryFiles.set(scope, file)
    filesReadAt.set(scope, readAt)
  }

  /** A search keeps its folder for the session, while a re-check can have replaced that folder's file. */
  function withLatestFile(found: FetchOutcome<{ scope: string, file: WidgetFile }>): FetchOutcome<{ scope: string, file: WidgetFile }> {
    if (!found.ok)
      return found
    const file = galleryFiles.get(found.value.scope)
    return file && file !== 'loading' ? { ok: true, value: { scope: found.value.scope, file } } : found
  }

  function discover(url: string): Promise<FetchOutcome<{ scope: string, file: WidgetFile }>> {
    if (isBlocked(url))
      return Promise.resolve({ ok: false, error: 'Widgets of this Mini App are not available', transient: false })
    const key = url.split(/[?#]/)[0]!
    const cached = discoveries.get(key)
    if (cached)
      return cached.then(withLatestFile)
    const pending = findWidgetFile(key).then((result) => {
      if (!result.ok && result.transient) {
        discoveries.delete(key)
        return result
      }
      const folder = widgetScopeCandidates(key)[0]
      if (folder) {
        const at = Date.now()
        const entries = Object.entries({ ...checks.value, [folder]: { scope: result.ok ? result.value.scope : null, checkedAt: at } })
        // Old misses are dropped, so the record does not grow with every site ever opened; they would be searched again anyway.
        checks.value = Object.fromEntries(entries.filter(([, check]) => check.scope !== null || at - check.checkedAt < DAY_MS))
      }
      if (result.ok)
        cacheFile(result.value.scope, result.value.file, Date.now())
      return result
    })
    discoveries.set(key, pending)
    return pending
  }

  function noteLaunch(url: string) {
    const folder = widgetScopeCandidates(url)[0]
    const checkedAt = folder ? checks.value[folder]?.checkedAt : undefined
    if (folder && (checkedAt === undefined || Date.now() - checkedAt >= DAY_MS))
      void discover(url)
  }

  function galleryScopesFor(origins: string[]): string[] {
    const found = Object.values(checks.value).flatMap(check => (check.scope ? [check.scope] : []))
    return [...new Set(origins.flatMap(origin => [
      ...found.filter(scope => originOf(scope) === origin && scope !== `${origin}/`),
      `${origin}/`,
    ]))].filter(scope => !isBlocked(scope))
  }

  function shownContent(widget: HomeWidget, at: number): WidgetContent {
    return shownState(widget, at)?.content ?? localizeDefinition(widget.definition, useApp().language).content
  }

  function catalogEntry(scope: string) {
    return useMiniApps().popularDApps.find(app => stripTrailingSlash(app.url) === stripTrailingSlash(scope))
  }

  function identity(widget: Pick<HomeWidget, 'scope' | 'definition'>): Pick<WidgetView, 'appName' | 'appAddress' | 'launchTitle'> {
    const address = addressOf(widget.scope)
    const listed = catalogEntry(widget.scope)
    if (listed)
      return { appName: listed.name, appAddress: listed.name === address ? undefined : address, launchTitle: listed.name }
    const declared = widget.definition.appName
    return { appName: declared ?? address, appAddress: declared && declared !== address ? address : undefined, launchTitle: address }
  }

  /** The image it wants once that can be drawn, until then the one before. None at once when it wants none. */
  function imageToShow(widget: Pick<HomeWidget, 'definition' | 'shownImage'>, content: WidgetContent | WidgetDemo): WidgetImage | undefined {
    const wanted = imageIn(content, widget.definition.images)
    if (!wanted)
      return undefined
    return images.has(imageId(wanted)) ? wanted : widget.shownImage
  }

  function backgroundView(widget: Pick<HomeWidget, 'definition' | 'shownImage'>, content: WidgetContent | WidgetDemo): WidgetView['background'] {
    if (content.background && 'chart' in content.background)
      return { kind: 'chart', chart: content.background.chart }
    const image = imageToShow(widget, content)
    const src = image && images.get(imageId(image))
    return src ? { kind: 'image', src } : undefined
  }

  function toView(widget: HomeWidget, at: number, content: WidgetContent | WidgetDemo = shownContent(widget, at)): WidgetView {
    const { countdown } = content
    return {
      key: widgetKey(widget.scope, widget.widgetId),
      scope: widget.scope,
      widgetId: widget.widgetId,
      ...identity(widget),
      appIcon: useMiniApps().iconForUrl(widget.scope),
      size: widget.size,
      sizes: widget.definition.sizes,
      label: content.label,
      value: content.value,
      info: content.info,
      tone: content.tone,
      progress: content.progress,
      countdown: !countdown
        ? undefined
        : 'in' in countdown
          ? { label: countdown.label, left: countdown.in * 1000 }
          : 'until' in countdown
            ? { label: countdown.label, until: countdown.until }
            : head.value.height > 0 ? { label: countdown.label, until: head.value.at + (countdown.untilNimiqHeight - head.value.height) * 1000 } : undefined,
      rows: content.rows.map(row => ({ label: row.label, value: row.value, url: row.path })),
      chart: content.chart,
      background: backgroundView(widget, content),
      url: content.path ?? widget.scope,
      pendingAppName: widget.pendingAppName && !catalogEntry(widget.scope) ? widget.pendingAppName : undefined,
      staleSince: !widget.halted && widget.failures >= STALE_AFTER_FAILURES ? widget.updatedAt : undefined,
      reconnect: widget.halted === 'reconnect',
      sharesAddresses: !!widget.grants?.includes('addresses'),
      pendingPermissions: waitingPermissions(widget).length > 0,
      stoppedPermissions: ungranted(widget).some(permission => widget.stopped?.includes(permission)),
    }
  }

  // Nothing from the site: no declared name, and no icon, whose download would contact it. An icon-sized card only draws its name.
  function blockedView(widget: HomeWidget, at: number): WidgetView {
    const notAvailable = i18n.t('Not available')
    const { appAddress, launchTitle } = identity(widget)
    const icon = widget.size === 'icon'
    return {
      ...toView(widget, at, { value: { text: icon ? launchTitle : notAvailable }, tone: 'neutral', rows: [] }),
      appName: icon ? notAvailable : launchTitle,
      appAddress: !icon && appAddress === launchTitle ? undefined : appAddress,
      appIcon: MINI_APP_FALLBACK_ICON,
      url: undefined,
      staleSince: undefined,
      pendingAppName: undefined,
      reconnect: false,
      sharesAddresses: false,
      pendingPermissions: false,
      stoppedPermissions: false,
    }
  }

  function goneView(widget: HomeWidget, at: number): WidgetView {
    return toView(widget, at, { value: { text: i18n.t('No longer available') }, tone: 'neutral', rows: [] })
  }

  const views = computed(() => widgets.value.map((w) => {
    if (isBlocked(w.scope))
      return blockedView(w, now.value)
    return w.halted === 'gone' ? goneView(w, now.value) : toView(w, now.value)
  }))

  function previewContent(definition: WidgetDefinition): WidgetContent | WidgetDemo {
    const { content, demo } = localizeDefinition(definition, useApp().language)
    return demo ?? content
  }

  function previewView(scope: string, definition: WidgetDefinition): WidgetView {
    const content = previewContent(definition)
    const view = toView({ scope, widgetId: definition.id, network, size: definition.sizes[0]!, definition: approvedDefinition(scope, definition), definitionCheckedAt: 0, failures: 0, updatedAt: 0 }, now.value, content)
    const image = imageIn(content, definition.images)
    const src = image && previews.get(imageId(image))
    return src ? { ...view, background: { kind: 'image', src } } : view
  }

  function lookupBudget(enabled: boolean) {
    let left = enabled ? WIDGET_LIMITS.chainLookups : 0
    const leftPerOrigin = new Map<string, number>()
    return {
      take(count: number, origin: string): boolean {
        const leftForOrigin = leftPerOrigin.get(origin) ?? WIDGET_LIMITS.chainLookupsPerMiniApp
        if (count > left || count > leftForOrigin)
          return false
        left -= count
        leftPerOrigin.set(origin, leftForOrigin - count)
        return true
      },
    }
  }

  type Budget = ReturnType<typeof lookupBudget>

  // A state with a payment or transaction trigger is checked whole or not at all, so a time trigger never wins over a payment that was not looked up.
  async function applyExpiryAndTriggers(widget: HomeWidget, at: number, chain: WidgetChain, budget: Budget) {
    const from = widget.state
    if (!from)
      return
    if (from.expiresAt !== undefined && at >= from.expiresAt) {
      replaceState(widget.scope, widget.widgetId, undefined, at)
      return
    }
    const lookups = from.next.filter(transition => needsLookup(transition.on)).length
    if (lookups > 0 && !budget.take(lookups, originOf(widget.scope)))
      return
    // An unanswered trigger stops the check, so a later trigger never wins over one that could not be checked.
    for (const transition of from.next) {
      const fired = await evaluateTrigger(transition.on, chain, at)
      if (fired === undefined)
        return
      // A Mini App may have pushed a newer state while the lookup ran.
      if (fired) {
        if (find(widget.scope, widget.widgetId)?.revision === widget.revision)
          replaceState(widget.scope, widget.widgetId, transition.state ?? undefined, at)
        return
      }
    }
  }

  function dueRefresh(widget: HomeWidget, at: number, force: boolean): WidgetRefresh | undefined {
    const refresh = refreshOf(shownState(widget, at), widget.definition)
    if (!refresh || !fetchesRead.value || widget.halted || at < (widget.retryNotBefore ?? 0))
      return undefined
    const countdown = shownContent(widget, at).countdown
    const sinceLastAttempt = at - (widget.lastAttemptAt ?? Number.NEGATIVE_INFINITY)
    // One early refresh when a countdown runs out, still behind the floor so answers whose countdowns end at once are not fetched every tick.
    const countdownEnded = !!countdown && 'until' in countdown && at >= countdown.until && (widget.lastAttemptAt ?? 0) < countdown.until && sinceLastAttempt >= MIN_FORCED_REFRESH_GAP_MS
    if (force && sinceLastAttempt >= MIN_FORCED_REFRESH_GAP_MS)
      return refresh
    if (!countdownEnded && (widget.refreshDueAt ?? 0) > at)
      return undefined
    // The first fetch only ever comes once, so it does not wait for the budget.
    return widget.lastAttemptAt === undefined || withinBudgets(fetches.value, originOf(widget.scope), at, WIDGET_LIMITS.refreshBudgets) ? refresh : undefined
  }

  async function runRefresh(widget: HomeWidget, refresh: WidgetRefresh, at: number, chain: WidgetChain) {
    const key = widgetKey(widget.scope, widget.widgetId)
    if (inFlight.has(key))
      return
    inFlight.add(key)
    fetches.value = withFetch(fetches.value, originOf(widget.scope), at)
    try {
      const accounts = widget.grants?.includes('addresses') ? chain.accounts() : []
      const result = await fetchWidgetRefresh(refresh, { lang: useApp().language, network }, widget.scope, at, { token: widget.token, accounts })
      // A Mini App may have pushed a newer state or token while the request ran.
      const latest = find(widget.scope, widget.widgetId)
      if (latest?.revision !== widget.revision) {
        // Still an attempt, so a forced tick right after does not ask the Mini App again.
        patch(widget.scope, widget.widgetId, () => ({ lastAttemptAt: at }))
        return
      }
      if (result.ok) {
        replaceState(widget.scope, widget.widgetId, result.value ?? undefined, at)
        patch(widget.scope, widget.widgetId, () => ({ lastAttemptAt: at }))
        return
      }
      logger.warn('Widget refresh failed', key, result.error)
      // Without a token there is nothing to reconnect: it may be a firewall's passing 403, and nothing would ever resume it.
      const halted = result.status === 410 ? 'gone' : widget.token && (result.status === 401 || result.status === 403) ? 'reconnect' : undefined
      if (halted) {
        patch(widget.scope, widget.widgetId, () => ({ lastAttemptAt: at, halted }))
        return
      }
      patch(widget.scope, widget.widgetId, (w) => {
        const failures = w.failures + 1
        const backoff = Math.min(MAX_BACKOFF_MS, refresh.every * 1000 * 2 ** failures)
        const retryAfter = Math.min(result.retryAfterMs ?? 0, DAY_MS)
        return { failures, lastAttemptAt: at, refreshDueAt: at + Math.max(backoff, retryAfter), retryNotBefore: retryAfter ? at + retryAfter : undefined }
      })
    }
    finally {
      inFlight.delete(key)
    }
  }

  function approvedDefinition(scope: string, definition: WidgetDefinition): WidgetDefinition {
    const sibling = widgets.value.find(w => w.scope === scope)
    return sibling ? { ...definition, appName: sibling.definition.appName } : definition
  }

  // A name belongs to the whole folder. Only a new one waits: content can change with any state anyway, and dropping a name only shows the address.
  function offerName(scope: string, offered: string | undefined) {
    const shownAsAddress = offered === undefined || offered === addressOf(scope)
    stored.value = stored.value.map((w) => {
      if (w.network !== network || w.scope !== scope)
        return w
      if (shownAsAddress)
        return { ...w, definition: { ...w.definition, appName: undefined }, pendingAppName: undefined }
      return { ...w, pendingAppName: offered === w.definition.appName ? undefined : offered }
    })
  }

  function pendingName(scope: string): { to: string, address: string } | undefined {
    const to = widgets.value.find(w => w.scope === scope)?.pendingAppName
    return to && !catalogEntry(scope) ? { to, address: addressOf(scope) } : undefined
  }

  /** Takes the name the user saw: a newer one that arrived meanwhile keeps waiting. */
  function approveName(scope: string, name: string) {
    stored.value = stored.value.map(w => w.network === network && w.scope === scope && w.pendingAppName === name
      ? { ...w, definition: { ...w.definition, appName: name }, pendingAppName: undefined }
      : w)
  }

  function widgetName(scope: string, widgetId: string): string {
    const widget = find(scope, widgetId)
    return widget ? localizeDefinition(widget.definition, useApp().language).name : widgetId
  }

  async function downloadImage({ image, scope, token }: ImagePin, signal?: AbortSignal): Promise<FetchOutcome<string>> {
    if (isBlocked(scope))
      return { ok: false, error: 'widgets of this site are blocked', transient: true }
    const result = await fetchWidgetImage(image, scope, token, signal)
    // Not the error, which quotes the URL: it can be a secret, and the log can be shared.
    if (!result.ok)
      logger.warn('Could not download a widget image', originOf(scope), result.status ?? (result.transient ? 'unreachable' : 'refused'))
    return result
  }

  function imagesOf(widget: HomeWidget): WidgetImage[] {
    const { shownImage, definition, state } = widget
    return [...(shownImage ? [shownImage] : []), ...Object.values(definition.images ?? {}), ...(state ? imagesInState(state) : [])]
  }

  // Only its own widget's token, withheld as refreshes are.
  function pinsOf(widget: HomeWidget, list: (WidgetImage | undefined)[]): ImagePin[] {
    const { scope, retryNotBefore: notBefore } = widget
    const token = widget.halted || widget.network !== network ? undefined : widget.token
    const tokenId = token ? widget.tokenId ?? 0 : undefined
    return list.flatMap(image => !image ? [] : [image.sendToken ? { image, scope, token, tokenId, notBefore } : { image, scope }])
  }

  // Cards that draw one first, so one widget's later states cannot take the budget of another's image on screen.
  const pinnedImages = computed(() => uniqueImages([
    ...running.value.filter(w => w.size !== 'icon').flatMap(w => pinsOf(w, [imageIn(shownContent(w, now.value), w.definition.images)])),
    ...[...widgets.value, ...stored.value].flatMap(w => pinsOf(w, imagesOf(w))),
  ]))
  const pinnedIds = computed(() => new Set(pinnedImages.value.map(({ image }) => imageId(image))))

  async function keepImages() {
    const unknown = new Set(pinnedImages.value.map(({ image }) => imageId(image)).filter(id => !images.has(id) && !absentImages.has(id) && !isBusy(id)))
    await Promise.all([...unknown].map(readSavedImage))
    downloadMissing()
  }

  function isBusy(id: string): boolean {
    return reading.has(id) || downloading.has(id)
  }

  // A busy id is freed only once it is done, so that a delete never lands on a copy that is wanted again.
  function freeIfUnwanted(id: string) {
    if (!pinnedIds.value.has(id))
      void kv().removeItem(imageKey(id))
  }

  async function readSavedImage(id: string) {
    reading.add(id)
    try {
      const saved = await kv().getItem(imageKey(id))
      if (!pinnedIds.value.has(id))
        return
      if (saved)
        images.set(id, saved)
      else
        absentImages.add(id)
    }
    catch (error) {
      logger.warn('Could not read a widget image', error)
    }
    finally {
      reading.delete(id)
      freeIfUnwanted(id)
    }
  }

  function mayRequest({ image, scope, token, notBefore }: ImagePin, at: number): boolean {
    // Home is hidden while a Mini App is open, and waiting for it to close turns its pushes into one download.
    if (isBlocked(scope) || hasMiniAppSession())
      return false
    return !image.sendToken || (!!token && at >= (notBefore ?? 0))
  }

  function mayRetry({ image, tokenId }: ImagePin, at: number): boolean {
    const failure = imageFailures.value[failureKey(image)]
    if (!failure || at >= failure.retryAt)
      return true
    return tokenId !== undefined && !!failure.refused && !failure.refused.includes(tokenId)
  }

  function mayKeep(pin: ImagePin, at: number): boolean {
    const { image, scope } = pin
    const id = imageId(image)
    if (!absentImages.has(id) || images.has(id) || isBusy(id))
      return false
    if (takenPreviews.has(id))
      return true
    if (!imageFetchesRead.value || !imageFailuresRead.value || !mayRequest(pin, at))
      return false
    const origin = originOf(scope)
    if ([...downloading].filter(other => other.startsWith(`${origin} `)).length >= DOWNLOADS_AT_ONCE_PER_SITE)
      return false
    return mayRetry(pin, at) && withinBudgets(imageFetches.value, origin, at, WIDGET_LIMITS.imageBudgets)
  }

  // Picked as each slot frees rather than queued, so a newer state's image never waits behind an older one's.
  function downloadMissing() {
    while (downloading.size < DOWNLOADS_AT_ONCE) {
      const at = Date.now()
      const next = pinnedImages.value.find(pinned => mayKeep(pinned, at))
      if (!next)
        return
      void keepImage(next, at)
    }
  }

  async function keepImage(pin: ImagePin, at: number) {
    const { image, scope } = pin
    const id = imageId(image)
    const preview = takenPreviews.get(id)
    downloading.add(id)
    const key = failureKey(image)
    const failedBefore = imageFailures.value[key]
    try {
      if (!preview) {
        imageFetches.value = withFetch(imageFetches.value, originOf(scope), at)
        noteAttempt(key, at)
        // Awaited here, as useStorageAsync's own write can still be under way when a download ends the app.
        await Promise.all([
          kv().setItem(IMAGE_FETCHES_KEY, JSON.stringify(imageFetches.value)),
          kv().setItem(IMAGE_FAILURES_KEY, JSON.stringify(imageFailures.value)),
        ])
        // A token can be cleared, a widget removed or a Mini App opened during those writes.
        const current = pinnedImages.value.find(other => pinKey(other) === pinKey(pin))
        if (!current || !mayRequest(current, at)) {
          setFailure(key, failedBefore)
          return
        }
      }
      const request = image.sendToken ? new AbortController() : undefined
      if (request)
        tokenRequests.set(pinKey(pin), request)
      const result: FetchOutcome<string> = preview ? { ok: true, value: preview } : await downloadImage(pin, request?.signal)
      if (!result.ok) {
        if (request?.signal.aborted)
          setFailure(key, failedBefore)
        else
          noteFailure(pin, result, at, failedBefore)
        return
      }
      // The widget can be removed or change during the download.
      if (!pinnedIds.value.has(id)) {
        forgetFailures(id)
        return
      }
      await kv().setItem(imageKey(id), result.value)
      forgetFailures(id)
      if (!pinnedIds.value.has(id))
        return
      // Drawn only once saved, as the image before it is freed as soon as this one is drawn.
      images.set(id, result.value)
    }
    catch (error) {
      logger.warn('Could not keep a widget image', error)
    }
    finally {
      downloading.delete(id)
      tokenRequests.delete(pinKey(pin))
      takenPreviews.delete(id)
      freeIfUnwanted(id)
      void keepImages()
    }
  }

  function noteAttempt(key: string, at: number) {
    const count = (imageFailures.value[key]?.count ?? 0) + 1
    const recent = Object.entries(imageFailures.value).filter(([, { retryAt }]) => at - retryAt < DAY_MS)
    // Whatever fails: a deploy can put the file online before its image, which then fails its hash.
    imageFailures.value = { ...Object.fromEntries(recent), [key]: { count, retryAt: at + Math.min(MAX_IMAGE_RETRY_MS, IMAGE_RETRY_MS * 2 ** (count - 1)) } }
  }

  function setFailure(key: string, failure: ImageFailure | undefined) {
    const { [key]: _, ...others } = imageFailures.value
    imageFailures.value = failure ? { ...others, [key]: failure } : others
  }

  function noteFailure({ image, tokenId }: ImagePin, result: { status?: number, retryAfterMs?: number }, at: number, failedBefore?: ImageFailure) {
    const key = failureKey(image)
    const attempt = imageFailures.value[key]
    if (!attempt)
      return
    const retryAt = Math.max(attempt.retryAt, at + Math.min(result.retryAfterMs ?? 0, DAY_MS))
    const refused = tokenId !== undefined && (result.status === 401 || result.status === 403)
      ? [...(failedBefore?.refused ?? []), tokenId].slice(-WIDGET_LIMITS.widgetsOnHome)
      : undefined
    setFailure(key, { count: attempt.count, retryAt, refused })
  }

  function forgetFailures(id: string) {
    const all = Object.entries(imageFailures.value)
    const others = all.filter(([key]) => !key.startsWith(`${id} `))
    if (others.length < all.length)
      imageFailures.value = Object.fromEntries(others)
  }

  // Added again, its images are tried at once; a state that only switches away from one keeps the back-off.
  function removeWhere(matches: (w: HomeWidget) => boolean) {
    const removed = stored.value.filter(matches)
    stored.value = stored.value.filter(w => !matches(w))
    for (const id of removed.flatMap(imagesOf).map(imageId)) {
      if (!pinnedIds.value.has(id))
        forgetFailures(id)
    }
  }

  watch(isMiniAppActive, active => !active && void keepImages())

  const imagesToShow = computed(() => stored.value.map(w => imageToShow(w, shownContent(w, now.value))))
  // The one writer of `shownImage`, from what the view draws. It runs before Vue renders, so nothing is drawn unrecorded.
  watch(imagesToShow, (list) => {
    if (list.some((image, i) => image?.sha256 !== stored.value[i]!.shownImage?.sha256))
      stored.value = stored.value.map((w, i) => ({ ...w, shownImage: list[i] }))
  })

  // Joined, so that this runs when the set of images changes, not with every state.
  watch(() => [...pinnedIds.value].sort().join('\n'), (_, before) => {
    for (const id of before.split('\n').filter(id => id && !pinnedIds.value.has(id))) {
      images.delete(id)
      absentImages.delete(id)
      if (!isBusy(id)) {
        takenPreviews.delete(id)
        freeIfUnwanted(id)
      }
    }
  })
  // Not with the ids alone: a token, or the end of a reconnect, makes an image downloadable.
  watch(() => pinnedImages.value.map(pinKey).join('\n'), (keys) => {
    const current = new Set(keys.split('\n'))
    for (const [key, request] of tokenRequests) {
      if (!current.has(key))
        request.abort()
    }
    void keepImages()
  })

  /** Only what the previews draw, and never stored: browsing the gallery leaves nothing behind. */
  async function loadPreviewImages(scopes: string[]) {
    const session = previewSession
    const wanted = scopes.flatMap((scope) => {
      const file = galleryFiles.get(scope)
      return !file || file === 'loading'
        ? []
        : file.widgets.flatMap((definition) => {
            const image = imageIn(previewContent(definition), definition.images)
            return image && !image.sendToken && definition.sizes[0] !== 'icon' && !isOnHome(scope, definition.id) ? [{ image, scope }] : []
          })
    })
    await inTurns(uniqueImages(wanted), async ({ image, scope }) => {
      const id = imageId(image)
      if (session !== previewSession || images.has(id) || previews.has(id))
        return
      const result = await downloadImage({ image, scope })
      if (result.ok && session === previewSession)
        previews.set(id, result.value)
    })
  }

  function clearPreviewImages() {
    previewSession++
    previews.clear()
  }

  /** What the consent sheet says, the same from a Mini App and the gallery. */
  function consentFor(scope: string, definition: WidgetDefinition) {
    const { appAddress, appName } = identity({ scope, definition: approvedDefinition(scope, definition) })
    const { name, description } = localizeDefinition(definition, useApp().language)
    return { widgetName: name, description, appName: appAddress ? appName : undefined, permissions: definition.permissions }
  }

  async function recheckFile(scope: string, at: number) {
    const inFolder = (w: HomeWidget) => w.network === network && w.scope === scope
    const checkedBefore = new Map(stored.value.filter(inFolder).map(w => [w.widgetId, w.definitionCheckedAt]))
    stored.value = stored.value.map(w => inFolder(w) ? { ...w, definitionCheckedAt: at } : w)
    try {
      // Before the request: one that ends the app would otherwise be made again at every start.
      await kv().setItem(WIDGETS_KEY, storedSerializer.write(stored.value))
    }
    catch (error) {
      logger.warn('Could not store a widget file check', error)
      stored.value = stored.value.map(w => inFolder(w) && w.definitionCheckedAt === at ? { ...w, definitionCheckedAt: checkedBefore.get(w.widgetId) ?? at } : w)
      return
    }
    const result = await fetchWidgetFile(scope, at)
    // Only a valid file that no longer declares a widget removes it; errors never do.
    if (!result.ok)
      return
    cacheFile(scope, result.value, at)
    const declared = new Map(result.value.widgets.map(definition => [definition.id, definition]))
    stored.value = stored.value.flatMap((w) => {
      if (!inFolder(w))
        return [w]
      const definition = declared.get(w.widgetId)
      if (!definition)
        return []
      return [{
        ...w,
        definition: { ...definition, appName: w.definition.appName },
        grants: grantable(definition, w.grants),
        definitionCheckedAt: at,
        size: definition.sizes.includes(w.size) ? w.size : definition.sizes[0]!,
      }]
    })
    // The name is the file's, the same on each of its widgets.
    const first = result.value.widgets[0]
    if (first)
      offerName(scope, first.appName)
  }

  async function step({ chain = createWidgetChain(), at = Date.now(), force = false }: TickOptions) {
    observe(at)
    // A forced tick skips the refresh interval, never the floors on how often the chain and a Mini App are asked.
    const checkChain = at - lastChainCheckAt >= CHAIN_CHECK_MS
    if (checkChain)
      lastChainCheckAt = at
    const budget = lookupBudget(checkChain)
    // Each chain check starts one widget after the previous one, so no widget always loses the budget.
    if (checkChain)
      void useFeatureFlags().refreshBlockedWidgetOrigins()
    const all = running.value
    const start = checkChain && all.length ? chainStart % all.length : 0
    if (checkChain)
      chainStart = start + 1
    for (const listed of [...all.slice(start), ...all.slice(0, start)]) {
      // A Mini App may have replaced the state during an earlier widget's lookup.
      const widget = find(listed.scope, listed.widgetId)
      if (!widget)
        continue
      await applyExpiryAndTriggers(widget, at, chain, budget)
    }
    const contactable = widgets.value.filter(w => !isBlocked(w.scope))
    // A widget gone with a 410 is re-read too: its site may have withdrawn it.
    const dueFolders = new Set(contactable.filter((w) => {
      const sinceRead = at - w.definitionCheckedAt
      return sinceRead >= RECHECK_MS || (force && sinceRead >= MIN_FORCED_REFRESH_GAP_MS)
    }).map(w => w.scope))
    await Promise.all([
      // The longest waiting first, so a Mini App's fast widget cannot keep taking the budget from its slow one.
      ...byLongestWaiting(contactable).map(async (widget) => {
        const refresh = dueRefresh(widget, at, force)
        if (refresh)
          await runRefresh(widget, refresh, at, chain)
      }),
      ...[...dueFolders].map(scope => recheckFile(scope, at)),
    ])
    void keepImages()
  }

  /** Call only while Home is visible. A forced tick during a running one is queued, not dropped, and resolves once it has run. */
  function tick(options: TickOptions = {}): Promise<void> {
    if (!current) {
      current = step(options).finally(() => {
        current = undefined
      })
      return current
    }
    if (!options.force)
      return Promise.resolve()
    if (queued) {
      queued.options = options
      return queued.promise
    }
    const slot = { options, promise: Promise.resolve() }
    slot.promise = current.catch(() => {}).then(() => {
      queued = undefined
      return tick(slot.options)
    })
    queued = slot
    return slot.promise
  }

  function catalogScopes(): string[] {
    return useMiniApps().popularDApps.flatMap(app => widgetScopeCandidates(app.url).slice(0, 1)).filter(scope => !isBlocked(scope))
  }

  async function loadGallery(scopes: string[]) {
    const waiting = scopes.filter(scope => !galleryFiles.has(scope))
    waiting.forEach(scope => galleryFiles.set(scope, 'loading'))
    await inTurns(waiting, async (scope) => {
      // A block can arrive while earlier sites are being asked.
      if (isBlocked(scope)) {
        galleryFiles.delete(scope)
        return
      }
      const result = await fetchWidgetFile(scope)
      if (result.ok)
        cacheFile(scope, result.value, Date.now())
      else if (result.transient)
        galleryFiles.delete(scope)
      else
        galleryFiles.set(scope, null)
    })
    // A height known before the sync finished can be far behind.
    observe(Date.now())
  }

  return {
    ready,
    widgets,
    views,
    canAdd,
    canAddTo,
    isBlocked,
    catalogScopes,
    setToken,
    widgetName,
    loadPreviewImages,
    clearPreviewImages,
    missingPermissions,
    askablePermissions,
    grantPermissions,
    revokePermissions,
    consentFor,
    pendingName,
    approveName,
    isOnHome,
    listForScope,
    listForOrigin,
    add,
    update,
    remove,
    removeForOrigin,
    setSize,
    tick,
    discover,
    noteLaunch,
    galleryScopesFor,
    galleryFiles,
    loadGallery,
    previewView,
  }
})
