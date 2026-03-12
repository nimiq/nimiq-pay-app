import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
  }
}

const state = vi.hoisted(() => {
  const getBalance = vi.fn(() => Promise.resolve({ data: 0, error: undefined }))
  const getAccounts = vi.fn(() => Promise.resolve({ data: [], error: undefined }))
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
  const getRemoteSigner = vi.fn(() => Promise.resolve({
    data: undefined,
    error: { message: 'not found', statusCode: 404, error: 'NOT_FOUND' },
    hasError: true,
    status: 404,
  }))
  const query = vi.fn((_sql: string, _params?: unknown[], options?: { single?: boolean }) => Promise.resolve(options?.single ? undefined : []))
  const run = vi.fn(() => Promise.resolve())
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
      addHeadChangedListener: vi.fn(),
    },
    height: 128,
    headTimestamp: 123_456,
    consensus: 'established' as 'connecting' | 'established',
    isProcessingRemote: false,
    getBalance,
    getAccounts,
    getStatus,
    getRemoteSigner,
    query,
    run,
    logger,
  }
})

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/stores/conn', () => {
  const useConn = defineStore('conn', () => ({
    query: state.query,
    run: state.run,
  }))

  return { useConn }
})

vi.mock('@/stores/local-wallet', () => {
  const useLocalWallet = defineStore('local-wallet', () => ({
    localAddress: computed(() => state.localAddress),
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
    getAccounts: state.getAccounts,
    getBalance: state.getBalance,
    client: computed(() => state.client),
    height: computed(() => state.height),
    headTimestamp: computed(() => state.headTimestamp),
    consensus: computed(() => state.consensus),
  }))

  return { useNimiqNetwork }
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
        fromString: (value: string) => createAddress(value),
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
      addHeadChangedListener: vi.fn(),
    }
    state.height = 128
    state.headTimestamp = 123_456
    state.consensus = 'established'
    state.isProcessingRemote = true

    state.getBalance.mockReset()
    state.getBalance.mockResolvedValue({ data: 0, error: undefined })
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
    state.run.mockResolvedValue(undefined)
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
    state.query.mockImplementation(((sql: string, _params?: unknown[], options?: { single?: boolean }) => {
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

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    await store.resolveHomeBalanceState()

    expect(store.homeBalanceState).toBe('resolved-remote')
    expect(store.remoteBalance).toBe(25)
  })

  it('keeps loading when the local account already has main-address funds', async () => {
    state.getBalance.mockResolvedValue({ data: 42, error: undefined })

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.resolveHomeBalanceState()

    expect(store.homeBalanceState).toBe('loading')
  })
})
