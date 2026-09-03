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
    sendTransaction: vi.fn(async (): Promise<unknown> => undefined),
  },
  query: vi.fn(async () => []),
  run: vi.fn(async (..._args: unknown[]) => undefined),
  updateActiveRemoteBalance: vi.fn(async () => undefined),
  activateRemoteSignerFromTransaction: vi.fn(async () => undefined),
  updateRemoteSigner: vi.fn(async () => undefined),
  upsertInactiveRemoteSigner: vi.fn(async () => 'added' as const),
  blockHeightToTimestamp: vi.fn(async (height: number) => height * 1000),
  pendingHtlcCreationTransactions: [] as any[],
  pendingPaymentTransactions: [] as any[],
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
    activateRemoteSignerFromTransaction: state.activateRemoteSignerFromTransaction,
    updateRemoteSigner: state.updateRemoteSigner,
    upsertInactiveRemoteSigner: state.upsertInactiveRemoteSigner,
    blockHeightToTimestamp: state.blockHeightToTimestamp,
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
      sendTransaction: vi.fn(async (): Promise<unknown> => undefined),
    }
    state.query.mockReset()
    state.query.mockResolvedValue([])
    state.run.mockReset()
    state.run.mockResolvedValue(undefined)
    state.updateActiveRemoteBalance.mockReset()
    state.updateActiveRemoteBalance.mockResolvedValue(undefined)
    state.activateRemoteSignerFromTransaction.mockReset()
    state.activateRemoteSignerFromTransaction.mockResolvedValue(undefined)
    state.updateRemoteSigner.mockReset()
    state.updateRemoteSigner.mockResolvedValue(undefined)
    state.upsertInactiveRemoteSigner.mockReset()
    state.upsertInactiveRemoteSigner.mockResolvedValue('added')
    state.blockHeightToTimestamp.mockReset()
    state.blockHeightToTimestamp.mockImplementation(async height => height * 1000)
    state.pendingHtlcCreationTransactions = []
    state.pendingPaymentTransactions = []
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

  it('persists local-to-remote recovery state before waiting for broadcast', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation()
    let resolveBroadcast!: (details: typeof plain) => void
    state.client.sendTransaction.mockReturnValue(new Promise<typeof plain>(resolve => resolveBroadcast = resolve))
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)

    const sendPromise = useTransactions().sendTx({ transfer: Transfer.LocalToRemote })
    await vi.waitFor(() => {
      expect(state.run).toHaveBeenCalledWith(SQLQuery.UpsertTx, expect.any(Array))
      expect(state.upsertInactiveRemoteSigner).toHaveBeenCalledWith(expect.objectContaining({
        active: false,
        balance: 0,
        address: expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }),
      }))
      expect(state.client.sendTransaction).toHaveBeenCalledTimes(1)
    })

    const upsertCall = state.run.mock.calls.find(call => call[0] === SQLQuery.UpsertTx)!
    expect(upsertCall).toBeDefined()
    expect((upsertCall[1] as unknown[]).at(-1)).toBe(plain.validityStartHeight)
    expect(state.run.mock.invocationCallOrder[state.run.mock.calls.indexOf(upsertCall)]).toBeLessThan(state.client.sendTransaction.mock.invocationCallOrder[0])
    expect(state.upsertInactiveRemoteSigner.mock.invocationCallOrder[0]).toBeLessThan(state.run.mock.invocationCallOrder[state.run.mock.calls.indexOf(upsertCall)])
    expect(state.upsertInactiveRemoteSigner.mock.invocationCallOrder[0]).toBeLessThan(state.client.sendTransaction.mock.invocationCallOrder[0])

    resolveBroadcast(plain)
    await sendPromise
  })

  it('persists extension recovery state before asking the cosigner to sign or broadcast', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { signedTx } = createSignedHtlcCreation('extension-hash')
    vi.mocked(getSignedTx).mockImplementation((async (_partialTx: unknown, options?: { beforeRemoteBroadcast?: (tx: unknown) => Promise<void> }) => {
      if (!options?.beforeRemoteBroadcast)
        return { data: undefined, error: 'Missing recovery hook' }

      await options.beforeRemoteBroadcast(signedTx)
      expect(state.upsertInactiveRemoteSigner).toHaveBeenCalledTimes(1)
      expect(state.run).toHaveBeenCalledWith(SQLQuery.UpsertTx, expect.any(Array))
      return { data: undefined, error: 'Cosigner response lost' }
    }) as any)

    const result = await useTransactions().sendTx({ transfer: Transfer.ExtendRemote } as any)

    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: 'extension-hash', status: 'pending' })
    expect(state.client.sendTransaction).not.toHaveBeenCalled()
    expect(state.pendingHtlcCreationTransactions).toEqual([
      expect.objectContaining({ transactionHash: 'extension-hash' }),
    ])
  })

  it('retains staged extension recovery when the cosigner request throws', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { signedTx } = createSignedHtlcCreation('extension-hash')
    vi.mocked(getSignedTx).mockImplementation((async (_partialTx: unknown, options?: { beforeRemoteBroadcast?: (tx: unknown) => Promise<void> }) => {
      await options!.beforeRemoteBroadcast!(signedTx)
      throw new Error('connection closed')
    }) as any)

    const result = await useTransactions().sendTx({ transfer: Transfer.ExtendRemote } as any)

    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: 'extension-hash', status: 'pending' })
    expect(state.client.sendTransaction).not.toHaveBeenCalled()
    expect(state.pendingHtlcCreationTransactions).toEqual([
      expect.objectContaining({ transactionHash: 'extension-hash' }),
    ])
  })

  it('retains the staged extension when the cosigner response changes its transaction', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const staged = createSignedHtlcCreation('staged-extension-hash')
    const changed = createSignedHtlcCreation('changed-extension-hash')
    vi.mocked(getSignedTx).mockImplementation((async (_partialTx: unknown, options?: { beforeRemoteBroadcast?: (tx: unknown) => Promise<void> }) => {
      await options!.beforeRemoteBroadcast!(staged.signedTx)
      return { data: { signedTx: changed.signedTx, txSent: true }, error: undefined }
    }) as any)

    const result = await useTransactions().sendTx({ transfer: Transfer.ExtendRemote } as any)

    expect(result.error).toBeUndefined()
    expect(result.data?.tx).toMatchObject({ hash: 'staged-extension-hash', status: 'pending' })
    expect(state.client.sendTransaction).not.toHaveBeenCalled()
    expect(state.pendingHtlcCreationTransactions).toEqual([
      expect.objectContaining({ transactionHash: 'staged-extension-hash' }),
    ])
  })

  it('aborts broadcast and releases the send lock when recovery persistence fails', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { signedTx } = createSignedHtlcCreation()
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.upsertInactiveRemoteSigner.mockRejectedValue(new Error('database unavailable'))

    await expect(useTransactions().sendTx({ transfer: Transfer.LocalToRemote })).rejects.toThrow('database unavailable')

    expect(state.client.sendTransaction).not.toHaveBeenCalled()
    expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpsertTx, expect.any(Array))
    expect(state.isSendingTx).toBe(false)
  })

  it('activates a successfully included local-to-remote HTLC without waiting for server discovery', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation()
    const included = { ...plain, state: 'included' }
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockResolvedValue(included as any)

    await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

    expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(included)
    expect(state.pendingHtlcCreationTransactions).toEqual([included])
  })

  it('keeps a pending local-to-remote HTLC inactive until the chain includes it', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation()
    const pending = { ...plain, state: 'pending' }
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockResolvedValue(pending as any)

    await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

    expect(state.activateRemoteSignerFromTransaction).not.toHaveBeenCalled()
    expect(state.pendingHtlcCreationTransactions).toEqual([pending])
  })

  it.each([
    { transfer: Transfer.LocalToRemote, outcome: { state: 'invalidated' } },
    { transfer: Transfer.LocalToRemote, outcome: { state: 'included', executionResult: false } },
    { transfer: Transfer.ExtendRemote, outcome: { state: 'invalidated' } },
    { transfer: Transfer.ExtendRemote, outcome: { state: 'included', executionResult: false } },
  ])('clears a rejected $transfer from pending recovery after $outcome', async ({ transfer, outcome }) => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation()
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockResolvedValue({ ...plain, ...outcome } as any)

    const result = await useTransactions().sendTx({ transfer } as any)

    expect(result.error).toBeTruthy()
    expect(state.run).toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, ['failed', plain.timestamp, plain.transactionHash])
    expect(state.pendingHtlcCreationTransactions).toEqual([])
    expect(state.isSendingTx).toBe(false)
    expect(state.upsertInactiveRemoteSigner).toHaveBeenCalledTimes(1)
    expect(state.activateRemoteSignerFromTransaction).not.toHaveBeenCalled()
    expect(state.updateRemoteSigner).not.toHaveBeenCalled()
  })

  it.each([false, true])('preserves other pending HTLCs after rejection (already removed: %s)', async (alreadyRemoved) => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation()
    const otherPending = createSignedHtlcCreation('other-pending-hash').plain
    state.pendingHtlcCreationTransactions.push(otherPending)
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockImplementation(async () => {
      if (alreadyRemoved) {
        const index = state.pendingHtlcCreationTransactions.findIndex(tx => tx.transactionHash === plain.transactionHash)
        state.pendingHtlcCreationTransactions.splice(index, 1)
      }
      return { ...plain, state: 'invalidated' }
    })

    const result = await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

    expect(result.error).toBeTruthy()
    expect(state.pendingHtlcCreationTransactions).toEqual([otherPending])
  })

  it.each([Transfer.LocalToRemote, Transfer.ExtendRemote])('broadcasts %s only once', async (transfer) => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation(`${transfer}-hash`)
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockResolvedValue(plain as any)

    await useTransactions().sendTx({ transfer } as any)

    expect(state.client.sendTransaction).toHaveBeenCalledTimes(1)
  })

  it('does not rebroadcast when listener details already exist', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation()
    const observed = { ...plain, state: 'pending' }
    state.pendingPaymentTransactions = [observed]
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)

    await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

    expect(state.client.sendTransaction).not.toHaveBeenCalled()
    expect(state.pendingHtlcCreationTransactions).toEqual([observed])
  })

  it('tracks an extension already broadcast by the cosigner until the chain includes it', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation('extension-hash')
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: true }, error: undefined } as any)

    await useTransactions().sendTx({ transfer: Transfer.ExtendRemote } as any)

    expect(state.client.sendTransaction).not.toHaveBeenCalled()
    expect(state.activateRemoteSignerFromTransaction).not.toHaveBeenCalled()
    expect(state.pendingHtlcCreationTransactions).toEqual([plain])
  })

  it('releases the send lock and retains recovery state when broadcasting never settles', async () => {
    vi.useFakeTimers()
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { plain, signedTx } = createSignedHtlcCreation()
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockReturnValue(new Promise(() => {}))

    let settled = false
    void useTransactions().sendTx({ transfer: Transfer.LocalToRemote }).then(() => settled = true)
    await vi.waitFor(() => expect(state.client.sendTransaction).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(30_000)

    expect(settled).toBe(true)
    expect(state.isSendingTx).toBe(false)
    expect(state.pendingHtlcCreationTransactions).toEqual([
      expect.objectContaining({ transactionHash: plain.transactionHash }),
    ])
    vi.useRealTimers()
  })

  it('keeps staged recovery state when the broadcast result is unknown', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { signedTx } = createSignedHtlcCreation()
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockRejectedValue(new Error('connection closed'))

    const result = await useTransactions().sendTx({ transfer: Transfer.LocalToRemote })

    expect(result.data?.tx).toMatchObject({ hash: 'creation-hash', status: 'pending' })
    expect(state.run).toHaveBeenCalledWith(SQLQuery.UpsertTx, expect.any(Array))
    expect(state.upsertInactiveRemoteSigner).toHaveBeenCalledTimes(1)
    expect(state.run).not.toHaveBeenCalledWith(SQLQuery.UpdateTxStatus, expect.any(Array))
    expect(state.pendingHtlcCreationTransactions).toEqual([
      expect.objectContaining({ transactionHash: 'creation-hash' }),
    ])
  })

  it('keeps staged extension recovery state when the broadcast result is unknown', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    const { signedTx } = createSignedHtlcCreation('extension-hash')
    vi.mocked(getSignedTx).mockResolvedValue({ data: { signedTx, txSent: false }, error: undefined } as any)
    state.client.sendTransaction.mockRejectedValue(new Error('connection closed'))

    const result = await useTransactions().sendTx({ transfer: Transfer.ExtendRemote } as any)

    expect(result.error).toBeUndefined()
    expect(state.run).toHaveBeenCalledWith(SQLQuery.UpsertTx, expect.any(Array))
    expect(state.upsertInactiveRemoteSigner).toHaveBeenCalledTimes(1)
    expect(state.pendingHtlcCreationTransactions).toEqual([
      expect.objectContaining({ transactionHash: 'extension-hash' }),
    ])
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
