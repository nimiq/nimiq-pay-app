import type { ResolvedLive, WidgetChain } from '@/lib/mini-app-widget-chain'
import type { FetchOutcome } from '@/lib/mini-app-widget-sources'
import type {
  LiveValue,
  PriceRange,
  WidgetAsset,
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
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import nimiqPayIcon from '@/assets/graphics/nimiq-pay.png'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { isImageReviewOpen } from '@/lib/mini-app-active'
import { MINI_APP_FALLBACK_ICON } from '@/lib/mini-app-icons'
import { BUILTIN_WIDGET_SCOPE, builtinWidgetFile } from '@/lib/mini-app-widget-builtins'
import { createWidgetChain, evaluateTrigger, isBalanceLive, needsLookup, resolveLiveValue, resolvePriceHistory } from '@/lib/mini-app-widget-chain'
import { fetchWidgetFile, fetchWidgetImage, fetchWidgetRefresh, findWidgetFile } from '@/lib/mini-app-widget-sources'
import { localizeDefinition, WIDGET_LIMITS, widgetScopeCandidates } from '@/lib/mini-app-widgets'
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
  /** Images in a newer file, not downloaded until the user approves them. */
  pendingImages?: Record<string, WidgetImage>
  /** What the user allowed it to send, kept from install: a file cannot widen it. */
  grants?: WidgetPermission[]
  /** What the user stopped sending, which is not offered to them again unasked. */
  stopped?: WidgetPermission[]
  /** Sent to its refresh URL: set by the Mini App, never shown or read back. */
  token?: string
  /** Why refreshes stopped, until the Mini App sends a state or a token. */
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

export type DisplayValue
  = | { kind: 'text', text: string }
    | { kind: 'amount', amount: string, currency: string }
    | { kind: 'change', percent: number }
    | { kind: 'pending' }

export interface WidgetView {
  key: string
  scope: string
  widgetId: string
  appName: string
  /** The site the widget comes from, when the name does not already say it; unset for Nimiq Pay's own widgets. */
  appAddress?: string
  /** The catalog name or the address: a declared name never reaches the signing sheets of the launched Mini App. */
  launchTitle: string
  pendingAppName?: string
  appIcon: string
  size: WidgetSize
  sizes: WidgetSize[]
  label?: string
  value: DisplayValue
  info?: DisplayValue
  tone: WidgetTone
  progress?: number
  /** `left` is a demo's, which holds still. */
  countdown?: { label: string, until: number } | { label: string, left: number }
  rows: { label: string, value: DisplayValue, url?: string }[]
  chart?: { kind: 'line' | 'bars', points: number[] }
  url?: string
  /** After repeated refresh failures: when the content last updated. */
  staleSince?: number
  reconnect?: boolean
  sharesAddresses?: boolean
  pendingImages?: boolean
  pendingPermissions?: boolean
  stoppedPermissions?: boolean
  background?: { kind: 'image', src: string } | { kind: 'chart', chart: NonNullable<WidgetView['chart']> }
}

interface TickOptions { chain?: WidgetChain, at?: number, force?: boolean }

type LiveSpec = { live: LiveValue } | { priceHistory: { asset: WidgetAsset, range: PriceRange } }

export const TICK_MS = 15_000
export const STALE_AFTER_FAILURES = 3
const CHAIN_CHECK_MS = 30_000
const PRICE_MAX_AGE_MS = 5 * 60_000
const DAY_MS = 24 * 60 * 60_000
const MAX_BACKOFF_MS = 30 * 60_000
const MIN_FORCED_REFRESH_GAP_MS = 60_000
const DOWNLOADS_AT_ONCE = 6
const IMAGE_RETRY_MS = 5 * 60_000
const imageKey = (hash: string) => `miniAppWidgetImage:${hash}`

function ungranted(widget: HomeWidget): WidgetPermission[] {
  return (widget.definition.permissions ?? []).filter(permission => !widget.grants?.includes(permission))
}

function waitingPermissions(widget: HomeWidget): WidgetPermission[] {
  return ungranted(widget).filter(permission => !widget.stopped?.includes(permission))
}

function changedImageKeys(approved: WidgetDefinition['images'], offered: WidgetDefinition['images']): string[] {
  return Object.entries(offered ?? {}).filter(([key, image]) => approved?.[key]?.sha256 !== image.sha256).map(([key]) => key)
}

/** One download per URL: anyone can name the same hash with a URL that fails. */
function uniqueImages<T extends { image: WidgetImage }>(pinned: T[]): T[] {
  return [...new Map(pinned.map(entry => [`${entry.image.url} ${entry.image.sha256}`, entry])).values()]
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

function liveSpecs(content: WidgetContent | WidgetDemo, size: WidgetSize): LiveSpec[] {
  // Only the large size draws rows and a chart, so smaller sizes skip their lookups and leave the budget to what is shown.
  const values: unknown[] = [content.value, content.info, ...(size === 'large' ? content.rows.map(row => row.value) : [])]
  const specs: LiveSpec[] = values
    .filter((value): value is { live: LiveValue } => typeof value === 'object' && value !== null && 'live' in value)
    .map(value => ({ live: value.live }))
  if (size === 'large' && content.chart && 'priceHistory' in content.chart)
    specs.push({ priceHistory: content.chart.priceHistory })
  if (size !== 'icon' && content.background && 'chart' in content.background && 'priceHistory' in content.background.chart)
    specs.push({ priceHistory: content.background.chart.priceHistory })
  return specs
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
  const stored = useStorageAsync<HomeWidget[]>('miniAppWidgets', [], kv(), { writeDefaults: false, onReady: () => ready.value = true })
  // Launch folder → its search result, for the gallery; misses are kept too, so a site without widgets is not searched on every launch.
  const checks = useStorageAsync<Record<string, FolderCheck>>('miniAppWidgetChecks', {}, kv(), { writeDefaults: false })
  // No refresh before the read: it would go past the budget, and its record would be overwritten by the read.
  const fetchesRead = ref(false)
  // Stored, so a restart does not reset a Mini App's refresh budget.
  const fetches = useStorageAsync<Record<string, number[]>>('miniAppWidgetFetches', {}, kv(), { writeDefaults: false, onReady: () => fetchesRead.value = true })
  const widgets = computed(() => stored.value.filter(w => w.network === network))
  const canAdd = computed(() => widgets.value.length < WIDGET_LIMITS.widgetsOnHome)
  function isBlocked(scope: string): boolean {
    const blocked = useFeatureFlags().blockedWidgetOrigins
    return scope !== BUILTIN_WIDGET_SCOPE && (blocked.includes('*') || blocked.includes(safeOrigin(scope)))
  }
  const running = computed(() => widgets.value.filter(w => !isBlocked(w.scope) && w.halted !== 'gone'))

  function canAddTo(scope: string): boolean {
    return !isBlocked(scope) && canAdd.value && listForOrigin(originOf(scope)).length < WIDGET_LIMITS.widgetsPerMiniApp
  }
  const now = ref(Date.now())
  // Block-height countdowns count from the head seen at the last tick, so they do not jump when the head moves between ticks.
  const head = ref({ height: useNimiqNetwork().height, at: now.value })
  const live = reactive(new Map<string, { value?: ResolvedLive | number[], checkedAt: number }>())
  const galleryFiles = reactive(new Map<string, WidgetFile | null | 'loading'>())
  // By hash. Approved images are read from the encrypted database; previews only live while the gallery is open.
  const images = reactive(new Map<string, string>())
  const previews = reactive(new Map<string, string>())
  // Downloaded for the user to look at before approving, and kept only if they do.
  const reviews = reactive(new Map<string, string>())
  const imageReview = shallowRef<{ scope: string, widgetId: string, offered: Record<string, WidgetImage>, keys: string[], answer: (taken: boolean | undefined) => void }>()
  const reviewLoading = ref(false)
  let reviewSession = 0
  const savedImages = new Set<string>()
  const refusedImages = new Set<string>()
  let previewSession = 0
  let lastImageRetryAt = 0
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
    for (const { sha256 } of Object.values(definition.images ?? {})) {
      const preview = previews.get(sha256)
      if (preview)
        images.set(sha256, preview)
    }
    stored.value = [...stored.value, {
      scope,
      widgetId: definition.id,
      network,
      size: definition.sizes[0]!,
      definition: approvedDefinition(scope, definition),
      grants: grantable(definition, grants),
      revision: ++lastRevision,
      definitionCheckedAt: at,
      // A resting state with a refresh fetches its first content right away.
      refreshDueAt: definition.refresh ? at : undefined,
      failures: 0,
      updatedAt: at,
    }]
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
    patch(scope, widgetId, w => ({ token: token ?? undefined, halted: undefined, refreshDueAt: w.halted ? Date.now() : w.refreshDueAt, revision: ++lastRevision }))
    return true
  }

  function remove(scope: string, widgetId: string) {
    stored.value = stored.value.filter(w => !isWidget(w, scope, widgetId))
  }

  function removeForOrigin(origin: string) {
    stored.value = stored.value.filter(w => !(w.network === network && originOf(w.scope) === origin))
  }

  function setSize(scope: string, widgetId: string, size: WidgetSize) {
    if (find(scope, widgetId)?.definition.sizes.includes(size))
      patch(scope, widgetId, () => ({ size }))
  }

  function discover(url: string): Promise<FetchOutcome<{ scope: string, file: WidgetFile }>> {
    if (isBlocked(url))
      return Promise.resolve({ ok: false, error: 'Widgets of this Mini App are not available', transient: false })
    const key = url.split(/[?#]/)[0]!
    const cached = discoveries.get(key)
    if (cached)
      return cached
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
        galleryFiles.set(result.value.scope, result.value.file)
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

  function liveKey(spec: LiveSpec): string {
    return 'live' in spec && isBalanceLive(spec.live) ? JSON.stringify(spec) : `${useApp().selectedFiat}|${JSON.stringify(spec)}`
  }

  function resolved(spec: LiveSpec): DisplayValue {
    const value = live.get(liveKey(spec))?.value
    return value && !Array.isArray(value) ? value : { kind: 'pending' }
  }

  function display(value: WidgetValue): DisplayValue {
    if ('live' in value)
      return resolved({ live: value.live })
    return 'text' in value ? { kind: 'text', text: value.text } : { kind: 'amount', amount: value.amount, currency: value.currency }
  }

  function shownContent(widget: HomeWidget, at: number): WidgetContent {
    return shownState(widget, at)?.content ?? localizeDefinition(widget.definition, useApp().language).content
  }

  function catalogEntry(scope: string) {
    return useMiniApps().popularDApps.find(app => stripTrailingSlash(app.url) === stripTrailingSlash(scope))
  }

  function identity(widget: Pick<HomeWidget, 'scope' | 'definition'>): Pick<WidgetView, 'appName' | 'appAddress' | 'launchTitle'> {
    if (widget.scope === BUILTIN_WIDGET_SCOPE)
      return { appName: 'Nimiq Pay', launchTitle: 'Nimiq Pay' }
    const address = addressOf(widget.scope)
    const listed = catalogEntry(widget.scope)
    if (listed)
      return { appName: listed.name, appAddress: listed.name === address ? undefined : address, launchTitle: listed.name }
    const declared = widget.definition.appName
    return { appName: declared ?? address, appAddress: declared && declared !== address ? address : undefined, launchTitle: address }
  }

  function chartView(chart: WidgetChart | undefined): WidgetView['chart'] {
    if (!chart)
      return undefined
    if ('points' in chart)
      return { kind: chart.kind, points: chart.points }
    const history = live.get(liveKey({ priceHistory: chart.priceHistory }))?.value
    return Array.isArray(history) ? { kind: 'line', points: history } : undefined
  }

  function backgroundView(widget: Pick<HomeWidget, 'definition'>, { background }: WidgetContent | WidgetDemo): WidgetView['background'] {
    if (!background)
      return undefined
    if ('image' in background) {
      const hash = widget.definition.images?.[background.image]?.sha256 ?? ''
      const src = images.get(hash) ?? previews.get(hash) ?? reviews.get(hash)
      return src ? { kind: 'image', src } : undefined
    }
    const chart = chartView(background.chart)
    return chart && { kind: 'chart', chart }
  }

  function toView(widget: HomeWidget, at: number, content: WidgetContent | WidgetDemo = shownContent(widget, at)): WidgetView {
    const { countdown } = content
    const builtin = widget.scope === BUILTIN_WIDGET_SCOPE
    return {
      key: widgetKey(widget.scope, widget.widgetId),
      scope: widget.scope,
      widgetId: widget.widgetId,
      ...identity(widget),
      appIcon: builtin ? nimiqPayIcon : useMiniApps().iconForUrl(widget.scope),
      size: widget.size,
      sizes: widget.definition.sizes,
      label: content.label,
      value: display(content.value),
      info: content.info === undefined ? undefined : typeof content.info === 'string' ? { kind: 'text', text: content.info } : resolved({ live: content.info.live }),
      tone: content.tone,
      progress: content.progress,
      countdown: !countdown
        ? undefined
        : 'in' in countdown
          ? { label: countdown.label, left: countdown.in * 1000 }
          : 'until' in countdown
            ? { label: countdown.label, until: countdown.until }
            : head.value.height > 0 ? { label: countdown.label, until: head.value.at + (countdown.untilNimiqHeight - head.value.height) * 1000 } : undefined,
      rows: content.rows.map(row => ({ label: row.label, value: display(row.value), url: row.path })),
      chart: chartView(content.chart),
      background: backgroundView(widget, content),
      url: content.path ?? (builtin ? undefined : widget.scope),
      pendingAppName: widget.pendingAppName && !catalogEntry(widget.scope) ? widget.pendingAppName : undefined,
      staleSince: !widget.halted && widget.failures >= STALE_AFTER_FAILURES ? widget.updatedAt : undefined,
      reconnect: widget.halted === 'reconnect',
      sharesAddresses: !!widget.grants?.includes('addresses'),
      pendingImages: !!widget.pendingImages,
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
      pendingImages: false,
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
    return toView({ scope, widgetId: definition.id, network, size: definition.sizes[0]!, definition: approvedDefinition(scope, definition), definitionCheckedAt: 0, failures: 0, updatedAt: 0 }, now.value, previewContent(definition))
  }

  function lookupBudget(enabled: boolean) {
    let left = enabled ? WIDGET_LIMITS.chainLookups : 0
    const leftPerOrigin = new Map<string, number>()
    return {
      take(count: number, origin?: string): boolean {
        const leftForOrigin = origin === undefined ? left : leftPerOrigin.get(origin) ?? WIDGET_LIMITS.chainLookupsPerMiniApp
        if (count > left || count > leftForOrigin)
          return false
        left -= count
        if (origin !== undefined)
          leftPerOrigin.set(origin, leftForOrigin - count)
        return true
      },
    }
  }

  type Budget = ReturnType<typeof lookupBudget>

  // A state with a payment or transaction trigger is checked whole or not at all, so a time trigger never wins over a payment that was not looked up.
  async function applyExpiryAndTriggers(widget: HomeWidget, at: number, chain: WidgetChain, checkChain: boolean, budget: Budget) {
    const from = widget.state
    if (!from)
      return
    if (from.expiresAt !== undefined && at >= from.expiresAt) {
      replaceState(widget.scope, widget.widgetId, undefined, at)
      return
    }
    const lookups = from.next.filter(transition => needsLookup(transition.on)).length
    if (lookups > 0 && (!checkChain || !budget.take(lookups, originOf(widget.scope))))
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

  function withinRefreshBudget(origin: string, at: number): boolean {
    const log = fetches.value[origin] ?? []
    return WIDGET_LIMITS.refreshBudgets.every(({ windowMs, max }) => log.filter(time => at - time < windowMs).length < max)
  }

  function noteRefresh(origin: string, at: number) {
    const recent = Object.entries(fetches.value).map(([key, log]) => [key, log.filter(time => at - time < DAY_MS)] as const)
    const kept = Object.fromEntries(recent.filter(([, log]) => log.length))
    fetches.value = { ...kept, [origin]: [...(kept[origin] ?? []), at] }
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
    return widget.lastAttemptAt === undefined || withinRefreshBudget(originOf(widget.scope), at) ? refresh : undefined
  }

  async function runRefresh(widget: HomeWidget, refresh: WidgetRefresh, at: number, chain: WidgetChain) {
    const key = widgetKey(widget.scope, widget.widgetId)
    if (inFlight.has(key))
      return
    inFlight.add(key)
    noteRefresh(originOf(widget.scope), at)
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

  function hasPendingImages(scope: string, widgetId: string): boolean {
    return !!find(scope, widgetId)?.pendingImages
  }

  function widgetName(scope: string, widgetId: string): string {
    const widget = find(scope, widgetId)
    return widget ? localizeDefinition(widget.definition, useApp().language).name : widgetId
  }

  async function loadReviewImages() {
    const review = imageReview.value
    if (!review)
      return
    const session = reviewSession
    reviewLoading.value = true
    await inTurns(uniqueImages(review.keys.map(key => ({ image: review.offered[key]!, scope: review.scope }))), async ({ image, scope }) => {
      if (session !== reviewSession || images.has(image.sha256) || reviews.has(image.sha256))
        return
      const src = await downloadImage(image, scope)
      if (src && session === reviewSession)
        reviews.set(image.sha256, src)
    })
    if (session === reviewSession)
      reviewLoading.value = false
  }

  /** The widget in its demo state with one of the images under review, at its size on Home; an icon draws no background, so the next size up. */
  function reviewView(key: string): WidgetView | undefined {
    const review = imageReview.value
    const widget = review && find(review.scope, review.widgetId)
    if (!review || !widget || !review.offered[key])
      return undefined
    const size = widget.size === 'icon' ? widget.definition.sizes.find(s => s !== 'icon') ?? 'small' : widget.size
    const shown = { ...widget, size, definition: { ...widget.definition, images: review.offered } }
    return { ...toView(shown, now.value, { ...previewContent(widget.definition), background: { image: key } }), key: `${widgetKey(review.scope, review.widgetId)}#${key}` }
  }

  /** Resolves with whether the user took any of the new images, or undefined when no review could open. */
  function openImageReview(scope: string, widgetId: string): Promise<boolean | undefined> {
    const widget = find(scope, widgetId)
    const offered = widget?.pendingImages
    if (imageReview.value || !widget || !offered)
      return Promise.resolve(undefined)
    return new Promise((answer) => {
      imageReview.value = { scope, widgetId, offered, keys: changedImageKeys(widget.definition.images, offered), answer }
      isImageReviewOpen.value = true
    })
  }

  /** Takes only what the user saw (`drawn`, when the sheet says): an image that could not be shown stays waiting, so it is never taken unseen. */
  function answerImageReview(approved: boolean, drawn?: string[]) {
    const review = imageReview.value
    if (!review)
      return
    imageReview.value = undefined
    isImageReviewOpen.value = false
    reviewSession++
    reviewLoading.value = false
    const seen = approved ? review.keys.filter(key => reviews.has(review.offered[key]!.sha256) && (!drawn || drawn.includes(key))) : []
    if (seen.length) {
      seen.forEach(key => images.set(review.offered[key]!.sha256, reviews.get(review.offered[key]!.sha256)!))
      patch(review.scope, review.widgetId, (w) => {
        const unseen = review.keys.filter(key => !seen.includes(key))
        const taken = Object.fromEntries(Object.entries(review.offered).flatMap(([key, image]): [string, WidgetImage][] => {
          if (!unseen.includes(key))
            return [[key, image]]
          const approved = w.definition.images?.[key]
          return approved ? [[key, approved]] : []
        }))
        const waiting = w.pendingImages && changedImageKeys(taken, w.pendingImages).length ? w.pendingImages : undefined
        return { definition: { ...w.definition, images: taken }, pendingImages: waiting }
      })
    }
    reviews.clear()
    review.answer(seen.length > 0)
  }

  /** For a sheet that could not show at all: neither a yes nor a no. */
  function closeImageReview() {
    const review = imageReview.value
    imageReview.value = undefined
    isImageReviewOpen.value = false
    reviewSession++
    reviewLoading.value = false
    reviews.clear()
    review?.answer(undefined)
  }

  /** New or changed images wait for approval. One the file dropped goes at once, since that shows nothing new. */
  function checkedImages(widget: HomeWidget, offered: WidgetDefinition['images']) {
    const approved = widget.definition.images
    return changedImageKeys(approved, offered).length
      ? { images: approved, pendingImages: offered }
      : { images: offered, pendingImages: undefined }
  }

  async function downloadImage(image: WidgetImage, scope: string): Promise<string | undefined> {
    const refusal = `${image.url} ${image.sha256}`
    if (refusedImages.has(refusal) || isBlocked(scope))
      return undefined
    const result = await fetchWidgetImage(image, scope)
    if (result.ok)
      return result.value
    logger.warn(`Could not download a widget image: ${result.error}`)
    // Only what the file itself failed on. By URL, as anyone can copy a hash and point it at a bad one.
    if (!result.transient && result.status === undefined)
      refusedImages.add(refusal)
    return undefined
  }

  const pinnedImages = computed(() => stored.value.flatMap(w => Object.values(w.definition.images ?? {}).map(image => ({ image, scope: w.scope }))))
  const pinnedHashes = computed(() => new Set(pinnedImages.value.map(({ image }) => image.sha256)))

  async function keepImages() {
    const unread = uniqueImages(pinnedImages.value).filter(({ image }) => !savedImages.has(image.sha256))
    const missing: typeof unread = []
    await Promise.all(unread.map(async (pinned) => {
      const saved = await kv().getItem(imageKey(pinned.image.sha256))
      if (!saved)
        return missing.push(pinned)
      images.set(pinned.image.sha256, saved)
      savedImages.add(pinned.image.sha256)
    }))
    await inTurns(missing, async ({ image, scope }) => {
      // Another widget may just have brought it.
      if (savedImages.has(image.sha256))
        return
      const src = images.get(image.sha256) ?? await downloadImage(image, scope)
      // The widget can be removed during the download.
      if (!src || !pinnedHashes.value.has(image.sha256))
        return
      images.set(image.sha256, src)
      await kv().setItem(imageKey(image.sha256), src)
      savedImages.add(image.sha256)
    })
  }

  let keepingImages = Promise.resolve()
  function queueKeepImages() {
    keepingImages = keepingImages.then(keepImages).catch(error => logger.warn('Could not keep widget images', error))
  }

  // Joined, so that this runs when the set of images changes, not with every state.
  watch(() => [...pinnedHashes.value].sort().join(), (_, before) => {
    for (const hash of before.split(',').filter(hash => hash && !pinnedHashes.value.has(hash))) {
      images.delete(hash)
      savedImages.delete(hash)
      for (const refusal of refusedImages) {
        if (refusal.endsWith(hash))
          refusedImages.delete(refusal)
      }
      void kv().removeItem(imageKey(hash))
    }
    queueKeepImages()
  })

  /** Only what the previews draw, and never stored: browsing the gallery leaves nothing behind. */
  async function loadPreviewImages(scopes: string[]) {
    const session = previewSession
    const wanted = scopes.flatMap((scope) => {
      const file = galleryFiles.get(scope)
      return !file || file === 'loading'
        ? []
        : file.widgets.flatMap((definition) => {
            const { background } = previewContent(definition)
            const image = background && 'image' in background ? definition.images?.[background.image] : undefined
            return image && definition.sizes[0] !== 'icon' && !isOnHome(scope, definition.id) ? [{ image, scope }] : []
          })
    })
    await inTurns(uniqueImages(wanted), async ({ image, scope }) => {
      if (session !== previewSession || images.has(image.sha256) || previews.has(image.sha256))
        return
      const src = await downloadImage(image, scope)
      if (src && session === previewSession)
        previews.set(image.sha256, src)
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

  async function recheckDefinition(widget: HomeWidget, at: number, files: Map<string, Promise<FetchOutcome<WidgetFile>>>) {
    if (!files.has(widget.scope))
      files.set(widget.scope, widget.scope === BUILTIN_WIDGET_SCOPE ? Promise.resolve({ ok: true, value: builtinWidgetFile() }) : fetchWidgetFile(widget.scope, at))
    const result = await files.get(widget.scope)!
    if (!result.ok) {
      // Only a valid file that no longer declares the widget removes it; errors never do.
      patch(widget.scope, widget.widgetId, () => ({ definitionCheckedAt: at }))
      return
    }
    const definition = result.value.widgets.find(d => d.id === widget.widgetId)
    if (!definition) {
      remove(widget.scope, widget.widgetId)
      return
    }
    patch(widget.scope, widget.widgetId, (w) => {
      const { images: kept, pendingImages } = checkedImages(w, definition.images)
      return { definition: { ...definition, appName: w.definition.appName, images: kept }, pendingImages, grants: grantable(definition, w.grants), definitionCheckedAt: at, size: definition.sizes.includes(w.size) ? w.size : definition.sizes[0]! }
    })
    offerName(widget.scope, definition.appName)
  }

  async function resolveLive(shown: { content: WidgetContent | WidgetDemo, size: WidgetSize, origin?: string }[], chain: WidgetChain, at: number, budget: Budget) {
    const seen = new Set<string>()
    for (const { content, size, origin } of shown) {
      for (const spec of liveSpecs(content, size)) {
        const key = liveKey(spec)
        if (seen.has(key))
          continue
        seen.add(key)
        const entry = live.get(key)
        const balance = 'live' in spec && isBalanceLive(spec.live)
        // A price that has never answered is retried at the chain check pace.
        if (entry && at - entry.checkedAt < (balance || entry.value === undefined ? CHAIN_CHECK_MS : PRICE_MAX_AGE_MS))
          continue
        if (balance && !budget.take(1, origin))
          continue
        const fiat = useApp().selectedFiat
        const value = await ('priceHistory' in spec
          ? resolvePriceHistory(spec.priceHistory.asset, spec.priceHistory.range, chain, fiat, at)
          : resolveLiveValue(spec.live, chain, fiat, at)).catch(() => undefined)
        live.set(key, { value: value ?? entry?.value, checkedAt: at })
      }
    }
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
      await applyExpiryAndTriggers(widget, at, chain, checkChain, budget)
      const current = find(widget.scope, widget.widgetId) ?? widget
      await resolveLive([{ content: shownContent(current, at), size: current.size, origin: originOf(current.scope) }], chain, at, budget)
    }
    const files = new Map<string, Promise<FetchOutcome<WidgetFile>>>()
    // The longest waiting first, so a Mini App's fast widget cannot keep taking the budget from its slow one.
    // A widget gone with a 410 is re-read too: its site may have withdrawn it.
    await Promise.all(byLongestWaiting(widgets.value.filter(w => !isBlocked(w.scope))).map(async (widget) => {
      const refresh = dueRefresh(widget, at, force)
      if (refresh)
        await runRefresh(widget, refresh, at, chain)
      if (at - widget.definitionCheckedAt >= DAY_MS)
        await recheckDefinition(widget, at, files)
    }))
    if (files.size || at - lastImageRetryAt >= IMAGE_RETRY_MS) {
      lastImageRetryAt = at
      queueKeepImages()
    }
    await resolveLive(running.value.map(w => ({ content: shownContent(w, at), size: w.size, origin: originOf(w.scope) })), chain, at, budget)
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
      if (!result.ok && result.transient)
        galleryFiles.delete(scope)
      else
        galleryFiles.set(scope, result.ok ? result.value : null)
    })
  }

  function resolvePreviews(definitions: WidgetDefinition[], chain = createWidgetChain()) {
    const at = Date.now()
    observe(at)
    return resolveLive(definitions.map(d => ({ content: previewContent(d), size: d.sizes[0]! })), chain, at, lookupBudget(true))
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
    hasPendingImages,
    widgetName,
    imageReview,
    reviewLoading,
    loadReviewImages,
    reviewView,
    openImageReview,
    answerImageReview,
    closeImageReview,
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
    resolvePreviews,
  }
})
