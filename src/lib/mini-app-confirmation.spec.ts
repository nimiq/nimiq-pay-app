import { ExtendedDialog } from 'capacitor-extended-dialog'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n/i18n-setup'
import { Asset } from '@/lib/assets'
import { requestUserConfirmation } from './mini-app-confirmation'

vi.mock('capacitor-extended-dialog', () => ({ ExtendedDialog: { sheet: vi.fn() } }))
vi.mock('@/composables/useMiniAppHost', () => ({ MINI_APP_REQUEST_TIMEOUT_MS: 120_000 }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ error: vi.fn() }) }))
vi.mock('@/stores/mini-apps', () => ({ useMiniApps: () => ({ iconForUrl: () => undefined }) }))
vi.mock('@/lib/site-metadata', () => ({ getFaviconUrl: () => '' }))
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: () => ({ localAddress: { toUserFriendlyAddress: () => 'NQ00 LOCAL' } }) }))

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

describe('requestUserConfirmation transaction', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
  })

  it.each([
    [499, '0.00499 NIM'],
    [1499, '0.01499 NIM'],
  ])('shows the exact staking fee for %d luna', async (fee, value) => {
    await requestUserConfirmation({
      type: 'transaction',
      network: 'nimiq',
      url: 'https://app.example',
      name: 'Example',
      data: { recipient: 'NQ00 STAKING', amount: 1_000_000, fee },
      stakingData: { type: 'add-stake' },
    } as any)

    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      rows: expect.arrayContaining([{ title: 'Fee', value }]),
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

describe('requestUserConfirmation translations', () => {
  const app = { url: 'https://app.example', name: 'Example' }

  beforeAll(async () => {
    const { default: enMessages } = await vi.importActual<{ default: Record<string, string> }>('@/i18n/en.po')
    i18n.setLocaleMessage('en', enMessages)
    i18n.setLocaleMessage('de', {
      'Connect to {appName}': 'Mit {appName} verbinden',
      '{appName} wants to add and switch to this network:': 'Netzwerk hinzufügen und wechseln für {appName}:',
      '{appName} wants to switch to this network:': 'Netzwerk wechseln für {appName}:',
      'Service fee (included)': 'Servicegebühr (inklusive)',
    })
  })

  beforeEach(() => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
  })

  afterEach(() => {
    i18n.locale = 'en'
  })

  it.each([
    ['en', 'Connect to Example', 'Example will be able to:'],
    ['de', 'Mit Example verbinden', 'Example will be able to:'],
  ])('renders the accounts sheet in %s', async (locale, title, subtitle) => {
    i18n.locale = locale
    await requestUserConfirmation({ ...app, type: 'accounts', network: 'nimiq' })

    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      title,
      subtitle,
      rows: [
        { title: '• See your address NQ00…OCAL' },
        { title: '• View your balance and activity' },
        { title: '• Request approval for transactions' },
      ],
    }))
  })

  it.each([
    ['en', 'add', 'Example wants to add and switch to this network:'],
    ['en', 'switch', 'Example wants to switch to this network:'],
    ['de', 'add', 'Netzwerk hinzufügen und wechseln für Example:'],
    ['de', 'switch', 'Netzwerk wechseln für Example:'],
  ] as const)('renders the %s chain subtitle for %s', async (locale, action, subtitle) => {
    i18n.locale = locale
    await requestUserConfirmation({ ...app, type: 'chain', network: 'ethereum', data: { action, chainId: '0x89' } })

    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({ subtitle }))
  })

  it.each([
    ['en', 'Service fee (included)'],
    ['de', 'Servicegebühr (inklusive)'],
  ])('renders the Lightning fee title in %s', async (locale, title) => {
    i18n.locale = locale
    await requestUserConfirmation({
      ...app,
      type: 'lightning-payment',
      network: 'nimiq',
      data: { btcAmount: 0.0001, asset: Asset.USDT, amount: 1_000_000, usdtFeeAllowance: 0, fees: [{ asset: 'USD', amount: 0.25, included: true, source: 'SERVICE' }] },
    })

    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      subtitle: 'Example requests this payment:',
      rows: expect.arrayContaining([{ title, value: '0.25 USD' }]),
    }))
  })
})
