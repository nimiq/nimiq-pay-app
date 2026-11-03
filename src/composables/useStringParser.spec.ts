import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Asset } from '@/lib/assets'
import { Rail } from '@/types/transactions'

const state = vi.hoisted(() => ({
  query: vi.fn(),
  run: vi.fn(),
  createSwap: vi.fn(),
  getSwap: vi.fn(),
  parseBitcoinLightningInvoice: vi.fn(),
  getOrderById: vi.fn(),
  activeAsset: 'NIM' as string,
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    query: state.query,
    run: state.run,
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('./useApi', () => ({
  useCplApi: () => ({
    getOrderById: state.getOrderById,
  }),
}))

vi.mock('./useFastspotV2', () => ({
  useFastspotApiV2: async () => ({
    createSwap: state.createSwap,
    getSwap: state.getSwap,
  }),
}))

vi.mock('./useBitcoinLightning', () => ({
  parseBitcoinLightningInvoice: state.parseBitcoinLightningInvoice,
}))

vi.mock('./useGoCrypto', () => ({
  GOCRYPTO_ID_PARAM: 'gocrypto_id',
  parseGoCryptoRequestLink: vi.fn(() => null),
}))

vi.mock('@/stores/app', () => ({
  Fiat: {
    USD: 'USD',
  },
  useApp: () => ({
    activeAsset: state.activeAsset,
  }),
}))

describe('useStringParser', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('__ENABLE_BTC_LN__', true)
    state.query.mockReset()
    state.run.mockReset()
    state.createSwap.mockReset()
    state.getSwap.mockReset()
    state.parseBitcoinLightningInvoice.mockReset()
    state.getOrderById.mockReset()
    state.logger.log.mockReset()
    state.logger.error.mockReset()

    state.activeAsset = 'NIM'
    state.query.mockResolvedValue(undefined)
    state.run.mockResolvedValue(undefined)
  })

  it('does not echo invalid input in the returned error', async () => {
    const seed = 'witch collapse practice feed shame open despair creek road again ice least'
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData(seed)

    expect(data).toBeUndefined()
    // Tests run i18n without interpolation, so assert the message takes no input parameter at all.
    expect(error).toBe('Invalid URL')
  })

  it('parses a raw Polygon address as a USDT payment target', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('0x1111111111111111111111111111111111111111')

    expect(error).toBeUndefined()
    expect(data).toMatchObject({
      recipient: '0x1111111111111111111111111111111111111111',
      amount: 0,
      transfer: 'user-payment',
      asset: 'USDT',
      chain: 'Polygon',
    })
  })

  it('parses an ERC-681 Polygon USDT transfer URI', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('ethereum:0xc2132D05D31c914a87C6611C10748AEb04B58e8F@137/transfer?address=0x1111111111111111111111111111111111111111&uint256=2500000')

    expect(error).toBeUndefined()
    expect(data).toMatchObject({
      recipient: '0x1111111111111111111111111111111111111111',
      amount: 2500000,
      transfer: 'user-payment',
      asset: 'USDT',
      chain: 'Polygon',
    })
  })

  it('parses a short-form EIP-681 Polygon receive URI as a USDT payment target', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('ethereum:0x1111111111111111111111111111111111111111@137')

    expect(error).toBeUndefined()
    expect(data).toMatchObject({
      recipient: '0x1111111111111111111111111111111111111111',
      amount: 0,
      transfer: 'user-payment',
      asset: 'USDT',
      chain: 'Polygon',
    })
  })

  it('rejects native MATIC polygon protocol links from the USDT payment flow', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('polygon:0x1111111111111111111111111111111111111111?value=2500000')

    expect(data).toBeUndefined()
    expect(error).toContain('Only USDT Wallet requests are supported')
  })

  it('rejects ambiguous ethereum recipient-only links without Polygon context', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('ethereum:0x1111111111111111111111111111111111111111')

    expect(data).toBeUndefined()
    expect(error).toBeTruthy()
  })

  it('rejects non-Polygon USDT transfer links', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7@1/transfer?address=0x1111111111111111111111111111111111111111&uint256=2500000')

    expect(data).toBeUndefined()
    expect(error).toContain('Only Polygon network requests are supported')
  })

  it('keeps Nimiq wallet requests on the NIM/Nimiq asset pair', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=1.25')

    expect(error).toBeUndefined()
    expect(data).toMatchObject({
      amount: 125000,
      asset: 'NIM',
      chain: 'Nimiq',
    })
  })

  it('keeps an amount-less Nimiq wallet request at amount 0 so the user enters it', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6')

    expect(error).toBeUndefined()
    expect(data).toMatchObject({ recipient: 'NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6', amount: 0 })
  })

  it.each([
    ['a bad checksum', 'nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP7?amount=1'],
    ['a non-address path', 'nimiq:hello?amount=1'],
  ])('rejects a Nimiq wallet request with %s recipient', async (_, link) => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData(link)

    expect(data).toBeUndefined()
    expect(error).toBe('Invalid Nimiq address')
  })

  it.each(['abc', '-5', 'Infinity', '1e12'])('rejects a Nimiq wallet request with amount=%s', async (amount) => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData(`nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=${amount}`)

    expect(data).toBeUndefined()
    expect(error).toBe('Invalid amount')
  })

  it('parses a CPLink with a valid recipient and amount', async () => {
    state.getOrderById.mockResolvedValue({ data: { fiatCurrency: 'EUR', fiatAmount: 1.5, itemDescription: 'Shoes' }, error: undefined })
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=1.83&label=Maxi%20Shoes&cpl_id=PZEdCP62')

    expect(error).toBeUndefined()
    expect(data).toMatchObject({ recipient: 'NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6', amount: 183000, paymentRef: 'PZEdCP62', rail: Rail.CryptoPaymentLink })
  })

  it('rejects a CPLink with a bad recipient checksum before fetching the order', async () => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP7?amount=1&cpl_id=PZEdCP62')

    expect(data).toBeUndefined()
    expect(error).toBe('Invalid Nimiq address')
    expect(state.getOrderById).not.toHaveBeenCalled()
  })

  it.each([
    ['a negative amount', '-5'],
    ['an infinite amount', 'Infinity'],
    ['a sub-luna amount', '0.000001'],
    ['an amount beyond safe integer luna', '1e12'],
    ['no amount', ''],
  ])('rejects a CPLink with %s before fetching the order', async (_, amount) => {
    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData(`nimiq:NQ51PF643FPJ86JERCTP5R7F0BR5U41VELP6?amount=${amount}&cpl_id=PZEdCP62`)

    expect(data).toBeUndefined()
    expect(error).toBe('Invalid CPLink. Missing amount or recipient.')
    expect(state.getOrderById).not.toHaveBeenCalled()
  })

  it('normalizes supported Lightning swap fee tickers into app crypto values', async () => {
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1supportedfees',
      description: 'Invoice description',
      expiry: 600,
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })
    state.createSwap.mockResolvedValue({
      id: 'swap-1',
      status: 'PENDING_CONFIRMATION',
      sell: { asset: 'NIM', amount: 125000 },
      buy: { asset: 'BTC_LN', amount: 1000 },
      fees: [
        { asset: 'BTC', amount: 25, included: true, source: 'NETWORK' },
        { asset: 'BTC', amount: 5, included: true, source: 'NETWORK' },
        { asset: 'NIM', amount: 100, included: true, source: 'NETWORK' },
      ],
      expiry: Math.floor(Date.now() / 1e3) + 600,
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1supportedfees')

    expect(error).toBeUndefined()
    expect(data?.swap?.fees).toEqual([
      { asset: 'BTC', amount: 30, included: true, source: 'NETWORK' },
      { asset: 'NIM', amount: 100, included: true, source: 'NETWORK' },
    ])
  })

  it('rejects an expired Lightning invoice before requesting a quote', async () => {
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1expired',
      expiry: Math.floor(Date.now() / 1e3) - 700,
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) - 1000 },
        { name: 'expiry', value: 300 },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1expired')

    expect(data).toBeUndefined()
    expect(error).toBe('Bitcoin Lightning invoice expired.')
    expect(state.createSwap).not.toHaveBeenCalled()
  })

  it('rejects a Lightning invoice with less than 20 seconds remaining before requesting a quote', async () => {
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1nearexpiry',
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) - 50 },
        { name: 'expiry', value: 60 },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1nearexpiry')

    expect(data).toBeUndefined()
    expect(error).toBe('Bitcoin Lightning invoice expired.')
    expect(state.createSwap).not.toHaveBeenCalled()
  })

  it('uses the BOLT11 default expiry when no expiry tag exists', async () => {
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1defaultexpiry',
      sections: [{ name: 'timestamp', value: Math.floor(Date.now() / 1e3) - 3700 }],
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1defaultexpiry')

    expect(data).toBeUndefined()
    expect(error).toBe('Bitcoin Lightning invoice expired.')
    expect(state.createSwap).not.toHaveBeenCalled()
  })

  it('creates USDT_MATIC swap when active asset is USDT', async () => {
    state.activeAsset = 'USDT'
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1usdtswap',
      description: 'USDT swap test',
      expiry: 600,
      payment_hash: 'abc123',
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })
    state.createSwap.mockResolvedValue({
      id: 'swap-usdt-1',
      status: 'PENDING_CONFIRMATION',
      sell: { asset: 'USDT_MATIC', amount: 500000 },
      buy: { asset: 'BTC_LN', amount: 1000 },
      fees: [
        { asset: 'BTC', amount: 25, included: true, source: 'NETWORK' },
        { asset: 'USDT', amount: 1000, included: true, source: 'NETWORK' },
        { asset: 'USDT', amount: 500, included: false, source: 'NETWORK' },
      ],
      expiry: Math.floor(Date.now() / 1e3) + 600,
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1usdtswap')

    expect(error).toBeUndefined()
    expect(data).toMatchObject({
      asset: 'USDT',
      chain: 'Polygon',
      transfer: 'user-payment-to-atomic-swap',
      rail: 'bitcoin-lightning',
      amount: 500000,
    })
    expect(state.createSwap).toHaveBeenCalledWith(
      { asset: 'USDT_MATIC' },
      expect.objectContaining({ asset: 'BTC_LN' }),
    )
    expect(state.run).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO swap_quotes'), [
      'USDT_MATIC:lnbc1usdtswap',
      'swap-usdt-1',
      expect.any(Number),
    ])
    // Included fees summed per (asset, source); non-included take max per (asset, source)
    expect(data?.swap?.fees).toEqual([
      { asset: 'BTC', amount: 25, included: true, source: 'NETWORK' },
      { asset: 'USDT', amount: 1000, included: true, source: 'NETWORK' },
      { asset: 'USDT', amount: 500, included: false, source: 'NETWORK' },
    ])
  })

  it('quotes NIM for a Mini App even when the active asset is USDT', async () => {
    state.activeAsset = 'USDT'
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1nimfromminiapp',
      expiry: 600,
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })
    state.createSwap.mockResolvedValue({
      id: 'swap-mini-app',
      status: 'PENDING_CONFIRMATION',
      sell: { asset: 'NIM', amount: 125000 },
      buy: { asset: 'BTC_LN', amount: 1000 },
      fees: [],
      expiry: Math.floor(Date.now() / 1e3) + 600,
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1nimfromminiapp', Asset.NIM)

    expect(error).toBeUndefined()
    expect(data).toMatchObject({ asset: 'NIM', chain: 'Nimiq', paymentRef: 'swap-mini-app' })
    expect(state.createSwap).toHaveBeenCalledWith({ asset: 'NIM' }, expect.objectContaining({ asset: 'BTC_LN' }))
    expect(state.activeAsset).toBe('USDT')
  })

  it('namespaces Lightning swap quote cache entries by sell asset', async () => {
    const quoteExpiry = Math.floor(Date.now() / 1e3) + 600
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1sharedinvoice',
      description: 'Shared invoice',
      expiry: 600,
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })

    state.createSwap.mockResolvedValue({
      id: 'swap-nim-1',
      status: 'PENDING_CONFIRMATION',
      sell: { asset: 'NIM', amount: 125000 },
      buy: { asset: 'BTC_LN', amount: 1000 },
      fees: [],
      expiry: quoteExpiry,
    })

    const { useStringParser } = await import('./useStringParser')
    await useStringParser().getPaymentRequestData('lightning:lnbc1sharedinvoice')

    expect(state.query).toHaveBeenLastCalledWith(expect.any(String), ['NIM:lnbc1sharedinvoice'], { single: true })
    expect(state.run).toHaveBeenLastCalledWith(expect.stringContaining('INSERT OR REPLACE INTO swap_quotes'), [
      'NIM:lnbc1sharedinvoice',
      'swap-nim-1',
      quoteExpiry * 1e3,
    ])

    state.query.mockClear()
    state.run.mockClear()
    state.createSwap.mockResolvedValue({
      id: 'swap-usdt-2',
      status: 'PENDING_CONFIRMATION',
      sell: { asset: 'USDT_MATIC', amount: 500000 },
      buy: { asset: 'BTC_LN', amount: 1000 },
      fees: [],
      expiry: Math.floor(Date.now() / 1e3) + 600,
    })
    state.activeAsset = 'USDT'

    await useStringParser().getPaymentRequestData('lightning:lnbc1sharedinvoice')

    expect(state.query).toHaveBeenLastCalledWith(expect.any(String), ['USDT_MATIC:lnbc1sharedinvoice'], { single: true })
    expect(state.run).toHaveBeenLastCalledWith(expect.stringContaining('INSERT OR REPLACE INTO swap_quotes'), [
      'USDT_MATIC:lnbc1sharedinvoice',
      'swap-usdt-2',
      expect.any(Number),
    ])
  })

  it('accepts USD-denominated Lightning swap fees and passes through percentage', async () => {
    state.activeAsset = 'USDT'
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1usdswapfee',
      description: 'USD fee test',
      expiry: 600,
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })
    state.createSwap.mockResolvedValue({
      id: 'swap-usd-fee',
      status: 'PENDING_CONFIRMATION',
      sell: { asset: 'USDT_MATIC', amount: 500000 },
      buy: { asset: 'BTC_LN', amount: 1000 },
      fees: [
        { asset: 'USD', amount: 0.25, percentage: '0.0025', included: true, source: 'SERVICE' },
        { asset: 'BTC', amount: 25, included: true, source: 'NETWORK' },
      ],
      expiry: Math.floor(Date.now() / 1e3) + 600,
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1usdswapfee')

    expect(error).toBeUndefined()
    expect(data?.swap?.fees).toEqual([
      { asset: 'USD', amount: 0.25, included: true, source: 'SERVICE', percentage: 0.0025 },
      { asset: 'BTC', amount: 25, included: true, source: 'NETWORK' },
    ])
  })

  it('keeps unsupported Lightning swap fee tickers as-is', async () => {
    state.parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1unsupportedfees',
      description: 'Invoice description',
      expiry: 600,
      sections: [
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) },
        { name: 'coin_network', letters: 'tb' },
        { name: 'amount', value: '1000' },
      ],
    })
    state.createSwap.mockResolvedValue({
      id: 'swap-2',
      status: 'PENDING_CONFIRMATION',
      sell: { asset: 'NIM', amount: 125000 },
      buy: { asset: 'BTC_LN', amount: 1000 },
      fees: [
        { asset: 'USDC', amount: 10, included: true, source: 'NETWORK' },
      ],
      expiry: Math.floor(Date.now() / 1e3) + 600,
    })

    const { useStringParser } = await import('./useStringParser')
    const { data, error } = await useStringParser().getPaymentRequestData('lightning:lnbc1unsupportedfees')

    expect(error).toBeUndefined()
    expect(data?.swap?.fees).toEqual([
      { asset: 'USDC', amount: 10, included: true, source: 'NETWORK' },
    ])
  })
})
