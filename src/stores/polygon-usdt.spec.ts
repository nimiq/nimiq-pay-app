import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Asset, Chain } from '@/lib/assets'
import { getSwapHtlcKey } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const loggerError = vi.fn()

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    error: loggerError,
    warn: vi.fn(),
    log: vi.fn(),
  }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    query: vi.fn(),
    run: vi.fn(),
  }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    getEthAddress: vi.fn(),
    getEthWallet: vi.fn(),
  }),
}))

vi.mock('@/stores/transactions', () => ({
  getSwapHtlcKey: (tx: { chain?: string, hash: string, recipient: string }) => tx.chain === Chain.Polygon ? tx.hash : tx.recipient,
  useTransactions: () => ({
    addPaymentToMerchantTransaction: vi.fn(),
    addPaymentTransaction: vi.fn(),
    addWithdrawalTransaction: vi.fn(),
    addReceiptTransaction: vi.fn(),
    updateTransactionStatus: vi.fn(),
    updateTransactionTitle: vi.fn(),
  }),
}))

vi.mock('@/lib/sql-queries', () => ({
  SQLQuery: {},
}))

describe('polygon-usdt quote helpers', () => {
  beforeEach(() => {
    loggerError.mockReset()
  })

  it('marks outgoing Polygon history to unknown addresses as payments instead of withdrawals', async () => {
    const { getPolygonHistoryTitle } = await import('./polygon-usdt')

    expect(getPolygonHistoryTitle(
      '0x00000000000000000000000000000000000000aa',
      [{ address: '0x00000000000000000000000000000000000000bb' }],
    )).toBe('Payment')
  })

  it('keeps outgoing Polygon history to saved withdrawal addresses marked as withdrawals', async () => {
    const { getPolygonHistoryTitle } = await import('./polygon-usdt')

    expect(getPolygonHistoryTitle(
      '0x00000000000000000000000000000000000000aa',
      [{ address: '0x00000000000000000000000000000000000000Aa' }],
    )).toBe('Withdrawal')
  })

  it('uses the transaction hash as the swap HTLC key for Polygon swaps', async () => {
    expect(getSwapHtlcKey({
      asset: Asset.USDT,
      chain: Chain.Polygon,
      hash: '0xswaphash',
      recipient: 'lnbc1invoice',
    } as any)).toBe('0xswaphash')

    expect(getSwapHtlcKey({
      asset: Asset.NIM,
      chain: Chain.Nimiq,
      hash: 'unused-hash',
      recipient: 'NQ00 TEST',
    } as any)).toBe('NQ00 TEST')
  })

  it('fetches Polygon gas price via a single eth_gasPrice RPC', async () => {
    const { fetchNetworkGasPrice } = await import('./polygon-usdt')

    const send = vi.fn().mockResolvedValue('0x1234')

    await expect(fetchNetworkGasPrice({ send } as any)).resolves.toBe(0x1234n)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('eth_gasPrice', [])
  })

  it('logs relay broadcast RPC errors before falling back to polling', async () => {
    const { broadcastPolygonRelayTransaction } = await import('./polygon-usdt')
    const rpcError = new Error('evm timeout')
    const broadcastTransaction = vi.fn().mockRejectedValue(rpcError)

    await expect(broadcastPolygonRelayTransaction({ broadcastTransaction } as any, '0xdeadbeef')).resolves.toBeNull()

    expect(loggerError).toHaveBeenCalledWith('Failed to broadcast relayed Polygon transaction', rpcError)
  })

  it('logs receipt lookup RPC errors before treating the transaction as pending', async () => {
    const { fetchPolygonTransactionReceipt } = await import('./polygon-usdt')
    const rpcError = new Error('evm timeout')
    const getTransactionReceipt = vi.fn().mockRejectedValue(rpcError)

    await expect(fetchPolygonTransactionReceipt({ getTransactionReceipt } as any, '0xabc')).resolves.toBeNull()

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to fetch Polygon transaction receipt',
      rpcError,
      { hash: '0xabc' },
    )
  })

  it('reuses a cached relay when no previous quote is available', async () => {
    const { buildPolygonTransferQuote, getReusableRelaySource } = await import('./polygon-usdt')

    const cachedRelay = {
      relay: {
        url: 'https://relay.example/cached',
        baseRelayFee: 1n,
        pctRelayFee: 2n,
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: 3n,
      },
      expiresAt: 20_000,
    }

    expect(getReusableRelaySource({
      cachedRelay,
      now: 10_000,
    })).toEqual(cachedRelay.relay)

    expect(getReusableRelaySource({
      cachedRelay,
      now: 20_001,
    })).toBeNull()

    const previousQuote = buildPolygonTransferQuote({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 4_000_000n,
      balance: 500_000_000,
      gasLimit: 123_000n,
      gasPrice: 456_000_000n,
      relay: {
        url: 'https://relay.example/previous',
        baseRelayFee: 4n,
        pctRelayFee: 5n,
        relayManagerAddress: '0x0000000000000000000000000000000000000033',
        relayWorkerAddress: '0x0000000000000000000000000000000000000044',
        minGasPrice: 6n,
      },
      now: 1_000,
    })

    expect(getReusableRelaySource({
      previousQuote,
      cachedRelay,
      now: 20_001,
    })).toEqual({
      url: 'https://relay.example/previous',
      baseRelayFee: 4n,
      pctRelayFee: 5n,
      relayManagerAddress: '0x0000000000000000000000000000000000000033',
      relayWorkerAddress: '0x0000000000000000000000000000000000000044',
      minGasPrice: 6n,
    })
  })

  it('builds transfer quotes from a warmed fee snapshot', async () => {
    const { buildPolygonTransferFeeSnapshot, buildPolygonTransferQuoteFromSnapshot } = await import('./polygon-usdt')

    const snapshot = buildPolygonTransferFeeSnapshot({
      fee: 4_000_000n,
      gasLimit: 123_000n,
      gasPrice: 456_000_000n,
      relay: {
        url: 'https://relay.example',
        baseRelayFee: 1n,
        pctRelayFee: 2n,
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: 3n,
      },
      now: 1_000,
    })

    const quote = buildPolygonTransferQuoteFromSnapshot({
      snapshot,
      request: {
        amount: 116_440_000,
        recipient: '0x0000000000000000000000000000000000000001',
        transfer: Transfer.UserPaymentToMerchant,
      },
      balance: 500_000_000,
      now: 2_000,
    })

    expect(quote.fee).toBe(4_000_000)
    expect(quote.totalDebit).toBe(120_440_000)
    expect(quote.maxSendable).toBe(496_000_000)
    expect(quote.expiresAt).toBe(snapshot.expiresAt)
  })

  it('builds stable transfer quote metadata', async () => {
    const { buildPolygonTransferQuote, POLYGON_TRANSFER_QUOTE_TTL_MS } = await import('./polygon-usdt')

    const quote = buildPolygonTransferQuote({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 4_000_000n,
      balance: 500_000_000,
      gasLimit: 123_000n,
      gasPrice: 456_000_000n,
      relay: {
        url: 'https://relay.example',
        baseRelayFee: 1n,
        pctRelayFee: 2n,
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: 3n,
      },
      now: 1_000,
    })

    expect(quote.fee).toBe(4_000_000)
    expect(quote.totalDebit).toBe(120_440_000)
    expect(quote.maxSendable).toBe(496_000_000)
    expect(quote.expiresAt).toBe(1_000 + POLYGON_TRANSFER_QUOTE_TTL_MS)
  })

  it('refreshes stale quotes once before sending', async () => {
    const { buildPolygonTransferQuote, resolvePolygonTransferQuote } = await import('./polygon-usdt')

    const staleQuote = buildPolygonTransferQuote({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 4_000_000n,
      balance: 500_000_000,
      gasLimit: 123_000n,
      gasPrice: 456_000_000n,
      relay: {
        url: 'https://relay.example/stale',
        baseRelayFee: 1n,
        pctRelayFee: 2n,
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: 3n,
      },
      now: 1_000,
    })

    const freshQuote = buildPolygonTransferQuote({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 5_000_000n,
      balance: 500_000_000,
      gasLimit: 123_000n,
      gasPrice: 456_000_000n,
      relay: {
        url: 'https://relay.example/fresh',
        baseRelayFee: 1n,
        pctRelayFee: 2n,
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: 3n,
      },
      now: staleQuote.expiresAt + 1,
    })

    const buildFreshQuote = vi.fn().mockResolvedValue(freshQuote)

    const resolvedQuote = await resolvePolygonTransferQuote({
      request: {
        amount: 116_440_000,
        recipient: '0x0000000000000000000000000000000000000001',
        transfer: Transfer.UserPaymentToMerchant,
      },
      balance: 500_000_000,
      providedQuote: staleQuote,
      buildFreshQuote,
      now: staleQuote.expiresAt + 1,
    })

    expect(buildFreshQuote).toHaveBeenCalledTimes(1)
    expect(resolvedQuote).toEqual(freshQuote)
  })

  it('surfaces a deterministic insufficient-after-fee error from refreshed quotes', async () => {
    const { buildPolygonTransferQuote, resolvePolygonTransferQuote } = await import('./polygon-usdt')

    const staleQuote = buildPolygonTransferQuote({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 2_000_000n,
      balance: 118_000_000,
      gasLimit: 123_000n,
      gasPrice: 456_000_000n,
      relay: {
        url: 'https://relay.example/stale',
        baseRelayFee: 1n,
        pctRelayFee: 2n,
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: 3n,
      },
      now: 1_000,
    })

    const buildFreshQuote = vi.fn().mockResolvedValue(buildPolygonTransferQuote({
      amount: 116_440_000,
      recipient: '0x0000000000000000000000000000000000000001',
      transfer: Transfer.UserPaymentToMerchant,
      fee: 4_000_000n,
      balance: 118_000_000,
      gasLimit: 123_000n,
      gasPrice: 456_000_000n,
      relay: {
        url: 'https://relay.example/fresh',
        baseRelayFee: 1n,
        pctRelayFee: 2n,
        relayManagerAddress: '0x0000000000000000000000000000000000000011',
        relayWorkerAddress: '0x0000000000000000000000000000000000000022',
        minGasPrice: 3n,
      },
      now: staleQuote.expiresAt + 1,
    }))

    await expect(resolvePolygonTransferQuote({
      request: {
        amount: 116_440_000,
        recipient: '0x0000000000000000000000000000000000000001',
        transfer: Transfer.UserPaymentToMerchant,
      },
      balance: 118_000_000,
      providedQuote: staleQuote,
      buildFreshQuote,
      now: staleQuote.expiresAt + 1,
    })).rejects.toThrow('You don\'t have enough USDT to cover this payment plus Polygon fees.')
  })

  it('scans the full initial history when balance and nonce are both zero', async () => {
    const { scanInitialPolygonHistory } = await import('./polygon-usdt')

    const scannedRanges: Array<[number, number]> = []

    await scanInitialPolygonHistory({
      latestBlock: 9_000,
      earliestBlock: 1_000,
      rpcMaxBlockRange: 3_000,
      currentBalance: 0n,
      currentTokenNonce: 0n,
      fetchGroups: async (fromBlock, toBlock) => {
        scannedRanges.push([fromBlock, toBlock])
        return []
      },
      visitGroup: vi.fn(),
    })

    expect(scannedRanges).toEqual([
      [6_001, 9_000],
      [3_001, 6_000],
      [1_000, 3_000],
    ])
  })

  it('caps the initial Polygon history scan and resumes from the saved cursor', async () => {
    const { scanInitialPolygonHistory } = await import('./polygon-usdt')

    const scannedRanges: Array<[number, number]> = []

    const firstPass = await scanInitialPolygonHistory({
      latestBlock: 12_000,
      earliestBlock: 1_000,
      rpcMaxBlockRange: 3_000,
      currentBalance: 5n,
      currentTokenNonce: 0n,
      maxRanges: 1,
      fetchGroups: async (fromBlock, toBlock) => {
        scannedRanges.push([fromBlock, toBlock])
        return []
      },
      visitGroup: vi.fn(),
    })

    expect(firstPass).toEqual({
      completed: false,
      nextState: {
        headBlock: 12_000,
        nextToBlock: 9_000,
        remainingBalance: 5n,
        remainingNonce: 0n,
      },
    })

    const secondPass = await scanInitialPolygonHistory({
      latestBlock: 15_000,
      earliestBlock: 1_000,
      rpcMaxBlockRange: 3_000,
      currentBalance: 5n,
      currentTokenNonce: 0n,
      resumeState: firstPass.nextState!,
      maxRanges: 1,
      fetchGroups: async (fromBlock, toBlock) => {
        scannedRanges.push([fromBlock, toBlock])
        return []
      },
      visitGroup: vi.fn(),
    })

    expect(secondPass).toEqual({
      completed: false,
      nextState: {
        headBlock: 12_000,
        nextToBlock: 6_000,
        remainingBalance: 5n,
        remainingNonce: 0n,
      },
    })

    expect(scannedRanges).toEqual([
      [9_001, 12_000],
      [6_001, 9_000],
    ])
  })
})
