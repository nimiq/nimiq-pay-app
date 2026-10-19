import { ExtendedDialog } from 'capacitor-extended-dialog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Asset } from '@/lib/assets'
import { requestUserConfirmation } from './mini-app-confirmation'

vi.mock('capacitor-extended-dialog', () => ({ ExtendedDialog: { sheet: vi.fn() } }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ error: vi.fn() }) }))
vi.mock('@/stores/mini-apps', () => ({ useMiniApps: () => ({ iconForUrl: () => undefined }) }))
vi.mock('@/lib/site-metadata', () => ({ getFaviconUrl: () => '' }))

describe('requestUserConfirmation Lightning payment', () => {
  beforeEach(() => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
  })

  it('itemizes USD-denominated service fees', async () => {
    await requestUserConfirmation({
      type: 'lightning-payment',
      network: 'nimiq',
      url: 'https://merchant.example',
      data: {
        btcAmount: 0.0001,
        asset: Asset.USDT,
        amount: 1_000_000,
        usdtFeeAllowance: 0,
        fees: [{ asset: 'USD', amount: 0.25, included: true, source: 'SERVICE' }],
      },
    })

    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      rows: expect.arrayContaining([{ title: 'Service fee (included)', value: '0.25 USD' }]),
    }))
  })
})

describe('requestUserConfirmation widget', () => {
  it('asks to add the widget, naming the site and what the widget cannot do', async () => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: false })

    const confirmed = await requestUserConfirmation({ type: 'widget', url: 'https://swap.example/app', widgetName: 'Swap status', description: 'Follows your swap.' })

    expect(confirmed).toBe(false)
    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Add Swap status to Home?',
      subtitle: 'Follows your swap.',
      rows: [
        { title: '• Shows what swap.example sends' },
        { title: '• Cannot see your balance or move funds' },
        { title: '• Remove it any time from its menu' },
      ],
      confirmButtonTitle: 'Add to Home',
      cancelButtonTitle: 'Not now',
    }))
  })
})
