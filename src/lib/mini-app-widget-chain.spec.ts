import type { WidgetChain } from './mini-app-widget-chain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { polygonUsdtConfig } from '@/lib/polygon/config'

const { network, polygon, prices, signer } = vi.hoisted(() => ({
  network: { consensus: 'established', height: 1000, client: undefined as Record<string, ReturnType<typeof vi.fn>> | undefined },
  polygon: { provider: { getTransactionReceipt: vi.fn(), getBlockNumber: vi.fn(), getBlock: vi.fn() }, tokenContract: { balanceOf: vi.fn() } },
  prices: { getPriceNow: vi.fn(), getPriceAt: vi.fn() },
  signer: { getTransactionsForAddress: vi.fn() },
}))
vi.mock('@/stores/nimiq-network', () => ({ useNimiqNetwork: () => network }))
vi.mock('@/stores/polygon-usdt', () => ({
  getPolygonUsdtClient: async () => polygon,
  shouldValidateOpenGsnTransaction: (receipt: { to?: string }) => receipt.to === polygonUsdtConfig.openGsnRelayHubContract,
  isSuccessfulOpenGsnReceipt: (receipt: { logs: unknown[] }) => receipt.logs.length > 0,
  // Same contract as the real helper in stores/polygon-usdt.ts.
  fetchPolygonTransactionState: async (provider: typeof polygon.provider, hash: string, validate?: (receipt: { status: number, blockNumber: number, to?: string, logs: unknown[] }) => boolean) => {
    let receipt
    try {
      receipt = await provider.getTransactionReceipt(hash)
    }
    catch {
      return { status: 'pending', lookupFailed: true }
    }
    if (!receipt)
      return { status: 'pending' }
    if (!receipt.status || (validate && !validate(receipt)))
      return { status: 'failed' }
    return { status: (await provider.getBlockNumber()) - receipt.blockNumber >= 10 ? 'confirmed' : 'mined' }
  },
}))
vi.mock('@/stores/remote-signer', () => ({ useRemoteSigner: () => signer }))
vi.stubGlobal('Nimiq', { Address: { fromString: (address: string) => ({ address }) } })
vi.mock('@/composables/useApi', () => ({ useCurrencyPriceApi: () => prices }))

const { createWidgetChain, decimalToUnits, evaluateTrigger, resolveLiveValue, resolvePriceHistory, unitsToDecimal } = await import('./mini-app-widget-chain')

const NOW = Date.UTC(2026, 9, 19, 12)
const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

function fakeChain(overrides: Partial<WidgetChain> = {}): WidgetChain {
  return {
    nimiqHeight: () => 1000,
    nimiqTransaction: async () => 'pending',
    nimiqReceived: async () => false,
    nimiqBalance: async () => 1234500,
    nimiqStake: async () => 500000,
    polygonTransaction: async () => 'pending',
    usdtBalance: async () => 2500000,
    price: async (_asset, _fiat, at) => (at === undefined ? 0.0004 : 0.0002),
    ...overrides,
  }
}

describe('decimals', () => {
  it('converts between decimal strings and units', () => {
    expect(decimalToUnits('12.5', 5)).toBe(1250000)
    expect(decimalToUnits('0.000001', 5)).toBe(0)
    expect(decimalToUnits('0.000001', 5, true)).toBe(1)
    expect(unitsToDecimal(1250000, 5)).toBe('12.5')
    expect(unitsToDecimal(5, 6)).toBe('0.000005')
  })
})

describe('evaluateTrigger', () => {
  it('fires time and height triggers locally', async () => {
    const chain = fakeChain()
    expect(await evaluateTrigger({ at: NOW }, chain, NOW)).toBe(true)
    expect(await evaluateTrigger({ at: NOW + 1 }, chain, NOW)).toBe(false)
    expect(await evaluateTrigger({ nimiqHeight: 1000 }, chain, NOW)).toBe(true)
    expect(await evaluateTrigger({ nimiqHeight: 1000 }, fakeChain({ nimiqHeight: () => undefined }), NOW)).toBeUndefined()
  })

  it('matches transaction status and payments', async () => {
    expect(await evaluateTrigger({ nimiqTx: 'a'.repeat(64), status: 'confirmed' }, fakeChain({ nimiqTransaction: async () => 'confirmed' }), NOW)).toBe(true)
    expect(await evaluateTrigger({ nimiqTx: 'a'.repeat(64), status: 'failed' }, fakeChain({ nimiqTransaction: async () => 'confirmed' }), NOW)).toBe(false)
    const nimiqReceived = vi.fn(async () => true)
    expect(await evaluateTrigger({ nimiqPayment: { to: ADDRESS, minValue: '10.5', since: NOW } }, fakeChain({ nimiqReceived }), NOW)).toBe(true)
    expect(nimiqReceived).toHaveBeenCalledWith(ADDRESS, 1050000, NOW)
  })

  it('rounds a payment minimum up to the next luna', async () => {
    const nimiqReceived = vi.fn(async () => true)
    const chain = fakeChain({ nimiqReceived })
    await evaluateTrigger({ nimiqPayment: { to: ADDRESS, minValue: '10.000001', since: NOW } }, chain, NOW)
    expect(nimiqReceived).toHaveBeenLastCalledWith(ADDRESS, 1000001, NOW)
    await evaluateTrigger({ nimiqPayment: { to: ADDRESS, minValue: '0.000001', since: NOW } }, chain, NOW)
    expect(nimiqReceived).toHaveBeenLastCalledWith(ADDRESS, 1, NOW)
    await evaluateTrigger({ nimiqPayment: { to: ADDRESS, minValue: '12.5', since: NOW } }, chain, NOW)
    expect(nimiqReceived).toHaveBeenLastCalledWith(ADDRESS, 1250000, NOW)
  })

  it('says unknown, not false, when a lookup has no answer or throws', async () => {
    const hash = 'a'.repeat(64)
    const payment = { nimiqPayment: { to: ADDRESS, minValue: '1', since: NOW } }
    const fails = () => Promise.reject(new Error('peer gone'))
    expect(await evaluateTrigger({ nimiqTx: hash, status: 'confirmed' }, fakeChain({ nimiqTransaction: async () => undefined }), NOW)).toBeUndefined()
    expect(await evaluateTrigger({ nimiqTx: hash, status: 'confirmed' }, fakeChain({ nimiqTransaction: fails }), NOW)).toBeUndefined()
    expect(await evaluateTrigger({ polygonTx: hash, status: 'confirmed' }, fakeChain({ polygonTransaction: async () => undefined }), NOW)).toBeUndefined()
    expect(await evaluateTrigger({ polygonTx: hash, status: 'confirmed' }, fakeChain({ polygonTransaction: fails }), NOW)).toBeUndefined()
    expect(await evaluateTrigger(payment, fakeChain({ nimiqReceived: async () => undefined }), NOW)).toBeUndefined()
    expect(await evaluateTrigger(payment, fakeChain({ nimiqReceived: fails }), NOW)).toBeUndefined()
    expect(await evaluateTrigger({ nimiqHeight: 1 }, fakeChain({ nimiqHeight: () => undefined }), NOW)).toBeUndefined()
  })

  it('says false once a lookup answers that the trigger has not fired', async () => {
    const hash = 'a'.repeat(64)
    expect(await evaluateTrigger({ nimiqTx: hash, status: 'confirmed' }, fakeChain(), NOW)).toBe(false)
    expect(await evaluateTrigger({ polygonTx: hash, status: 'confirmed' }, fakeChain(), NOW)).toBe(false)
    expect(await evaluateTrigger({ nimiqPayment: { to: ADDRESS, minValue: '1', since: NOW } }, fakeChain(), NOW)).toBe(false)
    expect(await evaluateTrigger({ nimiqHeight: 2000 }, fakeChain(), NOW)).toBe(false)
  })
})

describe('resolveLiveValue', () => {
  it('formats balances as decimal amounts', async () => {
    expect(await resolveLiveValue({ nimiqBalance: ADDRESS }, fakeChain(), 'EUR', NOW)).toEqual({ kind: 'amount', amount: '12.345', currency: 'NIM' })
    expect(await resolveLiveValue({ usdtBalance: `0x${'1'.repeat(40)}` }, fakeChain(), 'EUR', NOW)).toEqual({ kind: 'amount', amount: '2.5', currency: 'USDT' })
  })

  it('gives prices in the fiat currency and changes in percent', async () => {
    expect(await resolveLiveValue({ price: 'NIM' }, fakeChain(), 'EUR', NOW)).toEqual({ kind: 'amount', amount: '0.0004', currency: 'EUR' })
    expect(await resolveLiveValue({ priceChange: { asset: 'NIM', range: '24h' } }, fakeChain(), 'EUR', NOW)).toEqual({ kind: 'change', percent: 100 })
  })

  it('samples price history on a fixed grid', async () => {
    const seen: Array<number | undefined> = []
    const price = vi.fn(async (_asset: string, _fiat: string, at?: number) => {
      seen.push(at)
      return 1
    })
    await resolvePriceHistory('NIM', '24h', fakeChain({ price }), 'EUR', NOW)
    const later = [...seen]
    seen.length = 0
    await resolvePriceHistory('NIM', '24h', fakeChain({ price }), 'EUR', NOW + 60_000)
    expect(seen).toEqual(later)
  })

  it('samples a price history ending now', async () => {
    const price = vi.fn(async () => 1)
    const points = await resolvePriceHistory('NIM', '24h', fakeChain({ price }), 'EUR', NOW)
    expect(points).toHaveLength(25)
    expect(price).toHaveBeenLastCalledWith('NIM', 'EUR', undefined)
  })
})

describe('createWidgetChain', () => {
  it('reports a transaction without an execution result as pending, never confirmed', async () => {
    network.client = { getTransaction: vi.fn(async () => ({ state: 'included' })) }
    expect(await createWidgetChain().nimiqTransaction('a'.repeat(64))).toBe('pending')
    network.client = { getTransaction: vi.fn(async () => ({ state: 'confirmed', executionResult: false })) }
    expect(await createWidgetChain().nimiqTransaction('a'.repeat(64))).toBe('failed')
  })

  it('reads a payment through the remote signer store and checks every condition', async () => {
    network.client = {}
    const other = 'NQ11 1111 1111 1111 1111 1111 1111 1111 1111'
    const incoming = { sender: other, recipient: ADDRESS, value: 1000, timestamp: NOW + 5, executionResult: true }
    const answer = async (tx: object) => {
      signer.getTransactionsForAddress.mockResolvedValue([tx])
      return createWidgetChain().nimiqReceived(ADDRESS, 1000, NOW)
    }
    expect(await answer(incoming)).toBe(true)
    expect(signer.getTransactionsForAddress).toHaveBeenLastCalledWith({ address: ADDRESS }, { limit: 25 })
    expect(await answer({ ...incoming, value: 999 })).toBe(false)
    expect(await answer({ ...incoming, timestamp: NOW - 1 })).toBe(false)
    expect(await answer({ ...incoming, sender: ADDRESS, recipient: other })).toBe(false)
    expect(await answer({ ...incoming, executionResult: false })).toBe(false)
    expect(await answer({ ...incoming, executionResult: undefined })).toBe(false)
  })

  it('answers nothing when the history lookup throws or the wallet is missing', async () => {
    network.client = {}
    signer.getTransactionsForAddress.mockRejectedValue(new Error('Local wallet or client unavailable'))
    expect(await createWidgetChain().nimiqReceived(ADDRESS, 1, NOW)).toBeUndefined()
  })

  it('does not start a second history lookup while one is pending', async () => {
    network.client = {}
    let release!: (txs: object[]) => void
    signer.getTransactionsForAddress.mockClear()
    signer.getTransactionsForAddress.mockReturnValueOnce(new Promise((resolve) => {
      release = resolve
    }))
    const first = createWidgetChain().nimiqReceived(ADDRESS, 1, NOW)
    expect(await createWidgetChain().nimiqReceived(ADDRESS, 1, NOW)).toBeUndefined()
    expect(signer.getTransactionsForAddress).toHaveBeenCalledTimes(1)
    release([])
    expect(await first).toBe(false)
    signer.getTransactionsForAddress.mockResolvedValue([])
    expect(await createWidgetChain().nimiqReceived(ADDRESS, 1, NOW)).toBe(false)
  })

  it('maps every Nimiq transaction state', async () => {
    const status = async (tx: object) => {
      network.client = { getTransaction: vi.fn(async () => tx) }
      return createWidgetChain().nimiqTransaction('a'.repeat(64))
    }
    expect(await status({ state: 'invalidated' })).toBe('failed')
    expect(await status({ state: 'expired' })).toBe('failed')
    expect(await status({ state: 'new' })).toBe('pending')
    expect(await status({ state: 'pending' })).toBe('pending')
    expect(await status({ state: 'confirmed', executionResult: true })).toBe('confirmed')
  })

  it('reports a transaction the client does not know as pending while consensus holds, so later triggers still run', async () => {
    const hash = 'a'.repeat(64)
    network.client = { getTransaction: vi.fn(async () => Promise.reject(new Error('Transaction not found'))) }
    expect(await createWidgetChain().nimiqTransaction(hash)).toBe('pending')
    expect(await evaluateTrigger({ nimiqTx: hash, status: 'confirmed' }, createWidgetChain(), NOW)).toBe(false)
    network.client = { getTransaction: vi.fn(async () => {
      network.consensus = 'syncing'
      throw new Error('peers gone')
    }) }
    expect(await createWidgetChain().nimiqTransaction(hash)).toBeUndefined()
    network.consensus = 'established'
  })

  it('answers nothing when the transaction lookup times out', async () => {
    vi.useFakeTimers()
    network.client = { getTransaction: vi.fn(() => new Promise(() => {})) }
    const result = evaluateTrigger({ nimiqTx: 'a'.repeat(64), status: 'confirmed' }, createWidgetChain(), NOW)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toBeUndefined()
    vi.useRealTimers()
  })

  it('reads NIM balance and both stake parts', async () => {
    network.client = {
      getAccount: vi.fn(async () => ({ balance: 42 })),
      getStaker: vi.fn(async () => ({ balance: 7, inactiveBalance: 3 })),
    }
    const chain = createWidgetChain()
    expect(await chain.nimiqBalance(ADDRESS)).toBe(42)
    expect(await chain.nimiqStake(ADDRESS, 'active')).toBe(7)
    expect(await chain.nimiqStake(ADDRESS, 'inactive')).toBe(3)
    network.client.getStaker = vi.fn(async () => undefined)
    expect(await chain.nimiqStake(ADDRESS, 'active')).toBe(0)
  })

  it('reads the USDT balance in micro-units', async () => {
    polygon.tokenContract.balanceOf.mockResolvedValue(2500000n)
    expect(await createWidgetChain().usdtBalance(`0x${'1'.repeat(40)}`)).toBe(2500000)
  })

  it('answers nothing without consensus', async () => {
    network.consensus = 'syncing'
    expect(await createWidgetChain().nimiqBalance(ADDRESS)).toBeUndefined()
    expect(createWidgetChain().nimiqHeight()).toBeUndefined()
    network.consensus = 'established'
  })

  it('looks up the fiat rate once for a whole history', async () => {
    prices.getPriceNow.mockClear()
    prices.getPriceAt.mockImplementation(async () => ({ data: { price: 1 } }))
    prices.getPriceNow.mockImplementation(async () => ({ data: { price: 2 } }))
    const points = await resolvePriceHistory('BTC', '24h', createWidgetChain(), 'CHF', NOW)
    expect(points).toHaveLength(25)
    expect(prices.getPriceNow.mock.calls.filter(([arg]) => arg.currency === 'CHF')).toHaveLength(1)
  })

  it('converts USD prices with the fiat rate (fiat units per dollar)', async () => {
    prices.getPriceNow.mockImplementation(async ({ currency }: { currency: string }) => ({ data: { price: currency === 'NIM' ? 0.0004 : 0.9 } }))
    expect(await createWidgetChain().price('NIM', 'EUR')).toBeCloseTo(0.00036)
  })
})

describe('polygonTransaction', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const HASH = `0x${'a'.repeat(64)}`
  const receipt = { status: 1, blockNumber: 100, to: '0x0000000000000000000000000000000000000001', logs: [] }

  function mockChain(r: object | null, head = 120) {
    polygon.provider.getTransactionReceipt.mockResolvedValue(r)
    polygon.provider.getBlockNumber.mockResolvedValue(head)
    polygon.provider.getBlock.mockResolvedValue({ timestamp: 1 })
  }

  it('is confirmed only ten blocks deep', async () => {
    mockChain(receipt, 110)
    expect(await createWidgetChain().polygonTransaction(HASH)).toBe('confirmed')
  })

  it('is pending while mined but shallow, or without a receipt', async () => {
    mockChain(receipt, 105)
    expect(await createWidgetChain().polygonTransaction(HASH)).toBe('pending')
    mockChain(null)
    expect(await createWidgetChain().polygonTransaction(HASH)).toBe('pending')
  })

  it('is failed when the receipt reverted or the relayed transfer reverted inside it', async () => {
    mockChain({ ...receipt, status: 0 })
    expect(await createWidgetChain().polygonTransaction(HASH)).toBe('failed')
    mockChain({ ...receipt, to: polygonUsdtConfig.openGsnRelayHubContract })
    expect(await createWidgetChain().polygonTransaction(HASH)).toBe('failed')
  })

  it('is confirmed when the relayed transfer succeeded inside a deep enough receipt', async () => {
    mockChain({ ...receipt, to: polygonUsdtConfig.openGsnRelayHubContract, logs: [{}] }, 110)
    expect(await createWidgetChain().polygonTransaction(HASH)).toBe('confirmed')
  })

  it('answers nothing when the receipt lookup fails', async () => {
    polygon.provider.getTransactionReceipt.mockRejectedValue(new Error('rpc down'))
    expect(await createWidgetChain().polygonTransaction(HASH)).toBeUndefined()
  })

  it('answers nothing after the lookup timeout', async () => {
    vi.useFakeTimers()
    polygon.provider.getTransactionReceipt.mockReturnValue(new Promise(() => {}))
    const result = createWidgetChain().polygonTransaction(HASH)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toBeUndefined()
  })
})
