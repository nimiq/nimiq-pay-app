import { CapacitorHttp } from '@capacitor/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBestIcon, getFaviconUrl } from '@/lib/site-metadata'

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { get: vi.fn() },
}))

const httpGet = vi.mocked(CapacitorHttp.get)
const PAGE = 'https://example.com/app'

function html(headInner: string): string {
  return `<!doctype html><html><head>${headInner}</head><body></body></html>`
}

function mockResponses(map: Record<string, { status?: number, data?: unknown, headers?: Record<string, string>, finalUrl?: string }>) {
  httpGet.mockImplementation((options) => {
    const hit = map[options.url]
    return Promise.resolve({
      status: hit?.status ?? (hit ? 200 : 404),
      data: hit?.data ?? '',
      headers: hit?.headers ?? {},
      url: hit?.finalUrl ?? options.url,
    })
  })
}

beforeEach(() => {
  httpGet.mockReset()
})

describe('getFaviconUrl', () => {
  it('returns the origin /favicon.ico (no third-party service)', () => {
    expect(getFaviconUrl('https://example.com/some/path?q=1')).toBe('https://example.com/favicon.ico')
  })

  it('returns empty string for an invalid URL', () => {
    expect(getFaviconUrl('not a url')).toBe('')
  })
})

describe('fetchBestIcon priority', () => {
  it('prefers apple-touch-icon over <link rel=icon>', async () => {
    mockResponses({ [PAGE]: { data: html('<link rel="apple-touch-icon" href="/apple.png"><link rel="icon" href="/fav.png" sizes="32x32">') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/apple.png')
  })

  it('falls back to the largest <link rel=icon>', async () => {
    mockResponses({ [PAGE]: { data: html('<link rel="icon" href="/small.png" sizes="16x16"><link rel="icon" href="/big.png" sizes="128x128">') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/big.png')
  })

  it('ignores og:image, falling back to /favicon.ico', async () => {
    mockResponses({ [PAGE]: { data: html('<meta property="og:image" content="https://cdn.example.com/banner.png">') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/favicon.ico')
  })

  it('resolves relative hrefs against the page URL', async () => {
    mockResponses({ [PAGE]: { data: html('<link rel="apple-touch-icon" href="icons/touch.png">') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/icons/touch.png')
  })

  it('rejects non-http(s) icon URLs, falling through to /favicon.ico', async () => {
    mockResponses({ [PAGE]: { data: html('<link rel="apple-touch-icon" href="javascript:alert(1)">') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/favicon.ico')
  })

  it('falls back to /favicon.ico when nothing is declared', async () => {
    mockResponses({ [PAGE]: { data: html('') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/favicon.ico')
  })

  it('skips a data: apple-touch-icon in favor of an http(s) <link rel=icon>', async () => {
    mockResponses({ [PAGE]: { data: html('<link rel="apple-touch-icon" href="data:image/png;base64,AAAA"><link rel="icon" href="/fav.png">') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/fav.png')
  })

  it.each([500, 403])('returns undefined when the page fetch answers %i', async (status) => {
    mockResponses({ [PAGE]: { status, data: '' } })
    expect(await fetchBestIcon(PAGE)).toBeUndefined()
  })

  it('resolves icons against the redirected host after a cross-host 301', async () => {
    mockResponses({
      [PAGE]: { status: 301, headers: { Location: 'https://www.example.org/app' } },
      'https://www.example.org/app': { data: html('<link rel="icon" href="/fav.png">') },
    })
    expect(await fetchBestIcon(PAGE)).toBe('https://www.example.org/fav.png')
  })

  it('resolves icons against the final URL when the native layer followed the redirect', async () => {
    mockResponses({ [PAGE]: { data: html('<link rel="icon" href="/fav.png">'), finalUrl: 'https://www.example.org/app' } })
    expect(await fetchBestIcon(PAGE)).toBe('https://www.example.org/fav.png')
  })

  it('falls back to /favicon.ico on the redirected host', async () => {
    mockResponses({
      [PAGE]: { status: 301, headers: { Location: 'https://www.example.org/app' } },
      'https://www.example.org/app': { data: html('') },
    })
    expect(await fetchBestIcon(PAGE)).toBe('https://www.example.org/favicon.ico')
  })

  it('resolves icons against <base href>', async () => {
    mockResponses({ [PAGE]: { data: html('<base href="/static/"><link rel="icon" href="fav.png">') } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/static/fav.png')
  })

  it('follows a 307 redirect (via Location) when fetching the page', async () => {
    mockResponses({
      [PAGE]: { status: 307, headers: { location: '/real' } },
      'https://example.com/real': { data: html('<link rel="apple-touch-icon" href="/apple.png">') },
    })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/apple.png')
  })

  it('gives up on a redirect with no Location header', async () => {
    mockResponses({ [PAGE]: { status: 307, headers: {} } })
    expect(await fetchBestIcon(PAGE)).toBeUndefined()
  })
})
