import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256HexOfBytes } from '@/lib/crypto'

const { cancelled, capped, clearAllCookies, get, isNativePlatform, isPluginAvailable } = vi.hoisted(() => ({ cancelled: vi.fn(), capped: vi.fn(), clearAllCookies: vi.fn(), get: vi.fn(), isNativePlatform: vi.fn(), isPluginAvailable: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform, isPluginAvailable }, CapacitorCookies: { clearAllCookies }, CapacitorHttp: { get }, registerPlugin: () => ({ get: capped, cancel: cancelled }) }))
vi.mock('@/lib', () => ({ isDev: false }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { fetchWidgetFile, fetchWidgetImage, fetchWidgetRefresh, findWidgetFile } = await import('./mini-app-widget-sources')

const NOW = Date.UTC(2026, 9, 19, 12)
const SCOPE = 'https://swap.example/'
const FILE = { v: 1, widgets: [{ id: 'swap', name: 'Swap status', sizes: ['medium'], content: { value: { text: 'Start a swap' }, path: 'status' } }] }

// Native clients hand over a JSON body already parsed, so objects stay objects.
function respond(status: number, data: unknown, headers: Record<string, string> = {}) {
  return { status, data, headers, url: '' }
}

function streamed(chunks: string[], init: { status?: number, type?: string } = {}) {
  const cancel = vi.fn(async () => {})
  const encoded = chunks.map(chunk => new TextEncoder().encode(chunk))
  const reader = { read: vi.fn(async () => encoded.length ? { done: false, value: encoded.shift()! } : { done: true, value: undefined }), cancel }
  return { status: init.status ?? 200, type: init.type ?? 'basic', body: { getReader: () => reader }, cancel }
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAUCAYAAAAAAAA='
const PARAMS = { lang: 'en', network: 'mainnet' } as const
const REFRESH = { url: 'https://swap.example/w', every: 60 }
const STATE = JSON.stringify({ content: { value: { text: 'Done' } } })

beforeEach(() => {
  clearAllCookies.mockReset()
  get.mockReset()
  // The web path, unless a test is about the phone.
  isNativePlatform.mockReturnValue(false)
  isPluginAvailable.mockReturnValue(true)
  capped.mockReset()
  cancelled.mockReset().mockResolvedValue(undefined)
  sessionStorage.clear()
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('downloads on a phone', () => {
  const bytes = Uint8Array.from(atob(PNG), c => c.charCodeAt(0))
  const IMAGE = { url: `${SCOPE}a.png`, sha256: sha256HexOfBytes(bytes) }
  const answer = (status: number, data = '', headers: Record<string, string> = {}) => ({ status, data, headers })
  const tooLarge = () => Object.assign(new Error('too large'), { code: 'TOO_LARGE' })

  beforeEach(() => {
    isNativePlatform.mockReturnValue(true)
  })

  it('read a file through the downloader that stops at 32 KB', async () => {
    capped.mockResolvedValue(answer(200, btoa(JSON.stringify(FILE))))
    expect((await fetchWidgetFile(SCOPE, NOW)).ok).toBe(true)
    expect(capped).toHaveBeenCalledWith({
      id: expect.any(String),
      responseHeaders: ['location'],
      url: `${SCOPE}nimiq-pay-widgets.json`,
      headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
      maxBytes: 32 * 1024,
      idleTimeout: 10_000,
      timeout: expect.any(Number),
    })
    expect(get).not.toHaveBeenCalled()
  })

  it('read a file\'s text as UTF-8', async () => {
    const named = new TextEncoder().encode(JSON.stringify({ ...FILE, name: 'Café Krone' }))
    capped.mockResolvedValue(answer(200, btoa(String.fromCharCode(...named))))
    const result = await fetchWidgetFile(SCOPE, NOW)
    expect(result.ok && result.value.widgets[0]!.appName).toBe('Café Krone')
  })

  it('read an image through it, stopping at 256 KB', async () => {
    capped.mockResolvedValue(answer(200, PNG))
    expect((await fetchWidgetImage(IMAGE, SCOPE)).ok).toBe(true)
    expect(capped.mock.calls[0]![0]).toMatchObject({ maxBytes: 256 * 1024, headers: { 'Cache-Control': 'no-cache' } })
    expect(get).not.toHaveBeenCalled()
  })

  it('refuse for good what went over the limit, as a check after the download does', async () => {
    capped.mockRejectedValue(tooLarge())
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: false, error: expect.stringContaining('larger than 32768 bytes') })
    expect(await fetchWidgetImage(IMAGE, SCOPE)).toMatchObject({ ok: false, transient: false, error: expect.stringContaining('larger than 262144 bytes') })
  })

  it('move up a folder past a file that is too large', async () => {
    capped.mockRejectedValueOnce(tooLarge())
    capped.mockResolvedValue(answer(200, btoa(JSON.stringify(FILE))))
    const found = await findWidgetFile(`${SCOPE}app/`, NOW)
    expect(found.ok && found.value.scope).toBe(SCOPE)
  })

  it('refuse for good an encoding the downloader can\'t decode', async () => {
    capped.mockRejectedValue(Object.assign(new Error('encoded'), { code: 'ENCODED' }))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: false, error: expect.stringContaining('can\'t decode') })
    expect(await fetchWidgetImage(IMAGE, SCOPE)).toMatchObject({ ok: false, transient: false, error: expect.stringContaining('can\'t decode') })
  })

  it('stop the transfer under way at the deadline', async () => {
    vi.useFakeTimers()
    capped.mockResolvedValueOnce(answer(301, '', { location: '/moved.png' }))
    capped.mockReturnValueOnce(new Promise(() => {}))
    const result = fetchWidgetImage(IMAGE, SCOPE)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toMatchObject({ ok: false, transient: true })
    const [first, second] = capped.mock.calls.map(([options]) => options.id)
    expect(second).not.toBe(first)
    expect(cancelled).toHaveBeenCalledExactlyOnceWith({ id: second })
  })

  it('may retry what timed out', async () => {
    capped.mockRejectedValue(new Error('the download took too long'))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
  })

  it('follow a redirect on the origin by hand', async () => {
    capped.mockResolvedValueOnce(answer(301, '', { location: '/moved.png' }))
    capped.mockResolvedValueOnce(answer(200, PNG))
    expect((await fetchWidgetImage(IMAGE, SCOPE)).ok).toBe(true)
    expect(capped.mock.calls[1]![0].url).toBe(`${SCOPE}moved.png`)
  })

  it('give each hop only what is left of the 15 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    capped.mockImplementationOnce(async () => {
      vi.setSystemTime(NOW + 12_000)
      return answer(301, '', { location: '/moved.png' })
    })
    capped.mockResolvedValueOnce(answer(200, PNG))
    await fetchWidgetImage(IMAGE, SCOPE)
    expect(capped.mock.calls.map(([options]) => options.timeout)).toEqual([15_000, 3_000])
  })

  it('allow the downloader no less than a second, which it needs to give up cleanly', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    capped.mockImplementationOnce(async () => {
      vi.setSystemTime(NOW + 14_900)
      return answer(301, '', { location: '/moved.png' })
    })
    capped.mockResolvedValueOnce(answer(200, PNG))
    await fetchWidgetImage(IMAGE, SCOPE)
    expect(capped.mock.calls[1]![0].timeout).toBe(1_000)
  })

  it.each([
    ['w|1[2].png?q=a|b{c}', 'w%7C1%5B2%5D.png?q=a%7Cb%7Bc%7D'],
    ['100%.png', '100%25.png'],
    ['a%20b.png?x=1&y=/z', 'a%20b.png?x=1&y=/z'],
  ])('percent-encode what iOS before 17 refuses in a URL: %s', async (raw, encoded) => {
    capped.mockResolvedValue(answer(404))
    await fetchWidgetImage({ ...IMAGE, url: new URL(raw, SCOPE).href }, SCOPE)
    expect(capped.mock.calls[0]![0].url).toBe(`${SCOPE}${encoded}`)
  })

  it('percent-encode a redirect\'s target too', async () => {
    capped.mockResolvedValueOnce(answer(301, '', { location: '/m|ved.png' }))
    capped.mockResolvedValueOnce(answer(200, PNG))
    await fetchWidgetImage(IMAGE, SCOPE)
    expect(capped.mock.calls[1]![0].url).toBe(`${SCOPE}m%7Cved.png`)
  })

  it('touch no cookies, as the downloader has none', async () => {
    capped.mockResolvedValue(answer(404))
    await fetchWidgetFile(SCOPE, NOW)
    await fetchWidgetImage(IMAGE, SCOPE)
    expect(clearAllCookies).not.toHaveBeenCalled()
  })

  it('make no request on a build without that downloader, rather than one without a limit', async () => {
    isPluginAvailable.mockReturnValue(false)
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
    expect(await fetchWidgetImage(IMAGE, SCOPE)).toMatchObject({ ok: false, transient: true })
    expect(await findWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
    expect(capped).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('downloads on the web, for development', () => {
  it('skip the HTTP cache without a header that would need a CORS preflight, and touch no cookies', async () => {
    get.mockResolvedValue(respond(404, ''))
    await fetchWidgetFile(SCOPE, NOW)
    expect(get.mock.calls[0]![0].headers).toEqual({ Accept: 'application/json' })
    expect(get.mock.calls[0]![0].webFetchExtra).toMatchObject({ credentials: 'omit', cache: 'no-store' })
    expect(clearAllCookies).not.toHaveBeenCalled()
  })
})

describe('an image that asks for the token', () => {
  const bytes = Uint8Array.from(atob(PNG), c => c.charCodeAt(0))
  const IMAGE = { url: `${SCOPE}mine.png`, sha256: sha256HexOfBytes(bytes), sendToken: true as const }
  const answered = (init: object = {}) => ({ status: 200, type: 'cors', body: null, arrayBuffer: async () => bytes.slice().buffer, ...init })

  it('is fetched like a refresh: only the token, no cookies, cache, native client or cookie clearing', async () => {
    fetchMock.mockResolvedValue(answered())
    expect(await fetchWidgetImage(IMAGE, SCOPE, 'opaque-token')).toMatchObject({ ok: true, value: expect.stringMatching(/^data:image\/png;base64,iVBOR/) })
    expect(fetchMock).toHaveBeenCalledWith(IMAGE.url, expect.objectContaining({ headers: { Accept: 'image/png, image/jpeg, image/webp', Authorization: 'Bearer opaque-token' }, credentials: 'omit', cache: 'no-store', redirect: 'manual', referrerPolicy: 'no-referrer' }))
    expect(get).not.toHaveBeenCalled()
    expect(clearAllCookies).not.toHaveBeenCalled()
  })

  it.each([
    ['a redirect', { status: 0, type: 'opaqueredirect' }],
    ['a refusal', { status: 401 }],
    ['other bytes', { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }],
  ])('is not taken from %s', async (_, init) => {
    fetchMock.mockResolvedValue(answered(init))
    expect((await fetchWidgetImage(IMAGE, SCOPE, 'opaque-token')).ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops reading past the size limit', async () => {
    const response = streamed(Array.from({ length: 3 }).fill('x'.repeat(100 * 1024)) as string[])
    fetchMock.mockResolvedValue(response)
    expect((await fetchWidgetImage(IMAGE, SCOPE, 'opaque-token')).ok).toBe(false)
    expect(response.cancel).toHaveBeenCalled()
  })

  it('may be as large as any image, not only as a state', async () => {
    const full = new Uint8Array(256 * 1024)
    full.set(bytes)
    fetchMock.mockResolvedValue(answered({ arrayBuffer: async () => full.slice().buffer }))
    expect((await fetchWidgetImage({ ...IMAGE, sha256: sha256HexOfBytes(full) }, SCOPE, 'opaque-token')).ok).toBe(true)
  })

  it('lets go of a refusal\'s body, which would keep downloading past the limit and the deadline', async () => {
    fetchMock.mockResolvedValue(answered({ status: 401 }))
    await fetchWidgetImage(IMAGE, SCOPE, 'opaque-token')
    expect((fetchMock.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true)
  })

  it('stops, preflight or not, when told to', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))))
    const request = new AbortController()
    const result = fetchWidgetImage(IMAGE, SCOPE, 'opaque-token', request.signal)
    request.abort()
    expect((fetchMock.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true)
    expect(await result).toMatchObject({ ok: false, transient: true })
  })

  it('makes no request without a token', async () => {
    expect((await fetchWidgetImage(IMAGE, SCOPE)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('never leaves the site with it', async () => {
    expect((await fetchWidgetImage({ ...IMAGE, url: 'https://cdn.example/mine.png' }, SCOPE, 'opaque-token')).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is the only kind that gets it', async () => {
    get.mockResolvedValue(respond(404, ''))
    await fetchWidgetImage({ url: IMAGE.url, sha256: IMAGE.sha256 }, SCOPE, 'opaque-token')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(get.mock.calls)).not.toContain('opaque-token')
  })
})

describe('what a refresh tells the store', () => {
  it('sends a token as a bearer header, and no such header without one', async () => {
    fetchMock.mockResolvedValue(streamed([STATE]))
    await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW, { token: 'opaque-token' })
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({ Authorization: 'Bearer opaque-token' })
    fetchMock.mockResolvedValue(streamed([STATE]))
    await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)
    expect(fetchMock.mock.calls[1]![1].headers).toEqual({})
  })

  it('sends addresses in their own header only when there are any', async () => {
    fetchMock.mockResolvedValue(streamed([STATE]))
    await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW, { accounts: ['NQ07 AAAA', '0xabc'] })
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({ 'Nimiq-Pay-Accounts': 'NQ07 AAAA, 0xabc' })
    expect(fetchMock.mock.calls[0]![0]).not.toContain('AAAA')
    fetchMock.mockResolvedValue(streamed([STATE]))
    await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW, { accounts: [] })
    expect(fetchMock.mock.calls[1]![1].headers).toEqual({})
  })

  it.each([[401], [403], [410], [429], [503]])('reports status %i', async (status) => {
    fetchMock.mockResolvedValue({ ...streamed([]), status, headers: new Headers() })
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, status })
  })

  it('reads Retry-After in seconds or as a date, ignoring anything else', async () => {
    const answer = async (value: string) => {
      fetchMock.mockResolvedValue({ ...streamed([]), status: 429, headers: new Headers({ 'Retry-After': value }) })
      return await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW) as { retryAfterMs?: number }
    }
    expect((await answer('120')).retryAfterMs).toBe(120_000)
    expect((await answer(new Date(NOW + 60_000).toUTCString())).retryAfterMs).toBe(60_000)
    expect((await answer('soon')).retryAfterMs).toBeUndefined()
    expect((await answer(new Date(NOW - 60_000).toUTCString())).retryAfterMs).toBeUndefined()
  })
})

describe('fetchWidgetFile', () => {
  it('fetches the file in the folder with redirects off and parses it against that folder', async () => {
    get.mockResolvedValueOnce(respond(200, FILE))
    const result = await fetchWidgetFile('https://name.github.io/my-app/', NOW)
    expect(get).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://name.github.io/my-app/nimiq-pay-widgets.json',
      responseType: 'text',
    }))
    expect(result.ok && result.value.widgets[0]!.content.path).toBe('https://name.github.io/my-app/status')
  })

  it('treats an HTML page as an invalid file, not a transient error', async () => {
    get.mockResolvedValueOnce(respond(200, '<!doctype html><html></html>'))
    expect(await fetchWidgetFile(SCOPE, NOW)).toEqual({ ok: false, error: expect.stringContaining('not JSON'), transient: false })
  })

  it('marks network errors, 5xx and 429 as transient and 404 as not', async () => {
    get.mockRejectedValueOnce(new Error('offline'))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
    get.mockResolvedValueOnce(respond(503, ''))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
    get.mockResolvedValueOnce(respond(429, ''))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
    get.mockResolvedValueOnce(respond(404, ''))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, transient: false })
  })

  it('follows a redirect within the origin and refuses one to another origin', async () => {
    get.mockResolvedValueOnce(respond(301, '', { Location: '/widgets/nimiq-pay-widgets.json' }))
    get.mockResolvedValueOnce(respond(200, FILE))
    expect((await fetchWidgetFile(SCOPE, NOW)).ok).toBe(true)
    expect(get.mock.calls[1]![0].url).toBe('https://swap.example/widgets/nimiq-pay-widgets.json')

    get.mockResolvedValueOnce(respond(302, '', { location: 'https://evil.example/x.json' }))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('refused'), transient: false })
  })

  it('refuses a file over 32 KB, as text or as an already-parsed object', async () => {
    get.mockResolvedValueOnce(respond(200, ' '.repeat(33 * 1024)))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('larger than'), transient: false })
    get.mockResolvedValueOnce(respond(200, { v: 1, pad: 'x'.repeat(33 * 1024) }))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('larger than'), transient: false })
  })

  it('parses a body the native client already parsed', async () => {
    get.mockResolvedValueOnce(respond(200, FILE))
    expect((await fetchWidgetFile(SCOPE, NOW)).ok).toBe(true)
  })

  it('refuses too many redirects, a redirect without Location, a malformed one and one to userinfo', async () => {
    get.mockResolvedValue(respond(301, '', { location: '/again.json' }))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('too many redirects'), transient: false })
    expect(get).toHaveBeenCalledTimes(4)
    get.mockReset()
    get.mockResolvedValueOnce(respond(301, ''))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('refused'), transient: false })
    get.mockResolvedValueOnce(respond(301, '', { location: 'http://[bad' }))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('refused'), transient: false })
    get.mockResolvedValueOnce(respond(301, '', { location: 'https://user:pw@swap.example/x.json' }))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('refused'), transient: false })
  })

  it('names the redirect target without its credentials, and refuses a blob: target', async () => {
    get.mockResolvedValueOnce(respond(301, '', { location: 'https://user:pw@swap.example/x.json' }))
    const result = await fetchWidgetFile(SCOPE, NOW)
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('https://swap.example/x.json'), transient: false })
    expect(!result.ok && result.error).not.toContain('pw')
    get.mockResolvedValueOnce(respond(301, '', { location: 'blob:https://swap.example/1' }))
    expect(await fetchWidgetFile(SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('refused'), transient: false })
  })

  it('starts no further request after the deadline fired', async () => {
    vi.useFakeTimers()
    let release!: (value: unknown) => void
    get.mockReturnValueOnce(new Promise((resolve) => {
      release = resolve
    }))
    const pending = fetchWidgetFile(SCOPE, NOW)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await pending).toMatchObject({ ok: false, transient: true })
    release(respond(301, '', { location: '/next.json' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('gives up after 15 s in total as a transient error', async () => {
    vi.useFakeTimers()
    get.mockReturnValueOnce(new Promise(() => {}))
    const pending = fetchWidgetFile(SCOPE, NOW)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await pending).toMatchObject({ ok: false, error: expect.stringContaining('timed out'), transient: true })
  })

  it('never requests an origin that cannot serve widgets', async () => {
    expect(await fetchWidgetFile('http://swap.example/', NOW)).toMatchObject({ ok: false, transient: false })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('fetchWidgetImage', () => {
  const IMAGE = { url: 'https://swap.example/hero.png', sha256: 'a'.repeat(64) }

  it('reads it and checks it', async () => {
    get.mockResolvedValue(respond(200, PNG))
    const result = await fetchWidgetImage(IMAGE, SCOPE)
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ url: IMAGE.url, responseType: 'arraybuffer' }))
    // The hash in IMAGE is made up, so this reached the check.
    expect(result).toMatchObject({ ok: false, transient: false, error: expect.stringContaining('hash') })
  })

  it('refuses an image on another site without contacting it', async () => {
    const result = await fetchWidgetImage({ ...IMAGE, url: 'https://cdn.example/hero.png' }, SCOPE)
    expect(result.ok).toBe(false)
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses a redirect to another site', async () => {
    get.mockResolvedValue(respond(302, '', { location: 'https://cdn.example/hero.png' }))
    expect((await fetchWidgetImage(IMAGE, SCOPE)).ok).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('says when trying again later might help', async () => {
    get.mockResolvedValue(respond(503, ''))
    expect(await fetchWidgetImage(IMAGE, SCOPE)).toMatchObject({ ok: false, transient: true })
  })
})

describe('findWidgetFile', () => {
  it('finds a subfolder Mini App\'s file from a deep page', async () => {
    get.mockResolvedValueOnce(respond(404, ''))
    get.mockResolvedValueOnce(respond(404, ''))
    get.mockResolvedValueOnce(respond(200, FILE))
    const result = await findWidgetFile('https://name.github.io/my-app/orders/12?tab=open#top', NOW)
    expect(get.mock.calls.map(c => c[0].url)).toEqual([
      'https://name.github.io/my-app/orders/12/nimiq-pay-widgets.json',
      'https://name.github.io/my-app/orders/nimiq-pay-widgets.json',
      'https://name.github.io/my-app/nimiq-pay-widgets.json',
    ])
    expect(result.ok && result.value.scope).toBe('https://name.github.io/my-app/')
  })

  it('skips an app route answered with the app\'s HTML and finds the file at the root', async () => {
    get.mockResolvedValueOnce(respond(200, '<!doctype html><html></html>'))
    get.mockResolvedValueOnce(respond(200, FILE))
    const result = await findWidgetFile('https://swap.example/swap', NOW)
    expect(result.ok && result.value.scope).toBe('https://swap.example/')
  })

  it('takes an empty nearest file as valid and stops looking in parent folders', async () => {
    get.mockResolvedValueOnce(respond(200, { v: 1, widgets: [] }))
    get.mockResolvedValueOnce(respond(200, FILE))
    const result = await findWidgetFile('https://name.github.io/my-app/', NOW)
    expect(result).toEqual({ ok: true, value: { scope: 'https://name.github.io/my-app/', file: { widgets: [] } } })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('stops at a transient error instead of taking a parent folder\'s file', async () => {
    get.mockResolvedValueOnce(respond(503, ''))
    expect(await findWidgetFile('https://name.github.io/my-app/', NOW)).toMatchObject({ ok: false, transient: true })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('names every folder it looked in when none has a file', async () => {
    get.mockResolvedValue(respond(404, ''))
    const result = await findWidgetFile('https://name.github.io/my-app/', NOW)
    expect(result).toEqual({ ok: false, error: 'no valid nimiq-pay-widgets.json in https://name.github.io/my-app/ (https://name.github.io/my-app/nimiq-pay-widgets.json not found), https://name.github.io/ (https://name.github.io/nimiq-pay-widgets.json not found)', transient: false })
  })

  it('names why a folder\'s file was refused', async () => {
    get.mockResolvedValueOnce(respond(200, { v: 1, widgets: [{ id: 'swap', name: 'Swap', sizes: ['huge'], content: { value: { text: 'x' } } }] }))
    get.mockResolvedValueOnce(respond(404, ''))
    const result = await findWidgetFile('https://name.github.io/my-app/', NOW)
    expect(result).toMatchObject({ ok: false, transient: false, error: expect.stringMatching(/^no valid nimiq-pay-widgets\.json in https:\/\/name\.github\.io\/my-app\/ \(.+\), https:\/\/name\.github\.io\/ \(.+ not found\)$/) })
  })

  it('says so when the URL has no candidates', async () => {
    expect(await findWidgetFile('ftp://swap.example/', NOW)).toEqual({ ok: false, error: 'ftp://swap.example/ cannot serve widgets', transient: false })
  })
})

describe('fetchWidgetRefresh', () => {
  it('uses the WebView fetch without cookies or redirects and parses against the widget\'s folder', async () => {
    fetchMock.mockResolvedValueOnce(streamed([JSON.stringify({ content: { value: { text: 'Done' }, path: 'status' } })]))
    const result = await fetchWidgetRefresh({ url: 'https://swap.example/api/widget/swap?id=X', every: 60 }, { lang: 'de', network: 'mainnet' }, SCOPE, NOW)
    expect(get).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('https://swap.example/api/widget/swap?id=X&lang=de&network=mainnet', expect.objectContaining({
      credentials: 'omit',
      redirect: 'manual',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    }))
    expect(result.ok && result.value?.content).toMatchObject({ value: { text: 'Done' }, path: 'https://swap.example/status' })
  })

  it('keeps the query byte for byte, drops the fragment and starts one when there is none', async () => {
    fetchMock.mockResolvedValue(streamed([STATE]))
    await fetchWidgetRefresh({ url: 'https://swap.example/w?a=~b&flag#frag', every: 60 }, PARAMS, SCOPE, NOW)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://swap.example/w?a=~b&flag&lang=en&network=mainnet')
    fetchMock.mockResolvedValue(streamed([STATE]))
    await fetchWidgetRefresh({ url: 'https://swap.example/w#frag', every: 60 }, PARAMS, SCOPE, NOW)
    expect(fetchMock.mock.calls[1]![0]).toBe('https://swap.example/w?lang=en&network=mainnet')
    for (const [i, url] of ['https://swap.example/w?', 'https://swap.example/w?#frag'].entries()) {
      fetchMock.mockResolvedValue(streamed([STATE]))
      await fetchWidgetRefresh({ url, every: 60 }, PARAMS, SCOPE, NOW)
      expect(fetchMock.mock.calls[2 + i]![0]).toBe('https://swap.example/w?lang=en&network=mainnet')
    }
  })

  it('drops the Mini App\'s own lang and network so the server reads Nimiq Pay\'s', async () => {
    fetchMock.mockResolvedValue(streamed([STATE]))
    await fetchWidgetRefresh({ url: 'https://swap.example/w?a=~b&lang=fr&%6Eetwork=testnet&langx=1&flag&network', every: 60 }, { lang: 'de', network: 'mainnet' }, SCOPE, NOW)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://swap.example/w?a=~b&langx=1&flag&lang=de&network=mainnet')
  })

  it('accepts null as "back to the resting state"', async () => {
    fetchMock.mockResolvedValueOnce(streamed(['null']))
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toEqual({ ok: true, value: null })
  })

  it('falls back to arrayBuffer when there is no body stream', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200, type: 'basic', body: null, arrayBuffer: async () => new TextEncoder().encode('null').buffer })
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toEqual({ ok: true, value: null })
  })

  it('reports an invalid answer as not transient', async () => {
    fetchMock.mockResolvedValueOnce(streamed([JSON.stringify({ content: {} })]))
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, transient: false })
    fetchMock.mockResolvedValueOnce(streamed(['<html>']))
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('not JSON'), transient: false })
  })

  it('stops reading and fails once the streamed body passes 8 KB', async () => {
    const response = streamed(['x'.repeat(5000), 'x'.repeat(5000), 'x'.repeat(5000)])
    fetchMock.mockResolvedValueOnce(response)
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('larger than'), transient: false })
    expect(response.cancel).toHaveBeenCalled()
  })

  it('refuses a redirect', async () => {
    fetchMock.mockResolvedValueOnce({ status: 0, type: 'opaqueredirect', body: null })
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('must not redirect'), transient: false })
    fetchMock.mockResolvedValueOnce(streamed([], { status: 302 }))
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, transient: false })
  })

  it('treats a thrown fetch (network, CORS) as transient and classifies statuses', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
    fetchMock.mockResolvedValueOnce(streamed([], { status: 503 }))
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, transient: true })
    fetchMock.mockResolvedValueOnce(streamed([], { status: 404 }))
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, transient: false })
  })

  it('aborts the request exactly at 15 s and reports a transient error', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = fetchWidgetRefresh(REFRESH, PARAMS, SCOPE, NOW)
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal
    await vi.advanceTimersByTimeAsync(14_999)
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal.aborted).toBe(true)
    expect(await pending).toMatchObject({ ok: false, transient: true })
  })

  it('refuses a refresh URL off the widget\'s origin, with userinfo, or on an origin that cannot serve widgets', async () => {
    for (const url of ['https://evil.example/w', 'https://user:pw@swap.example/w', 'http://swap.example/w']) {
      expect(await fetchWidgetRefresh({ url, every: 60 }, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, transient: false })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a blob: URL that has the right origin', async () => {
    expect(await fetchWidgetRefresh({ url: 'blob:https://swap.example/1234', every: 60 }, PARAMS, SCOPE, NOW)).toMatchObject({ ok: false, transient: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets the origin rule alone refuse a local host and a plain http scope', async () => {
    expect(await fetchWidgetRefresh({ url: 'https://swap.local/w', every: 60 }, PARAMS, 'https://swap.local/', NOW)).toMatchObject({ ok: false, error: expect.stringContaining('cannot answer'), transient: false })
    expect(await fetchWidgetRefresh({ url: 'http://swap.example/w', every: 60 }, PARAMS, 'http://swap.example/', NOW)).toMatchObject({ ok: false, error: expect.stringContaining('cannot answer'), transient: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a malformed scope instead of throwing', async () => {
    expect(await fetchWidgetRefresh(REFRESH, PARAMS, 'not a url', NOW)).toMatchObject({ ok: false, transient: false })
    expect(await fetchWidgetFile('not a url', NOW)).toMatchObject({ ok: false, transient: false })
  })
})
