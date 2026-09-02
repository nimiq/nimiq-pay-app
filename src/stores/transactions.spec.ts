import { mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, ref, watch } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { DEFAULT_LIMIT, SQLQuery } from '@/lib/sql-queries'
import { Transfer } from '@/types/transactions'

function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
    equals: (other?: { toUserFriendlyAddress: () => string }) => other?.toUserFriendlyAddress() === value,
  }
}

const state = vi.hoisted(() => ({
  activeAsset: 'USDT',
  isSendingTx: false,
  localAddress: createAddress('NQ00 TEST LOCAL ADDRESS'),
  localBalance: 0,
  remoteAddress: createAddress('NQ11 TEST ACTIVE REMOTE ADDRESS'),
  remoteBalance: 0,
  ourRemoteSignerAddresses: new Set<string>(),
  networkId: 5,
  client: {
    waitForConsensusEstablished: vi.fn(async () => undefined),
    sendTransaction: vi.fn(async () => undefined),
  },
  query: vi.fn(async () => []),
  run: vi.fn(async () => undefined),
  runBatch: vi.fn(async (_statements: Array<{ statement: string, values: unknown[] }>) => undefined),
  updateActiveRemoteBalance: vi.fn(async () => undefined),
  updateRemoteSigner: vi.fn(async () => undefined),
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/composables/useFastspotV2', () => ({
  useFastspotApiV2: () => ({}),
}))

vi.mock('@/composables/useTransactionSearch', () => ({
  useTransactionSearch: (transactions: { value: unknown[] }) => ({
    searchQuery: ref(''),
    filteredTransactions: computed(() => transactions.value as never[]),
    allTransactions: transactions,
  }),
}))

vi.mock('@/lib', () => ({
  isDev: false,
  nakaBufferAddresses: [],
}))

vi.mock('@/lib/tx', () => ({
  getSignedTx: vi.fn(),
  toAccountType: vi.fn(),
}))

vi.mock('@/stores/app', () => {
  const useApp = defineStore('app', () => ({
    activeAsset: computed(() => state.activeAsset),
    showHiddenTransactions: ref(false),
  }))

  return { useApp }
})

vi.mock('@/stores/conn', () => {
  const useConn = defineStore('conn', () => ({
    query: state.query,
    run: state.run,
    runBatch: state.runBatch,
  }))

  return { useConn }
})

vi.mock('@/stores/locks', () => {
  const useLocks = defineStore('locks', () => ({
    isSendingTx: computed({
      get: () => state.isSendingTx,
      set: value => state.isSendingTx = value,
    }),
  }))

  return { useLocks }
})

vi.mock('@/stores/local-wallet', () => {
  const useLocalWallet = defineStore('local-wallet', () => ({
    localAddress: computed(() => state.localAddress),
    localBalance: computed(() => state.localBalance),
  }))

  return { useLocalWallet }
})

vi.mock('@/stores/nimiq-network', () => {
  const useNimiqNetwork = defineStore('nimiq-network', () => ({
    client: computed(() => state.client),
    networkId: computed(() => state.networkId),
  }))

  return { useNimiqNetwork }
})

vi.mock('@/stores/remote-signer', () => {
  const useRemoteSigner = defineStore('remote-signer', () => ({
    updateActiveRemoteBalance: state.updateActiveRemoteBalance,
    updateRemoteSigner: state.updateRemoteSigner,
    remoteAddress: computed(() => state.remoteAddress),
    remoteBalance: computed(() => state.remoteBalance),
    isOurRemoteSigner: async (address: string) => state.ourRemoteSignerAddresses.has(address),
    getOurRemoteSignerAddresses: async () => state.ourRemoteSignerAddresses,
  }))

  return { useRemoteSigner }
})

vi.mock('@/stores/sync', () => {
  const useSync = defineStore('sync', () => ({
    pendingPaymentTransactions: computed(() => []),
  }))

  return { useSync }
})

describe('useTransactions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.activeAsset = Asset.USDT
    state.isSendingTx = false
    state.localAddress = createAddress('NQ00 TEST LOCAL ADDRESS')
    state.localBalance = 0
    state.remoteAddress = createAddress('NQ11 TEST ACTIVE REMOTE ADDRESS')
    state.remoteBalance = 0
    state.ourRemoteSignerAddresses = new Set<string>()
    state.networkId = 5
    state.client = {
      waitForConsensusEstablished: vi.fn(async () => undefined),
      sendTransaction: vi.fn(async () => undefined),
    }
    state.query.mockReset()
    state.query.mockResolvedValue([])
    state.run.mockReset()
    state.run.mockResolvedValue(undefined)
    state.runBatch.mockReset()
    state.runBatch.mockResolvedValue(undefined)
    state.updateActiveRemoteBalance.mockReset()
    state.updateActiveRemoteBalance.mockResolvedValue(undefined)
    state.updateRemoteSigner.mockReset()
    state.updateRemoteSigner.mockResolvedValue(undefined)
    state.logger.log.mockReset()
    state.logger.warn.mockReset()
    state.logger.error.mockReset()
    vi.stubGlobal('Nimiq', {
      Address: {
        fromUserFriendlyAddress: (value: string) => createAddress(value),
      },
      AccountType: {
        HTLC: 2,
      },
      BufferUtils: {
        toHex: vi.fn(() => 'serialized-content'),
      },
    })
  })

  it('reactively updates active asset transactions when a transaction status changes', async () => {
    const { useTransactions } = await import('./transactions')
    let store!: ReturnType<typeof useTransactions>

    mount(defineComponent({
      setup() {
        store = useTransactions()
        return () => null
      },
    }))

    const seenStatuses: string[] = []

    watch(
      () => store.activeAssetTransactions.map(tx => tx.status).join(','),
      status => seenStatuses.push(status),
      { immediate: true },
    )

    await store.addWithdrawalTransaction({
      transfer: Transfer.UserPayment,
      amount: 123,
      sender: '0xsender',
      recipient: '0xrecipient',
      hash: '0xhash',
      status: 'mined',
      timestamp: 1,
      title: 'Payment',
      fee: 1,
      proofSize: 0,
      message: '',
      asset: Asset.USDT,
      chain: Chain.Polygon,
    } as any)
    await nextTick()

    seenStatuses.length = 0

    await store.updateTransactionStatus({ hash: '0xhash', status: 'confirmed', timestamp: 2 })
    await nextTick()

    expect(store.activeAssetTransactions[0].status).toBe('confirmed')
    expect(seenStatuses).toEqual(['confirmed'])
  })

  it('loads active-asset transaction pages with an asset-specific query', async () => {
    state.activeAsset = Asset.USDT
    state.query.mockResolvedValue([])

    const { useTransactions } = await import('./transactions')
    let store!: ReturnType<typeof useTransactions>

    mount(defineComponent({
      setup() {
        store = useTransactions()
        return () => null
      },
    }))

    await nextTick()
    state.query.mockClear()

    await store.loadMoreTxs()

    expect(state.query).toHaveBeenCalledWith(SQLQuery.SelectPaginationTransactionsByAsset, [Asset.USDT, DEFAULT_LIMIT, 0])
  })

  it('shows only transactions for the current active asset', async () => {
    state.activeAsset = Asset.USDT
    state.query.mockResolvedValue([])

    const { useTransactions } = await import('./transactions')
    let store!: ReturnType<typeof useTransactions>

    mount(defineComponent({
      setup() {
        store = useTransactions()
        return () => null
      },
    }))

    await nextTick()

    await store.addWithdrawalTransaction({
      transfer: Transfer.UserPayment,
      amount: 123,
      sender: '0xsender',
      recipient: '0xrecipient',
      hash: '0xhash-switch',
      status: 'confirmed',
      timestamp: 1,
      title: 'Payment',
      fee: 1,
      proofSize: 0,
      message: '',
      asset: Asset.USDT,
      chain: Chain.Polygon,
    } as any)
    await nextTick()

    await store.addWithdrawalTransaction({
      transfer: Transfer.UserPayment,
      amount: 456,
      sender: 'NQsender',
      recipient: 'NQrecipient',
      hash: '0xhash-nim',
      status: 'confirmed',
      timestamp: 2,
      title: 'Payment',
      fee: 1,
      proofSize: 0,
      message: '',
      asset: Asset.NIM,
      chain: Chain.Nimiq,
    } as any)
    await nextTick()

    expect(store.transactions).toHaveLength(2)
    expect(store.transactionsToShow).toHaveLength(1)
    expect(store.transactionsToShow[0].asset).toBe(Asset.USDT)
  })

  it('replaces an existing transaction instead of duplicating it when metadata changes', async () => {
    state.activeAsset = Asset.USDT
    state.query.mockResolvedValue([])

    const { useTransactions } = await import('./transactions')
    let store!: ReturnType<typeof useTransactions>

    mount(defineComponent({
      setup() {
        store = useTransactions()
        return () => null
      },
    }))

    await nextTick()

    await store.addPaymentToMerchantTransaction({
      transfer: Transfer.UserPaymentToAtomicSwap,
      amount: 123,
      sender: '0xsender',
      recipient: 'lnbc1swap',
      hash: '0xswap',
      status: 'mined',
      timestamp: 1,
      title: 'Payment',
      fee: 1,
      proofSize: 0,
      message: '',
      merchantName: 'Merchant',
      merchantCategory: 'shop',
      paymentMethod: 'USDT',
      paymentRef: 'swap-ref',
      fiatAmount: 0,
      fiatFeeAmount: 0,
      fiatCurrency: 'EUR',
      isCashbackClaimed: true,
      rail: 'bitcoin-lightning',
      asset: Asset.USDT,
      chain: Chain.Polygon,
    } as any)
    await nextTick()

    await store.replaceTransaction({
      ...store.transactions[0],
      status: 'confirmed',
      meta: { secret: 'preimage' },
    } as any)
    await nextTick()

    expect(store.transactions).toHaveLength(1)
    expect(store.transactions[0].status).toBe('confirmed')
    expect(store.transactions[0].meta).toEqual({ secret: 'preimage' })
    expect(state.run).toHaveBeenCalled()
  })

  it('hides a tx from transactionsToShow when the reveal toggle is off (APP-132)', async () => {
    state.activeAsset = Asset.USDT
    state.query.mockResolvedValue([])

    const { useTransactions } = await import('./transactions')
    let store!: ReturnType<typeof useTransactions>

    mount(defineComponent({
      setup() {
        store = useTransactions()
        return () => null
      },
    }))
    await nextTick()

    await store.addWithdrawalTransaction({
      transfer: Transfer.UserPayment,
      amount: 100,
      sender: '0xsender',
      recipient: '0xrecipient',
      hash: '0xhide',
      status: 'confirmed',
      timestamp: 1,
      title: 'Payment',
      fee: 1,
      proofSize: 0,
      message: '',
      asset: Asset.USDT,
      chain: Chain.Polygon,
    } as any)
    await nextTick()

    expect(store.transactionsToShow).toHaveLength(1)

    state.run.mockClear()
    await store.setTxHidden('0xhide', true)
    await nextTick()

    expect(store.transactionsToShow).toHaveLength(0)
    expect(store.transactions).toHaveLength(1)

    const upsertCall = (state.run.mock.calls as unknown as Array<[unknown, unknown[]]>).find(
      ([query]) => query === SQLQuery.UpsertTx,
    )
    expect(upsertCall).toBeDefined()
    const metaJson = upsertCall![1].find(
      (arg): arg is string => typeof arg === 'string' && arg.includes('"hidden"'),
    )
    expect(metaJson).toContain('"hidden":true')
  })

  it('reveals hidden txs when showHiddenTransactions is enabled (APP-132)', async () => {
    state.activeAsset = Asset.USDT
    state.query.mockResolvedValue([])

    const { useTransactions } = await import('./transactions')
    const { useApp } = await import('@/stores/app')
    let store!: ReturnType<typeof useTransactions>

    mount(defineComponent({
      setup() {
        store = useTransactions()
        return () => null
      },
    }))
    await nextTick()

    await store.addWithdrawalTransaction({
      transfer: Transfer.UserPayment,
      amount: 100,
      sender: '0xsender',
      recipient: '0xrecipient',
      hash: '0xhide-reveal',
      status: 'confirmed',
      timestamp: 1,
      title: 'Payment',
      fee: 1,
      proofSize: 0,
      message: '',
      asset: Asset.USDT,
      chain: Chain.Polygon,
    } as any)
    await nextTick()

    await store.setTxHidden('0xhide-reveal', true)
    await nextTick()
    expect(store.transactionsToShow).toHaveLength(0)

    useApp().showHiddenTransactions = true
    await nextTick()
    expect(store.transactionsToShow).toHaveLength(1)

    await store.setTxHidden('0xhide-reveal', false)
    await nextTick()
    useApp().showHiddenTransactions = false
    await nextTick()
    expect(store.transactionsToShow).toHaveLength(1)
  })

  describe('refreshFromDb / addReceiptTransaction filter our own HTLC drains', () => {
    const ourHtlc = 'NQ22 TEST OUR OLD HTLC'
    const foreignHtlc = 'NQ33 OTHER NIMIQ PAY USER HTLC'

    function makeUserReceiptRow(overrides: Record<string, any> = {}) {
      return {
        hash: 'hash-default',
        timestamp: 1,
        sender: ourHtlc,
        senderType: 2, // Nimiq.AccountType.HTLC
        recipient: state.localAddress.toUserFriendlyAddress(),
        recipientType: 0,
        amount: 100,
        fee: 0,
        status: 'confirmed',
        title: 'Top-Up',
        transfer: Transfer.UserReceipt,
        message: '',
        asset: Asset.NIM,
        chain: Chain.Nimiq,
        ...overrides,
      }
    }

    beforeEach(() => {
      state.activeAsset = Asset.NIM
      state.ourRemoteSignerAddresses = new Set([ourHtlc])
    })

    it('refreshFromDb strips UserReceipt rows whose sender is one of our remote signers', async () => {
      const ourDrain = makeUserReceiptRow({ hash: 'hash-our-drain', sender: ourHtlc, timestamp: 9999 })
      const foreignTopUp = makeUserReceiptRow({ hash: 'hash-foreign', sender: foreignHtlc, timestamp: 100 })
      state.query.mockResolvedValue([ourDrain, foreignTopUp] as any)

      const { useTransactions } = await import('./transactions')
      let store!: ReturnType<typeof useTransactions>
      mount(defineComponent({
        setup() {
          store = useTransactions()
          return () => null
        },
      }))
      await nextTick()

      await store.refreshFromDb()
      await nextTick()

      const hashes = store.transactions.map(tx => tx.hash)
      expect(hashes).toContain('hash-foreign')
      expect(hashes).not.toContain('hash-our-drain')
    })

    it('refreshFromDb keeps non-UserReceipt rows even when sender matches our remote signer', async () => {
      const ourPayment = {
        ...makeUserReceiptRow({ hash: 'hash-payment', sender: ourHtlc }),
        transfer: Transfer.UserPayment,
        title: 'Withdrawal',
      }
      state.query.mockResolvedValue([ourPayment] as any)

      const { useTransactions } = await import('./transactions')
      let store!: ReturnType<typeof useTransactions>
      mount(defineComponent({
        setup() {
          store = useTransactions()
          return () => null
        },
      }))
      await nextTick()

      await store.refreshFromDb()
      await nextTick()

      expect(store.transactions.map(tx => tx.hash)).toContain('hash-payment')
    })

    it('refreshFromDb preserves timestamp DESC ordering after filtering', async () => {
      const older = makeUserReceiptRow({ hash: 'older', sender: foreignHtlc, timestamp: 100 })
      const newer = makeUserReceiptRow({ hash: 'newer', sender: foreignHtlc, timestamp: 9999 })
      state.query.mockResolvedValue([older, newer] as any)

      const { useTransactions } = await import('./transactions')
      let store!: ReturnType<typeof useTransactions>
      mount(defineComponent({
        setup() {
          store = useTransactions()
          return () => null
        },
      }))
      await nextTick()

      await store.refreshFromDb()
      await nextTick()

      expect(store.transactions[0].hash).toBe('newer')
      expect(store.transactions[1].hash).toBe('older')
    })

    it('addReceiptTransaction drops drains from one of our remote signers (no upsert, no in-memory entry)', async () => {
      const { useTransactions } = await import('./transactions')
      let store!: ReturnType<typeof useTransactions>
      mount(defineComponent({
        setup() {
          store = useTransactions()
          return () => null
        },
      }))
      await nextTick()

      state.run.mockClear()
      await store.addReceiptTransaction({
        transfer: Transfer.UserReceipt,
        amount: 5505,
        sender: ourHtlc,
        senderType: 2,
        recipient: state.localAddress.toUserFriendlyAddress(),
        recipientType: 0,
        hash: 'hash-our-drain',
        status: 'confirmed',
        timestamp: Date.now(),
        title: 'Top-Up',
        message: '',
        fee: 0,
        proofSize: 98,
        asset: Asset.NIM,
        chain: Chain.Nimiq,
      } as any)
      await nextTick()

      const upsertCall = (state.run.mock.calls as unknown as Array<[unknown, unknown[]]>).find(
        ([query]) => query === SQLQuery.UpsertTx,
      )
      expect(upsertCall).toBeUndefined()
      expect(store.transactions.map(tx => tx.hash)).not.toContain('hash-our-drain')
    })

    it('addReceiptTransaction stores receipts from foreign HTLC senders (other Nimiq Pay users paying us)', async () => {
      const { useTransactions } = await import('./transactions')
      let store!: ReturnType<typeof useTransactions>
      mount(defineComponent({
        setup() {
          store = useTransactions()
          return () => null
        },
      }))
      await nextTick()

      state.run.mockClear()
      await store.addReceiptTransaction({
        transfer: Transfer.UserReceipt,
        amount: 1234,
        sender: foreignHtlc,
        senderType: 2,
        recipient: state.localAddress.toUserFriendlyAddress(),
        recipientType: 0,
        hash: 'hash-foreign-pay',
        status: 'confirmed',
        timestamp: 1,
        title: 'Top-Up',
        message: '',
        fee: 0,
        proofSize: 98,
        asset: Asset.NIM,
        chain: Chain.Nimiq,
      } as any)
      await nextTick()

      const upsertCall = (state.run.mock.calls as unknown as Array<[unknown, unknown[]]>).find(
        ([query]) => query === SQLQuery.UpsertTx,
      )
      expect(upsertCall).toBeDefined()
      expect(store.transactions.map(tx => tx.hash)).toContain('hash-foreign-pay')
    })
  })

  it('logs wallet and signer context when signing a transaction fails', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    state.localBalance = 100_000
    state.remoteBalance = 50_000
    vi.mocked(getSignedTx).mockResolvedValue({
      data: undefined,
      error: 'cosigner rejected',
    } as any)

    const store = useTransactions()
    const result = await store.sendTx({ transfer: Transfer.RemoteToLocal } as any)

    expect(result.error).toBe('cosigner rejected')
    expect(state.logger.error).toHaveBeenCalledWith('Error while signing transaction', 'cosigner rejected', expect.objectContaining({
      transfer: Transfer.RemoteToLocal,
      remoteAddress: 'NQ11 TEST ACTIVE REMOTE ADDRESS',
      remoteBalance: 50_000,
      localAddress: 'NQ00 TEST LOCAL ADDRESS',
      localBalance: 100_000,
    }))
  })

  it('persists NIM swap recovery before requesting the cosigner signature', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const contractAddress = createAddress('NQ55 SWAP HTLC ADDRESS')
    const swap = {
      id: 'swap-id',
      status: 'pending',
      contracts: {
        NIM: {
          id: 'nim-contract-id',
          htlc: { timeoutTime: 123456 },
        },
      },
    }
    const unsignedTx = {
      getContractCreationAddress: () => contractAddress,
      value: 42n,
    }

    vi.mocked(getSignedTx).mockImplementation(async (_partialTx, options: any) => {
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.InsertSwapHtlc, expect.anything())
      await options.beforeSwapBroadcast(unsignedTx, swap)
      expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertSwapHtlc, [
        'NQ55 SWAP HTLC ADDRESS',
        42,
        123456,
        'swap-id',
        'pending',
        null,
      ])
      return { data: undefined, error: 'stop after pre-broadcast hook' } as any
    })

    const result = await useTransactions().sendTx({
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
    } as any)

    expect(result.error).toBe('stop after pre-broadcast hook')
  })

  it('releases the send lock when pre-broadcast recovery persistence fails', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const swap = {
      contracts: { NIM: { htlc: { timeoutTime: 123456 } } },
      id: 'swap-id',
      status: 'pending',
    }
    const unsignedTx = {
      getContractCreationAddress: () => createAddress('NQ55 SWAP HTLC ADDRESS'),
      value: 42n,
    }
    state.run.mockRejectedValueOnce(new Error('db unavailable'))
    vi.mocked(getSignedTx).mockImplementation(async (_partialTx, options: any) => {
      await options.beforeSwapBroadcast(unsignedTx, swap)
      return { data: undefined, error: 'unreachable' } as any
    })

    await expect(useTransactions().sendTx({
      transfer: Transfer.UserPaymentToAtomicSwap,
      paymentRef: 'swap-id',
    } as any)).rejects.toThrow('db unavailable')

    expect(state.isSendingTx).toBe(false)
  })

  it('durably marks a Polygon swap refunded when its transaction is not loaded', async () => {
    const storedTx = {
      hash: '0xrelayhash',
      transfer: Transfer.UserPaymentToAtomicSwap,
      asset: Asset.USDT,
      chain: Chain.Polygon,
      meta: JSON.stringify({ secret: undefined }),
      invoiced: null,
    }
    state.query.mockImplementation(((sql: string) => Promise.resolve(
      sql === SQLQuery.GetTransactionByHash ? storedTx : [],
    )) as any)

    const { useTransactions } = await import('./transactions')
    await expect(useTransactions().setPolygonSwapHtlcRefunded('0xrelayhash')).resolves.toBe(true)

    expect(state.query).toHaveBeenCalledWith(SQLQuery.GetTransactionByHash, ['0xrelayhash'], { single: true })
    const upsert = (state.run.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) => sql === SQLQuery.UpsertTx)
    expect(upsert).toBeDefined()
    expect(upsert?.[1]?.[26]).toBe(JSON.stringify({ refunded: true }))
  })

  it('atomically persists a Polygon swap transaction with its recovery hash', async () => {
    const { useTransactions } = await import('./transactions')
    const tx = {
      hash: '0xrelayhash',
      transfer: Transfer.UserPaymentToAtomicSwap,
      asset: Asset.USDT,
      chain: Chain.Polygon,
      meta: {},
    } as any

    await useTransactions().addPolygonSwapTransactionWithRecovery(tx, '0xhtlcid')

    expect(state.runBatch).toHaveBeenCalledOnce()
    expect(state.runBatch).toHaveBeenCalledWith([
      {
        statement: SQLQuery.SetSwapHtlcTxHash,
        values: ['0xrelayhash', '0xhtlcid'],
      },
      expect.objectContaining({ statement: SQLQuery.UpsertTx }),
    ])
  })

  it('deduplicates a Polygon replacement while preserving its confirmed state and relay metadata', async () => {
    const { useTransactions } = await import('./transactions')
    const store = useTransactions()
    const pendingTx = {
      hash: '0xoriginal',
      timestamp: 1,
      status: 'pending',
      fee: 1,
      transfer: Transfer.UserPaymentToAtomicSwap,
      asset: Asset.USDT,
      chain: Chain.Polygon,
      meta: { source: 'relay' },
    } as any
    const replacementTx = {
      ...pendingTx,
      hash: '0xreplacement',
      timestamp: 2,
      status: 'confirmed',
      fee: 2,
      raw: '0xraw',
      meta: { source: 'history' },
    }
    await store.addPaymentToMerchantTransaction(pendingTx)
    await store.addPaymentToMerchantTransaction(replacementTx)

    await store.replacePolygonTransactionHash('0xoriginal', '0xreplacement', '0xhtlcid')

    expect(store.transactions.map(tx => tx.hash)).toEqual(['0xreplacement'])
    expect(store.transactions[0]).toMatchObject({
      hash: '0xreplacement',
      status: 'confirmed',
      timestamp: 2,
      fee: 2,
      raw: '0xraw',
      transfer: Transfer.UserPaymentToAtomicSwap,
      meta: { source: 'relay' },
    })

    const statements = state.runBatch.mock.lastCall?.[0] || []
    const mergedUpsert = statements.find(({ statement }) => statement === SQLQuery.UpsertTx)
    expect(mergedUpsert?.values[0]).toBe('0xreplacement')
    expect(mergedUpsert?.values[1]).toBe(2)
    expect(mergedUpsert?.values[7]).toBe(2)
    expect(mergedUpsert?.values[8]).toBe('confirmed')
    expect(mergedUpsert?.values[9]).toBe('0xraw')
    expect(mergedUpsert?.values[26]).toBe(JSON.stringify({ source: 'relay' }))
  })

  it('does not clear the active remote signer when draining an inactive remote signer', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const inactiveSignerAddress = createAddress('NQ22 TEST INACTIVE REMOTE ADDRESS')
    const txPlain = {
      transactionHash: 'inactive-drain-hash',
      sender: inactiveSignerAddress.toUserFriendlyAddress(),
      senderType: 2,
      recipient: state.localAddress.toUserFriendlyAddress(),
      recipientType: 0,
      value: 123,
      fee: 0,
      timestamp: 1000,
      validityStartHeight: 1,
      data: { raw: '' },
      proof: { raw: '' },
      valid: true,
    }
    const signedTx = {
      toPlain: () => txPlain,
      hash: () => txPlain.transactionHash,
      toHex: () => 'serialized-tx',
      serializeContent: () => new Uint8Array(),
      networkId: 5,
      recipientType: 0,
      senderType: 2,
      proof: { length: 98 },
    }
    vi.mocked(getSignedTx).mockResolvedValue({
      data: { signedTx, txSent: true },
      error: undefined,
    } as any)
    state.client.sendTransaction.mockResolvedValue(txPlain as any)

    const store = useTransactions()

    await store.sendTx({
      transfer: Transfer.RemoteToLocalImmediateReclaim,
      amount: 123,
      sender: inactiveSignerAddress,
    } as any)

    expect(state.updateRemoteSigner).not.toHaveBeenCalled()
  })
})
