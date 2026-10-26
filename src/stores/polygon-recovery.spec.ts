import type { SwapHtlc } from '@/types/swapHtlcs'
import { Interface } from 'ethers'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Asset, Chain } from '@/lib/assets'
import { POLYGON_BRIDGED_TOKEN_ABI, POLYGON_HTLC_RECIPIENT_ABI, POLYGON_RELAY_HUB_ABI, POLYGON_TRANSFER_RECIPIENT_ABI } from '@/lib/polygon/abis'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { SQLQuery } from '@/lib/sql-queries'
import { markAsUnknownTransactionTitle, Rail, Transfer } from '@/types/transactions'
import { isMatchingRelayCall, usePolygonUsdt } from './polygon-usdt'

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
  signTypedData: vi.fn(),
  confirmSwap: vi.fn(),
  provideFundingProof: vi.fn(),
  trackSwapStep: vi.fn(),
  loggerError: vi.fn(),
  isUsdtMaintenanceActive: false,
  transactions: {
    setPolygonSwapHtlcRefunded: vi.fn(),
    setSwapPreimage: vi.fn(),
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
vi.mock('@/lib/analytics', () => ({ trackSwapCompleted: vi.fn(), trackSwapFailed: vi.fn(), trackSwapStep: mocks.trackSwapStep, trackTopUpReceived: vi.fn() }))
vi.mock('@/stores/feature-flags', async () => {
  const { ref } = await import('vue')
  return { useFeatureFlags: () => ({ polygonRpcUrl: ref('https://polygon.example'), isUsdtMaintenanceActive: ref(mocks.isUsdtMaintenanceActive), usdtMaintenanceNotice: ref('USDT maintenance notice') }) }
})
vi.mock('@/stores/conn', () => ({ useConn: () => ({ query: mocks.query, run: mocks.run }) }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ withdrawalAddressesHistory: [] }) }))
vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    getEthAddress: mocks.getEthAddress,
    getEthWallet: () => ({
      data: {
        address: mocks.walletAddress,
        signTypedData: mocks.signTypedData,
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
let persistedPaymentAttempt: Record<string, any> | null

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
    to: polygonUsdtConfig.openGsnRelayHubContract,
    status: 1,
    blockNumber: headBlock - 2,
    logs: [{ ...event, address: polygonUsdtConfig.openGsnRelayHubContract }],
  }
}

function paymentTransferLog(recipient = mocks.walletAddress, amount = 1_000_000n) {
  const event = new Interface(POLYGON_BRIDGED_TOKEN_ABI).encodeEventLog(
    new Interface(POLYGON_BRIDGED_TOKEN_ABI).getEvent('Transfer')!,
    [mocks.walletAddress, recipient, amount],
  )
  return {
    ...event,
    address: polygonUsdtConfig.tokenContract,
    transactionHash: mocks.relayHash,
    blockNumber: headBlock + 1,
    index: 0,
  }
}

function persistedRelayCallData() {
  const relayRequest = JSON.parse(persistedPaymentAttempt!.relay_request_json)
  return relayInterface.encodeFunctionData('relayCall', [
    1n,
    relayRequest,
    persistedPaymentAttempt!.signature,
    '0x',
    1n,
  ])
}

function recreateStore() {
  setActivePinia(createPinia())
  return usePolygonUsdt()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isUsdtMaintenanceActive = false
  persistedPayment = null
  persistedPaymentAttempt = null
  mocks.getEthAddress.mockReturnValue({ data: undefined })
  mocks.signTypedData.mockResolvedValue(`0x${'11'.repeat(64)}1b`)
  mocks.transactions.addPaymentTransaction.mockImplementation(async (tx) => {
    persistedPayment = { ...tx }
  })
  mocks.transactions.addPaymentToMerchantTransaction.mockImplementation(async (tx) => {
    persistedPayment = { ...tx }
  })
  mocks.transactions.addWithdrawalTransaction.mockImplementation(async (tx) => {
    persistedPayment = { ...tx }
  })
  mocks.transactions.addPolygonSwapTransactionWithRecovery.mockImplementation(async (tx) => {
    persistedPayment = { ...tx }
    persistedHtlc = { ...persistedHtlc!, tx_hash: tx.hash }
  })
  mocks.transactions.setSwapPreimage.mockImplementation(async (hash, secret) => {
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
    if (sql === SQLQuery.GetPolygonPaymentAttempt) {
      return persistedPaymentAttempt && persistedPaymentAttempt.network === values[0] && persistedPaymentAttempt.sender === values[1]
        ? { ...persistedPaymentAttempt }
        : null
    }
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
    else if (sql === SQLQuery.InsertPolygonPaymentAttempt) {
      persistedPaymentAttempt = {
        network: values[0],
        sender: values[1],
        request_json: values[2],
        title: values[3],
        relay_request_json: values[4],
        relay_url: values[5],
        signature: values[6],
        fee: values[7],
        start_block: values[8],
        created_at: values[9],
        relay_hash: values[10],
      }
    }
    else if (sql === SQLQuery.SetPolygonPaymentAttemptRelayHash && persistedPaymentAttempt) {
      persistedPaymentAttempt = { ...persistedPaymentAttempt, relay_hash: values[0] }
    }
    else if (sql === SQLQuery.DeletePolygonPaymentAttempt) {
      persistedPaymentAttempt = null
    }
  })
})

afterEach(() => {
  vi.mocked(Date.now).mockRestore()
})

describe('polygon refund recovery through the store', () => {
  it('reports a rejected refund receipt without treating it as pending', async () => {
    mocks.wait.mockResolvedValueOnce({ ...relayReceipt(), status: 0 })

    const result = await recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc! })

    expect(result).toEqual({ refunded: false, hash: mocks.relayHash })
    expect(persistedHtlc).not.toBeNull()
    expect(mocks.trackSwapStep).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      step: 'refund',
      ok: false,
      asset: Asset.USDT,
      swap_id: 'swap-id',
      duration_ms: 0,
      tx_state: 'rejected',
    }))
  })

  it('reports a refund that keeps failing only once per session', async () => {
    mocks.wait.mockResolvedValueOnce({ ...relayReceipt(), status: 0 }).mockResolvedValueOnce({ ...relayReceipt(), status: 0 })
    const store = recreateStore()

    await store.refundPolygonSwapHtlc({ ...persistedHtlc! })
    await store.refundPolygonSwapHtlc({ ...persistedHtlc! })

    expect(mocks.relayTransaction).toHaveBeenCalledTimes(2)
    expect(mocks.trackSwapStep).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ step: 'refund', ok: false, swap_id: 'swap-id' }))
  })

  it('persists the attempt before contacting the relay and waits after a lost response across store recreation', async () => {
    const lostResponse = new Error('relay response lost')
    mocks.relayTransaction.mockImplementationOnce(async () => {
      expect(persistedHtlc).toMatchObject({ refund_hash: null, refund_timestamp: now, refund_block: headBlock })
      throw lostResponse
    })
    await expect(recreateStore().refundPolygonSwapHtlc({ ...persistedHtlc! })).rejects.toThrow(lostResponse)
    expect(persistedHtlc).toMatchObject({ refund_hash: null, refund_timestamp: now, refund_block: headBlock })
    expect(mocks.provider.broadcastTransaction).not.toHaveBeenCalled()
    expect(mocks.trackSwapStep).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      step: 'refund',
      ok: false,
      asset: Asset.USDT,
      swap_id: 'swap-id',
      error_reason: 'relay response lost',
    }))

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
    expect(mocks.trackSwapStep).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ step: 'refund', ok: true, asset: Asset.USDT, swap_id: 'swap-id' }))
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
  it('rejects a new payment during maintenance without contacting the relay', async () => {
    mocks.isUsdtMaintenanceActive = true
    const store = recreateStore()
    store.balance = 10_000_000

    await expect(store.sendPayment({ recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment'))
      .resolves
      .toMatchObject({ outcome: 'rejected', error: 'USDT maintenance notice' })
    expect(mocks.relayTransaction).not.toHaveBeenCalled()
  })

  it('persists intent before relay contact and blocks sequential retries after a lost response', async () => {
    mocks.relayTransaction.mockImplementationOnce(async () => {
      expect(persistedPaymentAttempt).toMatchObject({
        sender: mocks.walletAddress,
        relay_hash: null,
        start_block: headBlock,
      })
      throw new Error('relay response lost')
    })

    const firstStore = recreateStore()
    firstStore.balance = 10_000_000
    const request = { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment } as const
    await expect(firstStore.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'unknown' })

    const restartedStore = recreateStore()
    restartedStore.balance = 10_000_000
    await expect(restartedStore.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'unknown' })
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.transactions.addPaymentTransaction).not.toHaveBeenCalled()
    expect(persistedPaymentAttempt).not.toBeNull()
  })

  it('does not contact relay when durable intent persistence fails', async () => {
    mocks.run.mockImplementationOnce(async (sql) => {
      if (sql === SQLQuery.InsertPolygonPaymentAttempt)
        throw new Error('database unavailable')
    })
    const store = recreateStore()
    store.balance = 10_000_000

    await expect(store.sendPayment(
      { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment },
      'Payment',
    )).resolves.toMatchObject({ outcome: 'rejected' })
    expect(mocks.relayTransaction).not.toHaveBeenCalled()
    expect(mocks.provider.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('keeps relay intent unknown when transaction persistence fails after relay response', async () => {
    mocks.transactions.addPaymentTransaction.mockRejectedValueOnce(new Error('database unavailable'))
    const store = recreateStore()
    store.balance = 10_000_000

    await expect(store.sendPayment(
      { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment },
      'Payment',
    )).resolves.toMatchObject({ outcome: 'unknown' })
    expect(persistedPaymentAttempt).toMatchObject({ relay_hash: mocks.relayHash })
  })

  it('recovers an exact relayed merchant payment after restart and preserves metadata', async () => {
    const merchantRequest = {
      recipient: mocks.walletAddress,
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToMerchant,
      rail: Rail.GoCrypto,
      railMerchantId: 'merchant-id',
      merchantName: 'Coffee Shop',
      paymentRef: 'payment-ref',
      fiatAmount: 3.5,
      fiatFeeAmount: 0.1,
      fiatCurrency: 'EUR',
      meta: { orderId: 'order-7' },
    } as const
    const merchantTitle = markAsUnknownTransactionTitle('Coffee Shop')
    mocks.relayTransaction.mockRejectedValueOnce(new Error('relay response lost'))
    const firstStore = recreateStore()
    firstStore.balance = 10_000_000
    await expect(firstStore.sendPayment(merchantRequest, merchantTitle)).resolves.toMatchObject({ outcome: 'unknown' })

    mocks.provider.getBlockNumber.mockResolvedValue(headBlock + 20)
    mocks.provider.getLogs.mockResolvedValueOnce([paymentTransferLog()])
    mocks.provider.getTransaction.mockResolvedValue({
      to: polygonUsdtConfig.openGsnRelayHubContract,
      data: persistedRelayCallData(),
    })
    expect(isMatchingRelayCall(
      { to: polygonUsdtConfig.openGsnRelayHubContract, data: persistedRelayCallData() },
      JSON.parse(persistedPaymentAttempt!.relay_request_json),
      persistedPaymentAttempt!.signature,
    )).toBe(true)
    const mismatchedRequest = JSON.parse(persistedPaymentAttempt!.relay_request_json)
    mismatchedRequest.request.nonce = String(Number(mismatchedRequest.request.nonce) + 1)
    expect(isMatchingRelayCall(
      { to: polygonUsdtConfig.openGsnRelayHubContract, data: persistedRelayCallData() },
      mismatchedRequest,
      persistedPaymentAttempt!.signature,
    )).toBe(false)
    mocks.provider.getTransactionReceipt.mockResolvedValue(relayReceipt(
      polygonUsdtConfig.transferContract,
      new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector,
    ))

    const restartedStore = recreateStore()
    restartedStore.balance = 10_000_000
    await expect(restartedStore.sendPayment(merchantRequest, merchantTitle)).resolves.toMatchObject({ outcome: 'previous-resolved' })
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(1)
    expect(persistedPayment).toMatchObject({
      hash: mocks.relayHash,
      merchantName: 'Coffee Shop',
      rail: Rail.GoCrypto,
      railMerchantId: 'merchant-id',
      paymentRef: 'payment-ref',
      fiatAmount: 3.5,
      fiatFeeAmount: 0.1,
      fiatCurrency: 'EUR',
      meta: { orderId: 'order-7' },
    })
    expect(persistedPaymentAttempt).toBeNull()
  })

  it('keeps an expired attempt guarded when a matching Transfer transaction cannot be loaded', async () => {
    mocks.relayTransaction.mockRejectedValueOnce(new Error('relay response lost'))
    const firstStore = recreateStore()
    firstStore.balance = 10_000_000
    const request = { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment } as const
    await firstStore.sendPayment(request, 'Payment')

    const validUntil = Number(JSON.parse(persistedPaymentAttempt!.relay_request_json).request.validUntil)
    mocks.provider.getBlockNumber.mockResolvedValue(validUntil + 20)
    mocks.provider.getLogs.mockResolvedValueOnce([paymentTransferLog()])
    mocks.provider.getTransaction.mockResolvedValueOnce(null)

    const restartedStore = recreateStore()
    restartedStore.balance = 10_000_000
    await expect(restartedStore.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'unknown' })
    expect(persistedPaymentAttempt).not.toBeNull()
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(1)
  })

  it('keeps an expired attempt guarded when the log provider has not indexed the safe head', async () => {
    mocks.relayTransaction.mockRejectedValueOnce(new Error('relay response lost'))
    const firstStore = recreateStore()
    firstStore.balance = 10_000_000
    const request = { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment } as const
    await firstStore.sendPayment(request, 'Payment')

    const validUntil = Number(JSON.parse(persistedPaymentAttempt!.relay_request_json).request.validUntil)
    mocks.provider.getBlockNumber.mockResolvedValue(validUntil + 20)
    const missingHeadError = Object.assign(new Error('block not found for eth_getLogs'), {
      error: { data: { details: { latestBlock: validUntil - 1 } } },
    })
    mocks.provider.getLogs.mockRejectedValueOnce(missingHeadError).mockResolvedValueOnce([])

    const restartedStore = recreateStore()
    restartedStore.balance = 10_000_000
    await expect(restartedStore.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'unknown' })
    expect(persistedPaymentAttempt).not.toBeNull()
    expect(mocks.provider.getLogs).toHaveBeenCalledTimes(1)
  })

  it('clears a fully scanned expired attempt before a later deliberate retry', async () => {
    mocks.relayTransaction.mockRejectedValueOnce(new Error('relay response lost'))
    const request = { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment } as const
    const firstStore = recreateStore()
    firstStore.balance = 10_000_000
    await firstStore.sendPayment(request, 'Payment')

    const validUntil = Number(JSON.parse(persistedPaymentAttempt!.relay_request_json).request.validUntil)
    mocks.provider.getBlockNumber.mockResolvedValue(validUntil + 20)
    const restartedStore = recreateStore()
    restartedStore.balance = 10_000_000
    await expect(restartedStore.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'rejected' })
    expect(persistedPaymentAttempt).toBeNull()

    mocks.provider.getBlockNumber.mockResolvedValue(validUntil + 21)
    mocks.wait.mockResolvedValueOnce(relayReceipt(
      polygonUsdtConfig.transferContract,
      new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector,
    ))
    await expect(restartedStore.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'submitted' })
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(2)
  })

  it('blocks an overlapping send before it can build a second signed request', async () => {
    let releaseSigning!: () => void
    const signingBlocked = new Promise<void>((resolve) => {
      releaseSigning = resolve
    })
    let signingStarted!: () => void
    const started = new Promise<void>((resolve) => {
      signingStarted = resolve
    })
    mocks.signTypedData.mockImplementationOnce(async () => {
      signingStarted()
      await signingBlocked
      return `0x${'11'.repeat(64)}1b`
    })
    mocks.wait.mockResolvedValueOnce(relayReceipt(
      polygonUsdtConfig.transferContract,
      new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector,
    ))
    const store = recreateStore()
    store.balance = 10_000_000
    const first = store.sendPayment({ recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment')
    await started

    const second = await store.sendPayment({ recipient: mocks.walletAddress, amount: 2_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment')
    expect(second).toMatchObject({ outcome: 'rejected' })
    releaseSigning()
    await expect(first).resolves.toMatchObject({ outcome: 'submitted' })
    expect(mocks.relayTransaction).toHaveBeenCalledOnce()
    expect(mocks.signTypedData).toHaveBeenCalledTimes(2)
  })

  it('clears an explicit relay rejection so a deliberate retry can send', async () => {
    mocks.relayTransaction.mockRejectedValueOnce(new Error('Got error response from relay: rejected'))
    const store = recreateStore()
    store.balance = 10_000_000
    const request = { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment } as const

    await expect(store.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'rejected' })
    expect(persistedPaymentAttempt).toBeNull()

    mocks.wait.mockResolvedValueOnce(relayReceipt(
      polygonUsdtConfig.transferContract,
      new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector,
    ))
    await expect(store.sendPayment(request, 'Payment')).resolves.toMatchObject({ outcome: 'submitted' })
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(2)
  })

  it('reports unknown when post-submission confirmation lookup fails', async () => {
    const store = recreateStore()
    store.balance = 10_000_000
    mocks.wait.mockRejectedValueOnce(new Error('confirmation RPC unavailable'))

    const result = await store.sendPayment({ recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment }, 'Payment')

    expect(result.outcome).toBe('unknown')
    expect(result.error).toContain('Do not retry')
    expect(mocks.transactions.addPaymentTransaction).toHaveBeenCalledOnce()
    expect(mocks.transactions.addPaymentTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.provider.broadcastTransaction.mock.invocationCallOrder[0]!)
    expect(mocks.transactions.replaceTransaction).not.toHaveBeenCalled()
    expect(mocks.transactions.updateTransactionStatus).not.toHaveBeenCalled()
  })

  it.each(['restart', 'recovery persistence failure', 'live replacement persistence failure'])(
    'removes the original pending payment after %s',
    async (scenario) => {
      const rows = new Map<string, Record<string, unknown>>()
      mocks.transactions.addPaymentTransaction.mockImplementation(async (tx) => {
        rows.set(tx.hash, { ...tx })
        persistedPayment = { ...tx }
      })
      mocks.transactions.replacePolygonTransactionHash.mockImplementation(async (oldHash, newHash) => {
        const old = rows.get(oldHash)
        rows.delete(oldHash)
        if (old)
          rows.set(newHash, { ...old, hash: newHash })
      })
      const replacementHash = `0x${'ab'.repeat(32)}`
      const receipt = {
        ...relayReceipt(polygonUsdtConfig.transferContract, new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector),
        hash: replacementHash,
      }
      if (scenario === 'live replacement persistence failure') {
        mocks.wait.mockRejectedValueOnce(Object.assign(new Error('transaction repriced'), {
          code: 'TRANSACTION_REPLACED',
          cancelled: false,
          reason: 'repriced',
          replacement: { hash: replacementHash },
          receipt,
        }))
        mocks.transactions.replacePolygonTransactionHash
          .mockRejectedValueOnce(new Error('database unavailable'))
          .mockRejectedValueOnce(new Error('database unavailable'))
      }
      else {
        mocks.wait.mockRejectedValueOnce(new Error('confirmation RPC unavailable'))
      }
      const request = { recipient: mocks.walletAddress, amount: 1_000_000, fee: 1000, transfer: Transfer.UserPayment } as const
      const firstStore = recreateStore()
      firstStore.balance = 10_000_000
      expect((await firstStore.sendPayment(request, 'Payment')).outcome).toBe('unknown')
      expect(rows.get(mocks.relayHash)?.status).toBe('pending')
      expect(persistedPaymentAttempt?.relay_hash).toBe(mocks.relayHash)

      const data = persistedRelayCallData()
      mocks.provider.getBlockNumber.mockResolvedValue(headBlock + 20)
      mocks.provider.getLogs.mockResolvedValue([{ ...paymentTransferLog(), transactionHash: replacementHash }])
      mocks.provider.getTransaction.mockImplementation(async hash => hash === replacementHash ? { to: polygonUsdtConfig.openGsnRelayHubContract, data } : null)
      mocks.provider.getTransactionReceipt.mockImplementation(async hash => hash === replacementHash ? receipt : null)
      if (scenario === 'recovery persistence failure') {
        mocks.transactions.replacePolygonTransactionHash.mockRejectedValueOnce(new Error('database unavailable'))
        expect((await recreateStore().sendPayment(request, 'Payment')).outcome).toBe('unknown')
        expect(persistedPaymentAttempt?.relay_hash).toBe(mocks.relayHash)
        expect([...rows.keys()]).toEqual([mocks.relayHash])
      }

      expect((await recreateStore().sendPayment(request, 'Payment')).outcome).toBe('previous-resolved')
      expect([...rows.keys()]).toEqual([replacementHash])
      expect(rows.get(replacementHash)?.status).toBe('confirmed')
      expect(persistedPaymentAttempt).toBeNull()
      expect(mocks.relayTransaction).toHaveBeenCalledOnce()
    },
  )

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

  it('blocks swap funding during maintenance', async () => {
    mocks.isUsdtMaintenanceActive = true
    const store = recreateStore()

    const result = await store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')

    expect(result).toMatchObject({ rejected: true, error: 'USDT maintenance notice' })
    expect(mocks.confirmSwap).not.toHaveBeenCalled()
    expect(mocks.relayTransaction).not.toHaveBeenCalled()
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
    expect(mocks.transactions.setSwapPreimage).toHaveBeenCalledWith(replacementHash, 'secret')
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

  it('reports uncertain swap funding before waiting for Lightning settlement', async () => {
    persistedHtlc = null
    const store = recreateStore()
    mocks.wait.mockRejectedValueOnce(new Error('confirmation RPC unavailable'))
    let releaseNotification!: () => void
    const onFundingUncertain = vi.fn(() => new Promise<void>((resolve) => {
      releaseNotification = resolve
    }))

    const payment = store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment', { onFundingUncertain })

    await vi.waitFor(() => expect(onFundingUncertain).toHaveBeenCalledWith(mocks.relayHash))
    expect(persistedPayment).toMatchObject({ hash: mocks.relayHash, status: 'pending' })
    expect(persistedHtlc).toMatchObject({ address: mocks.htlcId, tx_hash: mocks.relayHash })
    expect(mocks.provideFundingProof).not.toHaveBeenCalled()

    releaseNotification()
    const result = await payment
    expect(result.data?.tx).toMatchObject({ hash: mocks.relayHash, status: 'confirmed', meta: { secret: 'secret' } })
    expect(mocks.provideFundingProof).toHaveBeenCalledWith('swap-id', 'contract-id', mocks.relayHash)
  })

  it('defers the expiry refund while swap funding holds the HTLC forwarder nonce', async () => {
    const expiredHtlc = { ...persistedHtlc!, address: `0x${'9a'.repeat(32)}`, htlc_id: `0x${'9a'.repeat(32)}` }
    persistedHtlc = null
    const store = recreateStore()
    mocks.wait.mockResolvedValueOnce(relayReceipt(polygonUsdtConfig.htlcContract, refundInterface.getFunction('openWithApproval')!.selector))
    let releaseRelay!: () => void
    mocks.relayTransaction.mockImplementationOnce(() => new Promise((resolve) => {
      releaseRelay = () => resolve('0xserialized')
    }))

    const payment = store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')
    await vi.waitFor(() => expect(mocks.relayTransaction).toHaveBeenCalledOnce())

    await expect(store.refundPolygonSwapHtlc(expiredHtlc)).resolves.toEqual({ refunded: false })
    expect(mocks.relayTransaction).toHaveBeenCalledOnce()
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.SetSwapHtlcRefundAttempt, expect.anything())

    releaseRelay()
    const result = await payment
    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: mocks.relayHash, status: 'confirmed' })
  })

  it('waits for an in-flight refund before swap funding reads the HTLC forwarder nonce', async () => {
    const expiredHtlc = { ...persistedHtlc! }
    const store = recreateStore()
    mocks.wait
      .mockResolvedValueOnce(relayReceipt())
      .mockResolvedValueOnce(relayReceipt(polygonUsdtConfig.htlcContract, refundInterface.getFunction('openWithApproval')!.selector))
    let releaseRefundRelay!: () => void
    mocks.relayTransaction.mockImplementationOnce(() => new Promise((resolve) => {
      releaseRefundRelay = () => resolve('0xserialized')
    }))

    const refund = store.refundPolygonSwapHtlc(expiredHtlc)
    await vi.waitFor(() => expect(mocks.relayTransaction).toHaveBeenCalledOnce())
    expect(mocks.signTypedData).toHaveBeenCalledOnce()

    const payment = store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')
    await vi.waitFor(() => expect(mocks.confirmSwap).toHaveBeenCalledOnce())
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mocks.signTypedData).toHaveBeenCalledOnce()

    releaseRefundRelay()
    await expect(refund).resolves.toEqual({ refunded: true, hash: mocks.relayHash })
    const result = await payment
    expect(result.error).toBeUndefined()
    expect(mocks.relayTransaction).toHaveBeenCalledTimes(2)
    expect(mocks.signTypedData).toHaveBeenCalledTimes(3)
    // Swap signing starts only after the refund relay was released and broadcast.
    expect(mocks.signTypedData.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.provider.broadcastTransaction.mock.invocationCallOrder[0]!)
  })

  it('keeps a pending swap funding nonce reserved from the expiry refund', async () => {
    const expiredHtlc = { ...persistedHtlc!, address: `0x${'9a'.repeat(32)}`, htlc_id: `0x${'9a'.repeat(32)}` }
    persistedHtlc = null
    const store = recreateStore()
    mocks.wait.mockRejectedValueOnce(new Error('confirmation RPC unavailable'))
    let releasePreimage!: () => void
    mocks.provideFundingProof.mockImplementationOnce(() => new Promise((resolve) => {
      releasePreimage = () => resolve({ preimage: 'secret' })
    }))

    const payment = store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')
    await vi.waitFor(() => expect(mocks.provideFundingProof).toHaveBeenCalledOnce())

    // The funding is unmined, so the forwarder nonce read is unchanged.
    await expect(store.refundPolygonSwapHtlc(expiredHtlc)).rejects.toThrow('A transaction is already in progress')
    expect(mocks.relayTransaction).toHaveBeenCalledOnce()
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.SetSwapHtlcRefundAttempt, expect.anything())

    releasePreimage()
    const result = await payment
    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: mocks.relayHash, status: 'confirmed' })
  })

  it('bounds the swap funding confirmation wait so later HTLC relays are not blocked', async () => {
    const expiredHtlc = { ...persistedHtlc!, address: `0x${'9a'.repeat(32)}`, htlc_id: `0x${'9a'.repeat(32)}` }
    persistedHtlc = null
    const store = recreateStore()
    // Like ethers, the wait only settles on its own timeout: without one it never resolves.
    let expireWait: (() => void) | undefined
    mocks.wait.mockImplementationOnce((_confirms?: number, timeout?: number) => new Promise((_resolve, reject) => {
      if (timeout)
        expireWait = () => reject(Object.assign(new Error('wait for transaction timeout'), { code: 'TIMEOUT' }))
    }))

    const payment = store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')
    await vi.waitFor(() => expect(mocks.wait).toHaveBeenCalledOnce())
    await expect(store.refundPolygonSwapHtlc(expiredHtlc)).resolves.toEqual({ refunded: false })

    expect(expireWait).toBeDefined()
    expireWait!()
    const result = await payment
    expect(result.error).toBeUndefined()

    // The lock is free, but the unconfirmed funding nonce stays reserved.
    await expect(store.refundPolygonSwapHtlc(expiredHtlc)).rejects.toThrow('A transaction is already in progress')
    expect(mocks.relayTransaction).toHaveBeenCalledOnce()
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.SetSwapHtlcRefundAttempt, expect.anything())
  })

  it('keeps a refund nonce reserved when the relay response is lost', async () => {
    const expiredHtlc = { ...persistedHtlc! }
    persistedHtlc = null
    const store = recreateStore()
    mocks.relayTransaction.mockRejectedValueOnce(new Error('timeout of 30000ms exceeded'))

    await expect(store.refundPolygonSwapHtlc(expiredHtlc)).rejects.toThrow('timeout')
    expect(mocks.run).toHaveBeenCalledWith(SQLQuery.SetSwapHtlcRefundAttempt, expect.anything())

    // The refund may have been broadcast, so the forwarder nonce read is unchanged.
    const result = await store.sendSwapPayment({
      recipient: 'lnbc-invoice',
      amount: 1_000_000,
      fee: 1000,
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
      rail: Rail.BitcoinLightning,
    }, 'Payment')
    expect(result.error).toBe('A transaction is already in progress')
    expect(mocks.relayTransaction).toHaveBeenCalledOnce()
  })
})

describe('polygon swap step analytics', () => {
  const request = {
    recipient: 'lnbc-invoice',
    amount: 1_000_000,
    fee: 1000,
    transfer: Transfer.UserPaymentToAtomicSwap,
    paymentRef: 'swap-id',
    rail: Rail.BitcoinLightning,
  } as const

  beforeEach(() => {
    persistedHtlc = null
    const receipt = relayReceipt(polygonUsdtConfig.htlcContract, refundInterface.getFunction('openWithApproval')!.selector)
    mocks.wait.mockResolvedValue(receipt)
    mocks.provider.getTransactionReceipt.mockResolvedValue(receipt)
  })

  it('reports each completed USDT stage with its swap id and duration', async () => {
    mocks.relayTransaction.mockImplementationOnce(async () => {
      vi.mocked(Date.now).mockReturnValue(now + 25)
      return '0xserialized'
    })

    const result = await recreateStore().sendSwapPayment(request, 'Payment')

    expect(result.error).toBeUndefined()
    for (const step of ['confirm', 'verify', 'relay', 'funding_proof', 'settlement']) {
      expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({
        step,
        ok: true,
        asset: Asset.USDT,
        swap_id: 'swap-id',
        duration_ms: expect.any(Number),
      }))
    }
    expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'relay', duration_ms: 25 }))
    expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'settlement', preimage_source: 'funding_proof' }))
    expect(mocks.trackSwapStep).not.toHaveBeenCalledWith(expect.objectContaining({ step: 'cosign' }))
  })

  it('attributes a failed confirmation to confirm without reporting later stages', async () => {
    mocks.confirmSwap.mockRejectedValueOnce(new Error('Fastspot unavailable'))

    const result = await recreateStore().sendSwapPayment(request, 'Payment')

    expect(result).toMatchObject({ rejected: true, error: 'Fastspot unavailable' })
    expect(mocks.trackSwapStep).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      step: 'confirm',
      ok: false,
      asset: Asset.USDT,
      error_reason: 'Fastspot unavailable',
      duration_ms: 0,
    }))
  })

  it('reports an invoice hash mismatch before relay funding', async () => {
    mocks.confirmSwap.mockResolvedValueOnce({ hash: 'different-hash' })

    const result = await recreateStore().sendSwapPayment(request, 'Payment')

    expect(result).toMatchObject({ rejected: true, error: 'Invalid swap hash' })
    expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'verify', ok: false, error_reason: 'hash_mismatch' }))
    expect(mocks.relayTransaction).not.toHaveBeenCalled()
  })

  it('reports a lost relay response without claiming funding was rejected', async () => {
    mocks.relayTransaction.mockRejectedValueOnce(new Error('relay response lost'))

    const result = await recreateStore().sendSwapPayment(request, 'Payment')

    expect(result).toMatchObject({ rejected: false, error: 'relay response lost' })
    expect(persistedHtlc).not.toBeNull()
    expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'relay', ok: false, error_reason: 'relay response lost' }))
  })

  it('records a funding proof failure while polling still settles the payment', async () => {
    mocks.provideFundingProof.mockRejectedValueOnce(new Error('funding proof unavailable'))
    mocks.getSwap.mockResolvedValueOnce({ status: 'SUCCESS', preimage: 'secret' })

    const result = await recreateStore().sendSwapPayment(request, 'Payment')

    expect(result.error).toBeUndefined()
    expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'funding_proof', ok: false, error_reason: 'funding proof unavailable' }))
    expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'settlement', ok: true, polls: 1, last_status: 'SUCCESS', preimage_source: 'poll' }))
  })

  it('reports slow settlement once and a failed wait at the deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      mocks.provideFundingProof.mockResolvedValueOnce({ status: 'PENDING' })
      mocks.getSwap.mockResolvedValue({ status: 'PENDING' })
      const payment = recreateStore().sendSwapPayment(request, 'Payment')
      await vi.waitFor(() => expect(mocks.getSwap).toHaveBeenCalled())

      await vi.advanceTimersByTimeAsync(60_000)
      expect(mocks.trackSwapStep.mock.calls.filter(([event]) => event.step === 'settlement_slow')).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(540_000)

      expect(await payment).toMatchObject({ rejected: false, error: 'Swap timed out waiting for Lightning payment confirmation' })
      expect(mocks.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'settlement', ok: false, last_status: 'PENDING' }))
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mocks.trackSwapStep.mock.calls.filter(([event]) => event.step === 'settlement_slow')).toHaveLength(1)
      expect(persistedHtlc).not.toBeNull()
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('polygon transaction reconciliation through the store', () => {
  it('preserves confirmed status through a receipt outage and subsequent direct transfer refresh', async () => {
    persistedPayment = { hash: mocks.relayHash, status: 'confirmed', transfer: Transfer.UserPayment, chain: Chain.Polygon }
    mocks.transactions.updateTransactionStatus.mockImplementation(async ({ status }) => {
      persistedPayment = { ...persistedPayment!, status }
    })
    mocks.provider.getTransactionReceipt.mockRejectedValueOnce(new Error('temporary RPC outage'))
    const store = recreateStore()

    await store.updateSingleTransaction(mocks.relayHash)

    expect(mocks.transactions.updateTransactionStatus).not.toHaveBeenCalled()
    expect(persistedPayment?.status).toBe('confirmed')

    mocks.provider.getTransactionReceipt.mockResolvedValueOnce({
      status: 1,
      to: polygonUsdtConfig.tokenContract,
      blockNumber: headBlock - 20,
      logs: [],
    })
    await store.updateSingleTransaction(mocks.relayHash)
    expect(persistedPayment?.status).toBe('confirmed')
  })

  it.each(['pending', 'mined', 'failed'])('reconciles a direct token transfer stored as %s without requiring OpenGSN', async (status) => {
    persistedPayment = { hash: mocks.relayHash, status, transfer: Transfer.UserPayment, chain: Chain.Polygon }
    const tokenInterface = new Interface(POLYGON_BRIDGED_TOKEN_ABI)
    const event = tokenInterface.encodeEventLog(tokenInterface.getEvent('Transfer')!, [
      mocks.walletAddress,
      polygonUsdtConfig.transferContract,
      1_000_000n,
    ])
    mocks.provider.getTransactionReceipt.mockResolvedValueOnce({
      status: 1,
      to: polygonUsdtConfig.tokenContract,
      blockNumber: headBlock - 20,
      logs: [{ ...event, address: polygonUsdtConfig.tokenContract }],
    })

    await recreateStore().updateSingleTransaction(mocks.relayHash)

    expect(mocks.transactions.updateTransactionStatus).toHaveBeenCalledWith({
      hash: mocks.relayHash,
      status: 'confirmed',
      timestamp: now / 1000,
    })
  })

  it.each(['pending', 'confirmed'])('rejects unsuccessful OpenGSN execution even when stored as %s', async (status) => {
    persistedPayment = { hash: mocks.relayHash, status, transfer: Transfer.UserPayment, chain: Chain.Polygon }
    const receipt = relayReceipt()
    const event = relayInterface.encodeEventLog(relayInterface.getEvent('TransactionRelayed')!, [
      mocks.walletAddress,
      mocks.walletAddress,
      mocks.walletAddress,
      polygonUsdtConfig.transferContract,
      polygonUsdtConfig.transferContract,
      new Interface(POLYGON_TRANSFER_RECIPIENT_ABI).getFunction('transferWithApproval')!.selector,
      1,
      1n,
    ])
    mocks.provider.getTransactionReceipt.mockResolvedValueOnce({
      ...receipt,
      logs: [{ ...event, address: polygonUsdtConfig.openGsnRelayHubContract }],
    })

    await recreateStore().updateSingleTransaction(mocks.relayHash)

    expect(mocks.transactions.updateTransactionStatus).toHaveBeenCalledWith({
      hash: mocks.relayHash,
      status: 'failed',
      timestamp: now / 1000,
    })
  })

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

    expect(mocks.transactions.setSwapPreimage).toHaveBeenCalledWith(mocks.relayHash, 'late-secret')
    await expect(mocks.transactions.setSwapPreimage.mock.results[0]!.value).resolves.toBeNull()
    expect(mocks.transactions.replaceTransaction).not.toHaveBeenCalled()
    expect(persistedPayment).toMatchObject({ hash: replacementHash })
    expect(persistedHtlc).toMatchObject({ tx_hash: replacementHash })
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlcByTxHash, expect.anything())
    expect(mocks.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
  })
})
