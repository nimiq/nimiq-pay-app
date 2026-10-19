/** Untrusted input: Nimiq Pay draws widget files and states itself, so every field is parsed here first. Format: docs/MINI-APP-WIDGETS.md. */

import { ValidationUtils } from '@nimiq/utils/validation-utils'

export const WIDGET_FILE_NAME = 'nimiq-pay-widgets.json'

export const WIDGET_SIZES = ['icon', 'small', 'medium', 'large'] as const
export type WidgetSize = (typeof WIDGET_SIZES)[number]

export const WIDGET_ASSETS = ['NIM', 'BTC', 'ETH', 'USDT'] as const
export type WidgetAsset = (typeof WIDGET_ASSETS)[number]

export const PRICE_RANGES = ['24h', '7d', '30d'] as const
export type PriceRange = (typeof PRICE_RANGES)[number]

const TONES = ['neutral', 'positive', 'attention', 'negative'] as const
export type WidgetTone = (typeof TONES)[number]

export const WIDGET_LIMITS = {
  widgetsPerFile: 6,
  widgetsOnHome: 10,
  label: 24,
  valueText: 28,
  info: 40,
  rowLabel: 20,
  name: 32,
  description: 120,
  rows: 3,
  chartPoints: 48,
  triggersPerState: 8,
  nextDepth: 3,
  chainLookups: 10,
  stateBytes: 8 * 1024,
  fileBytes: 32 * 1024,
  refreshMinS: 60,
  refreshMaxS: 24 * 60 * 60,
  horizonMs: 30 * 24 * 60 * 60 * 1000,
} as const

export type LiveValue
  = | { nimiqBalance: string }
    | { nimiqStake: { address: string, part: 'active' | 'inactive' } }
    | { usdtBalance: string }
    | { price: WidgetAsset }
    | { priceChange: { asset: WidgetAsset, range: PriceRange } }

export type WidgetValue = { text: string } | { amount: string, currency: string } | { live: LiveValue }

export interface WidgetRow {
  label: string
  value: WidgetValue
  path?: string
}

export type WidgetChart
  = | { kind: 'line' | 'bars', points: number[] }
    | { kind: 'line', priceHistory: { asset: WidgetAsset, range: PriceRange } }

export type WidgetCountdown = { label: string, until: number } | { label: string, untilNimiqHeight: number }

export interface WidgetContent {
  label?: string
  value: WidgetValue
  info?: string | { live: LiveValue }
  tone: WidgetTone
  progress?: number
  countdown?: WidgetCountdown
  rows: WidgetRow[]
  chart?: WidgetChart
  /** Absolute URL on the Mini App's origin. */
  path?: string
}

export type WidgetTrigger
  = | { at: number }
    | { nimiqHeight: number }
    | { nimiqTx: string, status: 'confirmed' | 'failed' }
    | { nimiqPayment: { to: string, minValue: string, since: number } }
    | { polygonTx: string, status: 'confirmed' | 'failed' }

export interface WidgetRefresh {
  /** Absolute URL on the Mini App's origin. */
  url: string
  /** Seconds between refreshes. */
  every: number
}

export interface WidgetTransition {
  on: WidgetTrigger
  /** null returns the widget to its resting state. */
  state: WidgetState | null
}

export interface WidgetState {
  content: WidgetContent
  expiresAt?: number
  next: WidgetTransition[]
  refresh?: WidgetRefresh
}

export interface WidgetDefinition {
  id: string
  name: string
  description?: string
  /** Non-empty; the first is the default size. */
  sizes: WidgetSize[]
  content: WidgetContent
  refresh?: WidgetRefresh
  translations: Record<string, { name?: string, description?: string, content?: WidgetContent }>
}

export interface WidgetFile {
  widgets: WidgetDefinition[]
}

export type ParseResult<T> = { ok: true, value: T } | { ok: false, error: string }

export interface ParseContext {
  /** Lower-case, as `URL.origin` gives it; URLs may not leave it. */
  origin: string
  /** The widget's scope. */
  base: string
  now: number
  /** Plain http and IP or local hosts, for development builds only. */
  allowInsecure: boolean
}

const L = WIDGET_LIMITS
const AMOUNT_RE = /^\d{1,18}(?:\.\d{1,18})?$/
const CURRENCY_RE = /^[A-Z0-9]{2,8}$/
const NIMIQ_HASH_RE = /^[0-9a-f]{64}$/
const EVM_ADDRESS_RE = /^0x[0-9a-f]{40}$/
const EVM_HASH_RE = /^0x[0-9a-f]{64}$/
const WIDGET_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/
const LANGUAGE_RE = /^[a-z]{2}$/
const CONTROLS_RE = /[\p{Cc}\p{Cs}\u2028\u2029\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/gu
const BLANK_RE = /^[\s\u2800\p{Default_Ignorable_Code_Point}]*$/u
const MARK_RE = /\p{M}/u
const MAX_GRAPHEME_CODE_POINTS = 12
const MAX_GRAPHEME_MARKS = 6
const LOCAL_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa', '.lan']
const MAX_CHART_VALUE = 1e15
const IP_HOST_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i
const TX_STATUSES = ['confirmed', 'failed'] as const
const LIVE_KINDS = ['nimiqBalance', 'nimiqStake', 'usdtBalance', 'price', 'priceChange'] as const
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

class InvalidField extends Error {}

function fail(path: string, message: string): never {
  throw new InvalidField(`${path}: ${message}`)
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function record(raw: unknown, path: string): Record<string, unknown> {
  if (!isRecord(raw))
    fail(path, 'expected an object')
  return raw
}

function list(raw: unknown, path: string): unknown[] {
  if (!Array.isArray(raw))
    fail(path, 'expected a list')
  return raw
}

// Whole graphemes only: cutting inside one could leave a joiner that fuses with the next, so text stops at the first oversized grapheme.
function text(raw: unknown, max: number, path: string): string {
  if (typeof raw !== 'string')
    fail(path, 'expected a string')
  const cleaned = raw.normalize('NFC').replace(CONTROLS_RE, '').trim()
  let result = ''
  let count = 0
  for (const { segment } of graphemes.segment(cleaned)) {
    const codePoints = Array.from(segment)
    if (count >= max || codePoints.length > MAX_GRAPHEME_CODE_POINTS || codePoints.filter(char => MARK_RE.test(char)).length > MAX_GRAPHEME_MARKS)
      break
    result += segment
    count++
  }
  result = result.trim()
  if (BLANK_RE.test(result))
    fail(path, 'must not be empty')
  return result
}

function oneOf<T extends string>(raw: unknown, options: readonly T[], path: string): T {
  if (typeof raw !== 'string' || !(options as readonly string[]).includes(raw))
    fail(path, `expected one of ${options.join(', ')}`)
  return raw as T
}

function time(raw: unknown, ctx: ParseContext, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw))
    fail(path, 'expected a timestamp in milliseconds')
  if (Math.abs(raw - ctx.now) > L.horizonMs)
    fail(path, 'must be within 30 days from now')
  return Math.round(raw)
}

function height(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0)
    fail(path, 'expected a positive block height')
  return raw
}

function amount(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || !AMOUNT_RE.test(raw))
    fail(path, 'expected a decimal string such as "0.05"')
  return raw
}

export function normalizeNimiqAddress(raw: string): string | undefined {
  const compact = raw.replace(/\s+/g, '').toUpperCase()
  return ValidationUtils.isValidAddress(compact) ? compact.match(/.{4}/g)!.join(' ') : undefined
}

function nimiqAddress(raw: unknown, path: string): string {
  const address = typeof raw === 'string' ? normalizeNimiqAddress(raw) : undefined
  if (!address)
    fail(path, 'expected a Nimiq address')
  return address
}

function hex(raw: unknown, pattern: RegExp, what: string, path: string): string {
  const value = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (!pattern.test(value))
    fail(path, `expected ${what}`)
  return value
}

export function isAllowedWidgetOrigin(origin: string, allowInsecure: boolean): boolean {
  let url: URL
  try {
    url = new URL(origin)
  }
  catch {
    return false
  }
  if (url.origin !== origin)
    return false
  if (allowInsecure)
    return url.protocol === 'https:' || url.protocol === 'http:'
  const host = url.hostname
  return url.protocol === 'https:'
    && host.includes('.')
    && !host.endsWith('.')
    && !IP_HOST_RE.test(host)
    && !LOCAL_SUFFIXES.some(suffix => host.endsWith(suffix))
}

export function widgetFileUrl(scope: string): string {
  return `${scope}${WIDGET_FILE_NAME}`
}

/** The opened path counts as a folder, so a Mini App at `/my-app` is found and a route such as `/swap` costs one miss. */
export function widgetScopeCandidates(url: string): string[] {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return []
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    return []
  const segments = parsed.pathname.split('/').filter(Boolean)
  const folders = segments.map((_, i) => `${parsed.origin}/${segments.slice(0, segments.length - i).join('/')}/`)
  return [...folders.slice(0, 3), `${parsed.origin}/`]
}

// The origin, not the scope, is the boundary; the scheme is checked too, as blob: URLs carry their inner origin.
function resolveOnOrigin(raw: string, ctx: ParseContext): string | undefined {
  let url: URL
  try {
    url = new URL(raw, ctx.base)
  }
  catch {
    return undefined
  }
  const secure = url.protocol === 'https:' || (ctx.allowInsecure && url.protocol === 'http:')
  return secure && !url.username && !url.password && url.origin === ctx.origin ? url.href : undefined
}

function sameOrigin(raw: unknown, ctx: ParseContext, path: string): string {
  if (typeof raw !== 'string')
    fail(path, 'expected a path')
  return resolveOnOrigin(raw, ctx) ?? fail(path, `must stay on ${ctx.origin} over ${ctx.allowInsecure ? 'http(s)' : 'https'}, without credentials`)
}

// A link that leaves the origin is dropped, the rest of the content stays usable.
function linkOnOrigin(raw: unknown, ctx: ParseContext, path: string): string | undefined {
  if (typeof raw !== 'string')
    fail(path, 'expected a path')
  return resolveOnOrigin(raw, ctx)
}

function atMostOne(r: Record<string, unknown>, keys: readonly string[], path: string) {
  if (keys.filter(key => r[key] !== undefined).length > 1)
    fail(path, `expected only one of ${keys.join(', ')}`)
}

function priceSeries(raw: unknown, path: string): { asset: WidgetAsset, range: PriceRange } {
  const r = record(raw, path)
  return { asset: oneOf(r.asset, WIDGET_ASSETS, `${path}.asset`), range: oneOf(r.range, PRICE_RANGES, `${path}.range`) }
}

function liveValue(raw: unknown, path: string): LiveValue {
  const r = record(raw, path)
  if (LIVE_KINDS.filter(kind => kind in r).length !== 1)
    fail(path, `expected exactly one of ${LIVE_KINDS.join(', ')}`)
  if ('nimiqBalance' in r)
    return { nimiqBalance: nimiqAddress(r.nimiqBalance, `${path}.nimiqBalance`) }
  if ('nimiqStake' in r) {
    const stake = record(r.nimiqStake, `${path}.nimiqStake`)
    return {
      nimiqStake: {
        address: nimiqAddress(stake.address, `${path}.nimiqStake.address`),
        part: oneOf(stake.part, ['active', 'inactive'] as const, `${path}.nimiqStake.part`),
      },
    }
  }
  if ('usdtBalance' in r)
    return { usdtBalance: hex(r.usdtBalance, EVM_ADDRESS_RE, 'a Polygon address', `${path}.usdtBalance`) }
  if ('price' in r)
    return { price: oneOf(r.price, WIDGET_ASSETS, `${path}.price`) }
  return { priceChange: priceSeries(r.priceChange, `${path}.priceChange`) }
}

function value(raw: unknown, path: string): WidgetValue {
  const r = record(raw, path)
  atMostOne(r, ['text', 'amount', 'live'], path)
  if ('live' in r)
    return { live: liveValue(r.live, `${path}.live`) }
  if ('amount' in r) {
    if (typeof r.currency !== 'string' || !CURRENCY_RE.test(r.currency))
      fail(`${path}.currency`, 'expected a currency code such as "NIM" or "EUR"')
    return { amount: amount(r.amount, `${path}.amount`), currency: r.currency }
  }
  return { text: text(r.text, L.valueText, `${path}.text`) }
}

function chart(raw: unknown, path: string): WidgetChart {
  const r = record(raw, path)
  atMostOne(r, ['priceHistory', 'points'], path)
  if (r.priceHistory !== undefined) {
    if (r.kind !== undefined && r.kind !== 'line')
      fail(`${path}.kind`, 'a price history is drawn as a line')
    return { kind: 'line', priceHistory: priceSeries(r.priceHistory, `${path}.priceHistory`) }
  }
  const kind = oneOf(r.kind, ['line', 'bars'] as const, `${path}.kind`)
  const points = list(r.points, `${path}.points`)
  if (points.length < 2 || points.length > L.chartPoints || !points.every(p => typeof p === 'number' && Number.isFinite(p) && Math.abs(p) <= MAX_CHART_VALUE))
    fail(`${path}.points`, `expected 2 to ${L.chartPoints} numbers, each at most 1e15`)
  return { kind, points: points as number[] }
}

function content(raw: unknown, ctx: ParseContext, path: string): WidgetContent {
  const r = record(raw, path)
  const result: WidgetContent = {
    value: value(r.value, `${path}.value`),
    tone: r.tone === undefined ? 'neutral' : oneOf(r.tone, TONES, `${path}.tone`),
    rows: [],
  }
  if (r.label !== undefined)
    result.label = text(r.label, L.label, `${path}.label`)
  if (r.info !== undefined) {
    result.info = isRecord(r.info)
      ? { live: liveValue(r.info.live, `${path}.info.live`) }
      : text(r.info, L.info, `${path}.info`)
  }
  if (r.progress !== undefined) {
    if (typeof r.progress !== 'number' || !Number.isFinite(r.progress))
      fail(`${path}.progress`, 'expected a number from 0 to 1')
    result.progress = Math.min(1, Math.max(0, r.progress))
  }
  if (r.countdown !== undefined) {
    const countdown = record(r.countdown, `${path}.countdown`)
    atMostOne(countdown, ['until', 'untilNimiqHeight'], `${path}.countdown`)
    const label = text(countdown.label, L.label, `${path}.countdown.label`)
    result.countdown = countdown.untilNimiqHeight !== undefined
      ? { label, untilNimiqHeight: height(countdown.untilNimiqHeight, `${path}.countdown.untilNimiqHeight`) }
      : { label, until: time(countdown.until, ctx, `${path}.countdown.until`) }
  }
  if (r.rows !== undefined) {
    const rows = list(r.rows, `${path}.rows`)
    if (rows.length > L.rows)
      fail(`${path}.rows`, `at most ${L.rows} rows`)
    result.rows = rows.map((raw, i) => {
      const rowPath = `${path}.rows[${i}]`
      const row = record(raw, rowPath)
      const link = row.path !== undefined ? linkOnOrigin(row.path, ctx, `${rowPath}.path`) : undefined
      return {
        label: text(row.label, L.rowLabel, `${rowPath}.label`),
        value: value(row.value, `${rowPath}.value`),
        ...(link ? { path: link } : {}),
      }
    })
  }
  if (r.chart !== undefined)
    result.chart = chart(r.chart, `${path}.chart`)
  const link = r.path !== undefined ? linkOnOrigin(r.path, ctx, `${path}.path`) : undefined
  if (link)
    result.path = link
  return result
}

function refresh(raw: unknown, ctx: ParseContext, path: string): WidgetRefresh {
  const r = record(raw, path)
  const url = sameOrigin(r.url, ctx, `${path}.url`)
  if (typeof r.every !== 'number' || !Number.isFinite(r.every))
    fail(`${path}.every`, 'expected a number of seconds')
  return { url, every: Math.min(L.refreshMaxS, Math.max(L.refreshMinS, Math.round(r.every))) }
}

function trigger(raw: unknown, ctx: ParseContext, path: string): WidgetTrigger {
  const r = record(raw, path)
  atMostOne(r, ['at', 'nimiqHeight', 'nimiqTx', 'nimiqPayment', 'polygonTx'], path)
  if (r.at !== undefined)
    return { at: time(r.at, ctx, `${path}.at`) }
  if (r.nimiqHeight !== undefined)
    return { nimiqHeight: height(r.nimiqHeight, `${path}.nimiqHeight`) }
  if (r.nimiqTx !== undefined)
    return { nimiqTx: hex(r.nimiqTx, NIMIQ_HASH_RE, 'a Nimiq transaction hash', `${path}.nimiqTx`), status: oneOf(r.status, TX_STATUSES, `${path}.status`) }
  if (r.polygonTx !== undefined)
    return { polygonTx: hex(r.polygonTx, EVM_HASH_RE, 'a Polygon transaction hash', `${path}.polygonTx`), status: oneOf(r.status, TX_STATUSES, `${path}.status`) }
  if (r.nimiqPayment !== undefined) {
    const payment = record(r.nimiqPayment, `${path}.nimiqPayment`)
    return {
      nimiqPayment: {
        to: nimiqAddress(payment.to, `${path}.nimiqPayment.to`),
        minValue: amount(payment.minValue, `${path}.nimiqPayment.minValue`),
        since: time(payment.since, ctx, `${path}.nimiqPayment.since`),
      },
    }
  }
  fail(path, 'expected one of at, nimiqHeight, nimiqTx, nimiqPayment, polygonTx')
}

function state(raw: unknown, ctx: ParseContext, path: string, depth: number): WidgetState {
  const r = record(raw, path)
  const result: WidgetState = { content: content(r.content, ctx, `${path}.content`), next: [] }
  if (r.expiresAt !== undefined)
    result.expiresAt = time(r.expiresAt, ctx, `${path}.expiresAt`)
  if (r.refresh !== undefined)
    result.refresh = refresh(r.refresh, ctx, `${path}.refresh`)
  if (r.next !== undefined) {
    const next = list(r.next, `${path}.next`)
    if (next.length > L.triggersPerState)
      fail(`${path}.next`, `at most ${L.triggersPerState} triggers`)
    if (next.length && depth >= L.nextDepth)
      fail(`${path}.next`, `at most ${L.nextDepth} levels`)
    result.next = next.map((raw, i) => {
      const itemPath = `${path}.next[${i}]`
      const item = record(raw, itemPath)
      return {
        on: trigger(item.on, ctx, `${itemPath}.on`),
        state: item.state === null ? null : state(item.state, ctx, `${itemPath}.state`, depth + 1),
      }
    })
  }
  return result
}

function attempt<T>(run: () => T): ParseResult<T> {
  try {
    return { ok: true, value: run() }
  }
  catch (error) {
    if (error instanceof InvalidField)
      return { ok: false, error: error.message }
    throw error
  }
}

export function parseWidgetState(raw: unknown, ctx: ParseContext): ParseResult<WidgetState | null> {
  if (raw === null)
    return { ok: true, value: null }
  return attempt(() => {
    let size: number
    try {
      size = new TextEncoder().encode(JSON.stringify(raw)).length
    }
    catch {
      fail('state', 'is not plain JSON')
    }
    if (size > L.stateBytes)
      fail('state', `is larger than ${L.stateBytes} bytes`)
    return state(raw, ctx, 'state', 0)
  })
}

/** An empty widget list is valid: a file that declares nothing withdraws every widget of its scope. */
export function parseWidgetFile(raw: unknown, ctx: ParseContext): ParseResult<WidgetFile> {
  return attempt(() => {
    const r = record(raw, 'file')
    if (r.v !== 1)
      fail('file.v', 'expected 1')
    const widgets = list(r.widgets, 'file.widgets')
    if (widgets.length > L.widgetsPerFile)
      fail('file.widgets', `at most ${L.widgetsPerFile} widgets`)
    const ids = new Set<string>()
    return {
      widgets: widgets.map((raw, i) => {
        const path = `file.widgets[${i}]`
        const w = record(raw, path)
        if (typeof w.id !== 'string' || !WIDGET_ID_RE.test(w.id))
          fail(`${path}.id`, 'expected lower-case letters, digits and dashes, at most 32')
        if (ids.has(w.id))
          fail(`${path}.id`, 'is declared twice')
        ids.add(w.id)
        const sizes = list(w.sizes, `${path}.sizes`)
        if (!sizes.length)
          fail(`${path}.sizes`, 'expected at least one size')
        const definition: WidgetDefinition = {
          id: w.id,
          name: text(w.name, L.name, `${path}.name`),
          sizes: [...new Set(sizes.map((s, j) => oneOf(s, WIDGET_SIZES, `${path}.sizes[${j}]`)))],
          content: content(w.content, ctx, `${path}.content`),
          translations: {},
        }
        if (w.description !== undefined)
          definition.description = text(w.description, L.description, `${path}.description`)
        if (w.refresh !== undefined)
          definition.refresh = refresh(w.refresh, ctx, `${path}.refresh`)
        if (w.translations !== undefined) {
          for (const [language, raw] of Object.entries(record(w.translations, `${path}.translations`))) {
            if (!LANGUAGE_RE.test(language))
              fail(`${path}.translations`, `${JSON.stringify(language.slice(0, 16))} is not a two-letter language code`)
            const entryPath = `${path}.translations.${language}`
            const entry = record(raw, entryPath)
            definition.translations[language] = {
              ...(entry.name !== undefined ? { name: text(entry.name, L.name, `${entryPath}.name`) } : {}),
              ...(entry.description !== undefined ? { description: text(entry.description, L.description, `${entryPath}.description`) } : {}),
              ...(entry.content !== undefined ? { content: content(entry.content, ctx, `${entryPath}.content`) } : {}),
            }
          }
        }
        return definition
      }),
    }
  })
}

export function localizeDefinition(def: WidgetDefinition, language: string): { name: string, description?: string, content: WidgetContent } {
  const translation = def.translations[language.slice(0, 2).toLowerCase()]
  return {
    name: translation?.name ?? def.name,
    description: translation?.description ?? def.description,
    content: translation?.content ?? def.content,
  }
}
