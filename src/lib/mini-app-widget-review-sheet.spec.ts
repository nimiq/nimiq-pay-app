import { describe, expect, it, vi } from 'vitest'

const closeImageReview = vi.hoisted(() => vi.fn())
vi.mock('@/stores/mini-app-widgets', () => ({ useMiniAppWidgets: () => ({ closeImageReview }) }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ error: vi.fn() }) }))

const { closeReviewOnLoadError } = await import('./mini-app-widget-review-sheet')

describe('closeReviewOnLoadError', () => {
  it('gives up on the sheet and closes the review, so the Mini App comes back', async () => {
    const fail = vi.fn()
    closeReviewOnLoadError(new Error('chunk'), vi.fn(), fail)
    expect(fail).toHaveBeenCalled()
    await vi.waitFor(() => expect(closeImageReview).toHaveBeenCalled())
  })
})
