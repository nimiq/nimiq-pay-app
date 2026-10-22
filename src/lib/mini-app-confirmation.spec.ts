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

describe('requestUserConfirmation device identifier', () => {
  beforeEach(() => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
  })

  it('truncates a long reason', async () => {
    await requestUserConfirmation({ type: 'deviceIdentifier', url: 'https://app.example', reason: 'a'.repeat(10_000) })

    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      rows: [{ title: 'Reason', value: `${'a'.repeat(197)}...` }],
    }))
  })

  it('keeps a short reason intact', async () => {
    await requestUserConfirmation({ type: 'deviceIdentifier', url: 'https://app.example', reason: 'Prevent duplicate rewards' })

    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      rows: [{ title: 'Reason', value: 'Prevent duplicate rewards' }],
    }))
  })
})
