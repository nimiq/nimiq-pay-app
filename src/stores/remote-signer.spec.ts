import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, shallowReactive } from 'vue'

function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
    equals: (other?: { toUserFriendlyAddress: () => string }) => other?.toUserFriendlyAddress() === value,
  }
}

function createHtlcCreation(overrides: Record<string, unknown> = {}) {
  return {
    transactionHash: 'creation-hash',
    state: 'confirmed',
    executionResult: true,
    sender: 'NQ00 TEST LOCAL ADDRESS',
    senderType: 'basic',
    recipient: 'NQ22 TEST OLD HTLC ADDRESS',
    recipientType: 'htlc',
    value: 696_900_000,
    flags: 1,
    timestamp: 123_100,
    validityStartHeight: 100,
    data: {
      type: 'htlc',
      sender: 'NQ00 TEST LOCAL ADDRESS',
      recipient: 'NQ99 COSIGNER ADDRESS',
      timeout: 999_500,
    },
    ...overrides,
  }
}

function createLiveHtlcAccount(overrides: Record<string, unknown> = {}) {
  return {
    type: 'htlc',
    balance: 696_900_000,
    sender: 'NQ00 TEST LOCAL ADDRESS',
    recipient: 'NQ99 COSIGNER ADDRESS',
    timeout: 999_500,
    hashRoot: '00'.repeat(32),
    hashAlgorithm: 'sha256',
    hashCount: 1,
    totalAmount: 696_900_000,
    ...overrides,
  }
}

function createRemoteSignerApiData(address = 'NQ22 TEST OLD HTLC ADDRESS', overrides: Record<string, unknown> = {}) {
  return {
    address,
    balance: 696_900_000,
    servicePublicKey: 'service-public-key',
    serviceSignatureProofSize: 98,
    validityStart: 110,
    validityEnd: 999_500,
    creatingTransactionHash: 'creation-hash',
    ...overrides,
  }
}

const rawState = vi.hoisted(() => {
  const getBalance = vi.fn(() => Promise.resolve({ data: 0, error: undefined }))
  const getAccount = vi.fn((_address?: ReturnType<typeof createAddress>): Promise<{ data: any, error: any }> => Promise.resolve({ data: undefined, error: 'No account found' }))
  const getHtlcCreationData = vi.fn((): Promise<any> => Promise.resolve(undefined))
  const getAccounts = vi.fn((): Promise<{
    data: { type: string, balance: number }[] | undefined
    error: Error | undefined
  }> => Promise.resolve({ data: [], error: undefined }))
  const getStatus = vi.fn(() => Promise.resolve({
    data: {
      status: 'good',
      blockHeight: 128,
      servicePublicKey: 'service-public-key',
      network: 'TestAlbatross',
    },
    error: undefined,
    hasError: false,
    status: 200,
  }))
  const getRemoteSigner = vi.fn((): Promise<unknown> => Promise.resolve({
    data: undefined,
    error: { message: 'not found', statusCode: 404, error: 'NOT_FOUND' },
    hasError: true,
    status: 404,
  }))
  const query = vi.fn((_sql: string, _params?: unknown[], options?: { single?: boolean }): Promise<unknown[] | unknown | undefined> => Promise.resolve(options?.single ? undefined : []))
  const run = vi.fn((): Promise<any> => Promise.resolve())
  const runSet = vi.fn((): Promise<any> => Promise.resolve())
  const updateTransactionStatus = vi.fn(async (_update: any) => undefined)
  const reconnect = vi.fn((): Promise<void> => Promise.resolve())
  const createHistoryClient = vi.fn((): Promise<any> => Promise.resolve({
    getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
    disconnectNetwork: vi.fn(() => Promise.resolve()),
  }))
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  return {
    localAddress: createAddress('NQ00 TEST LOCAL ADDRESS'),
    hasLocalWallet: true,
    client: {
      waitForConsensusEstablished: vi.fn(() => Promise.resolve()),
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
      getTransaction: vi.fn(() => Promise.resolve(undefined)),
      addHeadChangedListener: vi.fn(() => 1),
      removeListener: vi.fn(),
    } as any,
    height: 128,
    headTimestamp: 123_456,
    networkName: 'testalbatross',
    consensus: 'established' as 'connecting' | 'established',
    isProcessingRemote: false,
    getBalance,
    getAccount,
    getAccounts,
    getHtlcCreationData,
    getStatus,
    getRemoteSigner,
    query,
    run,
    runSet,
    updateTransactionStatus,
    reconnect,
    createHistoryClient,
    logger,
  }
})
const state = shallowReactive(rawState)

function mockAddressSpecificSignerMetadata(...transactions: any[]) {
  state.getRemoteSigner.mockImplementation(({ address }: { address: ReturnType<typeof createAddress> } = { address: createAddress('') }) => {
    const transaction = transactions.find(tx => tx.recipient === address.toUserFriendlyAddress())
    if (!transaction) {
      return Promise.resolve({
        data: undefined,
        error: { message: 'not found', statusCode: 404, error: 'NOT_FOUND' },
        hasError: true,
        status: 404,
      })
    }
    const publicKey = transaction.data.recipient === 'NQ97 COSIGNER A ADDRESS'
      ? 'service-public-key-a'
      : transaction.data.recipient === 'NQ98 COSIGNER B ADDRESS'
        ? 'service-public-key-b'
        : 'service-public-key'
    return Promise.resolve({
      data: createRemoteSignerApiData(transaction.recipient, {
        creatingTransactionHash: transaction.transactionHash,
        servicePublicKey: publicKey,
        validityStart: transaction.validityStartHeight + 10,
        validityEnd: transaction.data.timeout,
      }),
      error: undefined,
      hasError: false,
      status: 200,
    })
  })
  state.client.getAccount = vi.fn((address: string) => {
    const transaction = transactions.find(tx => tx.recipient === address)
    return Promise.resolve(transaction
      ? createLiveHtlcAccount({ balance: transaction.value, timeout: transaction.data.timeout, sender: transaction.data.sender, recipient: transaction.data.recipient })
      : { type: 'basic', balance: 0 })
  })
  state.client.getTransaction.mockImplementation((hash: string) => Promise.resolve(
    transactions.find(transaction => transaction.transactionHash === hash),
  ))
}

// Makes the DB return one active remote signer (balance 25) for `single` queries.
function mockActiveSignerQuery() {
  state.query.mockImplementation(((_sql: string, _params?: unknown[], options?: { single?: boolean }) => {
    if (options?.single) {
      return Promise.resolve({
        active: true,
        balance: 25,
        end: 999999,
        proofSize: 98,
        publicKey: 'service-public-key',
        start: 123_000,
        address: 'NQ11 TEST REMOTE ADDRESS',
      })
    }
    return Promise.resolve([])
  }) as any)
}

// Makes the DB return one active remote signer whose validity window has already passed
// (end 100_000 < headTimestamp 123_456), with the given balance.
function mockExpiredSignerQuery(balance: number) {
  state.query.mockImplementation(((_sql: string, _params?: unknown[], options?: { single?: boolean }) => {
    if (options?.single) {
      return Promise.resolve({
        active: true,
        balance,
        end: 100_000,
        proofSize: 98,
        publicKey: 'service-public-key',
        start: 90_000,
        address: 'NQ11 TEST REMOTE ADDRESS',
      })
    }
    return Promise.resolve([])
  }) as any)
}

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/stores/conn', () => {
  const useConn = defineStore('conn', () => ({
    query: state.query,
    run: state.run,
    runSet: state.runSet,
  }))

  return { useConn }
})

vi.mock('@/stores/local-wallet', () => {
  const useLocalWallet = defineStore('local-wallet', () => ({
    localAddress: ref(state.localAddress),
    hasLocalWallet: computed(() => state.hasLocalWallet),
  }))

  return { useLocalWallet }
})

vi.mock('@/composables/useToast', () => ({ useToast: () => ({ setToast: vi.fn() }) }))
vi.mock('@/stores/app', () => ({
  useApp: defineStore('app', () => ({ htlcThreshold: ref(0) })),
}))
vi.mock('@/stores/transactions', () => ({
  useTransactions: defineStore('transactions', () => ({
    sendTx: vi.fn(),
    updateTransactionStatus: state.updateTransactionStatus,
  })),
}))

vi.mock('@/stores/locks', () => {
  const useLocks = defineStore('locks', () => ({
    isSendingTx: ref(false),
    htlcCheckLock: ref(false),
    isProcessingRemote: computed({
      get: () => state.isProcessingRemote,
      set: value => state.isProcessingRemote = value,
    }),
  }))

  return { useLocks }
})

vi.mock('@/stores/nimiq-network', () => {
  const useNimiqNetwork = defineStore('nimiq-network', () => ({
    getAccount: state.getAccount,
    getAccounts: state.getAccounts,
    getHtlcCreationData: state.getHtlcCreationData,
    getBalance: state.getBalance,
    reconnect: state.reconnect,
    createHistoryClient: state.createHistoryClient,
    client: computed(() => state.client),
    height: computed(() => state.height),
    headTimestamp: computed(() => state.headTimestamp),
    networkName: computed(() => state.networkName),
    consensus: computed(() => state.consensus),
  }))

  return { NO_ACCOUNT_ERROR: 'No account found', useNimiqNetwork }
})

vi.mock('@/composables/useApi', () => ({
  RemoteStatus: {
    Unknown: 'unknown',
    Good: 'good',
  },
  useRemoteSignerApi: () => ({
    getStatus: state.getStatus,
    getRemoteSigner: state.getRemoteSigner,
  }),
}))

describe('useRemoteSigner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    vi.stubGlobal('Nimiq', {
      Address: {
        fromUserFriendlyAddress: (value: string) => createAddress(value),
        fromString: (value: string) => {
          if (value === 'malformed')
            throw new Error('Invalid address')
          return createAddress(value)
        },
      },
      PublicKey: {
        fromHex: (value: string) => {
          if (value === 'malformed-key')
            throw new Error('Invalid public key')
          const address = value === 'service-public-key'
            ? 'NQ99 COSIGNER ADDRESS'
            : value === 'service-public-key-a'
              ? 'NQ97 COSIGNER A ADDRESS'
              : 'NQ98 COSIGNER B ADDRESS'
          return { toAddress: () => createAddress(address) }
        },
      },
      Policy: {
        BLOCKS_PER_BATCH: 32,
      },
    })

    state.localAddress = createAddress('NQ00 TEST LOCAL ADDRESS')
    state.hasLocalWallet = true
    state.client = {
      getAccount: vi.fn(() => Promise.resolve(createLiveHtlcAccount())),
      waitForConsensusEstablished: vi.fn(() => Promise.resolve()),
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
      getTransaction: vi.fn(() => Promise.resolve(undefined)),
      addHeadChangedListener: vi.fn(() => 1),
      removeListener: vi.fn(),
    }
    state.height = 128
    state.headTimestamp = 123_456
    state.networkName = 'testalbatross'
    state.consensus = 'established'
    state.isProcessingRemote = true

    state.getBalance.mockReset()
    state.getBalance.mockResolvedValue({ data: 0, error: undefined })
    state.getAccount.mockReset()
    state.getAccount.mockResolvedValue({ data: undefined, error: 'No account found' })
    state.getHtlcCreationData.mockReset()
    state.getAccounts.mockReset()
    state.getAccounts.mockResolvedValue({ data: [], error: undefined })
    state.getStatus.mockReset()
    state.getStatus.mockResolvedValue({
      data: {
        status: 'good',
        blockHeight: 128,
        servicePublicKey: 'service-public-key',
        network: 'TestAlbatross',
      },
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.getRemoteSigner.mockReset()
    state.getRemoteSigner.mockResolvedValue({
      data: undefined,
      error: { message: 'not found', statusCode: 404, error: 'NOT_FOUND' },
      hasError: true,
      status: 404,
    })
    state.query.mockReset()
    state.query.mockImplementation((_sql: string, _params?: unknown[], options?: { single?: boolean }) => Promise.resolve(options?.single ? undefined : []))
    state.run.mockReset()
    state.run.mockResolvedValue({ changes: { changes: 1 } } as any)
    state.runSet.mockReset()
    state.runSet.mockResolvedValue({ changes: { changes: 1 } } as any)
    state.updateTransactionStatus.mockReset()
    state.updateTransactionStatus.mockResolvedValue(undefined)
    state.reconnect.mockReset()
    state.reconnect.mockResolvedValue(undefined)
    state.createHistoryClient.mockReset()
    state.createHistoryClient.mockResolvedValue({
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    })
    state.logger.log.mockReset()
    state.logger.warn.mockReset()
    state.logger.error.mockReset()
  })

  it('finishes discovery when the latest cosigner creation lookup stalls', async () => {
    vi.useFakeTimers()
    try {
      state.getRemoteSigner.mockResolvedValue({ data: createRemoteSignerApiData(), error: undefined, hasError: false, status: 200 })
      state.client.getTransaction.mockReturnValue(new Promise(() => {}))
      const { useRemoteSigner } = await import('./remote-signer')
      let result: unknown
      void useRemoteSigner().discoverRemoteSignersFromBlockchain().then(value => result = value)

      await vi.advanceTimersByTimeAsync(30_001)

      expect(result).toMatchObject({ localComplete: true })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('stops estimating block time when neither height source becomes available', async () => {
    vi.useFakeTimers()
    try {
      state.consensus = 'connecting'
      state.getStatus.mockResolvedValue({ data: undefined, error: { message: 'offline' }, hasError: true, status: 504 } as any)
      const { useRemoteSigner } = await import('./remote-signer')
      let error: unknown
      void useRemoteSigner().blockHeightToTimestamp(100).catch(value => error = value)

      await vi.advanceTimersByTimeAsync(30_001)

      expect(error).toBeDefined()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('does not hydrate an obsolete signer after a concurrent activation', async () => {
    const { SQLQuery } = await import('@/lib/sql-queries')
    let finishRead!: (row: unknown) => void
    state.query.mockImplementation((query, _params, options) => query === SQLQuery.GetActiveRemoteSigner
      ? new Promise(resolve => finishRead = resolve)
      : Promise.resolve(options?.single ? undefined : []))
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const initialization = store.init()
    await vi.waitFor(() => expect(finishRead).toBeDefined())
    await store.updateRemoteSigner({
      address: createAddress('NQ22 NEW HTLC ADDRESS') as any,
      active: true,
      balance: 50,
      start: 2,
      end: 999_999,
      publicKey: 'service-public-key',
      proofSize: 98,
    })
    finishRead({ address: 'NQ11 OLD HTLC ADDRESS', active: true, balance: 25, start: 1, end: 999_999, publicKey: 'service-public-key', proofSize: 98 })

    await initialization

    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ22 NEW HTLC ADDRESS')
    expect(store.remoteBalance).toBe(50)
  })

  it('finishes initialization when a signer balance batch stalls', async () => {
    vi.useFakeTimers()
    try {
      mockActiveSignerQuery()
      state.query.mockImplementation((_sql, _params, options) => Promise.resolve(options?.single
        ? { address: 'NQ11 TEST REMOTE ADDRESS', active: true, balance: 25, start: 1, end: 999_999, publicKey: 'service-public-key', proofSize: 98 }
        : [{ address: 'NQ11 TEST REMOTE ADDRESS', active: true, balance: 25, start: 1, end: 999_999, publicKey: 'service-public-key', proofSize: 98 }]))
      state.client.getAccounts = vi.fn(() => new Promise(() => {}))
      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      let initialized = false
      void store.init().then(() => initialized = true)

      await vi.advanceTimersByTimeAsync(30_001)

      expect(initialized).toBe(true)
      expect(store.remoteBalance).toBe(25)
      expect(state.client.addHeadChangedListener).toHaveBeenCalledOnce()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('resolves first-account zero-balance state after consensus and no HTLC history', async () => {
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.resolveHomeBalanceState()

    expect(store.homeBalanceState).toBe('resolved-empty')
    expect(store.remoteBalance).toBe(0)
    expect(state.isProcessingRemote).toBe(false)
  })

  it('bounds the home balance history lookup and stops waiting after timeout', async () => {
    vi.useFakeTimers()
    state.client.getTransactionsByAddress = vi.fn(() => new Promise(() => {}))

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    let settled = false
    void store.resolveHomeBalanceState().then(() => settled = true)

    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(30_000)

    expect(state.client.getTransactionsByAddress).toHaveBeenCalledWith(state.localAddress, undefined, undefined, undefined, 100)
    expect(settled).toBe(true)
    expect(store.homeBalanceState).toBe('loading')
    vi.useRealTimers()
  })

  it('keeps the home balance in loading state before consensus is established', async () => {
    state.consensus = 'connecting'

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.resolveHomeBalanceState()

    expect(store.homeBalanceState).toBe('loading')
  })

  it('resolves as remote when an HTLC transaction exists for the local account', async () => {
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([
      { recipientType: 'htlc' },
    ]))

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.resolveHomeBalanceState()

    expect(store.homeBalanceState).toBe('resolved-remote')
  })

  it('resolves as remote without consensus when an HTLC signer is already known', async () => {
    state.consensus = 'connecting'
    mockActiveSignerQuery()

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    await store.resolveHomeBalanceState()

    expect(store.homeBalanceState).toBe('resolved-remote')
    expect(store.remoteBalance).toBe(25)
  })

  it('retains the last known balance after the active signer is cleared for a drain', async () => {
    mockActiveSignerQuery()

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    await nextTick()
    expect(store.lastKnownRemoteBalance).toBe(25)

    await store.updateRemoteSigner(undefined)
    await nextTick()

    expect(store.remoteBalance).toBe(0)
    expect(store.lastKnownRemoteBalance).toBe(25)
  })

  // An expired-but-drained signer is inert: nothing to recover, so it must not drive the
  // "Updating connection" recovery UI even though its validity window has passed.
  it('does not flag an expired HTLC as expired when it holds no balance to recover', async () => {
    state.consensus = 'connecting'
    mockExpiredSignerQuery(0)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    await nextTick()

    expect(store.remoteBalance).toBe(0)
    expect(store.hasHtlcExpired).toBeFalsy()
  })

  it('flags an expired HTLC as expired when it still holds a balance to recover', async () => {
    state.consensus = 'connecting'
    mockExpiredSignerQuery(25)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    await nextTick()

    expect(store.remoteBalance).toBe(25)
    expect(store.hasHtlcExpired).toBe(true)
  })

  it('keeps loading when the local account already has main-address funds', async () => {
    state.getBalance.mockResolvedValue({ data: 42, error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.resolveHomeBalanceState()

    expect(store.homeBalanceState).toBe('loading')
  })

  it('discards home balance results after the wallet changes', async () => {
    let resolveBalance!: (result: { data: number, error: undefined }) => void
    state.getBalance.mockImplementation(() => new Promise(resolve => resolveBalance = resolve))
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const resolution = store.resolveHomeBalanceState()
    await vi.waitFor(() => expect(state.getBalance).toHaveBeenCalledOnce())

    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    resolveBalance({ data: 0, error: undefined })
    await resolution

    expect(store.homeBalanceState).toBe('loading')
    expect(state.isProcessingRemote).toBe(true)
  })

  it('activates a signer from accepted HTLC creation details', async () => {
    const creation = createHtlcCreation({ state: 'included' })
    mockAddressSpecificSignerMetadata(creation)
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))

    await store.activateRemoteSignerFromTransaction(creation as any)

    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe(creation.recipient)
    expect(store.remoteBalance).toBe(696_900_000)
    expect(state.runSet).toHaveBeenCalledWith([
      { statement: expect.any(String), values: [] },
      {
        statement: expect.any(String),
        values: [creation.recipient, 696_900_000, 98, 'service-public-key', 123_100, 999_500, true],
      },
    ])
  })

  it.each(['included', 'confirmed'])('uses live balance for direct %s creation activation', async (status) => {
    const creation = createHtlcCreation({ state: status })
    mockAddressSpecificSignerMetadata(creation)
    state.client.getAccount.mockResolvedValue(createLiveHtlcAccount({ balance: 7 }))
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.activateRemoteSignerFromTransaction(creation as any)

    expect(store.remoteBalance).toBe(7)
    expect(state.runSet).toHaveBeenCalledWith([
      { statement: expect.any(String), values: [] },
      { statement: expect.any(String), values: [creation.recipient, 7, 98, 'service-public-key', 123_100, 999_500, true] },
    ])
  })

  it.each(['none', 'same', 'successor'])('resolves a drained confirmed creation with %s signer active', async (active) => {
    const creation = createHtlcCreation()
    mockAddressSpecificSignerMetadata(creation)
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    if (active !== 'none') {
      await store.updateRemoteSigner({
        active: true,
        address: createAddress(active === 'same' ? creation.recipient : 'NQ23 SUCCESSOR'),
        balance: 7,
        end: 999_500,
        proofSize: 98,
        publicKey: 'service-public-key',
        start: 123_100,
      } as any, store.getWalletContext()!)
    }
    state.runSet.mockClear()
    state.client.getAccount.mockResolvedValue({ type: 'basic', balance: 0 })

    await store.activateRemoteSignerFromTransaction(creation as any)

    expect(store.remoteBalance).toBe(active === 'successor' ? 7 : 0)
    if (active === 'successor')
      expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ23 SUCCESSOR')
    if (active !== 'same')
      expect(state.runSet).not.toHaveBeenCalled()
  })

  it.each([
    { type: 'basic', balance: 0 },
    createLiveHtlcAccount({ balance: 0 }),
    createLiveHtlcAccount({ balance: -1 }),
    createLiveHtlcAccount({ timeout: 1 }),
    createLiveHtlcAccount({ sender: 'NQ23 FOREIGN' }),
  ])('retains included activation when account is unavailable: %j', async (account) => {
    const creation = createHtlcCreation({ state: 'included' })
    mockAddressSpecificSignerMetadata(creation)
    state.client.getAccount.mockResolvedValue(account)
    const { useRemoteSigner } = await import('./remote-signer')

    await expect(useRemoteSigner().activateRemoteSignerFromTransaction(creation as any)).rejects.toThrow('account is unavailable')
    expect(state.runSet).not.toHaveBeenCalled()
  })

  it('keeps reconciliation pending when the shared live-account read fails', async () => {
    const creation = createHtlcCreation()
    mockAddressSpecificSignerMetadata(creation)
    state.client.getAccount.mockRejectedValue(new Error('offline'))
    const { useSyncState } = await import('./sync/state')
    const { useSyncHtlc } = await import('./sync/htlc')
    const sync = useSyncState()
    sync.pendingHtlcCreationTransactions.push({ ...creation, state: 'pending' } as any)

    await useSyncHtlc().checkHtlcState()

    expect(sync.pendingHtlcCreationTransactions).toHaveLength(1)
    expect(state.runSet).not.toHaveBeenCalled()
    expect(state.updateTransactionStatus).not.toHaveBeenCalled()
  })

  it('resolves a drained history-only creation even when activation metadata is unavailable', async () => {
    const creation = createHtlcCreation()
    state.client.getTransaction.mockRejectedValue(new Error('not found'))
    state.client.getTransactionsByAddress.mockResolvedValue([creation])
    state.client.getAccount.mockResolvedValue({ type: 'basic', balance: 0 })
    const { useSyncState } = await import('./sync/state')
    const { useSyncHtlc } = await import('./sync/htlc')
    const sync = useSyncState()
    sync.pendingHtlcCreationTransactions.push({ ...creation, state: 'pending', validityStartHeight: null } as any)

    await useSyncHtlc().checkHtlcState()

    expect(sync.pendingHtlcCreationTransactions).toEqual([])
    expect(state.runSet).not.toHaveBeenCalled()
    expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: creation.transactionHash, status: 'confirmed', timestamp: creation.timestamp })
  })

  it('does not let delayed activation overwrite newer same-context signer state', async () => {
    const creation = createHtlcCreation({ state: 'included' })
    let finishMetadata!: (result: any) => void
    state.getRemoteSigner.mockReturnValueOnce(new Promise(resolve => finishMetadata = resolve))
    state.client.getTransaction.mockResolvedValue(creation)
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const activation = store.activateRemoteSignerFromTransaction(creation as any)
    await vi.waitFor(() => expect(state.getRemoteSigner).toHaveBeenCalledOnce())

    const newerSigner = {
      active: true,
      address: createAddress('NQ23 NEWER HTLC ADDRESS'),
      balance: 7,
      end: 999_600,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_200,
    }
    await store.updateRemoteSigner(newerSigner as any, store.getWalletContext()!)
    finishMetadata({
      data: createRemoteSignerApiData(creation.recipient),
      error: undefined,
      hasError: false,
      status: 200,
    })

    await expect(activation).rejects.toThrow('invalid HTLC transaction')
    expect(state.runSet).toHaveBeenCalledTimes(1)
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ23 NEWER HTLC ADDRESS')
    expect(store.remoteBalance).toBe(7)
  })

  it('retains the included barrier when signer state changes during account lookup', async () => {
    const creation = createHtlcCreation({ state: 'included' })
    mockAddressSpecificSignerMetadata(creation)
    let finishAccount!: (account: any) => void
    state.client.getAccount = vi.fn(() => new Promise(resolve => finishAccount = resolve))
    const { useRemoteSigner } = await import('./remote-signer')
    const { useSyncState } = await import('./sync/state')
    const { useSyncHtlc } = await import('./sync/htlc')
    const store = useRemoteSigner()
    const sync = useSyncState()
    sync.pendingHtlcCreationTransactions.push({ ...creation, state: 'pending' } as any)
    const reconciliation = useSyncHtlc().checkHtlcState()
    await vi.waitFor(() => expect(state.client.getAccount).toHaveBeenCalledOnce())

    await store.updateRemoteSigner({
      active: true,
      address: createAddress('NQ23 NEWER HTLC ADDRESS'),
      balance: 7,
      end: 999_600,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_200,
    } as any, store.getWalletContext()!)
    finishAccount(createLiveHtlcAccount())
    await reconciliation

    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ23 NEWER HTLC ADDRESS')
    expect(store.remoteBalance).toBe(7)
    expect(state.runSet).toHaveBeenCalledTimes(1)
    expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    expect(sync.pendingHtlcCreationTransactions.map(tx => tx.transactionHash)).toEqual([creation.transactionHash])
  })

  it('keeps native activation active when a balance write queues behind it', async () => {
    const { SQLQuery } = await import('@/lib/sql-queries')
    const creation = createHtlcCreation({ state: 'included' })
    mockAddressSpecificSignerMetadata(creation)
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.activateRemoteSignerFromTransaction(creation as any)
    let durableActive = true
    let durableBalance = creation.value
    let finishWrite!: () => void
    state.runSet.mockClear()
    state.runSet.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => finishWrite = resolve)
      durableActive = true
      durableBalance = creation.value
    })
    state.run.mockImplementation(async (...args: any[]) => {
      if (args[0] === SQLQuery.DeactivateRemoteSigners)
        durableActive = false
      if (args[0] === SQLQuery.UpdateRemoteBalance)
        durableBalance = args[1][0]
    })

    const activation = store.activateRemoteSignerFromTransaction(creation as any)
    const activationResult = activation.then(() => 'committed', () => 'rejected')
    await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledOnce())
    const balanceUpdate = store.updateActiveRemoteBalance(7)
    finishWrite()
    await Promise.all([activationResult, balanceUpdate])

    expect(durableActive).toBe(true)
    expect(durableBalance).toBe(7)
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe(creation.recipient)
    expect(store.remoteBalance).toBe(7)
    expect(await activationResult).toBe('committed')
    expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeactivateRemoteSigners)
  })

  it('keeps the successor activation last when queued during a native activation', async () => {
    const { SQLQuery } = await import('@/lib/sql-queries')
    const first = createHtlcCreation({ state: 'included' })
    const successor = createHtlcCreation({
      state: 'included',
      transactionHash: 'successor-hash',
      recipient: 'NQ23 SUCCESSOR HTLC ADDRESS',
      value: 7,
    })
    mockAddressSpecificSignerMetadata(first, successor)
    let finishWrite!: () => void
    state.runSet.mockImplementationOnce(() => new Promise<void>(resolve => finishWrite = resolve))
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const activation = store.activateRemoteSignerFromTransaction(first as any)
    await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledOnce())
    const nextActivation = store.activateRemoteSignerFromTransaction(successor as any)
    await vi.waitFor(() => expect(store.getSignerWriteRevision()).toBe(2))
    finishWrite()
    await Promise.all([activation, nextActivation])

    expect(state.runSet).toHaveBeenCalledTimes(2)
    expect(state.runSet.mock.calls[1]).toEqual([[
      { statement: SQLQuery.DeactivateRemoteSigners, values: [] },
      { statement: SQLQuery.InsertRemoteSigner, values: [successor.recipient, 7, 98, 'service-public-key', 123_100, 999_500, true] },
    ]])
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe(successor.recipient)
    expect(store.remoteBalance).toBe(7)
    expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeactivateRemoteSigners)
  })

  it.each([101, 110])('accepts cosigner activation height %s independently of creation validity height', async (validityStart) => {
    const creation = createHtlcCreation()
    mockAddressSpecificSignerMetadata(creation)
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient, { validityStart }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.activateRemoteSignerFromTransaction(creation as any)

    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe(creation.recipient)
    expect(store.remoteBalance).toBe(696_900_000)
  })

  it.each(['cosigner', 'chain'])('releases discovery after a stalled %s metadata lookup', async (source) => {
    vi.useFakeTimers()
    try {
      const creation = createHtlcCreation()
      mockAddressSpecificSignerMetadata(creation)
      state.client.getTransactionsByAddress.mockResolvedValue([creation])
      if (source === 'cosigner')
        state.getRemoteSigner.mockReturnValue(new Promise(() => {}))
      else
        state.client.getTransaction.mockReturnValue(new Promise(() => {}))
      const { useRemoteSigner } = await import('./remote-signer')
      let result: unknown
      void useRemoteSigner().discoverRemoteSignersFromBlockchain().then(value => result = value)

      await vi.advanceTimersByTimeAsync(30_001)

      expect(result).toMatchObject({ localComplete: false, added: 0 })
      expect(state.run).not.toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('activates a historical signer with metadata for its exact address after key rotation', async () => {
    const creation = createHtlcCreation({
      data: {
        type: 'htlc',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ97 COSIGNER A ADDRESS',
        timeout: 999_500,
      },
    })
    state.getStatus.mockResolvedValue({
      data: {
        status: 'good',
        blockHeight: 128,
        servicePublicKey: 'service-public-key-b',
        network: 'TestAlbatross',
      },
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient, {
        servicePublicKey: 'service-public-key-a',
        serviceSignatureProofSize: 96,
      }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getAccount.mockResolvedValue(createLiveHtlcAccount({ recipient: creation.data.recipient }))
    state.client.getTransaction.mockResolvedValue(creation)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.activateRemoteSignerFromTransaction(creation as any)

    expect(state.runSet).toHaveBeenCalledWith([
      { statement: expect.any(String), values: [] },
      {
        statement: expect.any(String),
        values: [creation.recipient, 696_900_000, 96, 'service-public-key-a', 123_100, 999_500, true],
      },
    ])
  })

  it('rejects activation when historical address metadata names another creation transaction', async () => {
    const creation = createHtlcCreation()
    const historicalCreation = createHtlcCreation({ transactionHash: 'other-creation-hash' })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient, {
        creatingTransactionHash: historicalCreation.transactionHash,
      }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(historicalCreation)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await expect(store.activateRemoteSignerFromTransaction(creation as any)).rejects.toThrow('invalid HTLC transaction')
    expect(state.runSet).not.toHaveBeenCalled()
  })

  it('deactivates the exact signer and clears its balance in one batch', async () => {
    const childAddress = createAddress('NQ22 TEST CHILD HTLC ADDRESS')
    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.updateRemoteSigner({
      active: true,
      address: childAddress,
      balance: 25,
      end: 999_500,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_100,
    } as any)
    state.runSet.mockClear()
    const context = store.getWalletContext()!

    await expect(store.deactivateRemoteSigner(childAddress as any, context, true)).resolves.toBe(true)

    expect(state.runSet).toHaveBeenCalledWith([
      { statement: SQLQuery.UpdateRemoteBalance, values: [0, 'NQ22 TEST CHILD HTLC ADDRESS'] },
      { statement: SQLQuery.DeactivateRemoteSigner, values: ['NQ22 TEST CHILD HTLC ADDRESS'] },
    ])
    expect(store.remoteAddress).toBeUndefined()
    expect(store.remoteBalance).toBe(0)
    expect(store.homeBalanceState).toBe('loading')
  })

  it('deactivates only the requested address without clearing another active signer', async () => {
    const activeAddress = createAddress('NQ11 TEST ACTIVE HTLC ADDRESS')
    const otherAddress = createAddress('NQ22 TEST OTHER HTLC ADDRESS')
    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.updateRemoteSigner({
      active: true,
      address: activeAddress,
      balance: 25,
      end: 999_500,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_100,
    } as any)
    state.run.mockClear()

    await expect(store.deactivateRemoteSigner(otherAddress as any)).resolves.toBe(true)

    expect(state.run).toHaveBeenCalledWith(SQLQuery.DeactivateRemoteSigner, ['NQ22 TEST OTHER HTLC ADDRESS'])
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ11 TEST ACTIVE HTLC ADDRESS')
    expect(store.remoteBalance).toBe(25)
  })

  it('does not clear signer state when the wallet context changes during exact deactivation', async () => {
    let finishWrite!: (result: any) => void
    const childAddress = createAddress('NQ22 TEST CHILD HTLC ADDRESS')
    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.updateRemoteSigner({
      active: true,
      address: childAddress,
      balance: 25,
      end: 999_500,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_100,
    } as any)
    state.runSet.mockClear()
    state.run.mockClear()
    state.query.mockResolvedValue({
      address: 'NQ22 TEST CHILD HTLC ADDRESS',
      balance: 25,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_100,
      end: 999_500,
      active: 1,
    })
    state.runSet.mockImplementationOnce(() => new Promise(resolve => finishWrite = resolve))
    const context = store.getWalletContext()!

    const deactivation = store.deactivateRemoteSigner(childAddress as any, context, true)
    await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledOnce())
    useSyncState().walletContextGeneration += 1
    finishWrite({ changes: { changes: 1 } })

    await expect(deactivation).resolves.toBe(false)
    expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertRemoteSigner, [
      'NQ22 TEST CHILD HTLC ADDRESS',
      25,
      98,
      'service-public-key',
      123_100,
      999_500,
      1,
    ])
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ22 TEST CHILD HTLC ADDRESS')
    expect(store.remoteBalance).toBe(25)
  })

  it('suppresses activation for a stale expected wallet context', async () => {
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))
    const expectedContext = store.getWalletContext()!
    useSyncState().walletContextGeneration += 1

    await expect(store.activateRemoteSignerFromTransaction(createHtlcCreation() as any, expectedContext)).rejects.toThrow('invalid HTLC transaction')

    expect(state.runSet).not.toHaveBeenCalled()
  })

  it('does not finish a signer DB write after the wallet context changes', async () => {
    let finishWrite!: (result: any) => void
    const creation = createHtlcCreation()
    mockAddressSpecificSignerMetadata(creation)
    state.runSet.mockImplementationOnce(() => new Promise(resolve => finishWrite = resolve))
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))

    const activation = store.activateRemoteSignerFromTransaction(createHtlcCreation() as any)
    await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledOnce())
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    state.networkName = 'mainalbatross'
    finishWrite({ changes: { changes: 1 } })
    await activation

    expect(state.runSet).toHaveBeenCalledOnce()
    expect(state.run).toHaveBeenCalledOnce()
    expect(store.remoteAddress).toBeUndefined()
  })

  it('serializes signer activation across wallet changes', async () => {
    let finishFirstWrite!: (result: any) => void
    const firstCreation = createHtlcCreation()
    mockAddressSpecificSignerMetadata(firstCreation)
    state.runSet.mockImplementationOnce(() => new Promise(resolve => finishFirstWrite = resolve))
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))

    const firstActivation = store.activateRemoteSignerFromTransaction(firstCreation as any)
    await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledOnce())
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    const secondCreation = createHtlcCreation({
      transactionHash: 'second-creation-hash',
      recipient: 'NQ23 NEXT HTLC ADDRESS',
      data: {
        type: 'htlc',
        sender: 'NQ01 NEXT LOCAL ADDRESS',
        recipient: 'NQ99 COSIGNER ADDRESS',
        timeout: 999_600,
      },
    })
    mockAddressSpecificSignerMetadata(firstCreation, secondCreation)
    const secondActivation = store.activateRemoteSignerFromTransaction(secondCreation as any)
    await Promise.resolve()

    expect(state.runSet).toHaveBeenCalledOnce()
    finishFirstWrite({ changes: { changes: 1 } })
    await firstActivation
    await secondActivation

    expect(state.runSet).toHaveBeenCalledTimes(2)
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe(secondCreation.recipient)
  })

  it('waits for stale signer cleanup before hydrating a new wallet', async () => {
    let finishWrite!: (result: any) => void
    const creation = createHtlcCreation()
    mockAddressSpecificSignerMetadata(creation)
    state.runSet.mockImplementationOnce(() => new Promise(resolve => finishWrite = resolve))
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))

    const activation = store.activateRemoteSignerFromTransaction(createHtlcCreation() as any)
    await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledOnce())
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    state.query.mockClear()
    const initialization = store.init()
    await Promise.resolve()

    expect(state.query).not.toHaveBeenCalled()
    finishWrite({ changes: { changes: 1 } })
    await activation
    await initialization

    expect(state.run.mock.invocationCallOrder[0]).toBeLessThan(state.query.mock.invocationCallOrder[0])
  })

  it.each([
    ['another wallet', { data: { type: 'htlc', sender: 'NQ01 OTHER OWNER', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_500 } }],
    ['another cosigner', { data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ98 OTHER COSIGNER', timeout: 999_500 } }],
  ])('rejects HTLC activation owned by %s', async (_name, overrides) => {
    const creation = createHtlcCreation(overrides)
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))

    await expect(store.activateRemoteSignerFromTransaction(creation as any)).rejects.toThrow('invalid HTLC transaction')

    expect(state.run).not.toHaveBeenCalled()
  })

  it('does not activate an HTLC after the wallet changes while metadata is resolving', async () => {
    state.consensus = 'connecting'
    state.getStatus.mockResolvedValue({
      data: {
        status: 'good',
        blockHeight: 0,
        servicePublicKey: 'service-public-key',
        network: 'TestAlbatross',
      },
      error: undefined,
      hasError: false,
      status: 200,
    })
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))

    const activation = store.activateRemoteSignerFromTransaction(createHtlcCreation({ timestamp: 0 }) as any)
    ;(useLocalWallet() as any).localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    store.remoteHeight = 1

    await expect(activation).rejects.toThrow('invalid HTLC transaction')
    expect(state.run).not.toHaveBeenCalled()
  })

  it('shares the first local history request between balance resolution and discovery', async () => {
    let resolveHistory!: (transactions: any[]) => void
    state.client.getTransactionsByAddress = vi.fn()
      .mockImplementationOnce(() => new Promise<any[]>(resolve => resolveHistory = resolve))
      .mockResolvedValue([])

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const discovery = store.discoverRemoteSignersFromBlockchain()
    const balanceResolution = store.resolveHomeBalanceState()

    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce())
    resolveHistory([])
    await Promise.all([discovery, balanceResolution])
  })

  it('serializes local history requests with different parameters', async () => {
    let activeRequests = 0
    let maxActiveRequests = 0
    const resolvers: Array<(transactions: any[]) => void> = []
    state.client.getTransactionsByAddress = vi.fn(() => {
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
      return new Promise<any[]>((resolve) => {
        resolvers.push((transactions) => {
          activeRequests -= 1
          resolve(transactions)
        })
      })
    })

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const discovery = store.discoverRemoteSignersFromBlockchain()
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
    const fullHistory = store.getLocalTransactions({ sinceHeight: 0 })

    await Promise.resolve()
    expect(state.client.getTransactionsByAddress).toHaveBeenCalledTimes(1)
    resolvers[0]([])
    await vi.waitFor(() => expect(resolvers).toHaveLength(2))
    expect(maxActiveRequests).toBe(1)
    resolvers[1]([])

    await Promise.all([discovery, fullHistory])
    expect(maxActiveRequests).toBe(1)
  })

  it('exports the full wallet context and invalidates it after a new generation', async () => {
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    const context = store.getWalletContext()

    expect(context).toEqual({
      address: state.localAddress,
      client: state.client,
      network: state.networkName,
      owner: state.localAddress.toUserFriendlyAddress(),
      generation: 0,
    })
    expect(store.isWalletContextCurrent(context!)).toBe(true)
    useSyncState().walletContextGeneration += 1
    expect(store.isWalletContextCurrent(context!)).toBe(false)
  })

  it('returns complete history evidence when the first page is partial', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = [{ transactionHash: 'first-hit' }]
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve(firstPage))

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().getAllTransactionsForAddress(address as any)

    expect(result).toEqual({ transactions: firstPage, complete: true })
  })

  it('keeps completed history pages when the next page rejects', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ transactionHash: `first-${index}` }))
    state.client.getTransactionsByAddress = vi.fn((_address: unknown, _sinceHeight: unknown, _known: unknown, startAt?: string) => startAt
      ? Promise.reject(new Error('second page failed'))
      : Promise.resolve(firstPage))

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().getAllTransactionsForAddress(address as any)

    expect(result.transactions).toEqual(firstPage)
    expect(result.transactions).toContain(firstPage[0])
    expect(result.complete).toBe(false)
  })

  it('keeps positive extension history evidence when a later cursor page fails', async () => {
    const root = createHtlcCreation()
    const extension = createHtlcCreation({
      transactionHash: 'extension-hash',
      sender: root.recipient,
      senderType: 'htlc',
      recipient: 'NQ33 TEST FUNDED HTLC ADDRESS',
      timestamp: 124_100,
      data: {
        type: 'htlc',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ99 COSIGNER ADDRESS',
        timeout: 1_000_500,
      },
    })
    mockAddressSpecificSignerMetadata(root, extension)
    const extensionPage = [
      extension,
      ...Array.from({ length: 99 }, (_, index) => ({
        transactionHash: `filler-${index}`,
        executionResult: true,
        sender: root.recipient,
        senderType: 'htlc',
        recipient: `NQ${index} BASIC ADDRESS`,
        recipientType: 'basic',
        flags: 0,
        data: {},
      })),
    ]
    state.client.getTransactionsByAddress = vi.fn((address: ReturnType<typeof createAddress>, _sinceHeight: unknown, _known: unknown, startAt?: string) => {
      const value = address.toUserFriendlyAddress()
      if (value === state.localAddress.toUserFriendlyAddress())
        return Promise.resolve([root])
      if (value === root.recipient)
        return startAt ? Promise.reject(new Error('later page failed')) : Promise.resolve(extensionPage)
      return Promise.resolve([])
    })
    state.getAccount.mockImplementation((async (address: ReturnType<typeof createAddress>) => address.toUserFriendlyAddress() === extension.recipient
      ? { data: createLiveHtlcAccount({ balance: 500, totalAmount: 500, timeout: 1_000_500 }), error: undefined }
      : { data: undefined, error: 'No account found' }) as any)

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({
      added: 2,
      alreadyKnown: 0,
      localComplete: false,
      errors: [`HTLC history lookup incomplete: ${root.recipient}`],
    })
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [root.recipient, 0, 98, 'service-public-key', 123_100, 999_500, false])
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [extension.recipient, 500, 98, 'service-public-key', 124_100, 1_000_500, false])
  })

  it('deduplicates overlapping history cursor rows while preserving page order', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ transactionHash: `first-${index}`, page: 1 }))
    const secondPage = [
      { transactionHash: 'first-99', page: 2 },
      { transactionHash: 'second-hit', page: 2 },
    ]
    state.client.getTransactionsByAddress = vi.fn((_address: unknown, _sinceHeight: unknown, _known: unknown, startAt?: string) => Promise.resolve(startAt ? secondPage : firstPage))

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().getAllTransactionsForAddress(address as any)

    expect(result).toEqual({ transactions: [...firstPage, secondPage[1]], complete: true })
  })

  it('returns incomplete history evidence when the cursor repeats', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ transactionHash: `first-${index}` }))
    const secondPage = Array.from({ length: 100 }, (_, index) => ({
      transactionHash: index === 99 ? 'first-99' : `second-${index}`,
    }))
    state.client.getTransactionsByAddress = vi.fn((_address: unknown, _sinceHeight: unknown, _known: unknown, startAt?: string) => Promise.resolve(startAt ? secondPage : firstPage))

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().getAllTransactionsForAddress(address as any)

    expect(result.transactions).toEqual([...firstPage, ...secondPage.slice(0, -1)])
    expect(result.complete).toBe(false)
  })

  it('returns incomplete history evidence when a full page has no cursor', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      transactionHash: index === 99 ? undefined : `first-${index}`,
    }))
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve(firstPage))

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().getAllTransactionsForAddress(address as any)

    expect(result.transactions).toEqual(firstPage)
    expect(result.complete).toBe(false)
  })

  it('returns only completed history pages when the owner context changes', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ transactionHash: `first-${index}` }))
    let resolveSecondPage!: (transactions: any[]) => void
    state.client.getTransactionsByAddress = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => new Promise(resolve => resolveSecondPage = resolve))

    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const history = useRemoteSigner().getAllTransactionsForAddress(address as any)
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledTimes(2))
    ;(useLocalWallet() as any).localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    resolveSecondPage([{ transactionHash: 'stale-owner-hit' }])

    await expect(history).resolves.toEqual({ transactions: firstPage, complete: false })
  })

  it('returns only completed history pages when the network context changes', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ transactionHash: `first-${index}` }))
    let resolveSecondPage!: (transactions: any[]) => void
    state.client.getTransactionsByAddress = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => new Promise(resolve => resolveSecondPage = resolve))

    const { useRemoteSigner } = await import('./remote-signer')
    const history = useRemoteSigner().getAllTransactionsForAddress(address as any)
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledTimes(2))
    state.networkName = 'mainalbatross'
    resolveSecondPage([{ transactionHash: 'stale-network-hit' }])

    await expect(history).resolves.toEqual({ transactions: firstPage, complete: false })
  })

  it('returns only completed history pages when the client context changes', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ transactionHash: `first-${index}` }))
    let resolveSecondPage!: (transactions: any[]) => void
    state.client.getTransactionsByAddress = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => new Promise(resolve => resolveSecondPage = resolve))

    const { useRemoteSigner } = await import('./remote-signer')
    const history = useRemoteSigner().getAllTransactionsForAddress(address as any)
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledTimes(2))
    state.client = {
      ...state.client,
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
    }
    resolveSecondPage([{ transactionHash: 'stale-client-hit' }])

    await expect(history).resolves.toEqual({ transactions: firstPage, complete: false })
  })

  it('returns only completed history pages when the wallet context generation changes', async () => {
    const address = createAddress('NQ22 HISTORY ADDRESS')
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ transactionHash: `first-${index}` }))
    let resolveSecondPage!: (transactions: any[]) => void
    state.client.getTransactionsByAddress = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => new Promise(resolve => resolveSecondPage = resolve))

    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const history = useRemoteSigner().getAllTransactionsForAddress(address as any)
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledTimes(2))
    useSyncState().walletContextGeneration += 1
    resolveSecondPage([{ transactionHash: 'stale-generation-hit' }])

    await expect(history).resolves.toEqual({ transactions: firstPage, complete: false })
  })

  it('does not share history results across wallet and client changes', async () => {
    let resolveFirst!: (transactions: any[]) => void
    const firstClient = state.client
    firstClient.getTransactionsByAddress = vi.fn(() => new Promise<any[]>(resolve => resolveFirst = resolve))

    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstHistory = store.getLocalTransactions()
    await vi.waitFor(() => expect(firstClient.getTransactionsByAddress).toHaveBeenCalledOnce())

    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    const secondClient = {
      ...firstClient,
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
    }
    state.client = secondClient
    ;(useLocalWallet() as any).localAddress = state.localAddress
    const secondHistory = store.getLocalTransactions()

    await expect(secondHistory).resolves.toEqual([])
    expect(secondClient.getTransactionsByAddress).toHaveBeenCalledWith(state.localAddress, undefined, undefined, undefined, undefined)
    resolveFirst([])
    await expect(firstHistory).rejects.toThrow('Wallet changed during history request')
  })

  it('does not reconnect the current client when an obsolete client request times out', async () => {
    vi.useFakeTimers()
    const firstClient = state.client
    firstClient.getTransactionsByAddress = vi.fn(() => new Promise(() => {}))

    const { useRemoteSigner } = await import('./remote-signer')
    const request = expect(useRemoteSigner().getLocalTransactions()).rejects.toThrow('Operation timed out')
    await vi.waitFor(() => expect(firstClient.getTransactionsByAddress).toHaveBeenCalledOnce())

    const nextClient = {
      ...firstClient,
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
    }
    state.client = nextClient
    await vi.advanceTimersByTimeAsync(30_000)
    await request

    expect(state.createHistoryClient).not.toHaveBeenCalled()
  })

  it('resets a shared client before querying history for another wallet', async () => {
    let resolveFirst!: (transactions: any[]) => void
    state.client.getTransactionsByAddress = vi.fn(() => new Promise<any[]>(resolve => resolveFirst = resolve))
    const replacementClient = {
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    }
    state.createHistoryClient.mockResolvedValueOnce(replacementClient)

    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstHistory = store.getLocalTransactions()
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce())
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    const secondHistory = store.getLocalTransactions()

    await expect(secondHistory).resolves.toEqual([])
    expect(state.createHistoryClient).toHaveBeenCalledOnce()
    expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce()
    expect(replacementClient.getTransactionsByAddress).toHaveBeenCalledOnce()
    resolveFirst([])
    await expect(firstHistory).rejects.toThrow('Wallet changed during history request')
  })

  it('discards discovery results when the wallet changes before history returns', async () => {
    let resolveHistory!: (transactions: any[]) => void
    state.client.getTransactionsByAddress = vi.fn(() => new Promise<any[]>(resolve => resolveHistory = resolve))
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const discovery = useRemoteSigner().discoverRemoteSignersFromBlockchain()
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce())
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    resolveHistory([createHtlcCreation()])

    const result = await discovery

    expect(result.localComplete).toBe(false)
    expect(result.errors).toEqual([expect.stringContaining('Wallet changed')])
    expect(state.run).not.toHaveBeenCalled()
  })

  it('removes a signer inserted after discovery wallet context becomes stale', async () => {
    const creation = createHtlcCreation()
    state.client.getTransactionsByAddress = vi.fn((address: ReturnType<typeof createAddress>) => Promise.resolve(
      address.toUserFriendlyAddress() === state.localAddress.toUserFriendlyAddress() ? [creation] : [],
    ))
    state.client.getTransaction.mockResolvedValue(creation)
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })
    let resolveInsert!: (result: any) => void
    state.run.mockImplementationOnce(() => new Promise(resolve => resolveInsert = resolve))

    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const discovery = useRemoteSigner().discoverRemoteSignersFromBlockchain()
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(
      SQLQuery.InsertInactiveRemoteSigner,
      [creation.recipient, 696_900_000, 98, 'service-public-key', 123_100, 999_500, false],
    ))
    useSyncState().walletContextGeneration += 1
    resolveInsert({ changes: { changes: 1 } })

    await expect(discovery).resolves.toEqual({
      added: 0,
      alreadyKnown: 0,
      localComplete: false,
      errors: ['Wallet changed during discovery'],
    })
    expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteRemoteSigner, [creation.recipient])
  })

  it.each(['included', 'confirmed'])('recognizes %s historical HTLC creation without executionResult as successful', async (stateName) => {
    const creation = createHtlcCreation({ state: stateName, executionResult: undefined })
    state.client.getTransactionsByAddress = vi.fn((address: ReturnType<typeof createAddress>) => Promise.resolve(
      address.toUserFriendlyAddress() === state.localAddress.toUserFriendlyAddress() ? [creation] : [],
    ))
    state.client.getTransaction.mockResolvedValue(creation)
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 1, alreadyKnown: 0, localComplete: true, errors: [] })
    expect(state.run).toHaveBeenCalledWith(
      expect.any(String),
      [creation.recipient, 696_900_000, 98, 'service-public-key', 123_100, 999_500, false],
    )
  })

  it.each([
    ['explicit failure', { state: 'confirmed', executionResult: false }],
    ['new state', { state: 'new', executionResult: undefined }],
    ['pending state', { state: 'pending', executionResult: undefined }],
    ['invalidated state', { state: 'invalidated', executionResult: undefined }],
  ])('rejects historical HTLC creation with %s', async (_name, overrides) => {
    const creation = createHtlcCreation(overrides)
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([creation]))
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 0, alreadyKnown: 0, localComplete: true, errors: [] })
    expect(state.run).not.toHaveBeenCalled()
  })

  it('uses address-specific key and proof size for each historical signer after rotation', async () => {
    const root = createHtlcCreation({
      data: {
        type: 'htlc',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ97 COSIGNER A ADDRESS',
        timeout: 999_500,
      },
    })
    const extension = createHtlcCreation({
      transactionHash: 'extension-hash',
      sender: root.recipient,
      senderType: 'htlc',
      recipient: 'NQ33 TEST FUNDED HTLC ADDRESS',
      timestamp: 124_100,
      validityStartHeight: 110,
      data: {
        type: 'htlc',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ98 COSIGNER B ADDRESS',
        timeout: 1_000_500,
      },
    })
    state.getStatus.mockResolvedValue({
      data: {
        status: 'good',
        blockHeight: 128,
        servicePublicKey: 'service-public-key-b',
        network: 'TestAlbatross',
      },
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransactionsByAddress = vi.fn((address: ReturnType<typeof createAddress>) => {
      const value = address.toUserFriendlyAddress()
      if (value === state.localAddress.toUserFriendlyAddress())
        return Promise.resolve([root])
      if (value === root.recipient)
        return Promise.resolve([extension])
      return Promise.resolve([])
    })
    state.client.getTransaction.mockImplementation((hash: string) => Promise.resolve(hash === root.transactionHash ? root : extension))
    state.getRemoteSigner.mockImplementation(({ address }: { address: ReturnType<typeof createAddress> } = { address: createAddress('') }) => {
      const value = address.toUserFriendlyAddress()
      return Promise.resolve({
        data: createRemoteSignerApiData(value, value === root.recipient
          ? {
              servicePublicKey: 'service-public-key-a',
              serviceSignatureProofSize: 96,
            }
          : {
              creatingTransactionHash: extension.transactionHash,
              servicePublicKey: 'service-public-key-b',
              serviceSignatureProofSize: 104,
              validityStart: 110,
              validityEnd: 1_000_500,
            }),
        error: undefined,
        hasError: false,
        status: 200,
      })
    })
    state.getAccount.mockImplementation((async (address: ReturnType<typeof createAddress>) => address.toUserFriendlyAddress() === extension.recipient
      ? { data: createLiveHtlcAccount({ balance: 500, totalAmount: 500, recipient: 'NQ98 COSIGNER B ADDRESS', timeout: 1_000_500 }), error: undefined }
      : { data: undefined, error: 'No account found' }) as any)

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 2, alreadyKnown: 0, localComplete: true, errors: [] })
    expect(state.run).toHaveBeenCalledWith(
      expect.any(String),
      [root.recipient, 0, 96, 'service-public-key-a', 123_100, 999_500, false],
    )
    expect(state.run).toHaveBeenCalledWith(
      expect.any(String),
      [extension.recipient, 500, 104, 'service-public-key-b', 124_100, 1_000_500, false],
    )
  })

  it.each([
    ['returned address', { api: { address: 'NQ44 WRONG HTLC ADDRESS' } }],
    ['creation hash', { api: { creatingTransactionHash: '' } }],
    ['validity end', { creation: { data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_501 } } }],
    ['derived cosigner recipient', { creation: { data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ98 COSIGNER B ADDRESS', timeout: 999_500 } } }],
  ])('rejects historical address-specific metadata with mismatched %s', async (_name, mutations) => {
    const { api = {}, creation: creationOverrides = {} } = mutations as {
      api?: Record<string, unknown>
      creation?: Record<string, unknown>
    }
    const creation = createHtlcCreation(creationOverrides)
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([creation]))
    state.client.getTransaction.mockResolvedValue(creation)
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient, api),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result.localComplete).toBe(true)
    expect(result.added).toBe(0)
    expect(state.run).not.toHaveBeenCalled()
  })

  it('rejects empty historical address-specific public keys', async () => {
    const creation = createHtlcCreation({
      data: {
        type: 'htlc',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ98 COSIGNER B ADDRESS',
        timeout: 999_500,
      },
    })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient, { servicePublicKey: '' }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(creation)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const result = await store.resolveAddressSpecificSignerMetadata(
      createAddress(creation.recipient) as any,
      store.getWalletContext()!,
    )

    expect(result).toEqual({ status: 'rejected', reason: 'Cosigner returned an invalid public key' })
  })

  it('marks historical discovery incomplete when creation lookup returns no transaction', async () => {
    const creation = createHtlcCreation()
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([creation]))
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(undefined)
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result.localComplete).toBe(false)
    expect(result.added).toBe(0)
    expect(state.getRemoteSigner).toHaveBeenCalledOnce()
    expect(state.run).not.toHaveBeenCalled()
  })

  it.each([null, undefined])('activates a confirmed HTLC when cosigner creation hash is %s', async (creatingTransactionHash) => {
    const creation = createHtlcCreation()
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(creation.recipient, { creatingTransactionHash }),
      error: undefined,
    })
    state.client.getTransactionsByAddress.mockResolvedValue([creation])

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.activateRemoteSignerFromTransaction(creation as any)

    expect(store.remoteSigner?.address.toUserFriendlyAddress()).toBe('NQ22 TEST OLD HTLC ADDRESS')
    expect(store.remoteBalance).toBe(696_900_000)
  })

  it.each([
    { executionResult: false },
    { state: 'pending' },
    { flags: 0 },
    { recipientType: 'basic' },
    { recipient: 'NQ44 WRONG HTLC ADDRESS' },
    { data: { type: 'htlc', sender: 'NQ44 OTHER OWNER', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_500 } },
    { data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ98 COSIGNER B ADDRESS', timeout: 999_500 } },
    { data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_501 } },
  ])('does not activate unverified history when cosigner creation hash is null: %j', async (overrides) => {
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(undefined, { creatingTransactionHash: null }),
      error: undefined,
    })
    state.client.getTransactionsByAddress.mockResolvedValue([createHtlcCreation(overrides)])

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await expect(store.activateRemoteSignerFromTransaction(createHtlcCreation() as any)).rejects.toThrow()
    expect(store.remoteSigner).toBeUndefined()
    expect(state.runSet).not.toHaveBeenCalled()
  })

  it('keeps missing-hash recovery retryable when history has no creation yet', async () => {
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(undefined, { creatingTransactionHash: null }),
      error: undefined,
    })
    state.client.getTransactionsByAddress.mockResolvedValue([])

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const result = await store.resolveAddressSpecificSignerMetadata(
      createAddress('NQ22 TEST OLD HTLC ADDRESS') as any,
      store.getWalletContext()!,
    )
    expect(result.status).toBe('unavailable')
  })

  it('rejects historical metadata when creation lookup returns a different transaction hash', async () => {
    const creation = createHtlcCreation({ transactionHash: 'different-creation-hash' })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(creation)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const result = await store.resolveAddressSpecificSignerMetadata(
      createAddress('NQ22 TEST OLD HTLC ADDRESS') as any,
      store.getWalletContext()!,
    )

    expect(result).toEqual({ status: 'rejected', reason: 'HTLC creation transaction hash does not match cosigner metadata' })
  })

  it('marks historical discovery incomplete when address-specific metadata is unavailable', async () => {
    const creation = createHtlcCreation()
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([creation]))
    state.getRemoteSigner.mockRejectedValue(new Error('transport unavailable'))
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result.localComplete).toBe(false)
    expect(result.added).toBe(0)
    expect(state.getRemoteSigner).toHaveBeenCalledTimes(1)
    expect(state.getRemoteSigner).toHaveBeenCalledWith({ address: expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }) })
    expect(state.run).not.toHaveBeenCalled()
  })

  it('bounds historical discovery consensus waiting', async () => {
    vi.useFakeTimers()
    state.client.waitForConsensusEstablished = vi.fn(() => new Promise(() => {}))

    const { useRemoteSigner } = await import('./remote-signer')
    const discovery = useRemoteSigner().discoverRemoteSignersFromBlockchain()
    await vi.advanceTimersByTimeAsync(30_000)

    await expect(discovery).resolves.toMatchObject({ localComplete: false, added: 0 })
    expect(state.client.getTransactionsByAddress).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('returns incomplete historical discovery immediately when the client is missing', async () => {
    state.client = undefined as any

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 0, alreadyKnown: 0, localComplete: false, errors: ['Local wallet or client unavailable'] })
  })

  it('discovers a historical HTLC through bounded pages without replacing the active signer', async () => {
    const activeAddress = 'NQ11 TEST ACTIVE REMOTE ADDRESS'
    const oldAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    state.query.mockImplementation(((sql: string, _params?: unknown[], options?: { single?: boolean }) => {
      if (options?.single) {
        return Promise.resolve({
          active: true,
          balance: 25,
          end: 999_999,
          proofSize: 98,
          publicKey: 'service-public-key',
          start: 123_000,
          address: activeAddress,
        })
      }
      return Promise.resolve([{
        active: true,
        balance: 25,
        end: 999_999,
        proofSize: 98,
        publicKey: 'service-public-key',
        start: 123_000,
        address: activeAddress,
      }])
    }) as any)
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      transactionHash: `hash-${index}`,
      executionResult: true,
      sender: 'NQ00 TEST LOCAL ADDRESS',
      senderType: 'basic',
      recipient: `NQ${index} BASIC ADDRESS`,
      recipientType: 'basic',
      flags: 0,
      data: {},
    }))
    const creation = createHtlcCreation()
    state.client.getTransactionsByAddress = vi.fn((_address: unknown, _sinceHeight: unknown, _known: unknown, startAt: string | undefined) => Promise.resolve(
      startAt ? [creation] : firstPage,
    ))
    state.client.getTransaction.mockResolvedValue(creation)
    state.getRemoteSigner.mockImplementation(({ address }: { address: ReturnType<typeof createAddress> } = { address: createAddress('') }) => Promise.resolve(
      address.toUserFriendlyAddress() === oldAddress
        ? { data: createRemoteSignerApiData(oldAddress), error: undefined, hasError: false, status: 200 }
        : { data: undefined, error: { message: 'not found', statusCode: 404, error: 'NOT_FOUND' }, hasError: true, status: 404 },
    ))
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    const result = await store.discoverRemoteSignersFromBlockchain()

    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe(activeAddress)
    expect(store.remoteBalance).toBe(25)
    expect(result).toEqual({ added: 1, alreadyKnown: 0, localComplete: true, errors: [] })
    expect(state.client.getTransactionsByAddress).toHaveBeenNthCalledWith(1, state.localAddress, undefined, undefined, undefined, 100)
    expect(state.client.getTransactionsByAddress).toHaveBeenNthCalledWith(2, state.localAddress, undefined, undefined, 'hash-99', 100)
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [oldAddress, 696_900_000, 98, 'service-public-key', 123_100, 999_500, false])
  })

  it.each([
    ['pruned', undefined],
    ['zero-balance', createLiveHtlcAccount({ balance: 0 })],
    ['basic', { type: 'basic', balance: 0 }],
    ['basic with new funds', { type: 'basic', balance: 100 }],
  ])('retains a %s predecessor for history when discovering a funded extension', async (_name, account) => {
    const root = createHtlcCreation()
    const extension = createHtlcCreation({
      transactionHash: 'extension-hash',
      sender: root.recipient,
      senderType: 'htlc',
      recipient: 'NQ33 TEST FUNDED HTLC ADDRESS',
      timestamp: 124_100,
      data: {
        type: 'htlc',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ99 COSIGNER ADDRESS',
        timeout: 1_000_500,
      },
    })
    mockAddressSpecificSignerMetadata(root, extension)
    state.client.getTransactionsByAddress = vi.fn((address: ReturnType<typeof createAddress>) => {
      const value = address.toUserFriendlyAddress()
      if (value === state.localAddress.toUserFriendlyAddress())
        return Promise.resolve([root])
      if (value === root.recipient)
        return Promise.resolve([extension])
      return Promise.resolve([])
    })
    state.getAccount.mockImplementation(async (address) => {
      if (address?.toUserFriendlyAddress() === extension.recipient)
        return { data: createLiveHtlcAccount({ balance: 500, totalAmount: 500, timeout: 1_000_500 }), error: undefined }
      return { data: account, error: account ? undefined : 'No account found' }
    })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 2, alreadyKnown: 0, localComplete: true, errors: [] })
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [root.recipient, 0, 98, 'service-public-key', 123_100, 999_500, false])
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [extension.recipient, 500, 98, 'service-public-key', 124_100, 1_000_500, false])
  })

  it('imports a funded parent restored by a reorg after extension history was read', async () => {
    const root = createHtlcCreation()
    const extension = createHtlcCreation({
      transactionHash: 'extension-hash',
      sender: root.recipient,
      senderType: 'htlc',
      recipient: 'NQ33 TEST REORGED HTLC ADDRESS',
    })
    mockAddressSpecificSignerMetadata(root, extension)
    state.client.getTransactionsByAddress = vi.fn((address: ReturnType<typeof createAddress>) => {
      const value = address.toUserFriendlyAddress()
      if (value === state.localAddress.toUserFriendlyAddress())
        return Promise.resolve([root])
      if (value === root.recipient)
        return Promise.resolve([extension])
      return Promise.resolve([])
    })
    state.getAccount.mockImplementation((async (address: ReturnType<typeof createAddress>) => address.toUserFriendlyAddress() === root.recipient
      ? { data: createLiveHtlcAccount({ balance: 400, totalAmount: 400 }), error: undefined }
      : { data: undefined, error: 'No account found' }) as any)

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result.added).toBe(2)
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [root.recipient, 400, 98, 'service-public-key', 123_100, 999_500, false])
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [extension.recipient, 0, 98, 'service-public-key', 123_100, 999_500, false])
  })

  it.each([
    ['failed execution', { executionResult: false }],
    ['foreign sender', { sender: 'NQ01 OTHER OWNER' }],
    ['non-basic sender', { senderType: 'htlc' }],
    ['non-HTLC recipient', { recipientType: 'basic' }],
    ['missing creation flag', { flags: 0 }],
    ['wrong HTLC data sender', { data: { type: 'htlc', sender: 'NQ01 OTHER OWNER', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_500 } }],
    ['wrong HTLC data recipient', { data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ98 OTHER COSIGNER', timeout: 999_500 } }],
  ])('does not discover a transaction with %s', async (_name, overrides) => {
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([createHtlcCreation(overrides)]))
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 0, alreadyKnown: 0, localComplete: true, errors: [] })
    expect(state.run).not.toHaveBeenCalled()
  })

  it('marks discovery incomplete when an HTLC account lookup fails', async () => {
    const creation = createHtlcCreation()
    mockAddressSpecificSignerMetadata(creation)
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([creation]))
    state.getAccount.mockResolvedValue({ data: undefined, error: 'Error getting account' })

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result.localComplete).toBe(false)
    expect(result.errors).toEqual([expect.stringContaining('NQ22 TEST OLD HTLC ADDRESS')])
  })

  it('replaces the history client after a timed-out request so discovery can retry', async () => {
    vi.useFakeTimers()
    state.client.getTransactionsByAddress = vi.fn(() => new Promise(() => {}))
    const replacementClient = {
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    }
    state.createHistoryClient.mockResolvedValueOnce(replacementClient)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstRun = store.discoverRemoteSignersFromBlockchain()
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(30_000)

    await expect(firstRun).resolves.toMatchObject({ localComplete: false, added: 0 })
    expect(state.createHistoryClient).toHaveBeenCalledOnce()
    const secondRun = store.discoverRemoteSignersFromBlockchain()
    await expect(secondRun).resolves.toMatchObject({ localComplete: true, added: 0 })
    expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce()
    expect(replacementClient.getTransactionsByAddress).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('waits for a late history client instead of abandoning it', async () => {
    vi.useFakeTimers()
    state.client.getTransactionsByAddress = vi.fn(() => new Promise(() => {}))
    const replacementClient = {
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    }
    state.createHistoryClient.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 30_001, replacementClient)))

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstRequest = expect(store.getLocalTransactions()).rejects.toThrow('Operation timed out')
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(30_001)
    await firstRequest

    const secondRequest = store.getLocalTransactions()
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(secondRequest).resolves.toEqual([])
    expect(replacementClient.getTransactionsByAddress).toHaveBeenCalledOnce()
    expect(replacementClient.disconnectNetwork).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('retries a stalled history request on a different client', async () => {
    vi.useFakeTimers()
    state.client.getTransactionsByAddress = vi.fn(() => new Promise(() => {}))
    const firstReplacement = {
      getTransactionsByAddress: vi.fn(() => new Promise(() => {})),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    }
    const secondReplacement = {
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    }
    state.createHistoryClient.mockResolvedValueOnce(firstReplacement).mockResolvedValueOnce(secondReplacement)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstRequest = expect(store.getLocalTransactions()).rejects.toThrow('Operation timed out')
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(30_000)
    await firstRequest

    const secondRequest = expect(store.getLocalTransactions()).rejects.toThrow('Operation timed out')
    await Promise.resolve()
    expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce()
    expect(firstReplacement.getTransactionsByAddress).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    await secondRequest
    expect(state.createHistoryClient).toHaveBeenCalledTimes(2)
  })

  it('keeps a stalled history request serialized when replacement fails', async () => {
    vi.useFakeTimers()
    state.client.getTransactionsByAddress = vi.fn(() => new Promise(() => {}))
    state.createHistoryClient.mockRejectedValue(new Error('replacement failed'))

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstRequest = expect(store.getLocalTransactions()).rejects.toThrow('Operation timed out')
    await vi.waitFor(() => expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(30_000)
    await firstRequest

    const secondRequest = expect(store.getLocalTransactions()).rejects.toThrow('Operation timed out')
    await Promise.resolve()
    expect(state.client.getTransactionsByAddress).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    await secondRequest
    expect(state.createHistoryClient).toHaveBeenCalledTimes(2)
  })

  it('clears the previous wallet balance before async signer discovery', async () => {
    mockActiveSignerQuery()
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.init()
    await vi.waitFor(() => expect(state.getRemoteSigner).toHaveBeenCalled())
    expect(store.remoteBalance).toBe(25)

    state.query.mockImplementation((_sql: string, _params?: unknown[], options?: { single?: boolean }) => Promise.resolve(options?.single ? undefined : []))
    state.getRemoteSigner.mockImplementation(() => new Promise(() => {}))
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress

    await store.init()

    expect(store.remoteAddress).toBeUndefined()
    expect(store.remoteBalance).toBe(0)
    expect(store.homeBalanceState).toBe('loading')
  })

  it('discards a head refresh response after wallet or network changes', async () => {
    mockActiveSignerQuery()
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.init()
    await vi.waitFor(() => expect(state.getRemoteSigner).toHaveBeenCalled())

    let resolveRemoteSigner!: (result: any) => void
    state.getRemoteSigner.mockReset()
    state.getRemoteSigner.mockImplementation(() => new Promise(resolve => resolveRemoteSigner = resolve))
    state.getBalance.mockResolvedValue({ data: 10, error: undefined })
    state.run.mockClear()
    state.height = 320
    store.remoteBalance = 0
    const listener = state.client.addHeadChangedListener.mock.calls.at(-1)?.[0]
    const refresh = listener()
    await vi.waitFor(() => expect(state.getRemoteSigner).toHaveBeenCalledOnce())

    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    state.networkName = 'mainalbatross'
    resolveRemoteSigner({
      data: {
        address: 'NQ33 STALE REMOTE ADDRESS',
        balance: 10,
        creatingTransactionHash: 'stale-creation-hash',
        servicePublicKey: 'service-public-key',
        serviceSignatureProofSize: 98,
        validityStart: 100,
        validityEnd: 999_500,
      },
      error: undefined,
      hasError: false,
      status: 200,
    })
    await refresh

    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ11 TEST REMOTE ADDRESS')
    expect(store.remoteBalance).toBe(0)
    expect(state.run).not.toHaveBeenCalled()
  })

  it('hydrates the active signer offline without starting online work', async () => {
    const signer = {
      active: true,
      balance: 25,
      end: 999999,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_000,
      address: 'NQ11 TEST REMOTE ADDRESS',
    }
    state.query.mockImplementation(((_sql: string, _params?: unknown[], options?: { single?: boolean }) =>
      Promise.resolve(options?.single ? signer : [signer])) as any)
    const onlineClient = state.client
    state.client = undefined
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    let settled = false
    const initialization = store.init().then(() => settled = true)
    await vi.waitFor(() => expect(store.remoteBalance).toBe(25))
    await Promise.resolve()
    const settledOffline = settled
    const onlineCallsBeforeReadiness = {
      accounts: state.getAccounts.mock.calls.length,
      discovery: onlineClient.getTransactionsByAddress.mock.calls.length,
      listener: onlineClient.addHeadChangedListener.mock.calls.length,
      remoteApi: state.getRemoteSigner.mock.calls.length,
    }
    state.client = onlineClient
    await initialization

    expect(settledOffline).toBe(true)
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ11 TEST REMOTE ADDRESS')
    expect(store.homeBalanceState).toBe('resolved-remote')
    expect(onlineCallsBeforeReadiness).toEqual({
      accounts: 0,
      discovery: 0,
      listener: 0,
      remoteApi: 0,
    })
  })

  it('hydrates the active signer before consensus without starting online work', async () => {
    mockActiveSignerQuery()
    state.consensus = 'connecting'
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()

    expect(store.remoteBalance).toBe(25)
    expect(store.homeBalanceState).toBe('resolved-remote')
    expect(state.getRemoteSigner).not.toHaveBeenCalled()
    expect(state.client.addHeadChangedListener).not.toHaveBeenCalled()
  })

  it('registers one listener after consensus retry and replaces it on the next retry', async () => {
    state.consensus = 'connecting'
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    state.consensus = 'established'
    await store.init()
    await store.init()

    expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2)
    expect(state.client.removeListener).toHaveBeenCalledWith(1)
  })

  it('removes the active listener before returning during reconnect', async () => {
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.init()
    state.client.removeListener.mockClear()

    state.consensus = 'connecting'
    await store.init()

    expect(state.client.removeListener).toHaveBeenCalledOnce()
    expect(state.client.removeListener).toHaveBeenCalledWith(1)
    expect(state.client.addHeadChangedListener).toHaveBeenCalledOnce()
  })

  it.each(['client replacement', 'consensus loss'] as const)(
    'does not persist stale signer balances after %s',
    async (change) => {
      const signer = {
        active: true,
        balance: 25,
        end: 999999,
        proofSize: 98,
        publicKey: 'service-public-key',
        start: 123_000,
        address: 'NQ11 TEST REMOTE ADDRESS',
      }
      state.query.mockImplementation(((_sql: string, _params?: unknown[], options?: { single?: boolean }) =>
        Promise.resolve(options?.single ? signer : [signer])) as any)
      let resolveAccounts!: (accounts: Array<{ type: string, balance: number }>) => void
      const getAccounts = vi.fn((_addresses: unknown[]) => new Promise<Array<{ type: string, balance: number }>>(resolve => resolveAccounts = resolve))
      state.client = { ...state.client, getAccounts }
      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      state.run.mockClear()

      const initialization = store.init()
      await vi.waitFor(() => expect(getAccounts).toHaveBeenCalledOnce())
      if (change === 'client replacement') {
        state.client = {
          ...state.client,
          getAccounts: vi.fn(() => Promise.resolve([])),
        }
      }
      else {
        state.consensus = 'connecting'
      }
      resolveAccounts([{ type: 'htlc', balance: 99 }])
      await initialization

      expect(state.run).not.toHaveBeenCalled()
    },
  )

  it('replaces its previous head listener when initialized again', async () => {
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    await store.init()

    expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2)
    expect(state.client.removeListener).toHaveBeenCalledWith(1)
  })

  it('removes a superseded listener when concurrent initialization resolves out of order', async () => {
    let resolveFirstListener!: (id: number) => void
    state.client.addHeadChangedListener = vi.fn()
      .mockImplementationOnce(() => new Promise<number>(resolve => resolveFirstListener = resolve))
      .mockResolvedValueOnce(2)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstInit = store.init()
    await vi.waitFor(() => expect(state.client.addHeadChangedListener).toHaveBeenCalledOnce())
    const secondInit = store.init()
    await vi.waitFor(() => expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2))
    await secondInit
    resolveFirstListener(1)
    await firstInit

    expect(state.client.removeListener).toHaveBeenCalledWith(1)
    expect(state.client.removeListener).not.toHaveBeenCalledWith(2)
  })

  it('installs a listener when a concurrent init already removed the previous one', async () => {
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.init()
    let finishFirstRemoval!: () => void
    let failSecondRemoval!: (error: Error) => void
    state.client.removeListener
      .mockImplementationOnce(() => new Promise<void>(resolve => finishFirstRemoval = resolve))
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => failSecondRemoval = reject))

    const firstInit = store.init()
    await vi.waitFor(() => expect(state.client.removeListener).toHaveBeenCalledTimes(1))
    const secondInit = store.init()
    await vi.waitFor(() => expect(state.client.removeListener).toHaveBeenCalledTimes(2))
    finishFirstRemoval()
    await firstInit
    failSecondRemoval(new Error('already removed'))
    await secondInit

    expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2)
  })

  it('retries cleanup when removing a superseded listener fails', async () => {
    let resolveFirstListener!: (id: number) => void
    state.client.addHeadChangedListener = vi.fn()
      .mockImplementationOnce(() => new Promise<number>(resolve => resolveFirstListener = resolve))
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const firstInit = store.init()
    await vi.waitFor(() => expect(state.client.addHeadChangedListener).toHaveBeenCalledOnce())
    const secondInit = store.init()
    await vi.waitFor(() => expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2))
    await secondInit
    state.client.removeListener.mockRejectedValueOnce(new Error('remove failed'))
    resolveFirstListener(1)
    await firstInit

    state.client.removeListener.mockResolvedValue(undefined)
    await store.init()

    expect(state.client.removeListener).toHaveBeenNthCalledWith(2, 1)
    expect(state.client.removeListener).toHaveBeenCalledWith(2)
  })

  it('retains the previous listener handle when removal fails', async () => {
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.init()
    state.client.removeListener.mockRejectedValueOnce(new Error('remove failed'))

    await store.init()
    expect(state.client.addHeadChangedListener).toHaveBeenCalledOnce()

    state.client.removeListener.mockResolvedValue(undefined)
    await store.init()
    expect(state.client.removeListener).toHaveBeenCalledTimes(2)
    expect(state.client.removeListener).toHaveBeenLastCalledWith(1)
    expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2)
  })

  it('installs the current wallet listener when stale listener cleanup fails', async () => {
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.init()
    state.client.removeListener.mockRejectedValue(new Error('remove failed'))
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress

    await store.init()

    expect(state.client.removeListener).toHaveBeenCalledWith(1)
    expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2)
  })

  it('resolves empty home state after a complete multi-page history scan', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      transactionHash: `hash-${index}`,
      executionResult: true,
      sender: 'NQ00 TEST LOCAL ADDRESS',
      senderType: 'basic',
      recipient: `NQ${index} BASIC ADDRESS`,
      recipientType: 'basic',
      flags: 0,
      data: {},
    }))
    state.client.getTransactionsByAddress = vi.fn((_address: unknown, _sinceHeight: unknown, _known: unknown, startAt?: string) => Promise.resolve(startAt ? [] : firstPage))

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const result = await store.discoverRemoteSignersFromBlockchain()

    expect(result.localComplete).toBe(true)
    expect(store.homeBalanceState).toBe('resolved-empty')
  })

  it('keeps known signers when local history is empty', async () => {
    state.query.mockResolvedValue([{
      active: true,
      balance: 25,
      end: 999_999,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_000,
      address: 'NQ11 TEST ACTIVE REMOTE ADDRESS',
    }])
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([]))

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 0, alreadyKnown: 0, localComplete: true, errors: [] })
    expect(state.run).not.toHaveBeenCalled()
  })

  it.each(['included', 'confirmed'])('accepts %s exact-address creation without executionResult', async (stateName) => {
    const oldAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    const creation = createHtlcCreation({ state: stateName, executionResult: undefined })
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(oldAddress),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(creation)

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().validateRemoteSignerAddress(oldAddress)

    expect(result.status).toBe('importable')
  })

  it('validates historical address-specific metadata independently of the current status key', async () => {
    const oldAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    const creation = createHtlcCreation({
      data: {
        type: 'htlc',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ97 COSIGNER A ADDRESS',
        timeout: 999_500,
      },
    })
    state.getStatus.mockResolvedValue({
      data: {
        status: 'good',
        blockHeight: 128,
        servicePublicKey: 'service-public-key-b',
        network: 'TestAlbatross',
      },
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.getAccount.mockResolvedValue({
      data: createLiveHtlcAccount({ recipient: 'NQ97 COSIGNER A ADDRESS' }),
      error: undefined,
    })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(oldAddress, {
        servicePublicKey: 'service-public-key-a',
        serviceSignatureProofSize: 96,
      }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(creation)

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().validateRemoteSignerAddress(oldAddress)

    expect(result).toMatchObject({
      status: 'importable',
      cosignerRecipient: 'NQ97 COSIGNER A ADDRESS',
      signer: {
        address: expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }),
        publicKey: 'service-public-key-a',
        proofSize: 96,
      },
    })
  })

  it('validates a funded HTLC with one creation-transaction lookup', async () => {
    const oldAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    state.getAccount.mockResolvedValue({
      data: {
        type: 'htlc',
        balance: 696_900_000,
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ99 COSIGNER ADDRESS',
        timeout: 999_500,
      },
      error: undefined,
    })
    state.getRemoteSigner.mockResolvedValue({
      data: {
        address: oldAddress,
        balance: 696_900_000,
        servicePublicKey: 'service-public-key',
        serviceSignatureProofSize: 98,
        validityStart: 100,
        validityEnd: 999_500,
        creatingTransactionHash: 'creation-hash',
      },
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(createHtlcCreation())

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const result = await store.validateRemoteSignerAddress(oldAddress)

    expect(result).toMatchObject({
      status: 'importable',
      address: oldAddress,
      balance: 696_900_000,
      timeout: 999_500,
      expired: false,
      owner: 'NQ00 TEST LOCAL ADDRESS',
      cosignerRecipient: 'NQ99 COSIGNER ADDRESS',
      creationTransactionHash: 'creation-hash',
      creationState: 'confirmed',
    })
    expect(state.client.getTransaction).toHaveBeenCalledExactlyOnceWith('creation-hash')
    expect(state.run).not.toHaveBeenCalled()
  })

  it('registers only the validated target without changing the active signer', async () => {
    const targetAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(targetAddress, { serviceSignatureProofSize: 104 }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(createHtlcCreation())

    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await store.updateRemoteSigner({
      active: true,
      address: createAddress('NQ11 TEST ACTIVE HTLC ADDRESS'),
      balance: 25,
      end: 999_999,
      proofSize: 98,
      publicKey: 'active-service-public-key',
      start: 123_000,
    } as any)
    state.run.mockClear()
    state.runSet.mockClear()

    const candidate = await store.validateRemoteSignerAddress(targetAddress)
    if (candidate.status === 'invalid')
      throw new Error(candidate.reason)
    const registered = await store.registerValidatedRemoteSigner(candidate)

    expect(registered).toMatchObject({ address: targetAddress, signer: { proofSize: 104 } })
    expect(state.run).toHaveBeenCalledWith(SQLQuery.UpsertTargetRemoteSigner, [
      targetAddress,
      696_900_000,
      104,
      'service-public-key',
      123_100,
      999_500,
    ])
    expect(state.run).not.toHaveBeenCalledWith(SQLQuery.DeactivateRemoteSigners, expect.anything())
    expect(state.runSet).not.toHaveBeenCalled()
    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe('NQ11 TEST ACTIVE HTLC ADDRESS')
  })

  it('restores a target signer upsert that completes after wallet context becomes stale', async () => {
    const targetAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(targetAddress, { serviceSignatureProofSize: 104 }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(createHtlcCreation())

    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const candidate = await store.validateRemoteSignerAddress(targetAddress)
    if (candidate.status === 'invalid')
      throw new Error(candidate.reason)

    state.query.mockImplementation((sql: string) => Promise.resolve(
      sql.includes('WHERE address = ?')
        ? {
            address: targetAddress,
            balance: 25,
            proofSize: 98,
            publicKey: 'active-service-public-key',
            start: 123_000,
            end: 999_999,
            active: 1,
          }
        : [],
    ) as any)
    let resolveUpsert!: () => void
    state.run.mockImplementationOnce(() => new Promise<void>(resolve => resolveUpsert = resolve))

    const registration = store.registerValidatedRemoteSigner(candidate)
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(
      SQLQuery.UpsertTargetRemoteSigner,
      [targetAddress, 696_900_000, 104, 'service-public-key', 123_100, 999_500],
    ))
    useSyncState().walletContextGeneration += 1
    resolveUpsert()

    await expect(registration).rejects.toThrow('Wallet or network changed during validation')
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE address = ?'),
      [targetAddress],
      { single: true },
    )
    expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertRemoteSigner, [
      targetAddress,
      25,
      98,
      'active-service-public-key',
      123_000,
      999_999,
      1,
    ])
  })

  it('finishes stale target compensation before a newer direct signer write', async () => {
    const targetAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    const creation = createHtlcCreation()
    state.getAccount.mockResolvedValue({ data: createLiveHtlcAccount(), error: undefined })
    state.getRemoteSigner.mockResolvedValue({
      data: createRemoteSignerApiData(targetAddress, { serviceSignatureProofSize: 104 }),
      error: undefined,
      hasError: false,
      status: 200,
    })
    state.client.getTransaction.mockResolvedValue(creation)

    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const candidate = await store.validateRemoteSignerAddress(targetAddress)
    if (candidate.status === 'invalid')
      throw new Error(candidate.reason)
    await store.updateRemoteSigner({
      active: true,
      address: createAddress(targetAddress),
      balance: 25,
      end: 999_999,
      proofSize: 98,
      publicKey: 'active-service-public-key',
      start: 123_000,
    } as any)

    state.run.mockClear()
    state.query.mockImplementation((sql: string) => Promise.resolve(
      sql.includes('WHERE address = ?')
        ? {
            address: targetAddress,
            balance: 25,
            proofSize: 98,
            publicKey: 'active-service-public-key',
            start: 123_000,
            end: 999_999,
            active: 1,
          }
        : [],
    ) as any)
    let resolveUpsert!: () => void
    state.run.mockImplementationOnce(() => new Promise<void>(resolve => resolveUpsert = resolve))

    const registration = store.registerValidatedRemoteSigner(candidate)
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(
      SQLQuery.UpsertTargetRemoteSigner,
      [targetAddress, 696_900_000, 104, 'service-public-key', 123_100, 999_500],
    ))
    useSyncState().walletContextGeneration += 1
    const balanceUpdate = store.updateActiveRemoteBalance(99)
    await Promise.resolve()
    expect(state.run).not.toHaveBeenCalledWith(
      SQLQuery.UpdateRemoteBalance,
      [99, targetAddress],
    )
    resolveUpsert()

    await expect(registration).rejects.toThrow('Wallet or network changed during validation')
    await balanceUpdate
    const runCalls = state.run.mock.calls as unknown as [string, unknown[]][]
    const restoreCall = runCalls.findIndex(([sql]) => sql === SQLQuery.InsertRemoteSigner)
    const balanceCall = runCalls.findIndex(([sql]) => sql === SQLQuery.UpdateRemoteBalance)
    expect(restoreCall).toBeLessThan(balanceCall)
  })

  it('restores a balance update that completes after wallet context becomes stale', async () => {
    const targetAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    const address = createAddress(targetAddress) as any
    const previous = {
      address: targetAddress,
      balance: 25,
      proofSize: 98,
      publicKey: 'active-service-public-key',
      start: 123_000,
      end: 999_999,
      active: 1,
    }
    state.query.mockResolvedValue(previous as any)
    let resolveUpdate!: () => void
    state.run.mockImplementationOnce(() => new Promise<void>(resolve => resolveUpdate = resolve))

    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const context = store.getWalletContext()!
    const update = store.updateRemoteSignerBalance(99, address, context)
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(
      SQLQuery.UpdateRemoteBalance,
      [99, targetAddress],
    ))
    useSyncState().walletContextGeneration += 1
    resolveUpdate()

    await expect(update).resolves.toBe(false)
    expect(state.run).toHaveBeenCalledWith(SQLQuery.InsertRemoteSigner, [
      previous.address,
      previous.balance,
      previous.proofSize,
      previous.publicKey,
      previous.start,
      previous.end,
      previous.active,
    ])
  })

  it('revalidates a manually selected HTLC before registering it', async () => {
    const staleResult = {
      status: 'importable',
      address: 'NQ22 TEST OLD HTLC ADDRESS',
      balance: 696_900_000,
      timeout: 999_500,
      expired: false,
      owner: 'NQ00 TEST LOCAL ADDRESS',
      cosignerRecipient: 'NQ99 COSIGNER ADDRESS',
      creationState: 'confirmed',
      signer: {
        active: false,
        address: createAddress('NQ22 TEST OLD HTLC ADDRESS'),
        balance: 696_900_000,
        end: 999_500,
        proofSize: 98,
        publicKey: 'service-public-key',
        start: 123_100,
      },
    } as const
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    state.networkName = 'mainalbatross'

    await expect(store.registerValidatedRemoteSigner(staleResult as any)).rejects.toThrow('Cosigner unavailable or on a different network')
    expect(state.run).not.toHaveBeenCalled()
  })

  it('shares a pending remote-signer lookup and caches its result', async () => {
    let resolveSnapshot!: (value: any[]) => void
    state.query.mockImplementationOnce(() => new Promise(resolve => resolveSnapshot = resolve))
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    const lookups = Array.from({ length: 23 }, () => store.getOurRemoteSignerAddresses())
    expect(state.query).toHaveBeenCalledOnce()
    resolveSnapshot([])
    const results = await Promise.all(lookups)

    expect(results.every(result => result === results[0])).toBe(true)
    expect(await store.getOurRemoteSignerAddresses()).toBe(results[0])
    expect(state.query).toHaveBeenCalledOnce()
  })

  it('retries a shared remote-signer lookup after a DB failure', async () => {
    state.query.mockRejectedValueOnce(new Error('DB read failed')).mockResolvedValue([])
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    const results = await Promise.allSettled([
      store.getOurRemoteSignerAddresses(),
      store.getOurRemoteSignerAddresses(),
    ])
    expect(results).toEqual([
      { status: 'rejected', reason: new Error('DB read failed') },
      { status: 'rejected', reason: new Error('DB read failed') },
    ])
    expect(state.query).toHaveBeenCalledOnce()
    expect(await store.getOurRemoteSignerAddresses()).toEqual(new Set())
    expect(state.query).toHaveBeenCalledTimes(2)
  })

  it('keeps a new wallet lookup pending when the old wallet lookup rejects', async () => {
    let resolveOldSnapshot!: (value: any[]) => void
    let resolveNewSnapshot!: (value: any[]) => void
    state.query
      .mockImplementationOnce(() => new Promise(resolve => resolveOldSnapshot = resolve))
      .mockImplementationOnce(() => new Promise(resolve => resolveNewSnapshot = resolve))
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    const oldLookup = store.getOurRemoteSignerAddresses()
    ;(useLocalWallet() as any).localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    const newLookup = store.getOurRemoteSignerAddresses()
    const oldRejection = expect(oldLookup).rejects.toThrow('Wallet changed during remote signer lookup')
    resolveOldSnapshot([])
    await oldRejection
    const sharedLookup = store.getOurRemoteSignerAddresses()
    expect(state.query).toHaveBeenCalledTimes(2)
    resolveNewSnapshot([])
    expect(await sharedLookup).toBe(await newLookup)
    expect(await store.getOurRemoteSignerAddresses()).toBe(await newLookup)
    expect(state.query).toHaveBeenCalledTimes(2)
  })

  it('does not publish a remote-signer cache snapshot invalidated during its DB read', async () => {
    const signer = {
      active: false,
      address: 'NQ22 TEST OLD HTLC ADDRESS',
      balance: 696_900_000,
      end: 999_500,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_100,
    }
    let resolveOldSnapshot!: (value: any[]) => void
    state.query
      .mockImplementationOnce(() => new Promise(resolve => resolveOldSnapshot = resolve))
      .mockResolvedValue([signer])
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    const addresses = Promise.all(Array.from({ length: 23 }, () => store.getOurRemoteSignerAddresses()))
    await vi.waitFor(() => expect(state.query).toHaveBeenCalledOnce())
    await store.upsertInactiveRemoteSigner({ ...signer, address: createAddress(signer.address) } as any)
    resolveOldSnapshot([])

    const results = await addresses
    expect(results.every(result => result.has(signer.address) && result === results[0])).toBe(true)
    expect(state.query).toHaveBeenCalledTimes(2)
  })

  it('removes an inactive signer inserted after wallet context becomes stale', async () => {
    const { SQLQuery } = await import('@/lib/sql-queries')
    const { useSyncState } = await import('@/stores/sync/state')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const context = store.getWalletContext()!
    let resolveInsert!: (result: any) => void
    state.run.mockImplementationOnce(() => new Promise(resolve => resolveInsert = resolve))
    const signer = {
      active: false,
      address: createAddress('NQ22 STALE HTLC ADDRESS'),
      balance: 0,
      end: 999_500,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_100,
    } as any

    const insertion = store.upsertInactiveRemoteSigner(signer, context)
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledWith(
      SQLQuery.InsertInactiveRemoteSigner,
      ['NQ22 STALE HTLC ADDRESS', 0, 98, 'service-public-key', 123_100, 999_500, false],
    ))
    useSyncState().walletContextGeneration += 1
    resolveInsert({ changes: { changes: 1 } })

    await expect(insertion).resolves.toBe('already-known')
    expect(state.run).toHaveBeenCalledWith(SQLQuery.DeleteRemoteSigner, ['NQ22 STALE HTLC ADDRESS'])
  })

  it('does not overwrite an existing signer when an inactive insert loses a race', async () => {
    state.run.mockImplementationOnce(() => Promise.resolve({ changes: { changes: 0 } }) as any)

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().upsertInactiveRemoteSigner({
      active: false,
      address: createAddress('NQ22 TEST OLD HTLC ADDRESS'),
      balance: 696_900_000,
      end: 999_500,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_100,
    } as any)

    expect(result).toBe('already-known')
    expect(state.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE'),
      ['NQ22 TEST OLD HTLC ADDRESS', 696_900_000, 98, 'service-public-key', 123_100, 999_500, false],
    )
  })

  it.each([
    ['malformed address', 'malformed', undefined, undefined, undefined],
    ['non-HTLC account', 'NQ22 TEST OLD HTLC ADDRESS', { type: 'basic', balance: 1 }, undefined, undefined],
    ['zero balance', 'NQ22 TEST OLD HTLC ADDRESS', { type: 'htlc', balance: 0, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_500 }, undefined, undefined],
    ['foreign owner', 'NQ22 TEST OLD HTLC ADDRESS', { type: 'htlc', balance: 1, sender: 'NQ01 OTHER OWNER', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_500 }, undefined, undefined],
    ['wrong cosigner recipient', 'NQ22 TEST OLD HTLC ADDRESS', { type: 'htlc', balance: 1, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ98 OTHER COSIGNER', timeout: 999_500 }, undefined, undefined],
    ['server public-key mismatch', 'NQ22 TEST OLD HTLC ADDRESS', { type: 'htlc', balance: 1, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_500 }, 'other-service-key', undefined],
    ['failed creation transaction', 'NQ22 TEST OLD HTLC ADDRESS', { type: 'htlc', balance: 1, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 999_500 }, 'service-public-key', false],
  ])('rejects %s during exact-address validation', async (_name, address, account, apiPublicKey, executionResult) => {
    if (account)
      state.getAccount.mockResolvedValue({ data: account, error: undefined })
    if (apiPublicKey) {
      state.getRemoteSigner.mockResolvedValue({
        data: {
          address,
          balance: 1,
          servicePublicKey: apiPublicKey,
          serviceSignatureProofSize: 98,
          validityStart: 100,
          validityEnd: 999_500,
          creatingTransactionHash: 'creation-hash',
        },
        error: undefined,
        hasError: false,
        status: 200,
      })
    }
    if (executionResult !== undefined) {
      state.client.getTransaction.mockResolvedValue({
        transactionHash: 'creation-hash',
        state: 'confirmed',
        executionResult,
        timestamp: 123_100,
      })
    }

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().validateRemoteSignerAddress(address)

    expect(result.status).toBe('invalid')
    expect(state.run).not.toHaveBeenCalled()
  })

  it('does not treat equivalent address values as a newer remote signer', async () => {
    const activeAddress = 'NQ11 TEST ACTIVE REMOTE ADDRESS'
    state.query.mockImplementation(((sql: string, _params?: unknown[], options?: { single?: boolean }) => {
      const signer = {
        active: true,
        balance: 25,
        end: 999_999,
        proofSize: 98,
        publicKey: 'service-public-key',
        start: 123_000,
        address: activeAddress,
      }
      return Promise.resolve(options?.single ? signer : [signer])
    }) as any)

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()

    expect(state.logger.log).not.toHaveBeenCalledWith('📡 Found a newer remote signer that is not the active one')
  })

  it('refreshes signer balances in batches and preserves balances for failed batches', async () => {
    const signers = Array.from({ length: 25 }, (_, index) => ({
      active: index === 24,
      balance: 0,
      end: 999_999,
      proofSize: 98,
      publicKey: 'service-public-key',
      start: 123_000 + index,
      address: `NQ${String(index).padStart(2, '0')} TEST REMOTE ADDRESS`,
    }))
    state.query.mockResolvedValue(signers)
    const getAccounts = vi.fn()
      .mockRejectedValueOnce(new Error('temporary accounts failure'))
      .mockResolvedValueOnce(signers.slice(20).map((_, index) => ({
        type: 'htlc',
        balance: index + 1,
      })))
    state.client = { ...state.client, getAccounts }

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.updateSignersTableBalance()

    expect(getAccounts).toHaveBeenCalledTimes(2)
    expect(state.run).toHaveBeenCalledTimes(5)
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [1, 'NQ20 TEST REMOTE ADDRESS'])
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [5, 'NQ24 TEST REMOTE ADDRESS'])
  })

  describe('registerOwnHtlcIfMissing', () => {
    it('inserts a previously-unknown HTLC as inactive using the on-chain account fields', async () => {
      state.getStatus.mockResolvedValueOnce({
        data: { status: 'good', blockHeight: 128, servicePublicKey: 'service-public-key', network: 'TestAlbatross' },
        error: undefined,
        hasError: false,
        status: 200,
      })
      state.getAccount.mockResolvedValue({
        data: { type: 'htlc', balance: 521, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 555_000, hashRoot: '0'.repeat(64), hashAlgorithm: 'sha256', hashCount: 1, totalAmount: 521 },
        error: undefined,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      // Allow the immediate getStatus interval to populate remotePublicKey.
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ44 EXTENSION HTLC ADDRESS')

      expect(claim).toBe('ours')
      expect(state.getAccount).toHaveBeenCalled()
      expect(state.run).toHaveBeenCalledWith(
        expect.any(String),
        ['NQ44 EXTENSION HTLC ADDRESS', 521, 98, 'service-public-key', 0, 555_000, false],
      )
    })

    it('does not insert an unknown HTLC after wallet context invalidation', async () => {
      state.getStatus.mockResolvedValueOnce({
        data: { status: 'good', blockHeight: 128, servicePublicKey: 'service-public-key', network: 'TestAlbatross' },
        error: undefined,
        hasError: false,
        status: 200,
      })
      let finishAccountLookup!: (result: { data: any, error: undefined }) => void
      state.getAccount.mockReturnValueOnce(new Promise(resolve => finishAccountLookup = resolve))

      const { useSyncState } = await import('@/stores/sync/state')
      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()
      const context = store.getWalletContext()!

      const registration = store.registerOwnHtlcIfMissing('NQ44 EXTENSION HTLC ADDRESS', context)
      await vi.waitFor(() => expect(state.getAccount).toHaveBeenCalledOnce())
      useSyncState().walletContextGeneration += 1
      finishAccountLookup({
        data: { type: 'htlc', balance: 521, timeout: 555_000 },
        error: undefined,
      })
      await registration

      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ44 EXTENSION HTLC ADDRESS']),
      )
    })

    it('skips when the HTLC is already in remote_signers', async () => {
      state.query.mockImplementation(((_sql: string, _params?: unknown[], options?: { single?: boolean }) => {
        if (options?.single)
          return Promise.resolve(undefined)
        return Promise.resolve([{
          active: false,
          balance: 0,
          end: 999_999,
          proofSize: 98,
          publicKey: 'service-public-key',
          start: 0,
          address: 'NQ44 EXTENSION HTLC ADDRESS',
        }])
      }) as any)

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      const claim = await store.registerOwnHtlcIfMissing('NQ44 EXTENSION HTLC ADDRESS')

      expect(claim).toBe('ours')
      expect(state.getAccount).not.toHaveBeenCalled()
      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ44 EXTENSION HTLC ADDRESS']),
      )
    })

    it('registers a pruned HTLC whose creation tx shows our own shape', async () => {
      state.getAccount.mockResolvedValue({ data: { type: 'basic', balance: 100 }, error: undefined })
      state.getHtlcCreationData.mockResolvedValue({
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ99 COSIGNER ADDRESS',
        hashRoot: '0'.repeat(64),
        hashCount: 1,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ44 PRUNED HTLC')

      expect(claim).toBe('ours')
      expect(state.run).toHaveBeenCalledWith(
        expect.any(String),
        ['NQ44 PRUNED HTLC', 0, 98, 'service-public-key', 0, 0, false],
      )
    })

    it('does not register a Mini App HTLC whose contract shape is not ours', async () => {
      state.getAccount.mockResolvedValue({
        data: { type: 'htlc', balance: 500, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', timeout: 555_000, hashRoot: 'ab'.repeat(32), hashAlgorithm: 'blake2b', hashCount: 1, totalAmount: 500 },
        error: undefined,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ55 MINI APP HTLC ADDRESS')

      expect(claim).toBe('foreign')
      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ55 MINI APP HTLC ADDRESS']),
      )
    })

    it('does not register a pruned HTLC whose creation tx is not ours', async () => {
      state.getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })
      state.getHtlcCreationData.mockResolvedValue({
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ77 SOME COUNTERPARTY',
        hashRoot: 'ab'.repeat(32),
        hashCount: 1,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ55 PRUNED MINI APP HTLC')

      expect(claim).toBe('foreign')
      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ55 PRUNED MINI APP HTLC']),
      )
    })

    it('reports unknown rather than foreign when neither the account nor its creation tx yields a shape', async () => {
      // getAccount is a non-htlc (pruned) account, and getHtlcCreationData is left at its default
      // resolved value (undefined, i.e. no creation tx found) — neither source has a shape at all.
      // Callers only ask about contracts they just saw a drain from, so a creation tx must exist:
      // an empty answer is a history index that isn't ready, not a foreign contract.
      state.getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ66 UNKNOWN SHAPE ADDRESS')

      expect(claim).toBe('unknown')
      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ66 UNKNOWN SHAPE ADDRESS']),
      )
    })

    it('reports unknown rather than foreign when the creation-tx query throws', async () => {
      // A thrown query (timeout, client not ready) is not the same as a confirmed foreign shape —
      // recording it now could never be retracted, so the caller must be able to defer instead.
      state.getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })
      state.getHtlcCreationData.mockRejectedValue(new Error('Operation timed out after 30000 milliseconds'))

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ77 MAYBE OWN HTLC ADDRESS')

      expect(claim).toBe('unknown')
      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ77 MAYBE OWN HTLC ADDRESS']),
      )
    })

    it('reports unknown rather than throwing when the cosigner key is not valid hex', async () => {
      // servicePublicKey comes straight from an API response, and `fromHex` throws on malformed
      // input — which would escape into whichever caller's refresh loop asked the question.
      ;(globalThis as any).Nimiq.PublicKey.fromHex = vi.fn(() => {
        throw new Error('Invalid public key')
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ88 UNREADABLE KEY ADDRESS')

      expect(claim).toBe('unknown')
      expect(state.getAccount).not.toHaveBeenCalled()
      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ88 UNREADABLE KEY ADDRESS']),
      )
      expect(state.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('public key'),
        expect.objectContaining({ publicKeyLength: 'service-public-key'.length }),
      )
    })
  })
})
