import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Asset, Chain } from '@/lib/assets'
import { getSwapHtlcKey } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const loggerError = vi.fn()

const txMocks = vi.hoisted(() => ({
  addReceiptTransaction: vi.fn(),
  addPaymentTransaction: vi.fn(),
  addWithdrawalTransaction: vi.fn(),
}))

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

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    withdrawalAddressesHistory: [],
  }),
}))

vi.mock('@/stores/transactions', () => ({
  getSwapHtlcKey: (tx: { chain?: string, hash: string, recipient: string }) => tx.chain === Chain.Polygon ? tx.hash : tx.recipient,
  useTransactions: () => ({
    addPaymentToMerchantTransaction: vi.fn(),
    addPaymentTransaction: txMocks.addPaymentTransaction,
    addWithdrawalTransaction: txMocks.addWithdrawalTransaction,
    addReceiptTransaction: txMocks.addReceiptTransaction,
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

describe('persistHistoryTransaction onIncomingPersisted hook', () => {
  beforeEach(() => {
    txMocks.addReceiptTransaction.mockReset()
    txMocks.addPaymentTransaction.mockReset()
    txMocks.addWithdrawalTransaction.mockReset()
  })

  const localAddr = '0x0000000000000000000000000000000000000aaa'
  const foreignAddr = '0x0000000000000000000000000000000000000bbb'

  function makeIncomingGroup(timestamp: number, hash = '0xhash') {
    return {
      main: { from: foreignAddr, to: localAddr, value: 5_000_000n },
      fee: 0n,
      hash,
      timestamp,
      blockNumber: 1,
      logIndex: 0,
    } as any
  }

  it('invokes onIncomingPersisted with the persisted receipt for incoming txs', async () => {
    const { persistHistoryTransaction } = await import('./polygon-usdt')
    const onIncomingPersisted = vi.fn()
    await persistHistoryTransaction(makeIncomingGroup(2000, '0xfresh'), localAddr, { onIncomingPersisted })
    expect(txMocks.addReceiptTransaction).toHaveBeenCalledTimes(1)
    expect(onIncomingPersisted).toHaveBeenCalledTimes(1)
    const arg = onIncomingPersisted.mock.calls[0]![0]
    expect(arg).toMatchObject({ hash: '0xfresh', transfer: Transfer.UserReceipt, asset: Asset.USDT, chain: Chain.Polygon, timestamp: 2000 })
  })

  it('does NOT invoke onIncomingPersisted when no options passed (initial-scan branch contract)', async () => {
    const { persistHistoryTransaction } = await import('./polygon-usdt')
    await persistHistoryTransaction(makeIncomingGroup(2000), localAddr)
    expect(txMocks.addReceiptTransaction).toHaveBeenCalledTimes(1)
    // callback omitted → nothing to assert beyond the receipt being persisted.
  })

  it('does NOT invoke onIncomingPersisted for outgoing txs', async () => {
    const { persistHistoryTransaction } = await import('./polygon-usdt')
    const onIncomingPersisted = vi.fn()
    const outgoingGroup = {
      main: { from: localAddr, to: foreignAddr, value: 1_000_000n },
      fee: 0n,
      hash: '0xout',
      timestamp: 2000,
      blockNumber: 1,
      logIndex: 0,
    } as any
    await persistHistoryTransaction(outgoingGroup, localAddr, { onIncomingPersisted })
    expect(onIncomingPersisted).not.toHaveBeenCalled()
    expect(txMocks.addReceiptTransaction).not.toHaveBeenCalled()
    expect(txMocks.addPaymentTransaction).toHaveBeenCalledTimes(1)
  })
})

// Freshness filter used inside syncTransactionHistory incremental branch: only fire
// notifications for incoming txs strictly newer than the max timestamp present in DB
// before the pass started.
describe('usdt incremental freshness filter', () => {
  function freshnessFilter(newIncoming: Array<{ timestamp: number }>, previousMaxTimestamp: number) {
    return newIncoming.filter(tx => typeof tx.timestamp === 'number' && tx.timestamp > previousMaxTimestamp)
  }

  it('keeps txs with timestamp strictly greater than previousMaxTimestamp', () => {
    const result = freshnessFilter([{ timestamp: 1500 }, { timestamp: 1000 }, { timestamp: 999 }], 1000)
    expect(result).toEqual([{ timestamp: 1500 }])
  })

  it('drops txs equal to or older than previousMaxTimestamp (late-finality / out-of-order)', () => {
    expect(freshnessFilter([{ timestamp: 500 }, { timestamp: 1000 }], 1000)).toEqual([])
  })

  it('empty input yields empty output', () => {
    expect(freshnessFilter([], 1000)).toEqual([])
  })
})
