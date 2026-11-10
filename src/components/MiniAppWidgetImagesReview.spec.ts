import type { WidgetView } from '@/stores/mini-app-widgets'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { store } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return {
    store: reactive({
      imageReview: undefined as { scope: string, widgetId: string, keys: string[] } | undefined,
      reviewLoading: false,
      loadReviewImages: vi.fn(async () => {}),
      reviewView: vi.fn(),
      answerImageReview: vi.fn(),
      widgetName: vi.fn(() => 'Swap status'),
      views: [] as WidgetView[],
    }),
  }
})

vi.mock('@/stores/mini-app-widgets', () => ({ useMiniAppWidgets: () => store }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ language: 'en' }) }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(() => Promise.resolve()) }, ImpactStyle: { Light: 'LIGHT' } }))

const { default: MiniAppWidgetImagesReview } = await import('./MiniAppWidgetImagesReview.vue')

const SCOPE = 'https://swap.example/'
function view(key: string, src?: string): WidgetView {
  return {
    key: `${SCOPE}#swap-${key}`,
    scope: SCOPE,
    widgetId: 'swap',
    appName: 'Swap',
    appAddress: 'swap.example',
    appIcon: '',
    size: 'medium',
    sizes: ['medium'],
    value: { kind: 'text', text: 'Demo' },
    tone: 'neutral',
    rows: [],
    background: src ? { kind: 'image', src } : undefined,
  } as unknown as WidgetView
}

let wrapper: ReturnType<typeof mount> | undefined
const found = (testid: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testid}"]`)

beforeEach(() => {
  store.reviewView.mockImplementation((key: string) => view(key, `data:image/png;base64,${key}`))
  store.answerImageReview.mockClear()
  store.imageReview = { scope: SCOPE, widgetId: 'swap', keys: ['hero', 'side'] }
  store.reviewLoading = false
  store.views = [view('home')]
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

async function render() {
  wrapper = mount(MiniAppWidgetImagesReview, { attachTo: document.body, global: { mocks: { $t: (m: string, p?: Record<string, string>) => p ? m.replace(/\{(\w+)\}/g, (_, k) => p[k]!) : m } } })
  await flushPromises()
}

describe('miniAppWidgetImagesReview', () => {
  it('downloads the new images and shows the widget once with each of them', async () => {
    await render()
    expect(store.loadReviewImages).toHaveBeenCalled()
    expect(found('review-preview-hero')).not.toBeNull()
    expect(found('review-preview-side')).not.toBeNull()
    expect(found('review-preview-side')!.querySelector('[data-testid="widget-background"] img')!.getAttribute('src')).toBe('data:image/png;base64,side')
    expect(document.body.textContent).toContain('swap.example')
  })

  it('says when an image could not be checked', async () => {
    store.reviewView.mockImplementation((key: string) => view(key, key === 'hero' ? 'data:image/png;base64,hero' : undefined))
    await render()
    expect(found('review-failed-side')).not.toBeNull()
    expect(found('review-failed-hero')).toBeNull()
  })

  it('answers yes for all of them at once', async () => {
    await render()
    found('review-approve')!.click()
    expect(store.answerImageReview).toHaveBeenCalledWith(true)
  })

  it('cannot accept while the images load, or when none could be shown', async () => {
    store.reviewLoading = true
    await render()
    expect(found('review-approve')!.hasAttribute('disabled')).toBe(true)
    wrapper!.unmount()
    store.reviewLoading = false
    store.reviewView.mockImplementation((key: string) => view(key))
    await render()
    expect(found('review-approve')!.hasAttribute('disabled')).toBe(true)
  })

  it('answers no from Not now', async () => {
    await render()
    found('review-decline')!.click()
    expect(store.answerImageReview).toHaveBeenCalledWith(false)
  })

  it('shows nothing without a review', async () => {
    store.imageReview = undefined
    await render()
    expect(found('review-approve')).toBeNull()
  })
})
