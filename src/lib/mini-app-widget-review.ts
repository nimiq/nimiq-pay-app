import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { useLogger } from '@/composables/useLogger'
import { useMiniAppWidgets } from '@/stores/mini-app-widgets'

const logger = useLogger('MiniAppWidgetReview')

/** Nimiq Pay draws the previews under the in-app browser, so the Mini App steps aside while they show. */
export async function reviewWidgetImages(scope: string, widgetId: string): Promise<boolean> {
  try {
    await InAppBrowser.hide()
  }
  catch (error) {
    logger.warn('Could not hide the Mini App to show new widget images', error)
    return false
  }
  try {
    return await useMiniAppWidgets().openImageReview(scope, widgetId)
  }
  finally {
    await InAppBrowser.show().catch(error => logger.error('Could not show the Mini App again', error))
  }
}
