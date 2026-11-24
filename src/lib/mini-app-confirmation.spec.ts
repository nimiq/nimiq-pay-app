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

// The app's English messages, as at startup: a sheet string missing from en.po would show its {placeholders}.
beforeAll(async () => {
  const language = 'en'
  i18n.setLocaleMessage(language, (await import(`../i18n/${language}.po`)).default)
})

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
  it('asks to use a Mini App\'s new name, saying where it shows and that the address stays', async () => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })

    const confirmed = await requestUserConfirmation({ type: 'widgetName', url: 'https://name.github.io/my-app/', address: 'name.github.io/my-app', to: 'SwapSpace' })

    expect(confirmed).toBe(true)
    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Show name.github.io/my-app as SwapSpace?',
      rows: [
        { title: '• Shown on its widgets on Home' },
        { title: '• The address stays in each widget\'s menu' },
      ],
      confirmButtonTitle: 'Use this name',
      cancelButtonTitle: 'Not now',
    }))
  })

  it('says the name the widget will show under, so that approving it means having seen it', async () => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })

    await requestUserConfirmation({ type: 'widget', url: 'https://swap.example/app', widgetName: 'Swap status', appName: 'SwapSpace' })

    expect(vi.mocked(ExtendedDialog.sheet).mock.calls[0]![0].rows![0]).toEqual({ title: '• Appears as SwapSpace on Home' })
  })

  it('says at install when a widget sends the user\'s addresses', async () => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
    await requestUserConfirmation({ type: 'widget', url: 'https://swap.example/app', widgetName: 'Swap status', permissions: ['addresses'] })
    expect(vi.mocked(ExtendedDialog.sheet).mock.calls[0]![0].rows).toContainEqual({ title: '• Sends your addresses to swap.example with every refresh' })
    const rows = vi.mocked(ExtendedDialog.sheet).mock.calls[0]![0].rows!.map(row => row.title)
    expect(rows).not.toContain('• Cannot see your balance or move funds')
    expect(rows).toContain('• Cannot move funds')
  })

  it('asks on its own for a permission added after install', async () => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
    expect(await requestUserConfirmation({ type: 'widgetPermissions', url: 'https://swap.example/app', widgetName: 'Swap status' })).toBe(true)
    expect(vi.mocked(ExtendedDialog.sheet)).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Let Swap status send your addresses to swap.example?',
      rows: [{ title: '• With every refresh of this widget' }, { title: '• Stop any time from its menu' }],
    }))
  })

  it('asks to add the widget, naming the site and what the widget cannot do', async () => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: false })

    const confirmed = await requestUserConfirmation({ type: 'widget', url: 'https://swap.example/app', widgetName: 'Swap status', description: 'Follows your swap.' })

    expect(confirmed).toBe(false)
    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Add Swap status to Home?',
      subtitle: 'Follows your swap.',
      rows: [
        { title: '• Shows what swap.example sends' },
        { title: '• May contact swap.example regularly to stay up to date' },
        { title: '• Cannot see your balance or move funds' },
        { title: '• Remove it any time from its menu' },
      ],
      confirmButtonTitle: 'Add to Home',
      cancelButtonTitle: 'Not now',
    }))
  })
})

describe('requestUserConfirmation widget sheets in another language', () => {
  beforeEach(() => {
    vi.mocked(ExtendedDialog.sheet).mockReset().mockResolvedValue({ confirmed: true })
    i18n.setLocaleMessage('de', {
      'Add {name} to Home?': '{name} zu Home hinzufügen?',
      'Appears as {name} on Home': 'Erscheint auf Home als {name}',
      'Shows what {host} sends': 'Zeigt, was {host} sendet',
      'Cannot see your balance or move funds': 'Sieht dein Guthaben nicht und bewegt kein Geld',
      'Add to Home': 'Zu Home hinzufügen',
      'Not now': 'Nicht jetzt',
      'Let {name} send your addresses to {host}?': 'Darf {name} deine Adressen an {host} senden?',
      'Allow': 'Erlauben',
      'Show {address} as {name}?': '{address} als {name} anzeigen?',
      'Use this name': 'Diesen Namen verwenden',
    })
    i18n.locale = 'de'
  })

  afterEach(() => {
    i18n.locale = 'en'
  })

  it('translates the add sheet, keeping the bullets', async () => {
    await requestUserConfirmation({ type: 'widget', url: 'https://swap.example/app', widgetName: 'Swap status', appName: 'SwapSpace' })
    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Swap status zu Home hinzufügen?',
      confirmButtonTitle: 'Zu Home hinzufügen',
      cancelButtonTitle: 'Nicht jetzt',
    }))
    const rows = vi.mocked(ExtendedDialog.sheet).mock.calls[0]![0].rows!.map(row => row.title)
    expect(rows).toEqual(expect.arrayContaining(['• Erscheint auf Home als SwapSpace', '• Zeigt, was swap.example sendet', '• Sieht dein Guthaben nicht und bewegt kein Geld']))
  })

  it('translates the permission and name sheets', async () => {
    await requestUserConfirmation({ type: 'widgetPermissions', url: 'https://swap.example/app', widgetName: 'Swap status' })
    await requestUserConfirmation({ type: 'widgetName', url: 'https://name.github.io/my-app/', address: 'name.github.io/my-app', to: 'SwapSpace' })
    expect(ExtendedDialog.sheet).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: 'Darf Swap status deine Adressen an swap.example senden?', confirmButtonTitle: 'Erlauben', cancelButtonTitle: 'Nicht jetzt' }))
    expect(ExtendedDialog.sheet).toHaveBeenNthCalledWith(2, expect.objectContaining({ title: 'name.github.io/my-app als SwapSpace anzeigen?', confirmButtonTitle: 'Diesen Namen verwenden' }))
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

  it.each([
    { type: 'widget', url: 'https://swap.example/app', widgetName: 'Swap status' },
    { type: 'widgetPermissions', url: 'https://swap.example/app', widgetName: 'Swap status' },
    { type: 'widgetName', url: 'https://swap.example/app', address: 'swap.example/app', to: 'SwapSpace' },
  ] as const)('closes a $type sheet at it too', async (widgetRequest) => {
    await requestUserConfirmation(widgetRequest, 31_000)
    expect(ExtendedDialog.sheet).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30_000 }))
  })

  it.each([
    { type: 'widget', url: 'https://swap.example/app', widgetName: 'Swap status' },
    { type: 'widgetPermissions', url: 'https://swap.example/app', widgetName: 'Swap status' },
  ] as const)('leaves a $type sheet opened from Home up until it is answered, as no Mini App waits for it', async (widgetRequest) => {
    await requestUserConfirmation(widgetRequest)
    expect(vi.mocked(ExtendedDialog.sheet).mock.calls[0]![0].timeout).toBeUndefined()
  })

  it('rejects without a sheet once the request timed out', async () => {
    await expect(requestUserConfirmation(request, 1_000)).resolves.toBe(false)
    expect(ExtendedDialog.sheet).not.toHaveBeenCalled()
  })
})
