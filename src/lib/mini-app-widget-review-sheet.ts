import { defineAsyncComponent } from 'vue'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('MiniAppWidgetReviewSheet')

/** Without the sheet nobody can answer, and the Mini App would stay hidden behind it. */
export function closeReviewOnLoadError(error: Error, _retry: () => void, fail: () => void) {
  fail()
  logger.error('Could not load the widget image review', error)
  void import('@/stores/mini-app-widgets').then(({ useMiniAppWidgets }) => useMiniAppWidgets().closeImageReview())
}

// Rarely shown, so it stays out of the start-up bundle.
export const MiniAppWidgetImagesReview = defineAsyncComponent({
  loader: () => import('@/components/MiniAppWidgetImagesReview.vue'),
  onError: closeReviewOnLoadError,
})
