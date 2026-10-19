import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { get } }))
vi.mock('@/lib', () => ({ isDev: false }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { fetchWidgetFile, fetchWidgetRefresh, findWidgetFile } = await import('./mini-app-widget-sources')

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

const PARAMS = { lang: 'en', network: 'mainnet' } as const
const REFRESH = { url: 'https://swap.example/w', every: 60 }
const STATE = JSON.stringify({ content: { value: { text: 'Done' } } })

beforeEach(() => {
  get.mockReset()
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fetchWidgetFile', () => {
  it('fetches the file in the folder with redirects off and parses it against that folder', async () => {
    get.mockResolvedValueOnce(respond(200, FILE))
    const result = await fetchWidgetFile('https://name.github.io/my-app/', NOW)
    expect(get).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://name.github.io/my-app/nimiq-pay-widgets.json',
      disableRedirects: true,
      responseType: 'text',
      connectTimeout: 5000,
      readTimeout: 10000,
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
