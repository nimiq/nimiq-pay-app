import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'

function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
    equals: (other?: { toUserFriendlyAddress: () => string }) => other?.toUserFriendlyAddress() === value,
  }
}

const state = vi.hoisted(() => {
  const getBalance = vi.fn(() => Promise.resolve({ data: 0, error: undefined }))
  const getAccount = vi.fn((): Promise<{ data: any, error: any }> => Promise.resolve({ data: undefined, error: 'No account found' }))
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
  const getRemoteSigner = vi.fn(() => Promise.resolve({
    data: undefined,
    error: { message: 'not found', statusCode: 404, error: 'NOT_FOUND' },
    hasError: true,
    status: 404,
  }))
  const query = vi.fn((_sql: string, _params?: unknown[], options?: { single?: boolean }): Promise<unknown[] | unknown | undefined> => Promise.resolve(options?.single ? undefined : []))
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
      getTransaction: vi.fn(() => Promise.resolve(undefined)),
      addHeadChangedListener: vi.fn(),
    },
    height: 128,
    headTimestamp: 123_456,
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
    getAccount: state.getAccount,
    getAccounts: state.getAccounts,
    getHtlcCreationData: state.getHtlcCreationData,
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
      PublicKey: {
        fromHex: () => ({ toAddress: () => createAddress('NQ11 COSIGNER ADDRESS') }),
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
      addHeadChangedListener: vi.fn(),
    }
    state.height = 128
    state.headTimestamp = 123_456
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

  it('discovers missing historical HTLC signers as inactive without replacing the active signer', async () => {
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
    state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([{
      recipient: oldAddress,
      recipientType: 'htlc',
      timestamp: 123_100,
      validityStartHeight: 100,
      data: { timeout: 999_500 },
    }]))

    const { useRemoteSigner } = await import('./remote-signer')
    const store = useRemoteSigner()

    await store.init()
    await store.discoverRemoteSignersFromBlockchain()

    expect(store.remoteAddress?.toUserFriendlyAddress()).toBe(activeAddress)
    expect(store.remoteBalance).toBe(25)
    expect(state.run).toHaveBeenCalledWith(expect.any(String), [oldAddress, 0, 98, 'service-public-key', 123_100, 999_500, false])
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
        data: { type: 'htlc', balance: 521, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ11 COSIGNER ADDRESS', timeout: 555_000, hashRoot: '0'.repeat(64), hashAlgorithm: 'sha256', hashCount: 1, totalAmount: 521 },
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
        recipient: 'NQ11 COSIGNER ADDRESS',
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

    it('does not register when neither the account nor its creation tx yields a shape', async () => {
      // getAccount is a non-htlc (pruned) account, and getHtlcCreationData is left at its default
      // resolved value (undefined, i.e. no creation tx found) — neither source has a shape at all.
      state.getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      const claim = await store.registerOwnHtlcIfMissing('NQ66 UNKNOWN SHAPE ADDRESS')

      expect(claim).toBe('foreign')
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
