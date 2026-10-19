import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWidgetData, fetchWidgetManifest, parseWidgetData, parseWidgetManifest, widgetManifestUrl } from './mini-app-widgets'

const { httpGet } = vi.hoisted(() => ({ httpGet: vi.fn() }))

vi.mock('@capacitor/core', () => ({ CapacitorHttp: { get: httpGet } }))
vi.mock('@/lib', () => ({ isDev: false }))

const APP = 'https://nimjar.vercel.app'
const params = { address: 'NQ19 4DVG ARRM PVLY 45HC MRY7 5Y9U 31EG JF9U', network: 'mainnet', lang: 'en' } as const

describe('widgetManifestUrl', () => {
  it('resolves next to the start page', () => {
    expect(widgetManifestUrl('https://nimjar.vercel.app')).toBe('https://nimjar.vercel.app/nimiq-pay-widget.json')
    expect(widgetManifestUrl('https://x.github.io/app')).toBe('https://x.github.io/app/nimiq-pay-widget.json')
    expect(widgetManifestUrl('https://x.github.io/app/?ref=1#top')).toBe('https://x.github.io/app/nimiq-pay-widget.json')
    expect(widgetManifestUrl('https://x.github.io/app/index.html')).toBe('https://x.github.io/app/nimiq-pay-widget.json')
  })

  it('returns undefined for an unparseable url', () => {
    expect(widgetManifestUrl('not a url')).toBeUndefined()
  })
})

describe('parseWidgetManifest', () => {
  const manifestUrl = `${APP}/nimiq-pay-widget.json`

  it('resolves a relative dataUrl against the manifest', () => {
    expect(parseWidgetManifest({ v: 1, name: 'Staking', dataUrl: '/api/widget' }, manifestUrl, APP))
      .toEqual({ name: 'Staking', description: undefined, dataUrl: `${APP}/api/widget` })
  })

  it('rejects a dataUrl on another origin', () => {
    expect(parseWidgetManifest({ v: 1, name: 'Staking', dataUrl: 'https://evil.example/collect' }, manifestUrl, APP)).toBeUndefined()
  })

  it('rejects plain http outside development builds', () => {
    expect(parseWidgetManifest({ v: 1, name: 'Staking', dataUrl: 'http://nimjar.vercel.app/api' }, 'http://nimjar.vercel.app/nimiq-pay-widget.json', 'http://nimjar.vercel.app')).toBeUndefined()
  })

  it('rejects unknown versions and missing fields', () => {
    expect(parseWidgetManifest({ v: 2, name: 'Staking', dataUrl: '/api' }, manifestUrl, APP)).toBeUndefined()
    expect(parseWidgetManifest({ v: 1, dataUrl: '/api' }, manifestUrl, APP)).toBeUndefined()
    expect(parseWidgetManifest('nope', manifestUrl, APP)).toBeUndefined()
  })
})

describe('parseWidgetData', () => {
  it('keeps valid fields and fills defaults', () => {
    expect(parseWidgetData({
      v: 1,
      title: 'Staking',
      value: { label: 'Unstaking', luna: '60000000' },
      rows: [{ label: 'Pool', text: 'Pocket · 9% fee' }],
      countdown: { label: 'Ready to withdraw', until: 1792436400 },
      path: '/#out',
      extra: 'ignored',
    }, APP)).toEqual({
      title: 'Staking',
      value: { label: 'Unstaking', luna: '60000000' },
      rows: [{ label: 'Pool', text: 'Pocket · 9% fee' }],
      countdown: { label: 'Ready to withdraw', until: 1792436400 },
      message: undefined,
      tone: 'default',
      path: `${APP}/#out`,
      refresh: 300,
    })
  })

  it('drops items whose amount is not a plain integer string', () => {
    const data = parseWidgetData({
      v: 1,
      value: { label: 'Staked', luna: 600.5 },
      rows: [{ label: 'A', luna: '1e9' }, { label: 'B', luna: '-1' }, { label: 'C', luna: '42' }],
    }, APP)
    expect(data?.value).toBeUndefined()
    expect(data?.rows).toEqual([{ label: 'C', luna: '42' }])
  })

  it('caps rows, string lengths and the refresh interval', () => {
    const data = parseWidgetData({
      v: 1,
      message: 'x'.repeat(200),
      rows: Array.from({ length: 5 }, (_, i) => ({ label: `Row ${i}`, text: 'y'.repeat(50) })),
      refresh: 5,
    }, APP)
    expect(data?.message).toHaveLength(80)
    expect(data?.rows).toHaveLength(3)
    expect(data?.rows[0]?.text).toHaveLength(32)
    expect(data?.refresh).toBe(60)
    expect(parseWidgetData({ v: 1, refresh: 99_999 }, APP)?.refresh).toBe(3600)
  })

  it('ignores a path that leaves the Mini App', () => {
    expect(parseWidgetData({ v: 1, path: 'https://evil.example/' }, APP)?.path).toBeUndefined()
  })

  it('returns a hidden marker', () => {
    expect(parseWidgetData({ v: 1, hidden: true }, APP)).toEqual({ hidden: true, rows: [], tone: 'default', refresh: 300 })
  })

  it('rejects unknown versions', () => {
    expect(parseWidgetData({ v: 2 }, APP)).toBeUndefined()
    expect(parseWidgetData(null, APP)).toBeUndefined()
  })
})

describe('fetching', () => {
  beforeEach(() => httpGet.mockReset())

  it('returns undefined when the Mini App has no manifest', async () => {
    httpGet.mockResolvedValue({ status: 404, data: 'Not found' })
    expect(await fetchWidgetManifest(APP)).toBeUndefined()
  })

  it('returns undefined when the request fails', async () => {
    httpGet.mockRejectedValue(new Error('offline'))
    expect(await fetchWidgetManifest(APP)).toBeUndefined()
  })

  it('sends address, network and language to the data url', async () => {
    httpGet.mockResolvedValue({ status: 200, data: { v: 1, value: { label: 'Staked', luna: '1' } } })
    await fetchWidgetData({ name: 'Staking', dataUrl: `${APP}/api/widget` }, APP, params)
    const url = new URL(httpGet.mock.calls[0]![0].url)
    expect(url.origin + url.pathname).toBe(`${APP}/api/widget`)
    expect(Object.fromEntries(url.searchParams)).toEqual(params)
  })

  it('throws on a response it cannot draw', async () => {
    httpGet.mockResolvedValue({ status: 200, data: { v: 9 } })
    await expect(fetchWidgetData({ name: 'Staking', dataUrl: `${APP}/api/widget` }, APP, params)).rejects.toThrow('failed validation')
    httpGet.mockResolvedValue({ status: 502, data: {} })
    await expect(fetchWidgetData({ name: 'Staking', dataUrl: `${APP}/api/widget` }, APP, params)).rejects.toThrow('502')
  })
})
