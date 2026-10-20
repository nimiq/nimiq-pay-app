import type { WidgetFile } from '@/lib/mini-app-widgets'
import { i18n } from '@/i18n/i18n-setup'

/** Nimiq Pay's own widgets. `.invalid` never resolves (RFC 2606), so no Mini App can load from this scope or claim it. */
export const BUILTIN_WIDGET_SCOPE = 'https://nimiq-pay.invalid/'

export function builtinWidgetFile(): WidgetFile {
  return {
    widgets: [{
      id: 'nim-price',
      name: i18n.t('NIM price'),
      description: i18n.t('The NIM price in your currency, with its change over the last 24 hours.'),
      sizes: ['small', 'large', 'medium'],
      content: {
        label: 'NIM',
        value: { live: { price: 'NIM' } },
        info: { live: { priceChange: { asset: 'NIM', range: '24h' } } },
        tone: 'neutral',
        rows: [],
        chart: { kind: 'line', priceHistory: { asset: 'NIM', range: '24h' } },
      },
      translations: {},
    }],
  }
}
