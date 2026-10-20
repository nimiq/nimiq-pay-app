import { Interface } from 'ethers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Asset, Chain } from '@/lib/assets'
import { POLYGON_RELAY_HUB_ABI } from '@/lib/polygon/abis'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { getSwapHtlcKey } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const loggerError = vi.fn()

const txMocks = vi.hoisted(() => ({
  addReceiptTransactions: vi.fn(),
  addPaymentTransaction: vi.fn(),
  addWithdrawalTransaction: vi.fn(),
  addPolygonHistoryTransaction: vi.fn(),
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
    addPolygonSwapTransactionWithRecovery: vi.fn(),
    replacePolygonTransactionHash: vi.fn(),
    addPaymentTransaction: txMocks.addPaymentTransaction,
    addWithdrawalTransaction: txMocks.addWithdrawalTransaction,
    addPolygonHistoryTransaction: txMocks.addPolygonHistoryTransaction,
    addReceiptTransactions: txMocks.addReceiptTransactions,
    updateTransactionStatus: vi.fn(),
    updateTransactionTitle: vi.fn(),
  }),
}))

vi.mock('@/lib/sql-queries', () => ({
  SQLQuery: {},
}))

describe('outgoing Polygon transaction timestamps', () => {
  it.each([
    { name: 'pending payment', transfer: Transfer.UserPayment, status: 'pending', timestamp: 1788429600123, expected: 1788429600 },
    { name: 'pending swap', transfer: Transfer.UserPaymentToAtomicSwap, status: 'pending', timestamp: 1788429600123, expected: 1788429600 },
    { name: 'confirmed payment', transfer: Transfer.UserPayment, status: 'confirmed', timestamp: 1788429600, expected: 1788429600 },
    { name: 'unknown block time', transfer: Transfer.UserPayment, status: 'pending', timestamp: undefined, expected: undefined },
  ] as const)('uses epoch seconds for $name', async ({ transfer, status, timestamp, expected }) => {
    const { buildOutgoingTransaction } = await import('./polygon-usdt')

    const tx = buildOutgoingTransaction(
      { recipient: '0x00000000000000000000000000000000000000bb', amount: 1000000, fee: 1000, transfer },
      'Payment',
      '0x00000000000000000000000000000000000000aa',
      '0xrelayhash',
      timestamp,
      1000,
      status,
    )

    expect(tx).toMatchObject({ timestamp: expected, status, transfer, asset: Asset.USDT, chain: Chain.Polygon })
  })
})

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

  it('retries the required relay gas lookup after a failed RPC call', async () => {
    vi.resetModules()
    const { getRequiredRelayGas } = await import('./polygon-usdt')
    const lookup = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(70_000n)
    const client = {
      transferContract: {
        getRequiredRelayGas: lookup,
        interface: new Interface(['function transferWithApproval()']),
      },
    } as any

    await expect(getRequiredRelayGas(client)).rejects.toThrow('network error')
    await expect(getRequiredRelayGas(client)).resolves.toBe(70_000n)
    await expect(getRequiredRelayGas(client)).resolves.toBe(70_000n)
    expect(lookup).toHaveBeenCalledTimes(2)
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

  it('persists relay bookkeeping before broadcasting the Polygon transaction', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const calls: string[] = []
    const provider = {
      broadcastTransaction: vi.fn(async () => {
        calls.push('broadcast')
        return {
          wait: vi.fn(async () => ({ hash: '0xrelayhash' })),
        }
      }),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(
      provider as any,
      '0xserialized',
      '0xrelayhash',
      { beforeBroadcast: async () => { calls.push('persist') } },
    )).resolves.toEqual({ hash: '0xrelayhash', status: 'mined' })

    expect(calls).toEqual(['persist', 'broadcast'])
  })

  it('keeps the Polygon relay hash when receipt waiting fails after broadcast', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const waitError = new Error('receipt RPC unavailable')
    const provider = {
      broadcastTransaction: vi.fn(async () => ({
        wait: vi.fn(async () => { throw waitError }),
      })),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(
      provider as any,
      '0xserialized',
      '0xrelayhash',
    )).resolves.toEqual({ hash: '0xrelayhash', status: 'pending' })

    expect(loggerError).toHaveBeenCalledWith(
      'Polygon relay submitted; confirmation lookup failed',
      waitError,
      { hash: '0xrelayhash' },
    )
  })

  it('reports a mined Polygon relay revert as rejected', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const revertError = Object.assign(new Error('transaction execution reverted'), {
      code: 'CALL_EXCEPTION',
      receipt: { status: 0 },
    })
    const provider = {
      broadcastTransaction: vi.fn(async () => ({
        wait: vi.fn(async () => { throw revertError }),
      })),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(
      provider as any,
      '0xserialized',
      '0xrelayhash',
    )).resolves.toEqual({ hash: '0xrelayhash', status: 'rejected' })
  })

  it('reports a returned status-zero Polygon receipt as rejected', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const provider = {
      broadcastTransaction: vi.fn(async () => ({
        wait: vi.fn(async () => ({ status: 0 })),
      })),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(
      provider as any,
      '0xserialized',
      '0xrelayhash',
    )).resolves.toEqual({ hash: '0xrelayhash', status: 'rejected' })
  })

  it('requires a successful OpenGSN inner relay result', async () => {
    const { isSuccessfulOpenGsnReceipt } = await import('./polygon-usdt')
    const iface = new Interface(POLYGON_RELAY_HUB_ABI)
    const event = iface.getEvent('TransactionRelayed')!
    const eventArgs = [
      '0x0000000000000000000000000000000000000011',
      '0x0000000000000000000000000000000000000022',
      '0x0000000000000000000000000000000000000033',
      '0x0000000000000000000000000000000000000044',
      '0x0000000000000000000000000000000000000055',
      '0x12345678',
    ]
    const successful = iface.encodeEventLog(event, [...eventArgs, 0, 1])
    const failed = iface.encodeEventLog(event, [...eventArgs, 1, 1])
    const receipt = (encoded: { data: string, topics: string[] }) => ({
      logs: [{
        address: polygonUsdtConfig.openGsnRelayHubContract,
        data: encoded.data,
        topics: encoded.topics,
      }],
    })

    expect(isSuccessfulOpenGsnReceipt(receipt(successful) as any)).toBe(true)
    expect(isSuccessfulOpenGsnReceipt(receipt(failed) as any)).toBe(false)
    expect(isSuccessfulOpenGsnReceipt({ logs: [] } as any)).toBe(false)
  })

  it('matches the requested relay before interpreting its execution status', async () => {
    const { isSuccessfulOpenGsnReceipt } = await import('./polygon-usdt')
    const iface = new Interface(POLYGON_RELAY_HUB_ABI)
    const from = '0x0000000000000000000000000000000000000033'
    const to = '0x0000000000000000000000000000000000000044'
    const eventArgs = [
      '0x0000000000000000000000000000000000000011',
      '0x0000000000000000000000000000000000000022',
      from,
      to,
      '0x0000000000000000000000000000000000000055',
      '0x12345678',
    ]
    const log = (args: unknown[]) => ({
      address: polygonUsdtConfig.openGsnRelayHubContract,
      ...iface.encodeEventLog(iface.getEvent('TransactionRelayed')!, args),
    })
    const unrelated = [...eventArgs]
    unrelated[2] = '0x0000000000000000000000000000000000000066'
    const receipt = { logs: [log([...unrelated, 1, 1]), log([...eventArgs, 0, 1])] }
    const request = { request: { from, to, data: '0x12345678abcd' } }

    expect(isSuccessfulOpenGsnReceipt(receipt as any, request as any)).toBe(true)
    expect(isSuccessfulOpenGsnReceipt({ logs: [receipt.logs[0]] } as any, request as any)).toBe(false)
  })

  it('rejects a mined outer transaction when OpenGSN reports inner failure', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const provider = {
      broadcastTransaction: vi.fn(async () => ({
        wait: vi.fn(async () => ({ status: 1 })),
      })),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(
      provider as any,
      '0xserialized',
      '0xrelayhash',
      { validateReceipt: () => false },
    )).resolves.toEqual({ hash: '0xrelayhash', status: 'rejected' })
  })

  it('adopts a successfully repriced Polygon relay transaction', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const replacementError = Object.assign(new Error('transaction was replaced'), {
      code: 'TRANSACTION_REPLACED',
      cancelled: false,
      reason: 'repriced',
      replacement: { hash: '0xreplacement' },
      receipt: { status: 1 },
    })
    const onReplaced = vi.fn(async () => undefined)
    const provider = {
      broadcastTransaction: vi.fn(async () => ({
        wait: vi.fn(async () => { throw replacementError }),
      })),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(
      provider as any,
      '0xserialized',
      '0xrelayhash',
      { onReplaced },
    )).resolves.toEqual({ hash: '0xreplacement', status: 'mined' })

    expect(onReplaced).toHaveBeenCalledWith('0xrelayhash', '0xreplacement')
  })

  it('does not adopt a replacement that cancelled the Polygon relay intent', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const replacementError = Object.assign(new Error('transaction was replaced'), {
      code: 'TRANSACTION_REPLACED',
      cancelled: true,
      reason: 'cancelled',
      replacement: { hash: '0xcancelled' },
      receipt: { status: 1 },
    })
    const onReplaced = vi.fn()
    const provider = {
      broadcastTransaction: vi.fn(async () => ({
        wait: vi.fn(async () => { throw replacementError }),
      })),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(
      provider as any,
      '0xserialized',
      '0xrelayhash',
      { onReplaced },
    )).resolves.toEqual({ hash: '0xrelayhash', status: 'rejected' })

    expect(onReplaced).not.toHaveBeenCalled()
  })

  it('keeps a mined replacement successful when replacement persistence fails', async () => {
    const { completePolygonRelayTransaction } = await import('./polygon-usdt')
    const replacementError = Object.assign(new Error('transaction was replaced'), {
      code: 'TRANSACTION_REPLACED',
      cancelled: false,
      reason: 'repriced',
      replacement: { hash: '0xreplacement' },
      receipt: { status: 1 },
    })
    const provider = {
      broadcastTransaction: vi.fn().mockResolvedValue({ wait: vi.fn().mockRejectedValue(replacementError) }),
      getTransaction: vi.fn(),
    }

    await expect(completePolygonRelayTransaction(provider as any, '0xserialized', '0xrelayhash', {
      onReplaced: async () => { throw new Error('storage unavailable') },
    })).resolves.toEqual({ hash: '0xreplacement', status: 'mined' })
  })

  it('retries a missing Polygon relay only after the ambiguity grace period', async () => {
    const { shouldRetryMissingPolygonRelay } = await import('./polygon-usdt')

    expect(shouldRetryMissingPolygonRelay(1_000, 1_000 + 299_999)).toBe(false)
    expect(shouldRetryMissingPolygonRelay(1_000, 1_000 + 300_000)).toBe(true)
    expect(shouldRetryMissingPolygonRelay(null, 1_000)).toBe(true)
  })

  it('identifies OpenGSN execution by the receipt destination', async () => {
    const { shouldValidateOpenGsnTransaction } = await import('./polygon-usdt')

    expect(shouldValidateOpenGsnTransaction({
      to: polygonUsdtConfig.openGsnRelayHubContract.toLowerCase(),
    })).toBe(true)
    expect(shouldValidateOpenGsnTransaction({
      to: polygonUsdtConfig.tokenContract,
    })).toBe(false)
    expect(shouldValidateOpenGsnTransaction({ to: null })).toBe(false)
  })

  it('persists swap recovery before requesting a relay and transaction data before broadcast', async () => {
    const { submitPolygonRelayTransaction } = await import('./polygon-usdt')
    const calls: string[] = []
    const provider = {
      broadcastTransaction: vi.fn(async () => {
        calls.push('broadcast')
        return { wait: vi.fn(async () => ({ status: 1 })) }
      }),
      getTransaction: vi.fn(),
    }

    await expect(submitPolygonRelayTransaction(
      provider as any,
      async () => {
        calls.push('request-relay')
        return { relayTx: '0xserialized', relayHash: '0xrelayhash' }
      },
      {
        beforeRelay: async () => { calls.push('persist-recovery') },
        beforeBroadcast: async () => { calls.push('persist-transaction') },
      },
    )).resolves.toEqual({ hash: '0xrelayhash', status: 'mined' })

    expect(calls).toEqual([
      'persist-recovery',
      'request-relay',
      'persist-transaction',
      'broadcast',
    ])
  })

  it('classifies an explicit relay rejection without attempting broadcast', async () => {
    const { PolygonRelayRejectedError, submitPolygonRelayTransaction } = await import('./polygon-usdt')
    const provider = {
      broadcastTransaction: vi.fn(),
      getTransaction: vi.fn(),
    }
    const beforeBroadcast = vi.fn()

    await expect(submitPolygonRelayTransaction(
      provider as any,
      async () => { throw new Error('Got error response from relay: request rejected') },
      { beforeBroadcast },
    )).rejects.toBeInstanceOf(PolygonRelayRejectedError)

    expect(beforeBroadcast).not.toHaveBeenCalled()
    expect(provider.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('does not contact the relay when recovery persistence fails', async () => {
    const { submitPolygonRelayTransaction } = await import('./polygon-usdt')
    const requestRelay = vi.fn()
    const provider = { broadcastTransaction: vi.fn(), getTransaction: vi.fn() }

    await expect(submitPolygonRelayTransaction(provider as any, requestRelay, {
      beforeRelay: async () => { throw new Error('storage unavailable') },
    })).rejects.toThrow('storage unavailable')

    expect(requestRelay).not.toHaveBeenCalled()
    expect(provider.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('keeps a temporarily missing Polygon transaction pending', async () => {
    const { fetchPolygonTransactionState } = await import('./polygon-usdt')
    const provider = {
      getTransaction: vi.fn(async () => null),
      getTransactionReceipt: vi.fn(async () => null),
      getBlockNumber: vi.fn(async () => 100),
      getBlock: vi.fn(),
    }

    await expect(
      fetchPolygonTransactionState(provider as any, '0xrelayhash'),
    ).resolves.toEqual({ status: 'pending' })
  })

  it('marks a Polygon receipt RPC failure as ambiguous', async () => {
    const { fetchPolygonTransactionState } = await import('./polygon-usdt')
    const provider = {
      getTransactionReceipt: vi.fn(async () => { throw new Error('RPC unavailable') }),
      getBlockNumber: vi.fn(),
      getBlock: vi.fn(),
    }

    await expect(
      fetchPolygonTransactionState(provider as any, '0xrelayhash'),
    ).resolves.toEqual({ status: 'pending', lookupFailed: true })
  })

  it('marks a Polygon transaction failed only from a reverted receipt', async () => {
    const { fetchPolygonTransactionState } = await import('./polygon-usdt')
    const provider = {
      getTransaction: vi.fn(async () => null),
      getTransactionReceipt: vi.fn(async () => ({ status: 0, blockNumber: 99 })),
      getBlockNumber: vi.fn(async () => 100),
      getBlock: vi.fn(async () => ({ timestamp: 1234 })),
    }

    await expect(
      fetchPolygonTransactionState(provider as any, '0xrelayhash'),
    ).resolves.toEqual({ status: 'failed', timestamp: 1234 })
  })

  it.each([0, 1])('preserves receipt outcome %s when block enrichment fails', async (status) => {
    const { fetchPolygonTransactionState } = await import('./polygon-usdt')
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({ status, blockNumber: 99 }),
      getBlockNumber: vi.fn().mockRejectedValue(new Error('RPC unavailable')),
      getBlock: vi.fn().mockRejectedValue(new Error('RPC unavailable')),
    }

    await expect(fetchPolygonTransactionState(provider as any, '0xrelayhash')).resolves.toEqual({
      status: status === 0 ? 'failed' : 'mined',
      timestamp: undefined,
    })
  })

  it('marks a mined outer Polygon receipt failed when OpenGSN inner execution failed', async () => {
    const { fetchPolygonTransactionState } = await import('./polygon-usdt')
    const provider = {
      getTransactionReceipt: vi.fn(async () => ({ status: 1, blockNumber: 99 })),
      getBlockNumber: vi.fn(async () => 100),
      getBlock: vi.fn(async () => ({ timestamp: 1234 })),
    }

    await expect(fetchPolygonTransactionState(
      provider as any,
      '0xrelayhash',
      () => false,
    )).resolves.toEqual({ status: 'failed', timestamp: 1234 })
  })

  it('finds a refund that mined under an unknown replacement hash', async () => {
    const { hasPolygonHtlcRefundEvent } = await import('./polygon-usdt')
    const getLogs = vi.fn(async () => [{}])
    const provider = {
      getBlockNumber: vi.fn(async () => 200),
      getLogs,
    }

    await expect(hasPolygonHtlcRefundEvent(
      provider as any,
      `0x${'11'.repeat(32)}`,
      100,
    )).resolves.toBe(true)

    expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({
      address: polygonUsdtConfig.htlcContract,
      fromBlock: 100,
      toBlock: 200,
      topics: expect.arrayContaining([`0x${'11'.repeat(32)}`]),
    }))
  })

  it('finds a late refund event when rescanning from the retained block', async () => {
    const { hasPolygonHtlcRefundEvent } = await import('./polygon-usdt')
    const getLogs = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}])
    const provider = {
      getBlockNumber: vi.fn(async () => 200),
      getLogs,
    }
    const htlcId = `0x${'22'.repeat(32)}`

    await expect(hasPolygonHtlcRefundEvent(provider as any, htlcId, 100)).resolves.toBe(false)
    await expect(hasPolygonHtlcRefundEvent(provider as any, htlcId, 100)).resolves.toBe(true)

    expect(getLogs).toHaveBeenNthCalledWith(2, expect.objectContaining({ fromBlock: 100 }))
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
      fee: 4_000_000n,
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

  it('rejects a refreshed quote whose fee exceeds the approved fee', async () => {
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

    await expect(resolvePolygonTransferQuote({
      request: {
        amount: 116_440_000,
        recipient: '0x0000000000000000000000000000000000000001',
        transfer: Transfer.UserPaymentToMerchant,
      },
      balance: 500_000_000,
      providedQuote: staleQuote,
      buildFreshQuote,
      now: staleQuote.expiresAt + 1,
    })).rejects.toThrow('Polygon fee changed; review the payment again')
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
    txMocks.addReceiptTransactions.mockReset()
    txMocks.addPaymentTransaction.mockReset()
    txMocks.addWithdrawalTransaction.mockReset()
    txMocks.addPolygonHistoryTransaction.mockReset()
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
    expect(txMocks.addReceiptTransactions).toHaveBeenCalledTimes(1)
    expect(onIncomingPersisted).toHaveBeenCalledTimes(1)
    const arg = onIncomingPersisted.mock.calls[0]![0]
    expect(arg).toMatchObject({ hash: '0xfresh', transfer: Transfer.UserReceipt, asset: Asset.USDT, chain: Chain.Polygon, timestamp: 2000 })
  })

  it('does NOT invoke onIncomingPersisted when no options passed (initial-scan branch contract)', async () => {
    const { persistHistoryTransaction } = await import('./polygon-usdt')
    await persistHistoryTransaction(makeIncomingGroup(2000), localAddr)
    expect(txMocks.addReceiptTransactions).toHaveBeenCalledTimes(1)
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
    expect(txMocks.addReceiptTransactions).not.toHaveBeenCalled()
    expect(txMocks.addPolygonHistoryTransaction).toHaveBeenCalledWith(expect.objectContaining({
      hash: '0xout',
      title: 'Payment',
      transfer: Transfer.UserPayment,
    }))
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
