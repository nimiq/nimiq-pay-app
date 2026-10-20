import type { ResolvedLive, WidgetChain } from '@/lib/mini-app-widget-chain'
import type { FetchOutcome } from '@/lib/mini-app-widget-sources'
import type {
  LiveValue,
  PriceRange,
  WidgetAsset,
  WidgetContent,
  WidgetDefinition,
  WidgetFile,
  WidgetRefresh,
  WidgetSize,
  WidgetState,
  WidgetTone,
  WidgetValue,
} from '@/lib/mini-app-widgets'
import type { NetworkMode } from '@/lib/network'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import nimiqPayIcon from '@/assets/graphics/nimiq-pay.png'
import { useLogger } from '@/composables/useLogger'
import { isTestnet } from '@/lib'
import { BUILTIN_WIDGET_SCOPE, builtinWidgetFile } from '@/lib/mini-app-widget-builtins'
import { createWidgetChain, evaluateTrigger, isBalanceLive, needsLookup, resolveLiveValue, resolvePriceHistory } from '@/lib/mini-app-widget-chain'
import { fetchWidgetFile, fetchWidgetRefresh, findWidgetFile } from '@/lib/mini-app-widget-sources'
import { localizeDefinition, WIDGET_LIMITS, widgetScopeCandidates } from '@/lib/mini-app-widgets'
import { kv, useApp } from '@/stores/app'
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
  /** undefined means the resting state. */
  state?: WidgetState
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
  appIcon: string
  size: WidgetSize
  sizes: WidgetSize[]
  label?: string
  value: DisplayValue
  info?: DisplayValue
  tone: WidgetTone
  progress?: number
  countdown?: { label: string, until: number }
  rows: { label: string, value: DisplayValue, url?: string }[]
  chart?: { kind: 'line' | 'bars', points: number[] }
  url?: string
  /** After repeated refresh failures: when the content last updated. */
  staleSince?: number
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

function liveSpecs(content: WidgetContent): LiveSpec[] {
  const values: unknown[] = [content.value, content.info, ...content.rows.map(row => row.value)]
  const specs: LiveSpec[] = values
    .filter((value): value is { live: LiveValue } => typeof value === 'object' && value !== null && 'live' in value)
    .map(value => ({ live: value.live }))
  if (content.chart && 'priceHistory' in content.chart)
    specs.push({ priceHistory: content.chart.priceHistory })
  return specs
}

function refreshOf(state: WidgetState | undefined, definition: WidgetDefinition): WidgetRefresh | undefined {
  return state ? state.refresh : definition.refresh
}

function dueAt(state: WidgetState | undefined, definition: WidgetDefinition, at: number): number | undefined {
  const refresh = refreshOf(state, definition)
  return refresh ? at + refresh.every * 1000 : undefined
}

export const useMiniAppWidgets = defineStore('mini-app-widgets', () => {
  const network: NetworkMode = isTestnet ? 'testnet' : 'mainnet'
  // Home waits for the first read, so the empty state never flashes for someone who has widgets.
  const ready = ref(false)
  // kv() so widgets clear on logout with the rest of the account.
  const stored = useStorageAsync<HomeWidget[]>('miniAppWidgets', [], kv(), { writeDefaults: false, onReady: () => ready.value = true })
  // Launch folder → its search result, for the gallery; misses are kept too, so a site without widgets is not searched on every launch.
  const checks = useStorageAsync<Record<string, FolderCheck>>('miniAppWidgetChecks', {}, kv(), { writeDefaults: false })
  const widgets = computed(() => stored.value.filter(w => w.network === network))
  const canAdd = computed(() => widgets.value.length < WIDGET_LIMITS.widgetsOnHome)
  const now = ref(Date.now())
  // Block-height countdowns count from the head seen at the last tick, so they do not jump when the head moves between ticks.
  const head = ref({ height: useNimiqNetwork().height, at: now.value })
  const live = reactive(new Map<string, { value?: ResolvedLive | number[], checkedAt: number }>())
  const galleryFiles = reactive(new Map<string, WidgetFile | null | 'loading'>())
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
    patch(scope, widgetId, w => ({ state, failures: 0, updatedAt: at, refreshDueAt: dueAt(state, w.definition, at) }))
  }

  function add(scope: string, definition: WidgetDefinition): boolean {
    if (isOnHome(scope, definition.id))
      return true
    if (!canAdd.value)
      return false
    const at = Date.now()
    stored.value = [...stored.value, {
      scope,
      widgetId: definition.id,
      network,
      size: definition.sizes[0]!,
      definition,
      definitionCheckedAt: at,
      // A resting state with a refresh fetches its first content right away.
      refreshDueAt: definition.refresh ? at : undefined,
      failures: 0,
      updatedAt: at,
    }]
    return true
  }

  function update(scope: string, widgetId: string, state: WidgetState | null): boolean {
    if (!isOnHome(scope, widgetId))
      return false
    replaceState(scope, widgetId, state ?? undefined, Date.now())
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
    ]))]
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

  /** The catalog name only for the catalog's own URL, else host and folder, so no Mini App can pose as another on its site. */
  function appName(scope: string): string {
    const listed = useMiniApps().popularDApps.find(app => stripTrailingSlash(app.url) === stripTrailingSlash(scope))
    if (listed)
      return listed.name
    const url = new URL(scope)
    return stripTrailingSlash(`${url.hostname}${url.pathname}`)
  }

  function toView(widget: HomeWidget, at: number): WidgetView {
    const content = shownContent(widget, at)
    const { countdown, chart } = content
    const builtin = widget.scope === BUILTIN_WIDGET_SCOPE
    const history = chart && 'priceHistory' in chart ? live.get(liveKey({ priceHistory: chart.priceHistory }))?.value : undefined
    return {
      key: widgetKey(widget.scope, widget.widgetId),
      scope: widget.scope,
      widgetId: widget.widgetId,
      appName: builtin ? 'Nimiq Pay' : appName(widget.scope),
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
        : 'until' in countdown
          ? { label: countdown.label, until: countdown.until }
          : head.value.height > 0 ? { label: countdown.label, until: head.value.at + (countdown.untilNimiqHeight - head.value.height) * 1000 } : undefined,
      rows: content.rows.map(row => ({ label: row.label, value: display(row.value), url: row.path })),
      chart: !chart ? undefined : 'points' in chart ? { kind: chart.kind, points: chart.points } : Array.isArray(history) ? { kind: 'line', points: history } : undefined,
      url: content.path ?? (builtin ? undefined : widget.scope),
      staleSince: widget.failures >= STALE_AFTER_FAILURES ? widget.updatedAt : undefined,
    }
  }

  const views = computed(() => widgets.value.map(w => toView(w, now.value)))

  function previewView(scope: string, definition: WidgetDefinition): WidgetView {
    return toView({ scope, widgetId: definition.id, network, size: definition.sizes[0]!, definition, definitionCheckedAt: 0, failures: 0, updatedAt: 0 }, now.value)
  }

  function lookupBudget(enabled: boolean) {
    let left = enabled ? WIDGET_LIMITS.chainLookups : 0
    return {
      take(count = 1): boolean {
        if (count > left)
          return false
        left -= count
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
    if (lookups > 0 && (!checkChain || !budget.take(lookups)))
      return
    // An unanswered trigger stops the check, so a later trigger never wins over one that could not be checked.
    for (const transition of from.next) {
      const fired = await evaluateTrigger(transition.on, chain, at)
      if (fired === undefined)
        return
      // A Mini App may have pushed a newer state while the lookup ran.
      if (fired) {
        if (find(widget.scope, widget.widgetId)?.state === from)
          replaceState(widget.scope, widget.widgetId, transition.state ?? undefined, at)
        return
      }
    }
  }

  function dueRefresh(widget: HomeWidget, at: number, force: boolean): WidgetRefresh | undefined {
    const refresh = refreshOf(shownState(widget, at), widget.definition)
    if (!refresh)
      return undefined
    const countdown = shownContent(widget, at).countdown
    const sinceLastAttempt = at - (widget.lastAttemptAt ?? Number.NEGATIVE_INFINITY)
    // One early refresh when a countdown runs out, still behind the floor so answers whose countdowns end at once are not fetched every tick.
    const countdownEnded = !!countdown && 'until' in countdown && at >= countdown.until && (widget.lastAttemptAt ?? 0) < countdown.until && sinceLastAttempt >= MIN_FORCED_REFRESH_GAP_MS
    const forced = force && sinceLastAttempt >= MIN_FORCED_REFRESH_GAP_MS
    return forced || countdownEnded || (widget.refreshDueAt ?? 0) <= at ? refresh : undefined
  }

  async function runRefresh(widget: HomeWidget, refresh: WidgetRefresh, at: number) {
    const key = widgetKey(widget.scope, widget.widgetId)
    if (inFlight.has(key))
      return
    inFlight.add(key)
    const from = widget.state
    try {
      const result = await fetchWidgetRefresh(refresh, { lang: useApp().language, network }, widget.scope, at)
      // A Mini App may have pushed a newer state while the request ran.
      if (find(widget.scope, widget.widgetId)?.state !== from) {
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
      patch(widget.scope, widget.widgetId, (w) => {
        const failures = w.failures + 1
        return { failures, lastAttemptAt: at, refreshDueAt: at + Math.min(MAX_BACKOFF_MS, refresh.every * 1000 * 2 ** failures) }
      })
    }
    finally {
      inFlight.delete(key)
    }
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
    patch(widget.scope, widget.widgetId, w => ({ definition, definitionCheckedAt: at, size: definition.sizes.includes(w.size) ? w.size : definition.sizes[0]! }))
  }

  async function resolveLive(contents: WidgetContent[], chain: WidgetChain, at: number, budget: Budget) {
    const seen = new Set<string>()
    for (const spec of contents.flatMap(liveSpecs)) {
      const key = liveKey(spec)
      if (seen.has(key))
        continue
      seen.add(key)
      const entry = live.get(key)
      const balance = 'live' in spec && isBalanceLive(spec.live)
      // A price that has never answered is retried at the chain check pace.
      if (entry && at - entry.checkedAt < (balance || entry.value === undefined ? CHAIN_CHECK_MS : PRICE_MAX_AGE_MS))
        continue
      if (balance && !budget.take())
        continue
      const fiat = useApp().selectedFiat
      const value = await ('priceHistory' in spec
        ? resolvePriceHistory(spec.priceHistory.asset, spec.priceHistory.range, chain, fiat, at)
        : resolveLiveValue(spec.live, chain, fiat, at)).catch(() => undefined)
      live.set(key, { value: value ?? entry?.value, checkedAt: at })
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
    const all = widgets.value
    const start = checkChain && all.length ? chainStart % all.length : 0
    if (checkChain)
      chainStart = start + 1
    for (const listed of [...all.slice(start), ...all.slice(0, start)]) {
      // A Mini App may have replaced the state during an earlier widget's lookup.
      const widget = find(listed.scope, listed.widgetId)
      if (!widget)
        continue
      await applyExpiryAndTriggers(widget, at, chain, checkChain, budget)
      await resolveLive([shownContent(find(widget.scope, widget.widgetId) ?? widget, at)], chain, at, budget)
    }
    const files = new Map<string, Promise<FetchOutcome<WidgetFile>>>()
    await Promise.all(widgets.value.map(async (widget) => {
      const refresh = dueRefresh(widget, at, force)
      if (refresh)
        await runRefresh(widget, refresh, at)
      if (at - widget.definitionCheckedAt >= DAY_MS)
        await recheckDefinition(widget, at, files)
    }))
    await resolveLive(widgets.value.map(w => shownContent(w, at)), chain, at, budget)
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

  async function loadGallery(scopes: string[]) {
    await Promise.all(scopes.filter(scope => !galleryFiles.has(scope)).map(async (scope) => {
      galleryFiles.set(scope, 'loading')
      const result = await fetchWidgetFile(scope)
      if (!result.ok && result.transient)
        galleryFiles.delete(scope)
      else
        galleryFiles.set(scope, result.ok ? result.value : null)
    }))
  }

  function resolvePreviews(definitions: WidgetDefinition[]) {
    const at = Date.now()
    observe(at)
    return resolveLive(definitions.map(d => localizeDefinition(d, useApp().language).content), createWidgetChain(), at, lookupBudget(true))
  }

  return {
    ready,
    widgets,
    views,
    canAdd,
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
