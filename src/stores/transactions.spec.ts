import type { RecoverablePlainTransactionDetails, UserTransaction } from '@/types/transactions'
import { DatabaseSync } from 'node:sqlite'
import { mount } from '@vue/test-utils'
import { createPinia, defineStore, disposePinia, getActivePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, customRef, defineComponent, nextTick, ref, shallowReactive, watch } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { DEFAULT_LIMIT, migrations, SQLQuery } from '@/lib/sql-queries'
import { getSignedTx } from '@/lib/tx'
import { Transfer } from '@/types/transactions'

function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
    equals: (other?: { toUserFriendlyAddress: () => string }) => other?.toUserFriendlyAddress() === value,
  }
}

function createSignedTransaction(hash = 'payment-hash', overrides: Record<string, unknown> = {}) {
  const plain = {
    transactionHash: hash,
    sender: 'NQ11 TEST ACTIVE REMOTE ADDRESS',
    senderType: 2,
    recipient: 'NQ22 TEST RECIPIENT',
    recipientType: 0,
    value: 42,
    fee: 1,
    timestamp: 123_100,
    validityStartHeight: 100,
    state: 'pending',
    data: { raw: '' },
    proof: { raw: '' },
    valid: true,
    ...overrides,
  }
  const signedTx = {
    toPlain: () => plain,
    hash: () => plain.transactionHash,
    toHex: () => `serialized-${plain.transactionHash}`,
    serializeContent: () => new Uint8Array(),
    networkId: 5,
    recipientType: plain.recipientType,
    senderType: plain.senderType,
    proof: { length: 98 },
    recipient: createAddress(plain.recipient),
    value: BigInt(plain.value),
  }
  return { plain, signedTx }
}

function createSignedHtlcCreation(hash = 'creation-hash') {
  const plain = {
    transactionHash: hash,
    sender: 'NQ00 TEST LOCAL ADDRESS',
    senderType: 0,
    recipient: 'NQ22 TEST NEW HTLC ADDRESS',
    recipientType: 2,
    value: 696_900_000,
    fee: 0,
    timestamp: 123_100,
    validityStartHeight: 100,
    data: {
      type: 'htlc',
      sender: 'NQ00 TEST LOCAL ADDRESS',
      recipient: 'NQ99 COSIGNER ADDRESS',
      timeout: 999_500,
    },
    proof: { raw: '' },
    valid: true,
  }
  return {
    plain,
    signedTx: {
      toPlain: () => plain,
      hash: () => hash,
      toHex: () => 'serialized-htlc-creation',
      serializeContent: () => new Uint8Array(),
      networkId: 5,
      recipientType: 2,
      senderType: 0,
      proof: { length: 98 },
    },
  }
}

const rawState = vi.hoisted(() => ({
  activeAsset: 'USDT',
  isSendingTx: false,
  localAddress: createAddress('NQ00 TEST LOCAL ADDRESS'),
  localBalance: 0,
  remoteAddress: createAddress('NQ11 TEST ACTIVE REMOTE ADDRESS'),
  remoteBalance: 0,
  ourRemoteSignerAddresses: new Set<string>(),
  networkId: 5,
  networkName: 'testalbatross',
  height: 128,
  headTimestamp: 200_000,
  walletContextGeneration: 0,
  client: {
    waitForConsensusEstablished: vi.fn(async () => undefined),
    sendTransaction: vi.fn(async (): Promise<unknown> => ({ state: 'pending' })),
  } as any,
  pendingTransactions: [] as any[],
  pendingRemoteDrainTxs: [] as any[],
  query: vi.fn(async (..._args: any[]): Promise<any[]> => []),
  run: vi.fn(async (..._args: unknown[]) => undefined),
  runSet: vi.fn(async (_statements: Array<{ statement: string, values: unknown[] }>) => undefined),
  updateActiveRemoteBalance: vi.fn(async () => undefined),
  activateRemoteSignerFromTransaction: vi.fn(async () => undefined),
  deactivateRemoteSigner: vi.fn(async (_address?: any, _context?: any, _clearBalance?: boolean) => true),
  updateRemoteSigner: vi.fn(async () => undefined),
  upsertInactiveRemoteSigner: vi.fn(async () => 'added' as const),
  blockHeightToTimestamp: vi.fn(async (height: number) => height * 1000),
  trackSwapCompleted: vi.fn(),
  trackSwapFailed: vi.fn(),
  trackSwapStep: vi.fn(),
  provideFundingProof: vi.fn(async () => ({})),
  getSwap: vi.fn(async (): Promise<any> => { throw new Error('bookkeeping failed') }),
  pendingHtlcCreationTransactions: [] as any[],
  pendingPaymentTransactions: [] as any[],
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const state = shallowReactive(rawState)

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/composables/useFastspotV2', () => ({
  useFastspotApiV2: () => ({ provideFundingProof: state.provideFundingProof, getSwap: state.getSwap }),
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
}))

vi.mock('@/lib/analytics', () => ({
  trackSwapCompleted: state.trackSwapCompleted,
  trackSwapFailed: state.trackSwapFailed,
  trackFundsBlocked: vi.fn(),
  trackSwapStep: state.trackSwapStep,
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
    runSet: state.runSet,
  }))

  return { useConn }
})

vi.mock('@/stores/locks', () => {
  const useLocks = defineStore('locks', () => ({
    isSendingTx: customRef<boolean>((track, trigger) => ({
      get: () => {
        track()
        return state.isSendingTx
      },
      set: (value) => {
        state.isSendingTx = value
        trigger()
      },
    })),
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
    networkName: computed(() => state.networkName),
    height: computed(() => state.height),
    headTimestamp: computed(() => state.headTimestamp),
  }))

  return { useNimiqNetwork }
})

vi.mock('@/stores/remote-signer', () => {
  const useRemoteSigner = defineStore('remote-signer', () => ({
    updateActiveRemoteBalance: state.updateActiveRemoteBalance,
    activateRemoteSignerFromTransaction: state.activateRemoteSignerFromTransaction,
    deactivateRemoteSigner: state.deactivateRemoteSigner,
    updateRemoteSigner: state.updateRemoteSigner,
    upsertInactiveRemoteSigner: state.upsertInactiveRemoteSigner,
    blockHeightToTimestamp: state.blockHeightToTimestamp,
    getWalletContext: () => state.localAddress && state.client
      ? {
          address: state.localAddress,
          client: state.client,
          network: state.networkName,
          owner: state.localAddress.toUserFriendlyAddress(),
          generation: state.walletContextGeneration,
        }
      : undefined,
    isWalletContextCurrent: (context: any) => !!state.localAddress
      && context.client === state.client
      && context.network === state.networkName
      && context.owner === state.localAddress.toUserFriendlyAddress()
      && context.generation === state.walletContextGeneration,
    remoteAddress: computed(() => state.remoteAddress),
    remoteBalance: computed(() => state.remoteBalance),
    remotePublicKey: computed(() => 'service-public-key'),
    remoteProofSize: computed(() => 98),
    isOurRemoteSigner: async (address: string) => state.ourRemoteSignerAddresses.has(address),
    getOurRemoteSignerAddresses: async () => state.ourRemoteSignerAddresses,
  }))

  return { useRemoteSigner }
})

vi.mock('@/stores/sync', () => {
  const useSync = defineStore('sync', () => ({
    pendingPaymentTransactions: computed(() => state.pendingPaymentTransactions),
    pendingHtlcCreationTransactions: state.pendingHtlcCreationTransactions,
  }))

  return { useSync }
})

vi.mock('@/stores/sync/state', () => {
  function upsertPlainPendingByHash(collection: RecoverablePlainTransactionDetails[], transaction: RecoverablePlainTransactionDetails) {
    const index = collection.findIndex(tx => tx.transactionHash === transaction.transactionHash)
    if (index >= 0)
      collection.splice(index, 1, transaction)
    else
      collection.push(transaction)
  }

  const useSyncState = defineStore('sync-state', () => ({
    pendingTransactions: state.pendingTransactions,
    pendingPaymentTransactions: state.pendingPaymentTransactions,
    pendingRemoteDrainTxs: state.pendingRemoteDrainTxs,
    pendingHtlcCreationTransactions: state.pendingHtlcCreationTransactions,
    walletContextGeneration: computed({
      get: () => state.walletContextGeneration,
      set: value => state.walletContextGeneration = value,
    }),
    isTransactionPending: customRef<boolean>(track => ({
      get: () => {
        track()
        return state.pendingTransactions.length > 0
          || state.pendingRemoteDrainTxs.length > 0
          || state.pendingHtlcCreationTransactions.length > 0
      },
      set: () => {},
    })),
  }))

  return { upsertPlainPendingByHash, useSyncState }
})

describe('useTransactions', () => {
  beforeEach(() => {
    const previousPinia = getActivePinia()
    if (previousPinia)
      disposePinia(previousPinia)
    setActivePinia(createPinia())
    state.activeAsset = Asset.USDT
    state.isSendingTx = false
    state.localAddress = createAddress('NQ00 TEST LOCAL ADDRESS')
    state.localBalance = 0
    state.remoteAddress = createAddress('NQ11 TEST ACTIVE REMOTE ADDRESS')
    state.remoteBalance = 0
    state.ourRemoteSignerAddresses = new Set<string>()
    state.networkId = 5
    state.networkName = 'testalbatross'
    state.height = 128
    state.headTimestamp = 200_000
    state.walletContextGeneration = 0
    state.client = {
      waitForConsensusEstablished: vi.fn(async () => undefined),
      sendTransaction: vi.fn(async (): Promise<unknown> => ({ state: 'pending' })),
    }
    state.pendingTransactions = []
    state.pendingRemoteDrainTxs = []
    state.query.mockReset()
    state.query.mockResolvedValue([])
    state.runSet.mockReset()
    state.runSet.mockResolvedValue(undefined)
    state.run.mockReset()
    state.run.mockResolvedValue(undefined)
    state.updateActiveRemoteBalance.mockReset()
    state.updateActiveRemoteBalance.mockResolvedValue(undefined)
    state.activateRemoteSignerFromTransaction.mockReset()
    state.activateRemoteSignerFromTransaction.mockResolvedValue(undefined)
    state.deactivateRemoteSigner.mockReset()
    state.deactivateRemoteSigner.mockResolvedValue(true)
    state.updateRemoteSigner.mockReset()
    state.updateRemoteSigner.mockResolvedValue(undefined)
    state.upsertInactiveRemoteSigner.mockReset()
    state.upsertInactiveRemoteSigner.mockResolvedValue('added')
    state.blockHeightToTimestamp.mockReset()
    state.blockHeightToTimestamp.mockImplementation(async height => height * 1000)
    state.trackSwapCompleted.mockReset()
    state.trackSwapFailed.mockReset()
    state.trackSwapStep.mockReset()
    state.provideFundingProof.mockReset()
    state.provideFundingProof.mockResolvedValue({})
    state.getSwap.mockReset()
    state.getSwap.mockRejectedValue(new Error('bookkeeping failed'))
    state.pendingHtlcCreationTransactions = []
    state.pendingPaymentTransactions = []
    state.logger.log.mockReset()
    state.logger.warn.mockReset()
    state.logger.error.mockReset()
    vi.mocked(getSignedTx).mockReset()
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

  it('writes a batch of status updates with one runSet and one list update', async () => {
    const { useTransactions } = await import('./transactions')
    const store = useTransactions()
    await store.refreshFromDb()
    await store.saveTransactions([
      { hash: 'older', status: 'pending', timestamp: 1, asset: Asset.NIM } as any,
      { hash: 'newer', status: 'pending', timestamp: 2, asset: Asset.NIM } as any,
    ])
    state.run.mockClear()
    state.runSet.mockClear()

    await store.updateTransactionStatus([
      { hash: 'older', status: 'confirmed', timestamp: 3 },
      { hash: 'newer', status: 'failed', timestamp: 2, executionResult: false },
    ])

    expect(state.run).not.toHaveBeenCalled()
    expect(state.runSet).toHaveBeenCalledOnce()
    expect(state.runSet.mock.calls[0][0]).toEqual([
      { statement: SQLQuery.UpdateTxStatus, values: ['confirmed', 3, 'older'] },
      { statement: SQLQuery.UpdateTxStatus, values: ['failed', 2, 'newer'] },
    ])
    expect(store.transactions.map(tx => [tx.hash, tx.status])).toEqual([['older', 'confirmed'], ['newer', 'failed']])
  })

  it.each([true, false, undefined])('preserves executionResult=%s unless an update provides a result', async (executionResult) => {
    const { useTransactions } = await import('./transactions')
    const store = useTransactions()
    await store.refreshFromDb()
    await store.addWithdrawalTransaction({ hash: 'execution', status: 'pending', timestamp: 123, asset: Asset.NIM } as any)
    await store.updateTransactionStatus({ hash: 'execution', status: 'included', timestamp: 123, executionResult })

    expect(state.run).toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, ['included', 123, 'execution'])
    expect(store.transactions.find(tx => tx.hash === 'execution')).toMatchObject({ status: 'included', executionResult })

    state.query.mockResolvedValue([{ hash: 'execution', status: 'included', timestamp: 123, asset: Asset.NIM }])
    await store.refreshFromDb()
    expect(store.transactions.find(tx => tx.hash === 'execution')?.executionResult).toBe(executionResult)

    await store.updateTransactionStatus({ hash: 'execution', status: 'included', timestamp: 123 })
    expect(store.transactions.find(tx => tx.hash === 'execution')?.executionResult).toBe(executionResult)

    await store.updateTransactionStatus({ hash: 'execution', status: 'included', timestamp: 123, executionResult: !executionResult })
    expect(store.transactions.find(tx => tx.hash === 'execution')?.executionResult).toBe(!executionResult)

    await store.updateTransactionStatus({ hash: 'execution', status: 'confirmed', timestamp: 123, executionResult: true })
    expect(store.transactions.find(tx => tx.hash === 'execution')).toMatchObject({ status: 'confirmed', executionResult: true })
  })

  it('persists validity evidence when importing a payment from history', async () => {
    const { useTransactions } = await import('./transactions')
    const store = useTransactions()
    await store.refreshFromDb()
    const { plain } = createSignedTransaction('imported-payment', { state: 'included', validityStartHeight: 100 })

    await store.saveTransactions([store.toUnknownPaymentToMerchantTransaction(plain as any)])

    const write = state.runSet.mock.calls[0]?.[0].find(({ statement }) => statement === SQLQuery.UpsertTx)
    expect(write?.values.at(-2)).toBe(100)
    expect(store.transactions.find(tx => tx.hash === 'imported-payment')?.validityStartHeight).toBe(100)
  })

  it.each([undefined, 0, 999])('preserves or replaces transaction timestamp with %s', async (timestamp) => {
    const { useTransactions } = await import('./transactions')
    const store = useTransactions()
    await store.refreshFromDb()
    await store.addWithdrawalTransaction({ hash: 'timestamp', timestamp: 123, asset: Asset.NIM } as any)
    await store.updateTransactionStatus({ hash: 'timestamp', status: 'expired', timestamp })
    expect(store.transactions.find(tx => tx.hash === 'timestamp')?.timestamp).toBe(timestamp ?? 123)
    expect(state.run).toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, ['expired', timestamp ?? null, 'timestamp'])
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

    expect(state.run).toHaveBeenCalledWith(SQLQuery.SetTxHidden, ['true', '0xhide'])
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

  describe('refreshFromDb / addReceiptTransactions filter our own HTLC drains', () => {
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

    it('addReceiptTransactions drops drains from one of our remote signers (no upsert, no in-memory entry)', async () => {
      const { useTransactions } = await import('./transactions')
      let store!: ReturnType<typeof useTransactions>
      mount(defineComponent({
        setup() {
          store = useTransactions()
          return () => null
        },
      }))
      await nextTick()

      state.runSet.mockClear()
      await store.addReceiptTransactions([{
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
      } as any])
      await nextTick()

      expect(state.runSet).not.toHaveBeenCalled()
      expect(store.transactions.map(tx => tx.hash)).not.toContain('hash-our-drain')
    })

    it('does not persist a receipt after context replacement during own-HTLC lookup', async () => {
      const { useTransactions } = await import('./transactions')
      const { useRemoteSigner } = await import('./remote-signer')
      const store = useTransactions()
      await nextTick()
      let finishLookup!: (ours: Set<string>) => void
      vi.spyOn(useRemoteSigner(), 'getOurRemoteSignerAddresses').mockReturnValueOnce(
        new Promise(resolve => finishLookup = resolve),
      )
      const receipt = makeUserReceiptRow({ sender: foreignHtlc, hash: 'stale-lookup-receipt' })
      const persistence = store.addReceiptTransactions([receipt as any])
      state.walletContextGeneration += 1
      finishLookup(new Set())
      await persistence

      expect(state.runSet).not.toHaveBeenCalled()
      expect(store.transactions).toEqual([])
    })

    it('does not publish a receipt after context replacement during native persistence', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await nextTick()
      let finishWrite!: () => void
      state.runSet.mockReturnValueOnce(new Promise(resolve => finishWrite = () => resolve(undefined)))
      const receipt = makeUserReceiptRow({ sender: foreignHtlc, hash: 'stale-native-receipt' })
      const persistence = store.addReceiptTransactions([receipt as any])
      await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledWith([{ statement: SQLQuery.UpsertTx, values: expect.any(Array) }]))
      state.walletContextGeneration += 1
      finishWrite()
      await persistence

      expect(store.transactions).toEqual([])
      expect(state.runSet).toHaveBeenCalledTimes(1)
    })

    it('stores a Polygon receipt while the Nimiq client is unavailable', async () => {
      state.client = undefined
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      const receipt = makeUserReceiptRow({
        sender: '0xsender',
        senderType: 0,
        hash: 'polygon-receipt',
        asset: Asset.USDT,
        chain: Chain.Polygon,
      })
      await store.addReceiptTransactions([receipt as any])

      expect(state.runSet).toHaveBeenCalledWith([{ statement: SQLQuery.UpsertTx, values: expect.any(Array) }])
      expect(store.transactions.map(tx => tx.hash)).toEqual(['polygon-receipt'])
    })

    it('addReceiptTransactions writes a batch with one runSet and one sorted list update', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      state.runSet.mockClear()

      await store.addReceiptTransactions([
        makeUserReceiptRow({ sender: foreignHtlc, hash: 'older', timestamp: 1 }),
        makeUserReceiptRow({ hash: 'own-drain', timestamp: 2 }),
        makeUserReceiptRow({ sender: foreignHtlc, hash: 'newer', timestamp: 3 }),
      ] as any)

      expect(state.runSet).toHaveBeenCalledOnce()
      expect(state.runSet.mock.calls[0][0].map(({ values }) => values[0])).toEqual(['older', 'newer'])
      expect(store.transactions.map(tx => tx.hash)).toEqual(['newer', 'older'])
    })

    it('addReceiptTransactions keeps valid rows when the batch write fails on one row', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      state.runSet.mockRejectedValueOnce(new Error('constraint failed'))
      state.run.mockImplementation(async (...args: unknown[]) => {
        if ((args[1] as unknown[] | undefined)?.[0] === 'bad')
          throw new Error('constraint failed')
      })

      await store.addReceiptTransactions([
        makeUserReceiptRow({ sender: foreignHtlc, hash: 'good-1', timestamp: 1 }),
        makeUserReceiptRow({ sender: foreignHtlc, hash: 'bad', timestamp: 2 }),
        makeUserReceiptRow({ sender: foreignHtlc, hash: 'good-2', timestamp: 3 }),
      ] as any)

      expect(state.run.mock.calls.filter(([sql]) => sql === SQLQuery.UpsertTx).map(([, values]) => (values as unknown[])[0])).toEqual(['good-1', 'bad', 'good-2'])
      expect(store.transactions.map(tx => tx.hash)).toEqual(['good-2', 'good-1'])
    })

    it('splits large batches into chunks and retries only the failed chunk row by row', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      state.runSet.mockClear()
      state.run.mockClear()
      // Second chunk fails as a set; its rows still write one by one.
      state.runSet.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('constraint failed'))

      await store.addReceiptTransactions(Array.from({ length: 450 }, (_, index) =>
        makeUserReceiptRow({ sender: foreignHtlc, hash: `chunk-${index}`, timestamp: index })) as any)

      expect(state.runSet.mock.calls.map(([statements]) => statements.length)).toEqual([200, 200, 50])
      expect(state.run.mock.calls.filter(([sql]) => sql === SQLQuery.UpsertTx)).toHaveLength(200)
      expect(store.transactions).toHaveLength(450)
    })

    it('addReceiptTransactions throws when no row of a failed batch can be written', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      const batchError = new Error('database locked')
      state.runSet.mockRejectedValueOnce(batchError)
      state.run.mockRejectedValue(new Error('database locked'))

      await expect(store.addReceiptTransactions([
        makeUserReceiptRow({ sender: foreignHtlc, hash: 'locked', timestamp: 1 }),
      ] as any)).rejects.toBe(batchError)
      expect(store.transactions).toEqual([])
    })

    it('addReceiptTransactions stores receipts from foreign HTLC senders (other Nimiq Pay users paying us)', async () => {
      const { useTransactions } = await import('./transactions')
      let store!: ReturnType<typeof useTransactions>
      mount(defineComponent({
        setup() {
          store = useTransactions()
          return () => null
        },
      }))
      await nextTick()

      state.runSet.mockClear()
      await store.addReceiptTransactions([{
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
      } as any])
      await nextTick()

      expect(state.runSet).toHaveBeenCalledWith([{ statement: SQLQuery.UpsertTx, values: expect.any(Array) }])
      expect(store.transactions.map(tx => tx.hash)).toContain('hash-foreign-pay')
    })
  })

  describe('send certainty', () => {
    function mockRemoteSigning(
      signedTx: ReturnType<typeof createSignedTransaction>['signedTx'],
      result: { outcome: 'signed', signedTx: any, txSent?: boolean, swap?: any } | { outcome: 'rejected' | 'unknown', error: string } = { outcome: 'signed', signedTx },
    ) {
      vi.mocked(getSignedTx).mockImplementation(async (_partialTx, options) => {
        try {
          await options?.beforeRemoteBroadcast?.(signedTx as any, result.outcome === 'signed' ? result.swap : undefined)
        }
        catch (error) {
          return { outcome: 'rejected', error: error instanceof Error ? error.message : String(error) }
        }
        return result as any
      })
    }

    it('restores payment, staking, and remote-drain rows without replacing concurrent pending entries', async () => {
      const { useTransactions } = await import('./transactions')
      const existingPayment = { transactionHash: 'existing-payment' }
      const concurrentPayment = { transactionHash: 'concurrent-payment' }
      const existingDrain = { hash: 'existing-drain' }
      const concurrentDrain = { hash: 'concurrent-drain' }
      state.pendingTransactions.push(existingPayment)
      state.pendingRemoteDrainTxs.push(existingDrain)
      let resolveQuery!: (rows: any[]) => void
      state.query.mockReturnValue(new Promise(resolve => resolveQuery = resolve))

      const restoration = useTransactions().restorePendingOutgoingTransactions()
      await vi.waitFor(() => expect(state.query).toHaveBeenCalledWith(
        SQLQuery.SelectPendingOutgoingTransactions,
        ['NQ00 TEST LOCAL ADDRESS'],
      ))
      state.pendingTransactions.push(concurrentPayment)
      state.pendingRemoteDrainTxs.push(concurrentDrain)
      resolveQuery([
        {
          hash: 'payment-hash',
          timestamp: 1,
          sender: 'NQ00 TEST LOCAL ADDRESS',
          senderType: 2,
          recipient: 'NQ22 RECIPIENT',
          recipientType: 0,
          amount: 10,
          fee: 1,
          status: 'pending',
          transfer: Transfer.UserPayment,
          validityStartHeight: 100,
        },
        {
          hash: 'staking-hash',
          timestamp: 2,
          sender: 'NQ00 TEST LOCAL ADDRESS',
          senderType: 2,
          recipient: 'NQ00 STAKING',
          recipientType: 3,
          amount: 20,
          fee: 0,
          status: 'new',
          transfer: Transfer.Staking,
          validityStartHeight: 101,
        },
        {
          hash: 'drain-hash',
          timestamp: 3,
          sender: 'NQ11 OLD HTLC',
          senderType: 2,
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 0,
          amount: 30,
          fee: 0,
          status: 'pending',
          transfer: Transfer.RemoteToLocalImmediateReclaim,
          validityStartHeight: 102,
        },
      ])

      await expect(restoration).resolves.toBe(true)
      expect(state.pendingTransactions.map(tx => tx.transactionHash)).toEqual([
        'existing-payment',
        'concurrent-payment',
        'payment-hash',
        'staking-hash',
      ])
      expect(state.pendingRemoteDrainTxs.map(tx => tx.hash)).toEqual([
        'existing-drain',
        'concurrent-drain',
        'drain-hash',
      ])
    })

    it('rejects stale ordinary and drain rows changed during restoration', async () => {
      const { useTransactions } = await import('./transactions')
      const pendingPayment = { transactionHash: 'stale-payment' }
      const pendingDrain = { hash: 'stale-drain' }
      state.pendingTransactions.push(pendingPayment)
      state.pendingRemoteDrainTxs.push(pendingDrain)
      let resolveRows!: (rows: any[]) => void
      state.query.mockImplementation(query => query === SQLQuery.SelectPendingOutgoingTransactions
        ? new Promise(resolve => resolveRows = resolve)
        : Promise.resolve([]))

      const restoration = useTransactions().restorePendingOutgoingTransactions()
      await vi.waitFor(() => expect(state.query).toHaveBeenCalledWith(
        SQLQuery.SelectPendingOutgoingTransactions,
        ['NQ00 TEST LOCAL ADDRESS'],
      ))
      state.pendingTransactions.splice(0)
      state.pendingRemoteDrainTxs.splice(0, 1, { hash: 'replacement-drain' } as any)
      resolveRows([
        {
          hash: 'stale-payment',
          timestamp: 1,
          sender: 'NQ00 TEST LOCAL ADDRESS',
          senderType: 0,
          recipient: 'NQ22 RECIPIENT',
          recipientType: 0,
          amount: 10,
          fee: 1,
          status: 'pending',
          transfer: Transfer.UserPayment,
          validityStartHeight: 100,
        },
        {
          hash: 'stale-drain',
          timestamp: 2,
          sender: 'NQ11 OLD HTLC',
          senderType: 2,
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 0,
          amount: 20,
          fee: 0,
          status: 'pending',
          transfer: Transfer.RemoteToLocalImmediateReclaim,
          validityStartHeight: 101,
        },
      ])

      await expect(restoration).resolves.toBe(false)
      expect(state.pendingTransactions).toEqual([])
      expect(state.pendingRemoteDrainTxs).toEqual([{ hash: 'replacement-drain' }])
    })

    it('restores a staged payment from a persisted imported signer without creation history', async () => {
      const { DatabaseSync } = await import('node:sqlite')
      const { useTransactions } = await import('./transactions')
      const db = new DatabaseSync(':memory:')
      for (const migration of migrations)
        db.exec(migration.statements.join(';'))
      db.prepare(SQLQuery.InsertRemoteSigner).run(
        'NQ11 TEST ACTIVE REMOTE ADDRESS',
        42,
        98,
        'service-public-key',
        1,
        2,
        1,
      )
      state.run.mockImplementation(async (...args: unknown[]) => {
        const [sql, values = []] = args as [string, unknown[]?]
        db.prepare(sql).run(...values.map(value => value ?? null) as any[])
      })
      state.query.mockImplementation(async (sql, values: any[] = []) =>
        db.prepare(sql).all(...values.map(value => value ?? null)) as any[],
      )
      const { signedTx } = createSignedTransaction('remote-payment-after-restart')
      mockRemoteSigning(signedTx, { outcome: 'signed', signedTx, txSent: true })

      try {
        const result = await useTransactions().sendTx({
          transfer: Transfer.UserPayment,
          recipient: 'NQ22 TEST RECIPIENT',
          amount: 42,
          title: 'Payment',
        } as any)
        expect(result.outcome).toBe('submitted')
        db.prepare(`INSERT INTO transactions
          (hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, transfer, asset, chain)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            'foreign-signer-payment',
            123_100,
            'NQ33 FOREIGN REMOTE SIGNER',
            2,
            'NQ22 TEST RECIPIENT',
            0,
            99,
            1,
            'pending',
            Transfer.UserPayment,
            Asset.NIM,
            Chain.Nimiq,
          )

        state.pendingTransactions.splice(0)
        await expect(useTransactions().restorePendingOutgoingTransactions()).resolves.toBe(true)

        expect(state.pendingTransactions.map(tx => tx.transactionHash)).toEqual([
          'remote-payment-after-restart',
        ])
      }
      finally {
        db.close()
      }
    })

    it('restores only our unresolved stake withdrawals and blocks another send', async () => {
      const { DatabaseSync } = await import('node:sqlite')
      const { useTransactions } = await import('./transactions')
      const db = new DatabaseSync(':memory:')
      for (const migration of migrations)
        db.exec(migration.statements.join(';'))
      const insert = db.prepare(`INSERT INTO transactions
        (hash, sender, senderType, recipient, status, transfer, asset, chain, validityStartHeight)
        VALUES (?, 'staking-contract', 3, ?, ?, 'staking', 'NIM', 'Nimiq', 100)`)
      insert.run('our-pending-withdrawal', 'NQ00 TEST LOCAL ADDRESS', 'pending')
      insert.run('foreign-withdrawal', 'NQ33 OTHER WALLET', 'pending')
      insert.run('resolved-withdrawal', 'NQ00 TEST LOCAL ADDRESS', 'confirmed')
      state.query.mockImplementation(async (sql, values: any[] = []) => db.prepare(sql).all(...values) as any[])
      try {
        const store = useTransactions()
        await expect(store.restorePendingOutgoingTransactions()).resolves.toBe(true)
        expect(state.pendingTransactions.map(tx => tx.transactionHash)).toEqual(['our-pending-withdrawal'])
        const result = await store.sendTx({ transfer: Transfer.UserPayment, recipient: 'NQ22 RECIPIENT', amount: 42 } as any)
        expect(result.outcome).toBe('rejected')
        expect(getSignedTx).not.toHaveBeenCalled()
      }
      finally {
        db.close()
      }
    })

    it('blocks sending when a persisted HTLC creation has not been hydrated by startup yet', async () => {
      const { DatabaseSync } = await import('node:sqlite')
      const { useTransactions } = await import('./transactions')
      const db = new DatabaseSync(':memory:')
      for (const migration of migrations)
        db.exec(migration.statements.join(';'))
      db.prepare(`INSERT INTO transactions
        (hash, sender, recipient, status, transfer, asset, chain, validityStartHeight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          'pending-htlc-after-reload',
          'NQ00 TEST LOCAL ADDRESS',
          'NQ11 TEST ACTIVE REMOTE ADDRESS',
          'pending',
          Transfer.LocalToRemote,
          Asset.NIM,
          Chain.Nimiq,
          100,
        )
      state.query.mockImplementation(async (sql, values: any[] = []) =>
        db.prepare(sql).all(...values.map(value => value ?? null)) as any[],
      )

      try {
        const result = await useTransactions().sendTx({
          transfer: Transfer.UserPayment,
          recipient: 'NQ22 TEST RECIPIENT',
          amount: 42,
          title: 'Payment',
        } as any)

        expect(result).toEqual({
          outcome: 'rejected',
          reason: 'busy',
          error: 'A transaction is still pending. Wait for it to resolve before sending another.',
        })
        expect(state.pendingHtlcCreationTransactions).toContainEqual(expect.objectContaining({
          transactionHash: 'pending-htlc-after-reload',
          state: 'pending',
        }))
        expect(getSignedTx).not.toHaveBeenCalled()
        expect(state.client.waitForConsensusEstablished).not.toHaveBeenCalled()
      }
      finally {
        db.close()
      }
    })

    it('returns false when pending restoration fails and blocks signing', async () => {
      const { useTransactions } = await import('./transactions')
      state.query.mockImplementation(query => query === SQLQuery.SelectPendingOutgoingTransactions
        ? Promise.reject(new Error('database unavailable'))
        : Promise.resolve([]))

      await expect(useTransactions().restorePendingOutgoingTransactions()).resolves.toBe(false)
      const result = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocal } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'Could not verify pending transactions' })
      expect(getSignedTx).not.toHaveBeenCalled()
    })

    it.each(['owner', 'network', 'client', 'generation'] as const)(
      'returns false when %s changes during pending restoration',
      async (field) => {
        const { useTransactions } = await import('./transactions')
        state.query.mockImplementation(async (query) => {
          if (query !== SQLQuery.SelectPendingOutgoingTransactions)
            return []
          if (field === 'owner')
            state.localAddress = createAddress('NQ01 NEXT OWNER')
          else if (field === 'network')
            state.networkName = 'mainalbatross'
          else if (field === 'client')
            state.client = { waitForConsensusEstablished: vi.fn(), sendTransaction: vi.fn() }
          else
            state.walletContextGeneration += 1
          return []
        })

        await expect(useTransactions().restorePendingOutgoingTransactions()).resolves.toBe(false)
      },
    )

    it('rejects without a client', async () => {
      const { useTransactions } = await import('./transactions')
      state.client = undefined as any

      const result = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocal } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'Nimiq network unavailable' })
      expect(getSignedTx).not.toHaveBeenCalled()
    })

    it('does not sign before consensus is established', async () => {
      const { useTransactions } = await import('./transactions')
      let establishConsensus!: () => void
      state.client.waitForConsensusEstablished.mockReturnValue(new Promise<void>(resolve => establishConsensus = resolve))
      const send = useTransactions().sendTx({ transfer: Transfer.RemoteToLocal } as any)
      await vi.waitFor(() => expect(state.client.waitForConsensusEstablished).toHaveBeenCalledOnce())

      expect(getSignedTx).not.toHaveBeenCalled()
      establishConsensus()
      mockRemoteSigning(createSignedTransaction().signedTx)
      await send
    })

    it('bounds consensus readiness and releases the send lock', async () => {
      vi.useFakeTimers()
      const { useTransactions } = await import('./transactions')
      state.client.waitForConsensusEstablished.mockReturnValue(new Promise(() => {}))

      const send = useTransactions().sendTx({ transfer: Transfer.RemoteToLocal } as any)
      await vi.advanceTimersByTimeAsync(30_000)

      await expect(send).resolves.toEqual(expect.objectContaining({ outcome: 'rejected' }))
      expect(getSignedTx).not.toHaveBeenCalled()
      expect(state.isSendingTx).toBe(false)
      vi.useRealTimers()
    })

    it.each(['owner', 'network', 'client', 'generation'] as const)(
      'rejects when %s changes before signing',
      async (field) => {
        const { useTransactions } = await import('./transactions')
        state.client.waitForConsensusEstablished.mockImplementation(async () => {
          if (field === 'owner')
            state.localAddress = createAddress('NQ01 NEXT OWNER')
          else if (field === 'network')
            state.networkName = 'mainalbatross'
          else if (field === 'client')
            state.client = { waitForConsensusEstablished: vi.fn(), sendTransaction: vi.fn() }
          else
            state.walletContextGeneration += 1
        })

        const result = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocal } as any)

        expect(result).toEqual({ outcome: 'rejected', error: 'Wallet or network changed before sending' })
        expect(getSignedTx).not.toHaveBeenCalled()
      },
    )

    it('persists, marks pending, then broadcasts an ordinary remote payment', async () => {
      const { useTransactions } = await import('./transactions')
      const order: string[] = []
      const { signedTx } = createSignedTransaction('ordinary-payment')
      state.run.mockImplementation(async (query) => {
        if (query === SQLQuery.UpsertTx)
          order.push('persist')
      })
      const originalPush = state.pendingTransactions.push.bind(state.pendingTransactions)
      vi.spyOn(state.pendingTransactions, 'push').mockImplementation((...items) => {
        order.push('pending')
        return originalPush(...items)
      })
      state.client.sendTransaction.mockImplementation(async () => {
        order.push('broadcast')
        return { state: 'pending' }
      })
      mockRemoteSigning(signedTx)

      const result = await useTransactions().sendTx({
        transfer: Transfer.UserPayment,
        recipient: 'NQ22 TEST RECIPIENT',
        amount: 42,
        title: 'Payment',
      } as any)

      expect(order).toEqual(['persist', 'pending', 'broadcast'])
      expect(result.outcome).toBe('submitted')
    })

    it('marks HTLC recovery pending immediately after persistence', async () => {
      const { useTransactions } = await import('./transactions')
      const order: string[] = []
      const { signedTx } = createSignedHtlcCreation()
      state.run.mockImplementation(async (query) => {
        if (query === SQLQuery.UpsertTx)
          order.push('persist')
      })
      const originalPush = state.pendingHtlcCreationTransactions.push.bind(state.pendingHtlcCreationTransactions)
      vi.spyOn(state.pendingHtlcCreationTransactions, 'push').mockImplementation((...items) => {
        order.push('pending')
        return originalPush(...items)
      })
      state.upsertInactiveRemoteSigner.mockImplementation(async () => {
        order.push('inactive-signer')
        return 'added'
      })
      state.client.sendTransaction.mockImplementation(async () => {
        order.push('broadcast')
        return { state: 'pending' }
      })
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)

      const result = await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

      expect(order).toEqual(['persist', 'pending', 'inactive-signer', 'broadcast'])
      expect(state.upsertInactiveRemoteSigner).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          client: state.client,
          generation: 0,
          network: 'testalbatross',
          owner: 'NQ00 TEST LOCAL ADDRESS',
        }),
      )
      expect(result.outcome).toBe('submitted')
    })

    it('classifies a staged pre-broadcast persistence failure as rejected', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction()
      state.run.mockImplementation(async (query) => {
        if (query === SQLQuery.UpsertTx)
          throw new Error('persistence failed')
      })
      vi.mocked(getSignedTx).mockImplementation(async (_partialTx, options) => {
        try {
          await options?.beforeRemoteBroadcast?.(signedTx as any)
          return { outcome: 'signed', signedTx } as any
        }
        catch (error) {
          return { outcome: 'rejected', error: (error as Error).message }
        }
      })

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPayment } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'persistence failed' })
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
    })

    it('cleans up an explicit cosigner rejection', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('rejected-payment')
      mockRemoteSigning(signedTx, { outcome: 'rejected', error: 'cosigner rejected' })

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPayment } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'cosigner rejected' })
      expect(state.run).toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, ['failed', 123_100, 'rejected-payment'])
      expect(state.pendingTransactions).toEqual([])
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
    })

    it.each(['owner', 'network', 'client', 'generation'] as const)(
      'keeps a staged swap unknown when %s changes after the cosigner cannot confirm submission',
      async (field) => {
        const { useTransactions } = await import('./transactions')
        const { signedTx } = createSignedTransaction(`stale-signing-${field}`)
        const swap = {
          id: 'swap-id',
          status: 'pending',
          contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } },
        }
        let finishSigning!: () => void
        vi.mocked(getSignedTx).mockImplementation(async (_partialTx, options) => {
          await options?.beforeRemoteBroadcast?.(signedTx as any, swap as any)
          await new Promise<void>(resolve => finishSigning = resolve)
          return { outcome: 'signed', signedTx, txSent: false, swap } as any
        })

        const send = useTransactions().sendTx({
          transfer: Transfer.UserPaymentToAtomicSwap,
          paymentRef: 'payment-ref',
        } as any)
        await vi.waitFor(() => expect(state.pendingTransactions).toContainEqual(
          expect.objectContaining({ transactionHash: `stale-signing-${field}` }),
        ))

        if (field === 'owner')
          state.localAddress = createAddress('NQ01 NEXT OWNER')
        else if (field === 'network')
          state.networkName = 'mainalbatross'
        else if (field === 'client')
          state.client = { waitForConsensusEstablished: vi.fn(), sendTransaction: vi.fn() }
        else
          state.walletContextGeneration += 1
        finishSigning()

        await expect(send).resolves.toMatchObject({
          outcome: 'unknown',
          stagedHash: `stale-signing-${field}`,
          error: 'Wallet or network changed before sending',
        })
        expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())
        expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertSwapHtlc, expect.any(Array))
        expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
        expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapQuote, expect.anything())
        expect(state.trackSwapFailed).not.toHaveBeenCalled()
        expect(state.pendingTransactions).toContainEqual(
          expect.objectContaining({ transactionHash: `stale-signing-${field}` }),
        )
      },
    )

    it('keeps staged state unknown when context changes during authoritative non-submission persistence failure', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('stale-non-submission-persistence')
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: false,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: {
            NIM: {
              id: 'nim-contract',
              htlc: { timeoutTime: 123 },
            },
          },
        },
      } as any)
      state.run.mockImplementation(async (query) => {
        if (query === SQLQuery.InsertSwapHtlc) {
          state.walletContextGeneration += 1
          throw new Error('swap persistence failed')
        }
      })

      const result = await useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'payment-ref',
      } as any)

      expect(result).toMatchObject({
        outcome: 'unknown',
        stagedHash: 'stale-non-submission-persistence',
        error: 'swap persistence failed',
      })
      expect(state.pendingTransactions).toContainEqual(expect.objectContaining({
        transactionHash: 'stale-non-submission-persistence',
      }))
    })

    it.each(['owner', 'network', 'client', 'generation'] as const)(
      'retains terminal swap recovery when %s changes during local broadcast',
      async (field) => {
        const { useTransactions } = await import('./transactions')
        const { signedTx } = createSignedTransaction(`stale-broadcast-${field}`)
        let finishBroadcast!: (details: any) => void
        state.client.sendTransaction.mockReturnValue(new Promise(resolve => finishBroadcast = resolve))
        mockRemoteSigning(signedTx, {
          outcome: 'signed',
          signedTx,
          txSent: false,
          swap: {
            id: 'swap-id',
            status: 'pending',
            contracts: {
              NIM: {
                id: 'nim-contract',
                htlc: { timeoutTime: 123 },
              },
            },
          },
        } as any)

        const send = useTransactions().sendTx({
          transfer: Transfer.UserPaymentToAtomicSwap,
          paymentRef: 'payment-ref',
        } as any)
        await vi.waitFor(() => expect(state.client.sendTransaction).toHaveBeenCalledOnce())

        if (field === 'owner')
          state.localAddress = createAddress('NQ01 NEXT OWNER')
        else if (field === 'network')
          state.networkName = 'mainalbatross'
        else if (field === 'client')
          state.client = { waitForConsensusEstablished: vi.fn(), sendTransaction: vi.fn() }
        else
          state.walletContextGeneration += 1
        finishBroadcast({ state: 'invalidated', timestamp: 321 })

        await expect(send).resolves.toEqual({ outcome: 'rejected', error: 'Transaction invalid' })
        expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertSwapHtlc, expect.any(Array))
        expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())
        expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
        expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapQuote, expect.anything())
        expect(state.trackSwapFailed).not.toHaveBeenCalled()
        expect(state.pendingTransactions).toContainEqual(
          expect.objectContaining({ transactionHash: `stale-broadcast-${field}` }),
        )
      },
    )

    it('keeps staged recovery without authorizing local retry on cosigner server uncertainty', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('cosigner-server-error')
      mockRemoteSigning(signedTx, { outcome: 'unknown', error: 'response creation failed' })

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPayment } as any)

      expect(result).toMatchObject({
        outcome: 'unknown',
        stagedHash: 'cosigner-server-error',
        error: 'response creation failed',
      })
      expect(getSignedTx).toHaveBeenCalledTimes(1)
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())
      expect(state.pendingTransactions).toHaveLength(1)
    })

    it('keeps final serialization on local transport uncertainty', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('local-timeout')
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockRejectedValue(new Error('connection closed'))

      const timeoutResult = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout } as any)

      expect(timeoutResult).toMatchObject({
        outcome: 'unknown',
        stagedHash: 'local-timeout',
        serialized: 'serialized-local-timeout',
      })
      expect(state.pendingRemoteDrainTxs).toHaveLength(1)
    })

    it('bounds an ordinary local broadcast while retaining its durable retry barrier', async () => {
      vi.useFakeTimers()
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      const { signedTx } = createSignedTransaction('ordinary-broadcast-timeout')
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockReturnValue(new Promise(() => {}))

      const send = store.sendTx({
        transfer: Transfer.UserPayment,
        recipient: 'NQ22 TEST RECIPIENT',
        amount: 42,
        title: 'Payment',
      } as any)
      for (let index = 0; index < 20; index += 1)
        await Promise.resolve()
      expect(state.client.sendTransaction).toHaveBeenCalledOnce()
      let result: Awaited<typeof send> | undefined
      let settled = false
      void send.then((value) => {
        result = value
        settled = true
      })

      vi.advanceTimersByTime(29_999)
      for (let index = 0; index < 20; index += 1)
        await Promise.resolve()
      expect(settled).toBe(false)
      expect(state.isSendingTx).toBe(true)
      expect(state.pendingTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: 'ordinary-broadcast-timeout' }),
      )
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())

      vi.advanceTimersByTime(1)
      for (let index = 0; index < 20; index += 1)
        await Promise.resolve()
      expect(settled).toBe(true)
      expect(result).toMatchObject({
        outcome: 'unknown',
        stagedHash: 'ordinary-broadcast-timeout',
        serialized: 'serialized-ordinary-broadcast-timeout',
      })
      expect(state.isSendingTx).toBe(false)
      expect(state.pendingTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: 'ordinary-broadcast-timeout' }),
      )
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())

      vi.useRealTimers()
      state.client.sendTransaction.mockRejectedValue(new Error('unexpected retry'))
      await expect(store.sendTx({ transfer: Transfer.UserPayment } as any)).resolves.toMatchObject({
        outcome: 'rejected',
        error: expect.stringContaining('still pending'),
      })
      expect(getSignedTx).toHaveBeenCalledTimes(1)
      expect(state.client.sendTransaction).toHaveBeenCalledTimes(1)
    }, 1_000)

    it.each([undefined, { state: 'new' }])('classifies broadcast response %s as unknown', async (details) => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('unconfirmed-broadcast')
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockResolvedValue(details as any)

      const result = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout } as any)

      expect(result.outcome).toBe('unknown')
    })

    it('anchors uncertainty to the staged hash when the cosigner changes the transaction', async () => {
      const { useTransactions } = await import('./transactions')
      const staged = createSignedTransaction('staged-hash')
      const changed = createSignedTransaction('changed-hash')
      vi.mocked(getSignedTx).mockImplementation(async (_partialTx, options) => {
        await options?.beforeRemoteBroadcast?.(staged.signedTx as any)
        return { outcome: 'signed', signedTx: changed.signedTx, txSent: true } as any
      })

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPayment } as any)

      expect(result).toMatchObject({ outcome: 'unknown', stagedHash: 'staged-hash' })
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
    })

    it('skips rebroadcast of a listener-observed transaction and drops observations after the send', async () => {
      const { useTransactions } = await import('./transactions')
      const { useSyncState } = await import('@/stores/sync/state')
      const { plain, signedTx } = createSignedTransaction('observed-payment')
      vi.mocked(getSignedTx).mockImplementation(async (_partialTx, options) => {
        await options?.beforeRemoteBroadcast?.(signedTx as any)
        useSyncState().pendingPaymentTransactions.push({ ...plain, state: 'included' } as any)
        return { outcome: 'signed', signedTx } as any
      })

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPayment } as any)

      expect(result.outcome).toBe('submitted')
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
      expect(useSyncState().pendingPaymentTransactions).toEqual([])
    })

    it.each([
      ['invalidated', 'failed'],
      ['expired', 'expired'],
    ] as const)('keeps authoritative %s rejection when status persistence fails', async (chainState, expectedStatus) => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('rejected-chain')
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockResolvedValue({ state: chainState, timestamp: 321 } as any)
      state.run.mockImplementation(async (...args: unknown[]) => {
        const [query, values] = args as [unknown, unknown[]?]
        if (query === SQLQuery.UpdateTxStatus && values?.[0] === expectedStatus)
          throw new Error('status write failed')
      })

      const result = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'Transaction invalid' })
      expect(state.pendingRemoteDrainTxs).toHaveLength(1)
    })

    it.each([
      ['invalidated', undefined, 'failed'],
      ['expired', undefined, 'expired'],
      ['failed execution', false, 'failed'],
    ] as const)('cleans stale swap rows after authoritative %s rejection', async (chainState, executionResult, expectedStatus) => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction(`rejected-swap-${expectedStatus}`)
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: false,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: {
            NIM: {
              id: 'nim-contract',
              htlc: { timeoutTime: 123 },
            },
          },
        },
      } as any)
      state.client.sendTransaction.mockResolvedValue({
        state: chainState === 'failed execution' ? 'pending' : chainState,
        executionResult,
        timestamp: 321,
      } as any)

      const result = await useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'payment-ref',
      } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'Transaction invalid' })
      expect(state.run).toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, [expectedStatus, 321, `rejected-swap-${expectedStatus}`])
      expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, ['NQ22 TEST RECIPIENT'])
      expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteSwapQuote, ['payment-ref'])
      expect(state.trackSwapFailed).toHaveBeenCalledWith({
        error_reason: 'Transaction invalid',
        asset: Asset.NIM,
      })
      expect(state.pendingTransactions).toEqual([])
    })

    it.each(['included', 'confirmed'])('preserves durable pending evidence when %s HTLC activation fails', async (status) => {
      const { useTransactions } = await import('./transactions')
      const { plain, signedTx } = createSignedHtlcCreation()
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockResolvedValue({ ...plain, state: status } as any)
      state.activateRemoteSignerFromTransaction.mockRejectedValue(new Error('activation failed'))

      const result = await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

      expect(result.outcome).toBe('submitted')
      expect(state.pendingHtlcCreationTransactions).toHaveLength(1)
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())
    })

    it('clears an included HTLC retry barrier after status persistence and activation', async () => {
      const { useTransactions } = await import('./transactions')
      const { plain, signedTx } = createSignedHtlcCreation()
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockResolvedValue({ ...plain, state: 'included' } as any)

      const result = await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

      expect(result.outcome).toBe('submitted')
      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ generation: 0 }))
      expect(state.pendingHtlcCreationTransactions).toEqual([expect.objectContaining({ state: 'included' })])
      expect(state.pendingTransactions).toEqual([])
      expect(state.pendingRemoteDrainTxs).toEqual([])
    })

    it('removes an HTLC monitoring barrier after actual confirmation', async () => {
      const { useTransactions } = await import('./transactions')
      const { plain, signedTx } = createSignedHtlcCreation()
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockResolvedValue({ ...plain, state: 'confirmed' } as any)

      const result = await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

      expect(result.outcome).toBe('submitted')
      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ generation: 0 }))
      expect(state.pendingHtlcCreationTransactions).toEqual([])
      expect(state.pendingTransactions).toEqual([])
      expect(state.pendingRemoteDrainTxs).toEqual([])
    })

    it('suppresses stale-context signer activation after authoritative inclusion', async () => {
      const { useTransactions } = await import('./transactions')
      const { plain, signedTx } = createSignedHtlcCreation()
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockImplementation(async () => {
        state.walletContextGeneration += 1
        return { ...plain, state: 'included' }
      })

      const result = await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

      expect(result.outcome).toBe('submitted')
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())
      expect(state.activateRemoteSignerFromTransaction).not.toHaveBeenCalled()
      expect(state.pendingHtlcCreationTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: plain.transactionHash }),
      )
    })

    it('uses a local head estimate for provisional HTLC timestamps', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedHtlcCreation()
      const plainWithoutTimestamp = { ...signedTx.toPlain(), timestamp: undefined }
      const txWithoutTimestamp = { ...signedTx, toPlain: () => plainWithoutTimestamp }
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx: txWithoutTimestamp } as any)
      state.client.sendTransaction.mockResolvedValue({ ...plainWithoutTimestamp, state: 'pending' } as any)

      await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

      expect(state.upsertInactiveRemoteSigner).toHaveBeenCalledWith(
        expect.objectContaining({ start: 172_000 }),
        expect.objectContaining({ generation: 0 }),
      )
      expect(state.blockHeightToTimestamp).not.toHaveBeenCalled()
    })

    it('persists swap refund metadata before a cosigner timeout', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('timed-out-swap')
      const swap = { id: 'swap-id', status: 'pending', contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } } }
      let writesBeforeTimeout: unknown[] = []
      vi.mocked(getSignedTx).mockImplementation(async (_args, options) => {
        await options?.beforeRemoteBroadcast?.(signedTx as any, swap as any)
        writesBeforeTimeout = [...state.run.mock.calls]
        return { outcome: 'unknown', error: 'Operation timed out' }
      })

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPaymentToAtomicSwap, paymentRef: 'swap-id' } as any)

      expect(writesBeforeTimeout).toContainEqual([SQLQuery.InsertSwapHtlc, [
        'NQ22 TEST RECIPIENT',
        42,
        123,
        'swap-id',
        'pending',
        null,
      ]])
      expect(result).toMatchObject({ outcome: 'unknown', stagedHash: 'timed-out-swap', error: 'Operation timed out' })
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
      expect(state.pendingTransactions).toContainEqual(expect.objectContaining({ transactionHash: 'timed-out-swap' }))
      expect(state.provideFundingProof).not.toHaveBeenCalled()
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
    })

    it('keeps staged state unknown when Fastspot funding proof setup throws', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('setup-failed')
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: false,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: {
            NIM: {
              id: 'nim-contract',
              htlc: { timeoutTime: 123 },
            },
          },
        },
      } as any)
      state.provideFundingProof.mockImplementationOnce(() => {
        throw new Error('setup failed')
      })

      const result = await useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'payment-ref',
      } as any)

      expect(result).toMatchObject({ outcome: 'unknown', stagedHash: 'setup-failed' })
      expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertSwapHtlc, expect.any(Array))
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())
      expect(state.pendingTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: 'setup-failed' }),
      )
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
    })

    it('rejects before cosigner submission when swap HTLC persistence fails', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('swap-insert-failed')
      let rejectFundingProof!: (error: Error) => void
      const fundingProof = new Promise<object>((_, reject) => rejectFundingProof = reject)
      const catchSpy = vi.spyOn(fundingProof, 'catch')
      state.provideFundingProof.mockReturnValue(fundingProof)
      state.run.mockImplementation(async (query) => {
        if (query === SQLQuery.InsertSwapHtlc)
          throw new Error('swap insert failed')
      })
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: false,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: {
            NIM: {
              id: 'nim-contract',
              htlc: { timeoutTime: 123 },
            },
          },
        },
      } as any)

      const result = await useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'payment-ref',
      } as any)

      expect(result).toMatchObject({ outcome: 'rejected', error: 'swap insert failed' })
      expect(state.pendingTransactions).toHaveLength(0)
      expect(state.run).toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.arrayContaining(['failed', 'swap-insert-failed']))
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
      expect(state.provideFundingProof).not.toHaveBeenCalled()
      expect(catchSpy).not.toHaveBeenCalled()
      rejectFundingProof(new Error('funding proof failed'))
      await fundingProof.catch(() => undefined)
    })

    it('does not contact Fastspot after swap persistence finishes in a stale context', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('stale-swap-insert')
      let rejectFundingProof!: (error: Error) => void
      const fundingProof = new Promise<object>((_, reject) => rejectFundingProof = reject)
      const catchSpy = vi.spyOn(fundingProof, 'catch')
      state.provideFundingProof.mockReturnValue(fundingProof)
      let finishInsert!: () => void
      state.run.mockImplementation(async (query) => {
        if (query === SQLQuery.InsertSwapHtlc)
          await new Promise<void>(resolve => finishInsert = resolve)
      })
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: false,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: {
            NIM: {
              id: 'nim-contract',
              htlc: { timeoutTime: 123 },
            },
          },
        },
      } as any)

      const send = useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'payment-ref',
      } as any)
      await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertSwapHtlc, expect.any(Array)))
      state.walletContextGeneration += 1
      finishInsert()

      await expect(send).resolves.toMatchObject({
        outcome: 'unknown',
        stagedHash: 'stale-swap-insert',
        error: 'Wallet or network changed before sending',
      })
      expect(state.provideFundingProof).not.toHaveBeenCalled()
      expect(catchSpy).not.toHaveBeenCalled()
      expect(state.pendingTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: 'stale-swap-insert' }),
      )
      rejectFundingProof(new Error('funding proof failed'))
      await fundingProof.catch(() => undefined)
    })

    it('keeps staged state unknown when local broadcast throws after the cosigner cannot confirm submission', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('local-broadcast-failed')
      mockRemoteSigning(signedTx, { outcome: 'signed', signedTx, txSent: false })
      state.client.sendTransaction.mockRejectedValue(new Error('connection closed'))

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPayment } as any)

      expect(result).toMatchObject({
        outcome: 'unknown',
        stagedHash: 'local-broadcast-failed',
        serialized: 'serialized-local-broadcast-failed',
      })
      expect(state.pendingTransactions).toHaveLength(1)
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.anything())
    })

    it('does not rebroadcast when the cosigner confirms submission', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('cosigner-sent')
      mockRemoteSigning(signedTx, { outcome: 'signed', signedTx, txSent: true })

      const result = await useTransactions().sendTx({ transfer: Transfer.UserPayment } as any)

      expect(result.outcome).toBe('submitted')
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
    })

    it('deactivates only the submitted drain sender without clearing its stored balance', async () => {
      const { useTransactions } = await import('./transactions')
      const targetAddress = 'NQ22 TEST INACTIVE REMOTE ADDRESS'
      const { signedTx } = createSignedTransaction('submitted-target-drain', { sender: targetAddress })
      mockRemoteSigning(signedTx, { outcome: 'signed', signedTx, txSent: true })
      state.deactivateRemoteSigner.mockResolvedValue(false)

      const result = await useTransactions().sendTx({
        transfer: Transfer.RemoteToLocalImmediateReclaim,
        sender: createAddress(targetAddress) as any,
        amount: 42,
        proofSize: 104,
      })

      expect(result.outcome).toBe('submitted')
      expect(state.deactivateRemoteSigner).toHaveBeenCalledWith(
        expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }),
        expect.objectContaining({
          client: state.client,
          generation: 0,
          network: 'testalbatross',
          owner: 'NQ00 TEST LOCAL ADDRESS',
        }),
      )
      expect(state.deactivateRemoteSigner.mock.calls[0]![0].toUserFriendlyAddress()).toBe(targetAddress)
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
    })

    it.each(['rejected', 'unknown'] as const)('leaves the immediate reclaim signer unchanged for %s outcome', async (outcome) => {
      const { useTransactions } = await import('./transactions')
      const targetAddress = 'NQ22 TEST INACTIVE REMOTE ADDRESS'
      const { signedTx } = createSignedTransaction(`${outcome}-target-drain`, { sender: targetAddress })
      mockRemoteSigning(signedTx, { outcome, error: `${outcome} drain` })

      const result = await useTransactions().sendTx({
        transfer: Transfer.RemoteToLocalImmediateReclaim,
        sender: createAddress(targetAddress) as any,
        amount: 42,
        proofSize: 104,
      })

      expect(result.outcome).toBe(outcome)
      expect(state.deactivateRemoteSigner).not.toHaveBeenCalled()
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
    })

    it('keeps cosigner acceptance authoritative when atomic-swap bookkeeping fails', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('accepted-swap')
      // getSwap keeps failing, so settlement retries until the HTLC deadline ends it.
      vi.useFakeTimers()
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: true,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: {
            NIM: {
              id: 'nim-contract',
              htlc: { timeoutTime: 123 },
            },
          },
        },
      } as any)

      let result
      try {
        const send = useTransactions().sendTx({
          transfer: Transfer.UserPaymentToAtomicSwap,
          paymentRef: 'payment-ref',
        } as any)
        await vi.advanceTimersByTimeAsync(60_000)
        result = await send
      }
      finally {
        vi.useRealTimers()
      }

      expect(result).toMatchObject({ outcome: 'submitted' })
      expect(state.pendingTransactions.map(tx => tx.transactionHash)).toContain('accepted-swap')
      expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertSwapHtlc, expect.any(Array))
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapQuote, expect.anything())
      expect(state.trackSwapFailed).not.toHaveBeenCalled()
      expect(state.client.sendTransaction).not.toHaveBeenCalled()
      expect(state.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'settlement', ok: false, error_reason: 'Swap timed out waiting for Lightning payment confirmation' }))
      expect(state.trackSwapCompleted).not.toHaveBeenCalled()
    })

    it('signals NIM submission before waiting for Lightning settlement', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('submitted-before-lightning')
      let settleSwap!: (value: { preimage: string }) => void
      state.provideFundingProof.mockReturnValue(new Promise(resolve => settleSwap = resolve))
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: true,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } },
        },
      } as any)
      const onSubmitted = vi.fn(async () => {})

      const send = useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'swap-id',
      } as any, undefined, onSubmitted)
      await expect(send).resolves.toMatchObject({ outcome: 'submitted' })
      expect(onSubmitted).toHaveBeenCalledWith('submitted-before-lightning')
      expect(state.isSendingTx).toBe(false)
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())

      settleSwap({ preimage: 'secret' })
      await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.any(Array)))
    })

    it('releases the send lock while the caller waits for Lightning settlement', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('awaiting-lightning')
      let settleSwap!: (value: { preimage: string }) => void
      state.provideFundingProof.mockReturnValue(new Promise(resolve => settleSwap = resolve))
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: true,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } },
        },
      } as any)

      let settled = false
      const send = useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'swap-id',
      } as any).finally(() => settled = true)
      await vi.waitFor(() => expect(state.isSendingTx).toBe(false))
      expect(settled).toBe(false)

      settleSwap({ preimage: 'secret' })
      await expect(send).resolves.toMatchObject({ outcome: 'submitted' })
      expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.any(Array))
    })

    it.each(['funding_proof', 'poll'])('keeps settlement successful after a %s preimage when persistence fails', async (source) => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('settled-swap')
      const persistenceError = new Error('database write failed')
      state.provideFundingProof.mockResolvedValue(source === 'funding_proof' ? { preimage: 'secret' } : {})
      state.getSwap.mockResolvedValue({ status: 'CONFIRMED', preimage: 'secret' })
      state.run.mockImplementation(async (statement) => {
        if (statement === SQLQuery.SetSwapPreimage)
          throw persistenceError
      })
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: true,
        swap: { id: 'swap-id', status: 'pending', contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } } },
      })

      await expect(useTransactions().sendTx({
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'swap-id',
      } as any)).resolves.toMatchObject({ outcome: 'submitted' })

      expect(state.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({
        step: 'settlement',
        ok: true,
        asset: Asset.NIM,
        swap_id: 'swap-id',
        preimage_source: source,
      }))
      expect(state.trackSwapStep).not.toHaveBeenCalledWith(expect.objectContaining({ step: 'settlement', ok: false }))
      expect(state.trackSwapCompleted).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ asset: Asset.NIM }))
      expect(state.logger.error).toHaveBeenCalledWith('Failed to finish accepted swap bookkeeping', persistenceError)
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.anything())
      expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeleteSwapQuote, expect.anything())
    })

    it('stops the slow settlement timer while completed swap bookkeeping is pending', async () => {
      vi.useFakeTimers()
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('settled-slow-bookkeeping')
      let releasePersistence!: () => void
      const persistence = new Promise<void>(resolve => releasePersistence = resolve)
      state.provideFundingProof.mockResolvedValue({ preimage: 'secret' })
      state.run.mockImplementation(async (statement) => {
        if (statement === SQLQuery.SetSwapPreimage)
          await persistence
      })
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: true,
        swap: { id: 'swap-id', status: 'pending', contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } } },
      })
      const send = useTransactions().sendTx({ transfer: Transfer.UserPaymentToAtomicSwap, paymentRef: 'swap-id' } as any)

      try {
        await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(SQLQuery.SetSwapPreimage, ['secret', 'settled-slow-bookkeeping']))
        await vi.advanceTimersByTimeAsync(60_000)
        expect(state.trackSwapStep).not.toHaveBeenCalledWith(expect.objectContaining({ step: 'settlement_slow' }))
        expect(state.trackSwapStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'settlement', ok: true }))
      }
      finally {
        releasePersistence()
        await send
        vi.useRealTimers()
      }
    })

    it('saves the Lightning secret even when the swap row is gone', async () => {
      const db = new DatabaseSync(':memory:')
      for (const migration of migrations)
        db.exec(migration.statements.join(';'))
      state.run.mockImplementation(async (statement, values = []) => {
        db.prepare(statement as string).run(...(values as unknown[]).map(value => value ?? null) as Array<string | number | null>)
      })
      state.query.mockImplementation(async (statement, values = [], options): Promise<any> => {
        const query = db.prepare(statement)
        const params = (values as unknown[]).map(value => value ?? null) as Array<string | number | null>
        return options?.single ? query.get(...params) : query.all(...params)
      })
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('swap-row-removed')
      let settleSwap!: (value: { preimage: string }) => void
      state.provideFundingProof.mockReturnValue(new Promise(resolve => settleSwap = resolve))
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: true,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } },
        },
      } as any)

      try {
        await expect(useTransactions().sendTx({
          transfer: Transfer.UserPaymentToAtomicSwap,
          paymentRef: 'swap-id',
        } as any, undefined, async () => {})).resolves.toMatchObject({ outcome: 'submitted' })
        db.prepare('DELETE FROM transactions WHERE hash = ?').run('swap-row-removed')

        settleSwap({ preimage: 'secret' })
        await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.any(Array)))

        expect(db.prepare('SELECT status, meta_json FROM transactions WHERE hash = ?').get('swap-row-removed')).toEqual({
          status: 'confirmed',
          meta_json: '{"secret":"secret"}',
        })
      }
      finally {
        db.close()
      }
    })

    it('keeps row updates made while waiting for Lightning settlement', async () => {
      const db = new DatabaseSync(':memory:')
      for (const migration of migrations)
        db.exec(migration.statements.join(';'))
      state.run.mockImplementation(async (statement, values = []) => {
        db.prepare(statement as string).run(...(values as unknown[]).map(value => value ?? null) as Array<string | number | null>)
      })
      state.query.mockImplementation(async (statement, values = [], options): Promise<any> => {
        const query = db.prepare(statement)
        const params = (values as unknown[]).map(value => value ?? null) as Array<string | number | null>
        return options?.single ? query.get(...params) : query.all(...params)
      })
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      const { signedTx } = createSignedTransaction('swap-waiting-for-lightning')
      let settleSwap!: (value: { preimage: string }) => void
      state.provideFundingProof.mockReturnValue(new Promise(resolve => settleSwap = resolve))
      mockRemoteSigning(signedTx, {
        outcome: 'signed',
        signedTx,
        txSent: true,
        swap: {
          id: 'swap-id',
          status: 'pending',
          contracts: { NIM: { id: 'nim-contract', htlc: { timeoutTime: 123 } } },
        },
      } as any)

      try {
        await expect(store.sendTx({
          transfer: Transfer.UserPaymentToAtomicSwap,
          paymentRef: 'swap-id',
        } as any, undefined, async () => {})).resolves.toMatchObject({ outcome: 'submitted' })
        db.prepare(`UPDATE transactions SET timestamp = 999, meta_json = '{"hidden":true}' WHERE hash = ?`).run('swap-waiting-for-lightning')

        settleSwap({ preimage: 'secret' })
        await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteSwapHtlc, expect.any(Array)))

        expect(db.prepare('SELECT status, timestamp, meta_json FROM transactions WHERE hash = ?').get('swap-waiting-for-lightning')).toEqual({
          status: 'confirmed',
          timestamp: 999,
          meta_json: '{"hidden":true,"secret":"secret"}',
        })
        expect(store.transactions.find(tx => tx.hash === 'swap-waiting-for-lightning')?.meta).toEqual({ hidden: true, secret: 'secret' })
      }
      finally {
        db.close()
      }
    })

    it('returns rejected for a second concurrent send and only broadcasts once', async () => {
      const { useTransactions } = await import('./transactions')
      const { signedTx } = createSignedTransaction('locked-send')
      let resolveBroadcast!: (value: any) => void
      vi.mocked(getSignedTx).mockResolvedValue({ outcome: 'signed', signedTx } as any)
      state.client.sendTransaction.mockReturnValue(new Promise(resolve => resolveBroadcast = resolve))

      const first = useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout } as any)
      await vi.waitFor(() => expect(state.client.sendTransaction).toHaveBeenCalledOnce())
      expect(state.isSendingTx).toBe(true)
      const secondResult = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout } as any)

      expect(secondResult.outcome).toBe('rejected')
      expect(state.client.sendTransaction).toHaveBeenCalledTimes(1)
      resolveBroadcast({ state: 'pending' })
      await first
      expect(state.isSendingTx).toBe(false)
    })
  })
  it('atomically persists a Polygon swap transaction with its recovery hash', async () => {
    const { useTransactions } = await import('./transactions')
    const tx = {
      hash: '0xrelayhash',
      transfer: Transfer.UserPaymentToAtomicSwap,
      asset: Asset.USDT,
      chain: Chain.Polygon,
      meta: {},
      validityStartHeight: 123,
    } as any

    await useTransactions().addPolygonSwapTransactionWithRecovery(tx, '0xhtlcid')

    expect(state.runSet).toHaveBeenCalledOnce()
    expect(state.runSet).toHaveBeenCalledWith([
      {
        statement: SQLQuery.SetSwapHtlcTxHash,
        values: ['0xrelayhash', '0xhtlcid'],
      },
      expect.objectContaining({ statement: SQLQuery.UpsertTx }),
    ])
    expect(state.runSet.mock.calls[0][0][1].values).toHaveLength(33)
    expect(state.runSet.mock.calls[0][0][1].values[31]).toBe(123)
  })

  describe('native row persistence', () => {
    let db: DatabaseSync

    beforeEach(() => {
      state.activeAsset = Asset.NIM
      db = new DatabaseSync(':memory:')
      for (const migration of migrations) {
        for (const statement of migration.statements)
          db.exec(statement)
      }
      db.prepare(`INSERT INTO transactions
        (hash, status, timestamp, sender, recipient, amount, fee, transfer, asset, chain, meta_json, senderData, recipientData, validityStartHeight)
        VALUES ('nim-swap', 'confirmed', 1, 'NQ00 TEST LOCAL ADDRESS', 'NQ55 SWAP HTLC ADDRESS', 10, 0, ?, ?, ?, '{"secret":"preimage"}', 'aabb', 'ccdd', 789)`).run(
        Transfer.UserPaymentToAtomicSwap,
        Asset.NIM,
        Chain.Nimiq,
      )

      state.query.mockImplementation(async (statement, values = [], options): Promise<any> => {
        const query = db.prepare(statement)
        const params = (values as unknown[]).map(value => value ?? null) as Array<string | number | null>
        return options?.single ? query.get(...params) : query.all(...params)
      })
      state.run.mockImplementation(async (statement, values = []) => {
        db.prepare(statement as string).run(...(values as unknown[]).map(value => value ?? null) as Array<string | number | null>)
      })
    })

    afterEach(() => db.close())

    it('keeps tx data columns when re-saving a row loaded from the list', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()

      await store.setTxHidden('nim-swap', true)

      expect(db.prepare('SELECT senderData, recipientData, validityStartHeight, meta_json FROM transactions WHERE hash = ?').get('nim-swap')).toEqual({
        senderData: 'aabb',
        recipientData: 'ccdd',
        validityStartHeight: 789,
        meta_json: '{"secret":"preimage","hidden":true}',
      })
    })

    it('writes staking tx data to the columns as hex', async () => {
      state.runSet.mockImplementation(async (statements: { statement: string, values: unknown[] }[]) => {
        for (const { statement, values } of statements)
          db.prepare(statement).run(...values.map(value => value ?? null) as Array<string | number | null>)
      })
      const { useTransactions } = await import('./transactions')

      await useTransactions().saveTransactions([{
        hash: 'nim-staking',
        timestamp: 1,
        sender: 'NQ00 TEST LOCAL ADDRESS',
        senderType: 0,
        recipient: 'NQ77 STAKING CONTRACT',
        recipientType: 3,
        amount: 10,
        fee: 0,
        status: 'confirmed',
        transfer: Transfer.Staking,
        title: 'Staking Contract',
        proofSize: 0,
        senderData: '',
        recipientData: 'aabb',
      }])

      expect(db.prepare('SELECT senderData, recipientData FROM transactions WHERE hash = ?').get('nim-staking')).toEqual({
        senderData: '',
        recipientData: 'aabb',
      })
    })

    it('reads staking tx data columns back as hex', async () => {
      db.prepare(`INSERT INTO transactions
        (hash, status, timestamp, sender, recipient, amount, fee, transfer, asset, chain, senderData, recipientData, validityStartHeight)
        VALUES ('nim-staking', 'confirmed', 1, 'NQ00 TEST LOCAL ADDRESS', 'NQ77 STAKING CONTRACT', 10, 0, ?, ?, ?, 'aabb', '', 789)`).run(
        Transfer.Staking,
        Asset.NIM,
        Chain.Nimiq,
      )
      const { useTransactions } = await import('./transactions')

      // setSwapPreimage only touches meta and returns the stored row.
      await expect(useTransactions().setSwapPreimage('nim-staking', 'preimage')).resolves.toMatchObject({
        senderData: 'aabb',
        recipientData: '',
        validityStartHeight: 789,
      })
    })

    it('persists a native swap refund when its tx is not loaded', async () => {
      const { useTransactions } = await import('./transactions')

      await useTransactions().setSwapHtlcRefunded('NQ55 SWAP HTLC ADDRESS')

      expect(db.prepare('SELECT meta_json FROM transactions WHERE hash = ?').get('nim-swap')).toEqual({
        meta_json: '{"secret":"preimage","refunded":true}',
      })
    })

    it('keeps newer row state when hiding a loaded tx', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      db.exec(`UPDATE transactions SET status = 'failed', meta_json = '{"secret":"preimage","refunded":true}' WHERE hash = 'nim-swap'`)

      await store.setTxHidden('nim-swap', true)

      expect(db.prepare('SELECT status, meta_json FROM transactions WHERE hash = ?').get('nim-swap')).toEqual({
        status: 'failed',
        meta_json: '{"secret":"preimage","refunded":true,"hidden":true}',
      })
      expect(store.transactions[0].meta).toEqual({ secret: 'preimage', hidden: true })
    })

    it('replaces the loaded tx when its cashback is claimed', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      const loadedTx = store.transactions[0]

      await store.updateTransactionCashbackClaimed({ hash: 'nim-swap' })

      expect(store.transactions[0]).not.toBe(loadedTx)
      expect(store.transactions[0].isCashbackClaimed).toBe(true)
    })

    it('marks every loaded tx sent to a refunded swap HTLC', async () => {
      db.prepare(`INSERT INTO transactions (hash, status, timestamp, sender, recipient, amount, fee, transfer, asset, chain)
        VALUES ('nim-swap-retry', 'failed', 2, 'NQ00 TEST LOCAL ADDRESS', 'NQ55 SWAP HTLC ADDRESS', 10, 0, ?, ?, ?)`).run(
        Transfer.UserPaymentToAtomicSwap,
        Asset.NIM,
        Chain.Nimiq,
      )
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()

      await store.setSwapHtlcRefunded('NQ55 SWAP HTLC ADDRESS')

      expect(store.transactions.map(tx => tx.meta?.refunded)).toEqual([true, true])
    })

    it('replaces the loaded native swap tx after marking it refunded', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      const loadedTx = store.transactions[0]

      await store.setSwapHtlcRefunded('NQ55 SWAP HTLC ADDRESS')

      expect(store.transactions[0]).not.toBe(loadedTx)
      expect(store.transactions[0].meta).toEqual({ secret: 'preimage', refunded: true })
    })
  })

  describe('polygon replacement persistence', () => {
    let db: DatabaseSync

    beforeEach(() => {
      db = new DatabaseSync(':memory:')
      for (const migration of migrations) {
        for (const statement of migration.statements)
          db.exec(statement)
      }
      db.prepare(`INSERT INTO transactions
        (hash, status, timestamp, fee, raw, transfer, asset, chain, meta_json, invoiced_json, paymentRef, validityStartHeight, senderData, recipientData)
        VALUES (?, 'pending', 1, 1, '0xoriginalraw', ?, ?, ?, ?, ?, 'swap-id', 789, 'aabb', 'ccdd')`).run(
        '0xoriginal',
        Transfer.UserPaymentToAtomicSwap,
        Asset.USDT,
        Chain.Polygon,
        JSON.stringify({ source: 'relay' }),
        JSON.stringify({ amount: 5, currency: 'EUR' }),
      )
      db.exec(`INSERT INTO swap_htlcs (address, amount, timeout_block, swap_id, swap_status, tx_hash)
        VALUES ('0xhtlcid', 1, 123, 'swap-id', 'pending', '0xoriginal')`)

      state.query.mockImplementation(async (statement, values, options): Promise<any> => {
        const query = db.prepare(statement)
        return options?.single
          ? query.get(...values as Array<string | number | null>)
          : query.all(...values as Array<string | number | null>)
      })
      state.run.mockImplementation(async (statement, values) => {
        db.prepare(statement as string).run(...(values as unknown[]).map(value => value ?? null) as Array<string | number | null>)
      })
      state.runSet.mockImplementation(async (statements) => {
        db.exec('BEGIN')
        try {
          for (const { statement, values } of statements)
            db.prepare(statement).run(...values.map(value => value ?? null) as Array<string | number | null>)
          db.exec('COMMIT')
        }
        catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      })
    })

    afterEach(() => db.close())

    it.each([
      { cached: 'neither', count: 0 },
      { cached: 'original', count: 1 },
      { cached: 'both', count: 2 },
      { cached: 'replacement', count: 1 },
    ])('preserves persisted replacement state with $cached transaction(s) cached', async ({ cached, count }) => {
      if (cached === 'neither' || cached === 'replacement')
        state.activeAsset = Asset.NIM
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()

      db.prepare(`INSERT INTO transactions (hash, status, timestamp, fee, raw, transfer, asset, chain)
        VALUES ('0xreplacement', 'confirmed', 2, 2, '0xraw', ?, ?, ?)`).run(
        Transfer.UserPayment,
        Asset.USDT,
        Chain.Polygon,
      )
      if (cached === 'both')
        await store.refreshFromDb()
      if (cached === 'replacement') {
        state.query.mockResolvedValueOnce([db.prepare(SQLQuery.GetTransactionByHash).get('0xreplacement')] as any)
        await store.refreshFromDb()
      }
      expect(store.transactions).toHaveLength(count)

      await store.replacePolygonTransactionHash('0xoriginal', '0xreplacement', '0xhtlcid')

      expect(db.prepare('SELECT hash, status, timestamp, fee, raw, transfer, paymentRef, meta_json, invoiced_json FROM transactions').all()).toEqual([{
        hash: '0xreplacement',
        status: 'confirmed',
        timestamp: 2,
        fee: 2,
        raw: '0xraw',
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'swap-id',
        meta_json: '{"source":"relay"}',
        invoiced_json: '{"amount":5,"currency":"EUR"}',
      }])
      expect(store.transactions).toHaveLength(1)
      expect(store.transactions[0]).toMatchObject({
        hash: '0xreplacement',
        status: 'confirmed',
        timestamp: 2,
        fee: 2,
        raw: '0xraw',
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'swap-id',
        meta: { source: 'relay' },
        invoiced: { amount: 5, currency: 'EUR' },
      })
      expect(db.prepare('SELECT tx_hash FROM swap_htlcs').get()).toEqual({ tx_hash: '0xreplacement' })
      expect(db.prepare('SELECT validityStartHeight, senderData, recipientData FROM transactions').get()).toEqual({
        validityStartHeight: 789,
        senderData: 'aabb',
        recipientData: 'ccdd',
      })
    })

    it('does not recreate a renamed hash when delayed swap completion arrives', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      db.exec(`UPDATE transactions SET meta_json = '{"source":"relay","refunded":true}' WHERE hash = '0xoriginal'`)
      await store.replacePolygonTransactionHash('0xoriginal', '0xreplacement', '0xhtlcid')

      expect(await store.setSwapPreimage('0xoriginal', 'late-secret')).toBeFalsy()
      expect(db.prepare('SELECT hash FROM transactions').all()).toEqual([{ hash: '0xreplacement' }])
      expect(store.transactions.map(tx => tx.hash)).toEqual(['0xreplacement'])

      await expect(store.setSwapPreimage('0xreplacement', 'secret')).resolves.toMatchObject({
        status: 'confirmed',
        meta: { source: 'relay', refunded: true, secret: 'secret' },
        invoiced: { amount: 5, currency: 'EUR' },
      })
      expect(db.prepare('SELECT hash, validityStartHeight, senderData, recipientData, status, meta_json FROM transactions').all()).toEqual([{
        hash: '0xreplacement',
        validityStartHeight: 789,
        senderData: 'aabb',
        recipientData: 'ccdd',
        status: 'confirmed',
        meta_json: '{"source":"relay","refunded":true,"secret":"secret"}',
      }])
      expect(store.transactions[0]).toMatchObject({ status: 'confirmed', meta: { secret: 'secret', refunded: true } })
    })

    it.each(['history-first', 'replacement-first'])('preserves swap metadata with %s ordering', async (order) => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      db.exec(`UPDATE transactions SET meta_json = '{"secret":"preimage","refunded":true}' WHERE hash = '0xoriginal'`)
      const historyTx: UserTransaction = {
        hash: '0xreplacement',
        sender: 'polygon-owner',
        recipient: 'polygon-htlc-contract',
        amount: 42,
        fee: 3,
        timestamp: 4,
        status: 'confirmed',
        proofSize: 0,
        transfer: Transfer.UserPayment,
        title: 'Withdrawal',
        asset: Asset.USDT,
        chain: Chain.Polygon,
      }
      if (order === 'history-first')
        await store.addPolygonHistoryTransaction(historyTx)
      await store.replacePolygonTransactionHash('0xoriginal', historyTx.hash, '0xhtlcid')
      if (order === 'replacement-first')
        await store.addPolygonHistoryTransaction(historyTx)

      expect(db.prepare('SELECT hash, transfer, paymentRef, status, timestamp, fee, raw, meta_json, invoiced_json, validityStartHeight FROM transactions').all()).toEqual([{
        hash: '0xreplacement',
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'swap-id',
        status: 'confirmed',
        timestamp: 4,
        fee: 3,
        raw: '0xoriginalraw',
        meta_json: '{"secret":"preimage","refunded":true}',
        invoiced_json: '{"amount":5,"currency":"EUR"}',
        validityStartHeight: 789,
      }])
      expect(store.transactions).toHaveLength(1)
      expect(store.transactions[0]).toMatchObject({
        hash: '0xreplacement',
        transfer: Transfer.UserPaymentToAtomicSwap,
        paymentRef: 'swap-id',
        status: 'confirmed',
        meta: { secret: 'preimage', refunded: true },
        invoiced: { amount: 5, currency: 'EUR' },
      })
    })

    it.each(['Payment', 'Withdrawal'] as const)('inserts unseen history with its %s title and refreshes only chain evidence', async (title) => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      const historyTx: UserTransaction = {
        hash: '0xhistory',
        sender: 'polygon-owner',
        recipient: 'recipient',
        amount: 42,
        fee: 3,
        timestamp: 4,
        status: 'mined',
        raw: 'raw-history',
        proofSize: 0,
        transfer: Transfer.UserPayment,
        title,
        asset: Asset.USDT,
        chain: Chain.Polygon,
      }
      await store.addPolygonHistoryTransaction(historyTx)
      expect(db.prepare(SQLQuery.GetTransactionByHash).get(historyTx.hash)).toMatchObject({
        hash: historyTx.hash,
        title,
        amount: 42,
        sender: 'polygon-owner',
        recipient: 'recipient',
        transfer: Transfer.UserPayment,
        asset: Asset.USDT,
        chain: Chain.Polygon,
      })
      await store.addPolygonHistoryTransaction({ ...historyTx, status: 'confirmed', timestamp: undefined, fee: 5, raw: 'refreshed-raw' })
      expect(store.transactions.find(tx => tx.hash === historyTx.hash)).toMatchObject({
        title,
        amount: 42,
        status: 'confirmed',
        timestamp: 4,
        fee: 5,
        raw: 'refreshed-raw',
      })
    })

    it('renames an original without a replacement and tolerates a repeated callback', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()

      await store.replacePolygonTransactionHash('0xoriginal', '0xreplacement')
      await store.replacePolygonTransactionHash('0xoriginal', '0xreplacement')

      expect(db.prepare('SELECT hash, status, timestamp, fee, raw, meta_json FROM transactions').all()).toEqual([{
        hash: '0xreplacement',
        status: 'pending',
        timestamp: 1,
        fee: 1,
        raw: '0xoriginalraw',
        meta_json: '{"source":"relay"}',
      }])
      expect(store.transactions.map(tx => tx.hash)).toEqual(['0xreplacement'])
      expect(store.transactions[0]?.meta).toEqual({ source: 'relay' })
    })

    it('keeps original fields when the replacement has no enrichment', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      db.exec('INSERT INTO transactions (hash, status) VALUES (\'0xreplacement\', \'confirmed\')')

      await store.replacePolygonTransactionHash('0xoriginal', '0xreplacement')

      expect(db.prepare('SELECT hash, status, timestamp, fee, raw FROM transactions').all()).toEqual([{
        hash: '0xreplacement',
        status: 'confirmed',
        timestamp: 1,
        fee: 1,
        raw: '0xoriginalraw',
      }])
      expect(store.transactions[0]).toMatchObject({ status: 'confirmed', timestamp: 1, fee: 1, raw: '0xoriginalraw' })
    })

    it.each([false, true])('persists refund metadata with loaded=%s without losing newer DB fields', async (loaded) => {
      if (!loaded)
        state.activeAsset = Asset.NIM
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      db.exec(`UPDATE transactions SET status = 'confirmed', fee = 42,
        meta_json = '{"source":"relay","secret":"secret"}' WHERE hash = '0xoriginal'`)

      await expect(store.setPolygonSwapHtlcRefunded('0xoriginal')).resolves.toBe(true)

      expect(db.prepare('SELECT status, fee, validityStartHeight, senderData, recipientData, meta_json FROM transactions').get()).toEqual({
        status: 'confirmed',
        fee: 42,
        validityStartHeight: 789,
        senderData: 'aabb',
        recipientData: 'ccdd',
        meta_json: '{"source":"relay","secret":"secret","refunded":true}',
      })
      expect(store.transactions).toHaveLength(loaded ? 1 : 0)
      if (loaded)
        expect(store.transactions[0]).toMatchObject({ status: 'confirmed', fee: 42, meta: { secret: 'secret', refunded: true } })
      await expect(store.setPolygonSwapHtlcRefunded('missing')).resolves.toBe(false)
    })

    it('rolls back the recovery hash if atomic transaction insertion fails', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      db.exec('UPDATE swap_htlcs SET tx_hash = NULL')
      db.exec(`CREATE TRIGGER reject_transaction BEFORE INSERT ON transactions
        BEGIN SELECT RAISE(ABORT, 'transaction insert failed'); END`)

      await expect(store.addPolygonSwapTransactionWithRecovery({
        hash: 'new-funding',
        transfer: Transfer.UserPaymentToAtomicSwap,
        asset: Asset.USDT,
        chain: Chain.Polygon,
      } as any, '0xhtlcid')).rejects.toThrow('transaction insert failed')

      expect(db.prepare('SELECT tx_hash FROM swap_htlcs').get()).toEqual({ tx_hash: null })
      expect(db.prepare('SELECT hash FROM transactions').all()).toEqual([{ hash: '0xoriginal' }])
      expect(store.transactions.map(tx => tx.hash)).toEqual(['0xoriginal'])
    })

    it('rolls back recovery and transaction changes when the hash update fails', async () => {
      const { useTransactions } = await import('./transactions')
      const store = useTransactions()
      await store.refreshFromDb()
      db.exec('INSERT INTO transactions (hash, status) VALUES (\'0xreplacement\', \'confirmed\')')
      db.exec(`CREATE TRIGGER reject_hash_update BEFORE UPDATE OF hash ON transactions
        BEGIN SELECT RAISE(ABORT, 'hash update failed'); END`)

      await expect(store.replacePolygonTransactionHash('0xoriginal', '0xreplacement', '0xhtlcid')).rejects.toThrow('hash update failed')

      expect(db.prepare('SELECT hash, status FROM transactions ORDER BY hash').all()).toEqual([
        { hash: '0xoriginal', status: 'pending' },
        { hash: '0xreplacement', status: 'confirmed' },
      ])
      expect(db.prepare('SELECT tx_hash FROM swap_htlcs').get()).toEqual({ tx_hash: '0xoriginal' })
      expect(store.transactions.map(tx => tx.hash)).toEqual(['0xoriginal'])
    })
  })
})
