import { ExtendedDialog } from 'capacitor-extended-dialog'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Asset } from '@/lib/assets'
import { requestUserConfirmation } from './mini-app-confirmation'

vi.mock('capacitor-extended-dialog', () => ({ ExtendedDialog: { sheet: vi.fn() } }))
vi.mock('@/composables/useMiniAppHost', () => ({ MINI_APP_REQUEST_TIMEOUT_MS: 120_000 }))
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

describe('requestUserConfirmation deadline', () => {
  const request = { type: 'deviceIdentifier', url: 'https://app.example', reason: 'Login' } as const

  beforeEach(() => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes the sheet when the Mini App request times out', async () => {
    await requestUserConfirmation(request, 31_000)
    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30_000 }))

    await requestUserConfirmation(request)
    expect(ExtendedDialog.sheet).toHaveBeenLastCalledWith(expect.objectContaining({ timeout: 120_000 }))
  })

  it('rejects without a sheet once the request timed out', async () => {
    await expect(requestUserConfirmation(request, 1_000)).resolves.toBe(false)
    expect(ExtendedDialog.sheet).not.toHaveBeenCalled()
  })
})
