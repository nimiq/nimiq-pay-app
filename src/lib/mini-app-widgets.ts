import type { NetworkMode } from '@/lib/network'
import { CapacitorHttp } from '@capacitor/core'
import { isDev } from '@/lib'

/**
 * Mini App home widgets. A Mini App serves `nimiq-pay-widget.json` next to its start page;
 * Nimiq Pay polls the manifest's `dataUrl` and draws the returned data with its own
 * component, so no webview runs for a widget.
 * Design: https://claude.ai/artifact/PUdeepnmCuu8AMR3Pyr3xp
 */

export const WIDGET_MANIFEST_FILE = 'nimiq-pay-widget.json'

export interface WidgetManifest {
  name: string
  description?: string
  dataUrl: string
}

export interface WidgetItem {
  label: string
  /** NIM amount in luna, as an integer string. */
  luna?: string
  text?: string
}

export interface WidgetData {
  hidden?: boolean
  title?: string
  value?: WidgetItem
  rows: WidgetItem[]
  /** `until` is a unix timestamp in seconds. */
  countdown?: { label: string, until: number }
  message?: string
  tone: 'default' | 'attention'
  path?: string
  /** Seconds until the next refresh. */
  refresh: number
}

export interface WidgetDataParams {
  address: string
  network: NetworkMode
  lang: string
}

export const DEFAULT_REFRESH_S = 300
const MIN_REFRESH_S = 60
const MAX_REFRESH_S = 3600
const MAX_ROWS = 3
const LUNA_RE = /^\d{1,20}$/
const FILE_SEGMENT_RE = /\.[^/]*$/

const httpOptions = {
  headers: { Accept: 'application/json' },
  connectTimeout: 5000,
  readTimeout: 10000,
  responseType: 'json',
} as const

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function parseItem(raw: unknown): WidgetItem | undefined {
  if (!raw || typeof raw !== 'object')
    return undefined
  const item = raw as Record<string, unknown>
  const label = text(item.label, 24)
  if (!label)
    return undefined
  // An amount that isn't a plain integer string drops the item instead of showing a wrong number.
  if (item.luna !== undefined)
    return typeof item.luna === 'string' && LUNA_RE.test(item.luna) ? { label, luna: item.luna } : undefined
  const value = text(item.text, 32)
  return value ? { label, text: value } : undefined
}

/** Only https, except plain http for the local demo Mini App in development builds. */
function isAllowedProtocol(url: URL): boolean {
  return url.protocol === 'https:' || (isDev && url.protocol === 'http:')
}

/**
 * The manifest sits next to the start page: `https://x.github.io/app` and `https://x.github.io/app/`
 * both resolve to `https://x.github.io/app/nimiq-pay-widget.json`.
 */
export function widgetManifestUrl(appUrl: string): string | undefined {
  try {
    const url = new URL(appUrl)
    url.search = ''
    url.hash = ''
    if (!url.pathname.endsWith('/') && !FILE_SEGMENT_RE.test(url.pathname))
      url.pathname += '/'
    return new URL(WIDGET_MANIFEST_FILE, url).href
  }
  catch {
    return undefined
  }
}

export function parseWidgetManifest(raw: unknown, manifestUrl: string, appUrl: string): WidgetManifest | undefined {
  if (!raw || typeof raw !== 'object')
    return undefined
  const manifest = raw as Record<string, unknown>
  const name = text(manifest.name, 32)
  if (manifest.v !== 1 || !name || typeof manifest.dataUrl !== 'string')
    return undefined
  try {
    const dataUrl = new URL(manifest.dataUrl, manifestUrl)
    // The address is only ever sent to the origin the person already uses the Mini App on.
    if (dataUrl.origin !== new URL(appUrl).origin || !isAllowedProtocol(dataUrl))
      return undefined
    return { name, description: text(manifest.description, 160), dataUrl: dataUrl.href }
  }
  catch {
    return undefined
  }
}

export function parseWidgetData(raw: unknown, appUrl: string): WidgetData | undefined {
  if (!raw || typeof raw !== 'object')
    return undefined
  const data = raw as Record<string, unknown>
  if (data.v !== 1)
    return undefined

  const refresh = typeof data.refresh === 'number' && Number.isFinite(data.refresh)
    ? Math.min(MAX_REFRESH_S, Math.max(MIN_REFRESH_S, Math.round(data.refresh)))
    : DEFAULT_REFRESH_S

  if (data.hidden === true)
    return { hidden: true, rows: [], tone: 'default', refresh }

  const rows = Array.isArray(data.rows)
    ? data.rows.slice(0, MAX_ROWS).map(parseItem).filter((row): row is WidgetItem => !!row)
    : []

  let countdown: WidgetData['countdown']
  const rawCountdown = data.countdown as Record<string, unknown> | undefined
  const countdownLabel = text(rawCountdown?.label, 24)
  if (countdownLabel && typeof rawCountdown?.until === 'number' && Number.isFinite(rawCountdown.until))
    countdown = { label: countdownLabel, until: rawCountdown.until }

  // `path` may only move within the Mini App, never to another site.
  let path: string | undefined
  if (typeof data.path === 'string') {
    try {
      const target = new URL(data.path, appUrl)
      if (target.origin === new URL(appUrl).origin)
        path = target.href
    }
    catch { /* unparseable path: open the start page instead */ }
  }

  return {
    title: text(data.title, 32),
    value: parseItem(data.value),
    rows,
    countdown,
    message: text(data.message, 80),
    tone: data.tone === 'attention' ? 'attention' : 'default',
    path,
    refresh,
  }
}

/** Resolves to undefined when the Mini App has no widget or its manifest is invalid. */
export async function fetchWidgetManifest(appUrl: string): Promise<WidgetManifest | undefined> {
  const manifestUrl = widgetManifestUrl(appUrl)
  if (!manifestUrl || !isAllowedProtocol(new URL(manifestUrl)))
    return undefined
  try {
    const response = await CapacitorHttp.get({ url: manifestUrl, ...httpOptions })
    if (response.status !== 200)
      return undefined
    return parseWidgetManifest(response.data, manifestUrl, appUrl)
  }
  catch {
    return undefined
  }
}

/** Throws when the server can't be reached or answers with something we can't draw. */
export async function fetchWidgetData(manifest: WidgetManifest, appUrl: string, params: WidgetDataParams): Promise<WidgetData> {
  const url = new URL(manifest.dataUrl)
  url.searchParams.set('address', params.address)
  url.searchParams.set('network', params.network)
  url.searchParams.set('lang', params.lang)
  const response = await CapacitorHttp.get({ url: url.href, ...httpOptions })
  if (response.status !== 200)
    throw new Error(`Widget data for ${appUrl} answered ${response.status}`)
  const data = parseWidgetData(response.data, appUrl)
  if (!data)
    throw new Error(`Widget data for ${appUrl} failed validation`)
  return data
}
