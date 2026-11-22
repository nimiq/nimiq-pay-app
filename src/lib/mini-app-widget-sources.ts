import type { HttpResponse } from '@capacitor/core'
import type { WidgetFile, WidgetImage, WidgetRefresh, WidgetState } from '@/lib/mini-app-widgets'
import type { NetworkMode } from '@/lib/network'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { encodeBase64 } from 'ethers'
import { isDev } from '@/lib'
import { canDownloadWidgets, CappedDownload } from '@/lib/mini-app-widget-download'
import { readWidgetImage } from '@/lib/mini-app-widget-images'
import { isAllowedWidgetOrigin, parseWidgetFile, parseWidgetState, WIDGET_FILE_NAME, WIDGET_LIMITS, widgetFileUrl, widgetScopeCandidates } from '@/lib/mini-app-widgets'
import { headerValue } from '@/lib/site-metadata'

export type FetchOutcome<T> = { ok: true, value: T } | { ok: false, error: string, transient: boolean, status?: number, retryAfterMs?: number }

const MAX_REDIRECTS = 3
const DEADLINE_MS = 15_000
const IDLE_TIMEOUT_MS = 10_000
// A hop started late still gets time to fail as itself.
const MIN_HOP_MS = 1_000
// What RFC 3986 takes raw outside a host. iOS before 17 refuses a URL with anything else, and new URL() leaves some of it.
const NOT_URI_RE = /[^\w\-.~!$&'()*+,;=:@/?%]|%(?![0-9a-f]{2})/gi
const IMAGE_ACCEPT = 'image/png, image/jpeg, image/webp'

function transientError(error: string): FetchOutcome<never> {
  return { ok: false, error, transient: true }
}

function definiteError(error: string): FetchOutcome<never> {
  return { ok: false, error, transient: false }
}

function statusError(url: string, status: number, retryAfterMs?: number): FetchOutcome<never> {
  return { ok: false, error: `${url} ${status === 404 ? 'not found' : `answered ${status}`}`, transient: status >= 500 || status === 429, status, retryAfterMs }
}

function retryAfterMs(value: string | null, now: number): number | undefined {
  if (!value)
    return undefined
  const ms = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now
  return ms > 0 ? ms : undefined
}

function identityHeaders({ token, accounts }: { token?: string, accounts?: string[] }): Record<string, string> {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(accounts?.length ? { 'Nimiq-Pay-Accounts': accounts.join(', ') } : {}),
  }
}

function isAllowedProtocol(url: URL): boolean {
  return url.protocol === 'https:' || (isDev && url.protocol === 'http:')
}

function withoutCredentials(url: URL): string {
  const copy = new URL(url.href)
  copy.username = ''
  copy.password = ''
  return copy.href
}

function queryKey(part: string): string {
  const key = part.split('=')[0]!.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(key)
  }
  catch {
    return key
  }
}

interface NativeRead<T> { accept: string, responseType: 'text' | 'arraybuffer', maxBytes: number, parse: (response: Answer, url: string) => FetchOutcome<T> }
type Answer = Pick<HttpResponse, 'status' | 'headers' | 'data'>
interface Download { timedOut: boolean, endsAt: number, id?: string }

/** Native client, so discovery needs no CORS; redirects by hand, so none leaves the origin. */
let lastDownload = 0

async function nativeGet<T>(url: string, origin: string, read: NativeRead<T>): Promise<FetchOutcome<T>> {
  if (!canDownloadWidgets())
    return transientError('this build of Nimiq Pay has no downloader for widgets')
  let timer: ReturnType<typeof setTimeout> | undefined
  const state: Download = { timedOut: false, endsAt: Date.now() + DEADLINE_MS }
  const deadline = new Promise<FetchOutcome<never>>((resolve) => {
    timer = setTimeout(() => {
      state.timedOut = true
      if (state.id)
        CappedDownload.cancel({ id: state.id }).catch(() => {})
      resolve(transientError(`${url} timed out`))
    }, DEADLINE_MS)
  })
  try {
    return await Promise.race([nativeGetHops(url, origin, read, state), deadline])
  }
  finally {
    clearTimeout(timer)
  }
}

async function nativeGetHops<T>(url: string, origin: string, read: NativeRead<T>, state: Download): Promise<FetchOutcome<T>> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (state.timedOut)
      return transientError(`${url} timed out`)
    let response: Answer
    try {
      response = await getOnce(current, read, state)
    }
    catch (error) {
      const code = (error as { code?: string } | undefined)?.code
      if (code === 'TOO_LARGE')
        return definiteError(`${current} is larger than ${read.maxBytes} bytes`)
      if (code === 'ENCODED')
        return definiteError(`${current} is in an encoding Nimiq Pay can't decode`)
      return transientError(`could not reach ${current}`)
    }
    if (response.status >= 300 && response.status < 400) {
      const location = headerValue(response.headers, 'location')
      let next: URL | undefined
      try {
        next = location ? new URL(location, current) : undefined
      }
      catch {}
      if (!next || next.origin !== origin || !isAllowedProtocol(next) || next.username || next.password)
        return definiteError(`redirect from ${current} to ${next ? withoutCredentials(next) : 'nowhere'} refused`)
      current = next.href
      continue
    }
    if (response.status !== 200)
      return statusError(current, response.status)
    // Past the deadline nobody reads the answer, and an image is costly to check.
    return state.timedOut ? transientError(`${url} timed out`) : read.parse(response, current)
  }
  return definiteError(`too many redirects from ${url}`)
}

async function getOnce<T>(url: string, { accept, maxBytes, responseType }: NativeRead<T>, state: Download): Promise<Answer> {
  // The web, which Nimiq Pay uses only in development, has no such downloader, and the Cache-Control header would need a CORS preflight there.
  if (!Capacitor.isNativePlatform())
    return CapacitorHttp.get({ url, headers: { Accept: accept }, responseType, webFetchExtra: { credentials: 'omit', cache: 'no-store' } })
  state.id = `${Date.now()}-${++lastDownload}`
  const answer = await CappedDownload.get({
    id: state.id,
    url: percentEncoded(url),
    // no-cache for caches on the way: the downloader itself keeps none.
    headers: { 'Accept': accept, 'Cache-Control': 'no-cache' },
    responseHeaders: ['location'],
    maxBytes,
    idleTimeout: IDLE_TIMEOUT_MS,
    timeout: Math.max(MIN_HOP_MS, state.endsAt - Date.now()),
  })
  return responseType === 'text' ? { ...answer, data: new TextDecoder().decode(Uint8Array.from(atob(answer.data), c => c.charCodeAt(0))) } : answer
}

function percentEncoded(url: string): string {
  const { origin, pathname, search } = new URL(url)
  return origin + `${pathname}${search}`.replace(NOT_URI_RE, encodeURIComponent)
}

const WIDGET_FILE_READ: NativeRead<unknown> = {
  accept: 'application/json',
  responseType: 'text',
  maxBytes: WIDGET_LIMITS.fileBytes,
  parse(response, url) {
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    if (new TextEncoder().encode(body).length > WIDGET_LIMITS.fileBytes)
      return definiteError(`${url} is larger than ${WIDGET_LIMITS.fileBytes} bytes`)
    if (typeof response.data !== 'string')
      return { ok: true, value: response.data }
    try {
      return { ok: true, value: JSON.parse(body) }
    }
    catch {
      return definiteError(`${url} is not JSON`)
    }
  },
}

export async function fetchWidgetFile(scope: string, now = Date.now()): Promise<FetchOutcome<WidgetFile>> {
  let origin: string
  try {
    origin = new URL(scope).origin
  }
  catch {
    return definiteError(`${scope} is not a URL`)
  }
  if (!isAllowedWidgetOrigin(origin, isDev))
    return definiteError(`${origin} cannot serve widgets`)
  const response = await nativeGet(widgetFileUrl(scope), origin, WIDGET_FILE_READ)
  if (!response.ok)
    return response
  const parsed = parseWidgetFile(response.value, { origin, base: scope, now, allowInsecure: isDev })
  return parsed.ok ? parsed : { ...parsed, transient: false }
}

/** A URL a widget of this folder may be served from, for a request carrying nothing of the user's beyond what its caller adds. */
function onWidgetOrigin(url: string, scope: string): { origin: string, target: URL } | undefined {
  try {
    const origin = new URL(scope).origin
    const target = new URL(url)
    return target.origin === origin && isAllowedProtocol(target) && isAllowedWidgetOrigin(origin, isDev) && !target.username && !target.password ? { origin, target } : undefined
  }
  catch {
    return undefined
  }
}

export async function fetchWidgetImage(image: WidgetImage, scope: string, token?: string, signal?: AbortSignal): Promise<FetchOutcome<string>> {
  const place = onWidgetOrigin(image.url, scope)
  if (!place)
    return definiteError(`${image.url} cannot serve this widget's images`)
  if (image.sendToken) {
    if (!token)
      return definiteError(`${image.url} needs the widget's token`)
    const answer = await fetchWithoutCookies(image.url, { Accept: IMAGE_ACCEPT, ...identityHeaders({ token }) }, WIDGET_LIMITS.imageBytes, Date.now(), signal)
    if (!answer.ok)
      return answer
    const read = readWidgetImage(encodeBase64(answer.value), image.sha256)
    return read.ok ? read : definiteError(`${image.url}: ${read.error}`)
  }
  return nativeGet(image.url, place.origin, {
    accept: IMAGE_ACCEPT,
    responseType: 'arraybuffer',
    maxBytes: WIDGET_LIMITS.imageBytes,
    parse(response, url) {
      const read = readWidgetImage(String(response.data), image.sha256)
      return read.ok ? read : definiteError(`${url}: ${read.error}`)
    },
  })
}

/** Only a definite miss moves up a folder: after a network error the search stops, so a parent folder's file is never taken for this Mini App's. */
export async function findWidgetFile(url: string, now = Date.now()): Promise<FetchOutcome<{ scope: string, file: WidgetFile }>> {
  const scopes = widgetScopeCandidates(url)
  if (!scopes.length)
    return definiteError(`${url} cannot serve widgets`)
  const misses: string[] = []
  for (const scope of scopes) {
    const result = await fetchWidgetFile(scope, now)
    if (result.ok)
      return { ok: true, value: { scope, file: result.value } }
    if (result.transient)
      return result
    misses.push(`${scope} (${result.error})`)
  }
  return definiteError(`no valid ${WIDGET_FILE_NAME} in ${misses.join(', ')}`)
}

export async function fetchWidgetRefresh(
  refresh: WidgetRefresh,
  params: { lang: string, network: NetworkMode },
  scope: string,
  now = Date.now(),
  identity: { token?: string, accounts?: string[] } = {},
): Promise<FetchOutcome<WidgetState | null>> {
  const place = onWidgetOrigin(refresh.url, scope)
  if (!place)
    return definiteError(`${refresh.url} cannot answer refreshes for ${scope}`)
  const { origin, target } = place

  target.hash = ''
  const [path, rawQuery] = target.href.split(/\?(.*)/s)
  const kept = target.href.includes('?') ? rawQuery!.split('&').filter(part => !['lang', 'network'].includes(queryKey(part))) : []
  const ours = `lang=${encodeURIComponent(params.lang)}&network=${encodeURIComponent(params.network)}`
  const query = kept.join('&')
  const href = `${path}?${query ? `${query}&` : ''}${ours}`

  const answer = await fetchWithoutCookies(href, identityHeaders(identity), WIDGET_LIMITS.stateBytes, now)
  if (!answer.ok)
    return answer
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(answer.value))
  }
  catch {
    return definiteError(`${href} is not JSON`)
  }
  const parsed = parseWidgetState(json, { origin, base: scope, now, allowInsecure: isDev })
  return parsed.ok ? parsed : { ...parsed, transient: false }
}

/** For requests that carry something of the user's: not the native client, whose options, headers included, debug builds log. */
async function fetchWithoutCookies(href: string, headers: Record<string, string>, maxBytes: number, now = Date.now(), signal?: AbortSignal): Promise<FetchOutcome<Uint8Array>> {
  const controller = new AbortController()
  signal?.addEventListener('abort', () => controller.abort())
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS)
  try {
    let response: Response
    try {
      response = await fetch(href, { credentials: 'omit', redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer', headers, signal: controller.signal })
    }
    catch {
      return transientError(`could not reach ${href}`)
    }
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
      return definiteError(`${href} must not redirect`)
    if (response.status !== 200)
      return statusError(href, response.status, retryAfterMs(response.headers?.get('retry-after') ?? null, now))
    try {
      const read = await readCapped(response, maxBytes)
      return read ? { ok: true, value: read } : definiteError(`${href} is larger than ${maxBytes} bytes`)
    }
    catch {
      return transientError(`could not read ${href}`)
    }
  }
  finally {
    clearTimeout(timer)
    // A refusal's body would go on downloading, past the limit and the deadline.
    controller.abort()
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | undefined> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.length > maxBytes ? undefined : buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done)
      break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return undefined
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
