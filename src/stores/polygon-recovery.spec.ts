import type { SwapHtlc } from '@/types/swapHtlcs'
import { Interface } from 'ethers'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chain } from '@/lib/assets'
import { POLYGON_HTLC_RECIPIENT_ABI, POLYGON_RELAY_HUB_ABI, POLYGON_TRANSFER_RECIPIENT_ABI } from '@/lib/polygon/abis'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { SQLQuery } from '@/lib/sql-queries'
import { Rail, Transfer } from '@/types/transactions'
import { usePolygonUsdt } from './polygon-usdt'

const mocks = vi.hoisted(() => ({
  provider: {
    getBlockNumber: vi.fn(),
    getTransactionReceipt: vi.fn(),
    getBlock: vi.fn(),
    getLogs: vi.fn(),
    getTransactionCount: vi.fn(),
    broadcastTransaction: vi.fn(),
    getTransaction: vi.fn(),
    send: vi.fn(),
  },
  relayTransaction: vi.fn(),
  wait: vi.fn(),
  query: vi.fn(),
  run: vi.fn(),
  getSwap: vi.fn(),
  getEthAddress: vi.fn(),
  confirmSwap: vi.fn(),
  provideFundingProof: vi.fn(),
  loggerError: vi.fn(),
  transactions: {
    setPolygonSwapHtlcRefunded: vi.fn(),
    setPolygonSwapPreimage: vi.fn(),
    addPaymentTransaction: vi.fn(),
    addPaymentToMerchantTransaction: vi.fn(),
    addWithdrawalTransaction: vi.fn(),
    addPolygonSwapTransactionWithRecovery: vi.fn(),
    replacePolygonTransactionHash: vi.fn(),
    replaceTransaction: vi.fn(),
    updateTransactionStatus: vi.fn(),
  },
  walletAddress: '0x00000000000000000000000000000000000000AA',
  relayHash: `0x${'12'.repeat(32)}`,
  htlcId: `0x${'34'.repeat(32)}`,
  swapHash: '56'.repeat(32),
}))

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>()
  return {
    ...actual,
    JsonRpcProvider: vi.fn(() => mocks.provider),
    Contract: vi.fn((_address, abi) => {
      return {
        interface: new actual.Interface(abi),
        getNonce: vi.fn().mockResolvedValue(0n),
        getRequiredRelayGas: vi.fn().mockResolvedValue(100n),
        getGasAndDataLimits: vi.fn().mockResolvedValue({ acceptanceBudget: 100n }),
        calldataGasCost: vi.fn().mockResolvedValue(10n),
      }
    }),
    Transaction: { from: vi.fn(() => ({ hash: mocks.relayHash })) },
  }
})
vi.mock('@opengsn/common', () => ({
  HttpClient: vi.fn(() => ({ relayTransaction: mocks.relayTransaction })),
  HttpWrapper: vi.fn(),
}))
vi.mock('@opengsn/common/dist/EIP712/TypedRequestData', () => ({
  TypedRequestData: vi.fn(() => ({ types: {}, domain: {}, message: {} })),
}))
vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: mocks.loggerError }),
}))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (text: string) => text } }))
vi.mock('@/lib', () => ({ isTestnet: true }))
vi.mock('@/lib/mock-mode', () => ({ isMockEnabled: false }))
vi.mock('@/lib/analytics', () => ({ trackSwapCompleted: vi.fn(), trackSwapFailed: vi.fn(), trackTopUpReceived: vi.fn() }))
vi.mock('@/stores/feature-flags', async () => {
  const { ref } = await import('vue')
  return { useFeatureFlags: () => ({ polygonRpcUrl: ref('https://polygon.example') }) }
})
vi.mock('@/stores/conn', () => ({ useConn: () => ({ query: mocks.query, run: mocks.run }) }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ withdrawalAddressesHistory: [] }) }))
vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    getEthAddress: mocks.getEthAddress,
    getEthWallet: () => ({
      data: {
        address: mocks.walletAddress,
        signTypedData: vi.fn().mockResolvedValue(`0x${'11'.repeat(64)}1b`),
      },
    }),
  }),
}))
vi.mock('@/stores/transactions', () => ({ useTransactions: () => mocks.transactions }))
vi.mock('@/lib/polygon/opengsn', () => ({
  getBestRelay: vi.fn().mockResolvedValue({
    url: 'https://relay.example',
    baseRelayFee: 1n,
    pctRelayFee: 1n,
    minGasPrice: 1n,
    relayWorkerAddress: mocks.walletAddress,
    relayManagerAddress: mocks.walletAddress,
  }),
  getRelayAddr: vi.fn().mockResolvedValue({
    ready: true,
    networkId: '137',
    minGasPrice: '1',
    relayWorkerAddress: mocks.walletAddress,
    relayManagerAddress: mocks.walletAddress,
  }),
}))
vi.mock('@/lib/polygon/uniswap', () => ({
  quoteWrappedNativePrice: vi.fn().mockResolvedValue({ amountOut: 1n, amountIn: 1n }),
  getRegisteredPoolAddress: vi.fn(),
}))
vi.mock('@/lib/polygon/token-meta-tx', () => ({ resolveTokenMetaTxDomain: vi.fn().mockResolvedValue({}) }))
vi.mock('@/composables/useFastspotV2', () => ({
  useFastspotApiV2: async () => ({ getSwap: mocks.getSwap, provideFundingProof: mocks.provideFundingProof }),
}))
vi.mock('@/composables/useFastspotv1', () => ({
  useFastspotApiV1: async () => ({
    confirmSwap: mocks.confirmSwap,
    SwapAsset: { BTC_LN: 'BTC_LN', USDT_MATIC: 'USDT_MATIC' },
  }),
}))
vi.mock('@/composables/useBitcoinLightning', () => ({
  parseBitcoinLightningInvoice: vi.fn().mockResolvedValue({ payment_hash: mocks.swapHash }),
}))

const now = 1_800_000_000_000
const headBlock = 90_000_000
const refundInterface = new Interface(POLYGON_HTLC_RECIPIENT_ABI)
const relayInterface = new Interface(POLYGON_RELAY_HUB_ABI)
let persistedHtlc: SwapHtlc | null
let persistedPayment: Record<string, unknown> | null

function relayReceipt(to: string = polygonUsdtConfig.htlcContract, selector = refundInterface.getFunction('refund')!.selector) {
  const event = relayInterface.encodeEventLog(relayInterface.getEvent('TransactionRelayed')!, [
    mocks.walletAddress,
    mocks.walletAddress,
    mocks.walletAddress,
    to,
    to,
    selector,
    0,
    1n,
  ])
  return {
    hash: mocks.relayHash,
    status: 1,
    blockNumber: headBlock - 2,
    logs: [{ ...event, address: polygonUsdtConfig.openGsnRelayHubContract }],
  }
}

function recreateStore() {
  setActivePinia(createPinia())
  return usePolygonUsdt()
}

beforeEach(() => {
  vi.clearAllMocks()
  persistedPayment = null
  mocks.getEthAddress.mockReturnValue({ data: undefined })
  mocks.transactions.addPaymentTransaction.mockImplementation(async (tx) => {
    persistedPayment = { ...tx }
  })
  mocks.transactions.addPolygonSwapTransactionWithRecovery.mockImplementation(async (tx) => {
    persistedPayment = { ...tx }
    persistedHtlc = { ...persistedHtlc!, tx_hash: tx.hash }
  })
  mocks.transactions.setPolygonSwapPreimage.mockImplementation(async (hash, secret) => {
    if (!persistedPayment || persistedPayment.hash !== hash)
      return null
    const meta = typeof persistedPayment.meta === 'string' ? JSON.parse(persistedPayment.meta) : persistedPayment.meta
    persistedPayment = { ...persistedPayment, status: 'confirmed', meta: { ...meta, secret } }
    return { ...persistedPayment }
  })
  mocks.transactions.replacePolygonTransactionHash.mockReset().mockImplementation(async (oldHash, newHash) => {
    if (persistedPayment && persistedPayment.hash === oldHash)
      persistedPayment = { ...persistedPayment, hash: newHash }
    if (persistedHtlc && persistedHtlc.tx_hash === oldHash)
      persistedHtlc = { ...persistedHtlc, tx_hash: newHash }
  })
  mocks.transactions.updateTransactionStatus.mockResolvedValue(undefined)
  vi.spyOn(Date, 'now').mockReturnValue(now)
  persistedHtlc = {
    address: mocks.htlcId,
    htlc_id: mocks.htlcId,
    tx_hash: `0x${'78'.repeat(32)}`,
    amount: 1_000_000,
    timeout_block: now - 10_000,
    swap_id: 'swap-id',
    swap_status: 'expired',
    refund_hash: null,
    refund_timestamp: null,
    refund_block: null,
  }
  mocks.provider.getBlockNumber.mockResolvedValue(headBlock)
  mocks.provider.getTransactionCount.mockResolvedValue(0)
  mocks.provider.getTransactionReceipt.mockResolvedValue(null)
  mocks.provider.getBlock.mockResolvedValue({ timestamp: now / 1000 })
  mocks.provider.getLogs.mockResolvedValue([])
  mocks.provider.send.mockResolvedValue('0x1')
  mocks.provider.broadcastTransaction.mockResolvedValue({ wait: mocks.wait })
  mocks.wait.mockResolvedValue(relayReceipt())
  mocks.relayTransaction.mockResolvedValue('0xserialized')
  mocks.getSwap.mockResolvedValue({ status: 'expired' })
  mocks.provideFundingProof.mockResolvedValue({ preimage: 'secret' })
  mocks.confirmSwap.mockResolvedValue({
    id: 'swap-id',
    status: 'confirmed',
    hash: mocks.swapHash,
    contracts: {
      USDT_MATIC: {
        id: 'contract-id',
        amount: 1_000_000,
        redeemAddress: mocks.walletAddress,
        timeout: now / 1000 + 600,
        htlc: { address: mocks.htlcId },
      },
    },
  })
  mocks.query.mockImplementation(async (sql, values) => {
    if (sql === SQLQuery.GetSwapHtlcByAddress)
      return persistedHtlc
    if (sql === SQLQuery.GetTransactionByHash)
      return persistedPayment?.hash === values[0] ? { ...persistedPayment } : null
    return null
  })
  mocks.run.mockImplementation(async (sql, values) => {
    if (sql === SQLQuery.SetSwapHtlcRefundAttempt) {
      persistedHtlc = { ...persistedHtlc!, refund_timestamp: values[0], refund_block: persistedHtlc?.refund_block ?? values[1] }
    }
    else if (sql === SQLQuery.SetSwapHtlcRefundHash) {
      persistedHtlc = { ...persistedHtlc!, refund_hash: values[0], refund_timestamp: values[1], refund_block: persistedHtlc?.refund_block ?? values[2] }
    }
    else if (sql === SQLQuery.ClearSwapHtlcRefundHash) {
      persistedHtlc = { ...persistedHtlc!, refund_hash: null, refund_timestamp: null }
    }
    else if (sql === SQLQuery.DeleteSwapHtlc) {
      persistedHtlc = null
    }
    else if (sql === SQLQuery.InsertSwapHtlcProvisional) {
      persistedHtlc = {
        address: values[0],
        amount: values[1],
        timeout_block: values[2],
        swap_id: values[3],
        swap_status: values[4],
        htlc_id: values[5],
        tx_hash: null,
      }
    }
  })
})

afterEach(() => {
  vi.mocked(Date.now).mockRestore()
})

describe('polygon refund recovery through the store', () => {
  it('persists the attempt before contacting the relay and waits after a lost response across store recreation', async () => {
    const lostResponse = new Error('relay response lost')
    mocks.relayTransaction.mockImplementationOnce(async () => {
      expect(persistedHtlc).toMatchObject({ refund_hash: null, refund_timestamp: now, refund_block: headBlock })
      throw lostResponse
    })
    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc! })).rejects.toThrow(lostResponse)
    expect(persistedHtlc).toMatchObject({ refund_hash: null, refund_timestamp: now, refund_block: headBlock })
    expect(mocks.provider.broadcastTransaction).not.toHaveBeenCalled()

    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc! })).resolves.toMatchObject({ refunded: false })
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.transactions.setPolygonSwapHtlcRefunded).not.toHaveBeenCalled()
  })

  it('finds the matching Refund event after a lost relay response and finalizes without resubmission', async () => {
    mocks.relayTransaction.mockRejectedValueOnce(new Error('relay response lost'))
    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc! })).rejects.toThrow('relay response lost')
    const originalHash = persistedHtlc!.tx_hash
    mocks.provider.getLogs.mockImplementationOnce(async (filter) => {
      expect(filter).toEqual({
        address: polygonUsdtConfig.htlcContract,
        fromBlock: headBlock,
        toBlock: headBlock,
        topics: [refundInterface.getEvent('Refund')!.topicHash, mocks.htlcId],
      })
      return [{ transactionHash: mocks.relayHash }]
    })

    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc! })).resolves.toMatchObject({ refunded: true })
    expect(mocks.transactions.setPolygonSwapHtlcRefunded).toHaveBeenCalledWith(originalHash)
    expect(persistedHtlc).toBeNull()
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(1)
  })

  it('retries an ambiguous attempt only after grace and retains its earliest scan block', async () => {
    persistedHtlc = { ...persistedHtlc!, refund_timestamp: now - 5 * 60_000, refund_block: headBlock - 100 }
    mocks.relayTransaction.mockImplementationOnce(async () => {
      expect(persistedHtlc).toMatchObject({ refund_timestamp: now, refund_block: headBlock - 100 })
      throw new Error('another lost response')
    })
    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc })).rejects.toThrow('another lost response')
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(1)
    expect(persistedHtlc?.refund_block).toBe(headBlock - 100)
  })

  it('finalizes a stored successful refund receipt without sending another refund', async () => {
    persistedHtlc = { ...persistedHtlc!, refund_hash: mocks.relayHash, refund_timestamp: now - 1000, refund_block: headBlock - 10 }
    const originalHash = persistedHtlc.tx_hash
    mocks.provider.getTransactionReceipt.mockResolvedValueOnce(relayReceipt())

    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc })).resolves.toEqual({ refunded: true, hash: mocks.relayHash })
    expect(mocks.transactions.setPolygonSwapHtlcRefunded).toHaveBeenCalledWith(originalHash)
    expect(persistedHtlc).toBeNull()
    expect(mocks.relayTransaction).not.toHaveBeenCalled()
  })

  it('keeps an old pending refund after receipt RPC failure without resubmitting', async () => {
    persistedHtlc = { ...persistedHtlc!, refund_hash: mocks.relayHash, refund_timestamp: now - 10 * 60_000, refund_block: headBlock - 100 }
    const originalRow = { ...persistedHtlc }
    mocks.provider.getTransactionReceipt.mockRejectedValueOnce(new Error('RPC unavailable'))

    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc })).resolves.toEqual({ refunded: false, hash: mocks.relayHash })
    expect(persistedHtlc).toEqual(originalRow)
    expect(mocks.relayTransaction).not.toHaveBeenCalled()
    expect(mocks.transactions.setPolygonSwapHtlcRefunded).not.toHaveBeenCalled()
  })

  it('returns a late preimage before inspecting or resubmitting a pending refund', async () => {
    persistedHtlc = { ...persistedHtlc!, refund_hash: mocks.relayHash, refund_timestamp: now, refund_block: headBlock }
    mocks.getSwap.mockResolvedValueOnce({ preimage: 'late-secret' })

    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc })).resolves.toEqual({ refunded: false, preimage: 'late-secret' })
    expect(mocks.provider.getTransactionReceipt).not.toHaveBeenCalled()
    expect(mocks.relayTransaction).not.toHaveBeenCalled()
    expect(persistedHtlc).not.toBeNull()
  })
})

describe('polygon payment submission through the store', () => {
  it('keeps a submitted payment successful when post-submission receipt lookup fails', async () => {
    const store = recreateStore()
    store.balance = 10_000_000
    mocks.wait.mockRejectedValueOnce(new Error('confirmation RPC unavailable'))
    mocks.provider.getTransactionReceipt.mockRejectedValueOnce(new Error('receipt RPC unavailable'))

    const result = await store.sendPayment({ recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment')

    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: mocks.relayHash, status: 'pending' })
    expect(mocks.transactions.addPaymentTransaction).toHaveBeenCalledOnce()
    expect(mocks.transactions.addPaymentTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.provider.broadcastTransaction.mock.invocationCallOrder[0]!)
    expect(mocks.transactions.replaceTransaction).not.toHaveBeenCalled()
    expect(mocks.transactions.updateTransactionStatus).not.toHaveBeenCalled()
  })

  it('preserves confirmed replacement state and metadata when receipt lookup fails', async () => {
    const replacementHash = `0x${'ab'.repeat(32)}`
    const store = recreateStore()
    store.balance = 10_000_000
    const receipt = relayReceipt(polygonUsdtConfig.transferContract, new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector)
    mocks.wait.mockRejectedValueOnce(Object.assign(new Error('transaction repriced'), {
      code: 'TRANSACTION_REPLACED',
      cancelled: false,
      reason: 'repriced',
      replacement: { hash: replacementHash },
      receipt,
    }))
    mocks.transactions.replacePolygonTransactionHash.mockImplementationOnce(async () => {
      persistedPayment = {
        ...persistedPayment!,
        hash: replacementHash,
        status: 'confirmed',
        timestamp: 123,
        meta: JSON.stringify({ note: 'restored metadata' }),
      }
    })
    mocks.provider.getTransactionReceipt.mockRejectedValueOnce(new Error('receipt RPC unavailable'))

    const result = await store.sendPayment({ recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment')

    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: replacementHash, status: 'confirmed', timestamp: 123, meta: { note: 'restored metadata' } })
    expect(mocks.transactions.replacePolygonTransactionHash).toHaveBeenCalledWith(mocks.relayHash, replacementHash)
    expect(mocks.transactions.updateTransactionStatus).not.toHaveBeenCalled()
    expect(mocks.transactions.replaceTransaction).not.toHaveBeenCalled()
    expect(persistedPayment).toMatchObject({ hash: replacementHash, status: 'confirmed' })
  })

  it('retries failed replacement persistence and returns the mined replacement hash', async () => {
    const replacementHash = `0x${'ab'.repeat(32)}`
    const store = recreateStore()
    store.balance = 10_000_000
    const receipt = relayReceipt(polygonUsdtConfig.transferContract, new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector)
    mocks.wait.mockRejectedValueOnce(Object.assign(new Error('transaction repriced'), {
      code: 'TRANSACTION_REPLACED',
      cancelled: false,
      reason: 'repriced',
      replacement: { hash: replacementHash },
      receipt: { ...receipt, hash: replacementHash },
    }))
    mocks.transactions.replacePolygonTransactionHash.mockRejectedValueOnce(new Error('database unavailable'))
    mocks.provider.getTransactionReceipt.mockResolvedValueOnce({ ...receipt, hash: replacementHash })

    const result = await store.sendPayment({ recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment')

    expect(result.error).toBeUndefined()
    expect(result.data?.serialized).toBe(replacementHash)
    expect(result.data?.tx.hash).toBe(replacementHash)
    expect(mocks.transactions.replacePolygonTransactionHash).toHaveBeenCalledWith(mocks.relayHash, replacementHash)
    expect(mocks.transactions.replacePolygonTransactionHash).toHaveBeenCalledTimes(2)
    expect(persistedPayment?.hash).toBe(replacementHash)
    expect(mocks.relayTransaction).toHaveBeenCalledOnce()
  })

  it('does not report a confirmed payment as failed when balance refresh throws', async () => {
    const store = recreateStore()
    store.balance = 10_000_000
    const receipt = relayReceipt(polygonUsdtConfig.transferContract, new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector)
    mocks.wait.mockResolvedValueOnce(receipt)
    mocks.provider.getTransactionReceipt.mockResolvedValueOnce({ ...receipt, blockNumber: headBlock - 20 })
    mocks.getEthAddress.mockImplementationOnce(() => {
      throw new Error('wallet state temporarily unavailable')
    })

    const result = await store.sendPayment({ recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment')

    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: mocks.relayHash, status: 'confirmed' })
    expect(mocks.transactions.updateTransactionStatus).toHaveBeenCalledWith({ hash: mocks.relayHash, status: 'confirmed', timestamp: now / 1000 })
  })

  it('retains swap recovery when both replacement persistence attempts fail', async () => {
    const replacementHash = `0x${'ab'.repeat(32)}`
    persistedHtlc = null
    const store = recreateStore()
    const receipt = relayReceipt(polygonUsdtConfig.htlcContract, refundInterface.getFunction('openWithApproval')!.selector)
    mocks.wait.mockRejectedValueOnce(Object.assign(new Error('transaction repriced'), {
      code: 'TRANSACTION_REPLACED',
      cancelled: false,
      reason: 'repriced',
      replacement: { hash: replacementHash },
      receipt: { ...receipt, hash: replacementHash },
    }))
    mocks.transactions.replacePolygonTransactionHash.mockRejectedValue(new Error('database unavailable'))
    mocks.provider.getTransactionReceipt.mockResolvedValueOnce({ ...receipt, hash: replacementHash })

    const result = await store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')

    expect(result.error).toBeUndefined()
    expect(result.data?.serialized).toBe(replacementHash)
    expect(result.data?.tx).toMatchObject({ hash: replacementHash, status: 'confirmed', meta: { secret: 'secret' } })
    expect(mocks.transactions.replacePolygonTransactionHash).toHaveBeenCalledTimes(2)
    expect(mocks.transactions.replacePolygonTransactionHash).toHaveBeenNthCalledWith(1, mocks.relayHash, replacementHash, mocks.htlcId)
    expect(mocks.transactions.replacePolygonTransactionHash).toHaveBeenNthCalledWith(2, mocks.relayHash, replacementHash, mocks.htlcId)
    expect(mocks.transactions.setPolygonSwapPreimage).toHaveBeenCalledWith(replacementHash, 'secret')
    expect(persistedPayment).toMatchObject({ hash: mocks.relayHash, status: 'pending' })
    expect(persistedHtlc).toMatchObject({ address: mocks.htlcId, tx_hash: mocks.relayHash })
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapQuote, expect.anything())
    expect(mocks.provideFundingProof).toHaveBeenCalledWith('swap-id', 'contract-id', replacementHash)
    expect(mocks.relayTransaction).toHaveBeenCalledOnce()
  })

  it('continues swap funding proof and preimage handling when receipt lookup fails', async () => {
    persistedHtlc = null
    const store = recreateStore()
    mocks.wait.mockRejectedValueOnce(new Error('confirmation RPC unavailable'))
    mocks.provider.getTransactionReceipt.mockRejectedValueOnce(new Error('receipt RPC unavailable'))
    mocks.relayTransaction.mockImplementationOnce(async () => {
      expect(persistedHtlc).toMatchObject({ address: mocks.htlcId, tx_hash: null })
      return '0xserialized'
    })

    const result = await store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')

    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: mocks.relayHash, status: 'confirmed', meta: { secret: 'secret' } })
    expect(mocks.transactions.addPolygonSwapTransactionWithRecovery).toHaveBeenCalledWith(expect.objectContaining({ hash: mocks.relayHash, status: 'pending' }), mocks.htlcId)
    expect(mocks.transactions.addPolygonSwapTransactionWithRecovery.mock.invocationCallOrder[0]).toBeLessThan(mocks.provider.broadcastTransaction.mock.invocationCallOrder[0]!)
    expect(mocks.provideFundingProof).toHaveBeenCalledWith('swap-id', 'contract-id', mocks.relayHash)
    expect(persistedHtlc).toBeNull()
  })
})

describe('polygon swap reconciliation through the store', () => {
  it('does not recreate a replaced hash or clear recovery when a stale preimage lookup finishes', async () => {
    const replacementHash = `0x${'ab'.repeat(32)}`
    persistedPayment = {
      hash: mocks.relayHash,
      status: 'pending',
      chain: Chain.Polygon,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      meta: JSON.stringify({ note: 'keep this metadata' }),
    }
    persistedHtlc = { ...persistedHtlc!, tx_hash: mocks.relayHash }
    mocks.provider.getTransactionReceipt.mockResolvedValueOnce(relayReceipt())
    let resolvePreimage!: (value: { preimage: string }) => void
    const preimageResponse = new Promise<{ preimage: string }>((resolve) => {
      resolvePreimage = resolve
    })
    let markLookupStarted!: () => void
    const lookupStarted = new Promise<void>((resolve) => {
      markLookupStarted = resolve
    })
    mocks.getSwap.mockImplementationOnce(() => {
      markLookupStarted()
      return preimageResponse
    })

    const reconcile = recreateStore().updateSingleTransaction(mocks.relayHash)
    await lookupStarted
    persistedPayment = { ...persistedPayment, hash: replacementHash }
    persistedHtlc = { ...persistedHtlc, tx_hash: replacementHash }
    resolvePreimage({ preimage: 'late-secret' })
    await reconcile

    expect(mocks.transactions.setPolygonSwapPreimage).toHaveBeenCalledWith(mocks.relayHash, 'late-secret')
    await expect(mocks.transactions.setPolygonSwapPreimage.mock.results[0]!.value).resolves.toBeNull()
    expect(mocks.transactions.replaceTransaction).not.toHaveBeenCalled()
    expect(persistedPayment).toMatchObject({ hash: replacementHash })
    expect(persistedHtlc).toMatchObject({ tx_hash: replacementHash })
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlcByTxHash, expect.anything())
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
  })
})
