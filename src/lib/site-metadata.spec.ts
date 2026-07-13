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

/** Route CapacitorHttp.get by URL; unmapped URLs 404. */
function mockResponses(map: Record<string, { status?: number, data?: unknown, headers?: Record<string, string> }>) {
  httpGet.mockImplementation((options) => {
    const hit = map[options.url]
    return Promise.resolve({
      status: hit?.status ?? (hit ? 200 : 404),
      data: hit?.data ?? '',
      headers: hit?.headers ?? {},
      url: options.url,
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

  it('falls back to /favicon.ico when the page fetch fails', async () => {
    mockResponses({ [PAGE]: { status: 500, data: '' } })
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/favicon.ico')
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
    expect(await fetchBestIcon(PAGE)).toBe('https://example.com/favicon.ico')
  })
})
