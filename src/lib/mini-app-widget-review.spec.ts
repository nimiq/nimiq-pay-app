import { beforeEach, describe, expect, it, vi } from 'vitest'

const { hide, show, openImageReview, steps } = vi.hoisted(() => {
  const steps: string[] = []
  return {
    steps,
    hide: vi.fn(async () => { steps.push('hide') }),
    show: vi.fn(async () => { steps.push('show') }),
    openImageReview: vi.fn(async () => {
      steps.push('review')
      return true
    }),
  }
})

vi.mock('@capgo/capacitor-inappbrowser', () => ({ InAppBrowser: { hide, show } }))
vi.mock('@/stores/mini-app-widgets', () => ({ useMiniAppWidgets: () => ({ openImageReview }) }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

const { reviewWidgetImages } = await import('./mini-app-widget-review')

beforeEach(() => {
  steps.length = 0
  hide.mockClear()
  show.mockClear()
  openImageReview.mockClear()
})

describe('reviewWidgetImages', () => {
  it('hides the Mini App, shows the review, and brings the Mini App back', async () => {
    expect(await reviewWidgetImages('https://swap.example/', 'swap')).toBe(true)
    expect(steps).toEqual(['hide', 'review', 'show'])
    expect(openImageReview).toHaveBeenCalledWith('https://swap.example/', 'swap')
  })

  it('brings the Mini App back when the review fails', async () => {
    openImageReview.mockRejectedValueOnce(new Error('no'))
    await expect(reviewWidgetImages('https://swap.example/', 'swap')).rejects.toThrow()
    expect(steps).toEqual(['hide', 'show'])
  })

  it('shows nothing when the Mini App cannot step aside, leaving the update in the widget menu', async () => {
    hide.mockRejectedValueOnce(new Error('no'))
    expect(await reviewWidgetImages('https://swap.example/', 'swap')).toBe(false)
    expect(openImageReview).not.toHaveBeenCalled()
  })
})
