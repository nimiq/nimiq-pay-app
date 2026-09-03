import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

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

const state = vi.hoisted(() => {
  const getBalance = vi.fn(() => Promise.resolve({ data: 0, error: undefined }))
  const getAccount = vi.fn((): Promise<{ data: any, error: any }> => Promise.resolve({ data: undefined, error: 'No account found' }))
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
    getStatus,
    getRemoteSigner,
    query,
    run,
    runSet,
    reconnect,
    createHistoryClient,
    logger,
  }
})

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

vi.mock('@/stores/locks', () => {
  const useLocks = defineStore('locks', () => ({
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
    getBalance: state.getBalance,
    reconnect: state.reconnect,
    createHistoryClient: state.createHistoryClient,
    client: ref(state.client),
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
        fromHex: (value: string) => ({
          toAddress: () => createAddress(value === 'service-public-key' ? 'NQ99 COSIGNER ADDRESS' : 'NQ98 OTHER COSIGNER'),
        }),
      },
      Policy: {
        BLOCKS_PER_BATCH: 32,
      },
    })

    state.localAddress = createAddress('NQ00 TEST LOCAL ADDRESS')
    state.hasLocalWallet = true
    state.client = {
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

  it('does not finish a signer DB write after the wallet context changes', async () => {
    let finishWrite!: (result: any) => void
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
    state.runSet.mockImplementationOnce(() => new Promise(resolve => finishFirstWrite = resolve))
    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    await vi.waitFor(() => expect(store.remotePublicKey).toBe('service-public-key'))

    const firstActivation = store.activateRemoteSignerFromTransaction(createHtlcCreation() as any)
    await vi.waitFor(() => expect(state.runSet).toHaveBeenCalledOnce())
    state.localAddress = createAddress('NQ01 NEXT LOCAL ADDRESS')
    ;(useLocalWallet() as any).localAddress = state.localAddress
    const secondCreation = createHtlcCreation({
      recipient: 'NQ23 NEXT HTLC ADDRESS',
      data: {
        type: 'htlc',
        sender: 'NQ01 NEXT LOCAL ADDRESS',
        recipient: 'NQ99 COSIGNER ADDRESS',
        timeout: 999_600,
      },
    })
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

  it('does not share history results across wallet and client changes', async () => {
    let resolveFirst!: (transactions: any[]) => void
    const firstClient = state.client
    firstClient.getTransactionsByAddress = vi.fn(() => new Promise<any[]>(resolve => resolveFirst = resolve))

    const { useLocalWallet } = await import('@/stores/local-wallet')
    const { useNimiqNetwork } = await import('@/stores/nimiq-network')
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
    useNimiqNetwork().client = secondClient
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

    const { useNimiqNetwork } = await import('@/stores/nimiq-network')
    const { useRemoteSigner } = await import('./remote-signer')
    const request = expect(useRemoteSigner().getLocalTransactions()).rejects.toThrow('Operation timed out')
    await vi.waitFor(() => expect(firstClient.getTransactionsByAddress).toHaveBeenCalledOnce())

    const nextClient = {
      ...firstClient,
      getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
    }
    state.client = nextClient
    useNimiqNetwork().client = nextClient
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
    state.client.getTransactionsByAddress = vi.fn((_address: unknown, _sinceHeight: unknown, _known: unknown, startAt: string | undefined) => Promise.resolve(
      startAt ? [createHtlcCreation()] : firstPage,
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

  it('discovers a funded signer through an empty first-hop HTLC extension chain', async () => {
    const root = createHtlcCreation()
    const extension = createHtlcCreation({
      transactionHash: 'extension-hash',
      sender: root.recipient,
      senderType: 'htlc',
      recipient: 'NQ33 TEST FUNDED HTLC ADDRESS',
      timestamp: 124_100,
    })
    state.client.getTransactionsByAddress = vi.fn((address: ReturnType<typeof createAddress>) => {
      const value = address.toUserFriendlyAddress()
      if (value === state.localAddress.toUserFriendlyAddress())
        return Promise.resolve([root])
      if (value === root.recipient)
        return Promise.resolve([extension])
      return Promise.resolve([])
    })
    state.getAccount.mockImplementation((async (address: ReturnType<typeof createAddress>) => address.toUserFriendlyAddress() === extension.recipient
      ? { data: createLiveHtlcAccount({ balance: 500, totalAmount: 500, timeout: 1_000_500 }), error: undefined }
      : { data: undefined, error: 'No account found' }) as any)

    const { useRemoteSigner } = await import('./remote-signer')
    const result = await useRemoteSigner().discoverRemoteSignersFromBlockchain()

    expect(result).toEqual({ added: 1, alreadyKnown: 0, localComplete: true, errors: [] })
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

    expect(result.added).toBe(1)
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [root.recipient, 400, 98, 'service-public-key', 123_100, 999_500, false])
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
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([createHtlcCreation()]))
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

  it('validates and imports a funded HTLC as inactive', async () => {
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
    state.client.getTransaction.mockResolvedValue({
      transactionHash: 'creation-hash',
      state: 'confirmed',
      executionResult: true,
      timestamp: 123_100,
    })

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
    if (result.status !== 'importable')
      throw new Error('Expected importable HTLC')

    expect(await store.importValidatedRemoteSigner(result)).toBe('added')
    expect(state.run).toHaveBeenCalledWith(
      expect.any(String),
      [oldAddress, 696_900_000, 98, 'service-public-key', 123_100, 999_500, false],
    )
  })

  it('revalidates a manually selected HTLC before importing it', async () => {
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

    await expect(store.importValidatedRemoteSigner(staleResult as any)).rejects.toThrow('Cosigner unavailable or on a different network')
    expect(state.run).not.toHaveBeenCalled()
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

    const addresses = store.getOurRemoteSignerAddresses()
    await vi.waitFor(() => expect(state.query).toHaveBeenCalledOnce())
    await store.upsertInactiveRemoteSigner({ ...signer, address: createAddress(signer.address) } as any)
    resolveOldSnapshot([])

    expect(await addresses).toContain(signer.address)
    expect(state.query).toHaveBeenCalledTimes(2)
  })

  it('does not replace an existing signer when the same HTLC is imported twice', async () => {
    const oldAddress = 'NQ22 TEST OLD HTLC ADDRESS'
    let stored = false
    state.query.mockImplementation(((_sql: string, _params?: unknown[], options?: { single?: boolean }) => {
      if (options?.single)
        return Promise.resolve(undefined)
      return Promise.resolve(stored
        ? [{
            active: true,
            balance: 696_900_000,
            end: 999_500,
            proofSize: 98,
            publicKey: 'service-public-key',
            start: 123_100,
            address: oldAddress,
          }]
        : [])
    }) as any)
    state.run.mockImplementation(async () => {
      if (stored)
        return { changes: { changes: 0 } }
      stored = true
      return { changes: { changes: 1 } }
    })
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
    state.client.getTransaction.mockResolvedValue({
      transactionHash: 'creation-hash',
      state: 'confirmed',
      executionResult: true,
      timestamp: 123_100,
    })

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()
    const result = await store.validateRemoteSignerAddress(oldAddress)
    if (result.status !== 'importable')
      throw new Error('Expected importable HTLC')

    expect(await store.importValidatedRemoteSigner(result)).toBe('added')
    expect(await store.importValidatedRemoteSigner(result)).toBe('already-known')
    expect(state.run).toHaveBeenCalledOnce()
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
    state.getAccounts
      .mockResolvedValueOnce({ data: undefined, error: new Error('temporary accounts failure') })
      .mockResolvedValueOnce({
        data: signers.slice(20).map((_, index) => ({
          type: 'htlc',
          balance: index + 1,
        })),
        error: undefined,
      })

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.updateSignersTableBalance()

    expect(state.getAccounts).toHaveBeenCalledTimes(2)
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
        data: { type: 'htlc', balance: 521, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ_R', timeout: 555_000, hashRoot: '0', hashAlgorithm: 'sha256', hashCount: 1, totalAmount: 521 },
        error: undefined,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      // Allow the immediate getStatus interval to populate remotePublicKey.
      await Promise.resolve()
      await Promise.resolve()

      await store.registerOwnHtlcIfMissing('NQ44 EXTENSION HTLC ADDRESS')

      expect(state.getAccount).toHaveBeenCalled()
      expect(state.run).toHaveBeenCalledWith(
        expect.any(String),
        ['NQ44 EXTENSION HTLC ADDRESS', 521, 98, 'service-public-key', 0, 555_000, false],
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
      await store.registerOwnHtlcIfMissing('NQ44 EXTENSION HTLC ADDRESS')

      expect(state.getAccount).not.toHaveBeenCalled()
      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ44 EXTENSION HTLC ADDRESS']),
      )
    })

    it('still registers when getAccount returns a non-htlc account (pruned post-drain)', async () => {
      state.getAccount.mockResolvedValue({
        data: { type: 'basic', balance: 100 },
        error: undefined,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      await store.registerOwnHtlcIfMissing('NQ44 PRUNED HTLC')

      expect(state.run).toHaveBeenCalledWith(
        expect.any(String),
        ['NQ44 PRUNED HTLC', 0, 98, 'service-public-key', 0, 0, false],
      )
    })
  })
})
