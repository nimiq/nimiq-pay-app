import type { HttpResponse } from '@capacitor/core'
import type { WidgetFile, WidgetRefresh, WidgetState } from '@/lib/mini-app-widgets'
import type { NetworkMode } from '@/lib/network'
import { CapacitorHttp } from '@capacitor/core'
import { isDev } from '@/lib'
import { isAllowedWidgetOrigin, parseWidgetFile, parseWidgetState, WIDGET_FILE_NAME, WIDGET_LIMITS, widgetFileUrl, widgetScopeCandidates } from '@/lib/mini-app-widgets'
import { headerValue } from '@/lib/site-metadata'

export type FetchOutcome<T> = { ok: true, value: T } | { ok: false, error: string, transient: boolean }

const MAX_REDIRECTS = 3
const DEADLINE_MS = 15_000

function transientError(error: string): FetchOutcome<never> {
  return { ok: false, error, transient: true }
}

function definiteError(error: string): FetchOutcome<never> {
  return { ok: false, error, transient: false }
}

function statusError(url: string, status: number): FetchOutcome<never> {
  return { ok: false, error: `${url} ${status === 404 ? 'not found' : `answered ${status}`}`, transient: status >= 500 || status === 429 }
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

/** Native client, so discovery needs no CORS; redirects by hand, so none leaves the origin. */
async function getJson(url: string, origin: string, maxBytes: number): Promise<FetchOutcome<unknown>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const state = { timedOut: false }
  const deadline = new Promise<FetchOutcome<never>>((resolve) => {
    timer = setTimeout(() => {
      state.timedOut = true
      resolve(transientError(`${url} timed out`))
    }, DEADLINE_MS)
  })
  try {
    return await Promise.race([getJsonHops(url, origin, maxBytes, state), deadline])
  }
  finally {
    clearTimeout(timer)
  }
}

async function getJsonHops(url: string, origin: string, maxBytes: number, state: { timedOut: boolean }): Promise<FetchOutcome<unknown>> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (state.timedOut)
      return transientError(`${url} timed out`)
    let response: HttpResponse
    try {
      response = await CapacitorHttp.get({
        url: current,
        headers: { Accept: 'application/json' },
        responseType: 'text',
        disableRedirects: true,
        webFetchExtra: { credentials: 'omit' },
        connectTimeout: 5_000,
        readTimeout: 10_000,
      })
    }
    catch {
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
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    if (new TextEncoder().encode(body).length > maxBytes)
      return definiteError(`${current} is larger than ${maxBytes} bytes`)
    if (typeof response.data !== 'string')
      return { ok: true, value: response.data }
    try {
      return { ok: true, value: JSON.parse(body) }
    }
    catch {
      return definiteError(`${current} is not JSON`)
    }
  }
  return definiteError(`too many redirects from ${url}`)
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
  const response = await getJson(widgetFileUrl(scope), origin, WIDGET_LIMITS.fileBytes)
  if (!response.ok)
    return response
  const parsed = parseWidgetFile(response.value, { origin, base: scope, now, allowInsecure: isDev })
  return parsed.ok ? parsed : { ...parsed, transient: false }
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
): Promise<FetchOutcome<WidgetState | null>> {
  let origin: string
  let target: URL
  try {
    origin = new URL(scope).origin
    target = new URL(refresh.url)
  }
  catch {
    return definiteError(`${refresh.url} is not a URL`)
  }
  if (target.origin !== origin || !isAllowedProtocol(target) || !isAllowedWidgetOrigin(origin, isDev) || target.username || target.password)
    return definiteError(`${target.origin} cannot answer refreshes for ${origin}`)

  target.hash = ''
  const [path, rawQuery] = target.href.split(/\?(.*)/s)
  const kept = target.href.includes('?') ? rawQuery!.split('&').filter(part => !['lang', 'network'].includes(queryKey(part))) : []
  const ours = `lang=${encodeURIComponent(params.lang)}&network=${encodeURIComponent(params.network)}`
  const query = kept.join('&')
  const href = `${path}?${query ? `${query}&` : ''}${ours}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS)
  try {
    // Refreshes skip the native client because it sends and stores the site's cookies.
    let response: Response
    try {
      response = await fetch(href, { credentials: 'omit', redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal })
    }
    catch {
      return transientError(`could not reach ${href}`)
    }
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
      return definiteError(`refresh URLs must not redirect (${href})`)
    if (response.status !== 200)
      return statusError(href, response.status)

    let bytes: Uint8Array
    try {
      const read = await readCapped(response, WIDGET_LIMITS.stateBytes)
      if (!read)
        return definiteError(`${href} is larger than ${WIDGET_LIMITS.stateBytes} bytes`)
      bytes = read
    }
    catch {
      return transientError(`could not read ${href}`)
    }

    let json: unknown
    try {
      json = JSON.parse(new TextDecoder().decode(bytes))
    }
    catch {
      return definiteError(`${href} is not JSON`)
    }
    const parsed = parseWidgetState(json, { origin, base: scope, now, allowInsecure: isDev })
    return parsed.ok ? parsed : { ...parsed, transient: false }
  }
  finally {
    clearTimeout(timer)
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
