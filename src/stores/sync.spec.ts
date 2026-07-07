import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { NO_ACCOUNT_ERROR } from '@/stores/nimiq-network'
import { Transfer } from '@/types/transactions'

function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
    equals: (other?: { toUserFriendlyAddress: () => string }) => other?.toUserFriendlyAddress() === value,
  }
}

const state = vi.hoisted(() => {
  const getBalance = vi.fn((_address?: unknown): Promise<{ data: any, error: any }> => Promise.resolve({ data: 0, error: undefined }))
  const getAccountTransactions = vi.fn(() => Promise.resolve({ data: [] }))
  const getAllOutgoingTransactionsFromHtlcs = vi.fn(() => Promise.resolve([]))
  const query = vi.fn((_sql?: string): Promise<any[]> => Promise.resolve([]))
  const run = vi.fn(() => Promise.resolve())
  const sendTx = vi.fn(() => Promise.resolve({ data: { tx: { hash: 'drain-hash' } }, error: undefined }))
  const discoverRemoteSignersFromBlockchain = vi.fn(() => Promise.resolve())
  const updateSignersTableBalance = vi.fn(() => Promise.resolve())
  const updateRemoteSigner = vi.fn(() => Promise.resolve())
  const getAllRemoteSigners = vi.fn(() => Promise.resolve([]))
  const addRemoteSigner = vi.fn(() => Promise.resolve())
  const addReceiptTransaction = vi.fn()
  const addUnknownPaymentToMerchantTransaction = vi.fn()
  const addWithdrawalTransaction = vi.fn()
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  return {
    localAddress: createAddress('NQ00 TEST LOCAL ADDRESS'),
    localBalance: 0,
    hasLocalWallet: true,
    remoteAddress: createAddress('NQ11 TEST REMOTE ADDRESS'),
    remoteBalance: 0,
    remoteSigner: undefined as any,
    remoteHeight: 128,
    remotePublicKey: 'service-public-key',
    remoteProofSize: 98,
    headTimestamp: 200_000,
    height: 128,
    lastMacroBlockHeight: 128,
    consensus: 'established' as 'connecting' | 'established' | 'syncing',
    isSendingTx: false,
    isProcessingRemote: false,
    isSyncingWallets: false,
    isUpdatingTransactions: false,
    headChangePendingDrainLock: false,
    headChangeUpdatesLock: false,
    htlcCheckLock: false,
    client: {
      waitForConsensusEstablished: vi.fn(() => Promise.resolve()),
      addHeadChangedListener: vi.fn(),
      addTransactionListener: vi.fn(() => 1),
      removeListener: vi.fn(() => Promise.resolve()),
      getAccount: vi.fn(() => Promise.resolve({ type: 'basic', balance: 0 })),
      getTransaction: vi.fn(() => Promise.resolve(undefined)),
    },
    getBalance,
    getAccountTransactions,
    getAllOutgoingTransactionsFromHtlcs,
    query,
    run,
    sendTx,
    discoverRemoteSignersFromBlockchain,
    updateSignersTableBalance,
    updateRemoteSigner,
    getAllRemoteSigners,
    addRemoteSigner,
    addReceiptTransaction,
    addUnknownPaymentToMerchantTransaction,
    addWithdrawalTransaction,
    logger,
  }
})

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/composables/useApi', () => ({
  useCplApi: () => ({
    getOrderById: vi.fn(() => Promise.resolve({ data: undefined, error: undefined })),
  }),
  useRemoteSignerApi: () => ({
    getTransactionState: vi.fn(() => Promise.resolve({ data: undefined, error: undefined })),
  }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    scheduleIncomingPaymentNotification: vi.fn(),
  }),
}))

vi.mock('@/composables/useFastspotv1', () => ({
  useFastspotApiV1: vi.fn(() => Promise.resolve({ getContract: vi.fn() })),
}))

vi.mock('@/composables/usePolygonSync', () => ({
  usePolygonSync: () => ({
    init: vi.fn(() => Promise.resolve()),
  }),
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice: (value: number) => ({
    crypto: { formatted: `${value}` },
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    setToast: vi.fn(),
  }),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock('@/lib', () => ({
  isDev: false,
  nakaBufferAddresses: [],
}))

vi.mock('@/lib/tx', () => ({
  toAccountType: (type: string) => type,
}))

vi.mock('@/stores/app', () => {
  const useApp = defineStore('app', () => ({
    // storeToRefs reads `.effect` on every state value, so these must be reactive, not plain
    // values — a bare `undefined` would throw once a consumer (htlc.ts) calls storeToRefs(useApp()).
    pointsToken: computed(() => undefined),
    htlcThreshold: computed(() => 0),
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

vi.mock('@/stores/local-wallet', () => {
  const useLocalWallet = defineStore('local-wallet', () => ({
    localAddress: computed(() => state.localAddress),
    localBalance: computed({
      get: () => state.localBalance,
      set: value => state.localBalance = value,
    }),
    localWallet: computed(() => ({ privateKey: {}, publicKey: {} })),
    hasLocalWallet: computed(() => state.hasLocalWallet),
  }))

  return { useLocalWallet }
})

vi.mock('@/stores/locks', () => {
  const writableFlag = (key: 'isProcessingRemote' | 'isSendingTx' | 'isSyncingWallets' | 'isUpdatingTransactions' | 'headChangePendingDrainLock' | 'headChangeUpdatesLock' | 'htlcCheckLock') => computed({
    get: () => state[key],
    set: value => state[key] = value,
  })
  const useLocks = defineStore('locks', () => ({
    isProcessingRemote: writableFlag('isProcessingRemote'),
    isSendingTx: writableFlag('isSendingTx'),
    isSyncingWallets: writableFlag('isSyncingWallets'),
    isUpdatingTransactions: writableFlag('isUpdatingTransactions'),
    headChangePendingDrainLock: writableFlag('headChangePendingDrainLock'),
    headChangeUpdatesLock: writableFlag('headChangeUpdatesLock'),
    htlcCheckLock: writableFlag('htlcCheckLock'),
  }))

  return { useLocks }
})

vi.mock('@/stores/nimiq-network', () => {
  const useNimiqNetwork = defineStore('nimiq-network', () => ({
    getAccountTransactions: state.getAccountTransactions,
    getAllOutgoingTransactionsFromHtlcs: state.getAllOutgoingTransactionsFromHtlcs,
    getBalance: state.getBalance,
    reconnect: vi.fn(),
    client: computed(() => state.client),
    height: computed(() => state.height),
    lastMacroBlockHeight: computed(() => state.lastMacroBlockHeight),
    consensus: computed(() => state.consensus),
    headTimestamp: computed(() => state.headTimestamp),
    networkId: computed(() => 5),
  }))

  return {
    CashlinkExtraDataHex: {
      CLAIMING: 'claiming',
    },
    NO_ACCOUNT_ERROR: 'No account found',
    useNimiqNetwork,
  }
})

vi.mock('@/stores/points', () => {
  const usePoints = defineStore('points', () => ({
    updatePointsBalance: vi.fn(),
    claimCashback: vi.fn(() => Promise.resolve({ error: undefined })),
  }))

  return { usePoints }
})

vi.mock('@/stores/remote-signer', () => {
  function parseAddress(remoteSigners: any): any {
    if (!remoteSigners)
      return remoteSigners
    if (Array.isArray(remoteSigners))
      return remoteSigners.map(parseAddress)
    if (typeof remoteSigners.address !== 'string')
      return remoteSigners
    return {
      ...remoteSigners,
      address: {
        toUserFriendlyAddress: () => remoteSigners.address,
      },
    }
  }

  const useRemoteSigner = defineStore('remote-signer', () => ({
    remoteHeight: computed(() => state.remoteHeight),
    remoteBalance: computed({
      get: () => state.remoteBalance,
      set: value => state.remoteBalance = value,
    }),
    remoteAddress: computed(() => state.remoteAddress),
    hasHtlcExpired: computed(() => false),
    end: computed(() => 300_000),
    start: computed(() => 100_000),
    isHtlcActive: computed({
      get: () => true,
      set: () => {},
    }),
    isHtlcPending: computed(() => false),
    isRemoteOk: computed(() => true),
    remotePublicKey: computed(() => state.remotePublicKey),
    remoteSigner: computed(() => state.remoteSigner),
    homeBalanceState: computed(() => 'resolved-remote'),
    remoteProofSize: computed(() => state.remoteProofSize),
    getAllRemoteSigners: state.getAllRemoteSigners,
    addRemoteSigner: state.addRemoteSigner,
    blockHeightToTimestamp: vi.fn((height: number) => Promise.resolve(height * 1000)),
    discoverRemoteSignersFromBlockchain: state.discoverRemoteSignersFromBlockchain,
    updateSignersTableBalance: state.updateSignersTableBalance,
    updateRemoteSigner: state.updateRemoteSigner,
    init: vi.fn(() => Promise.resolve()),
    resolveHomeBalanceState: vi.fn(() => Promise.resolve()),
  }))

  return { parseAddress, useRemoteSigner }
})

vi.mock('@/stores/transactions', () => {
  const useTransactions = defineStore('transactions', () => ({
    sendTx: state.sendTx,
    addReceiptTransaction: state.addReceiptTransaction,
    addUnknownPaymentToMerchantTransaction: state.addUnknownPaymentToMerchantTransaction,
    addWithdrawalTransaction: state.addWithdrawalTransaction,
    addStakingtransaction: vi.fn(),
    updateTransactionCashbackClaimed: vi.fn(),
    updateTransactionStatus: vi.fn(),
    refreshFromDb: vi.fn(() => Promise.resolve()),
    setNakaTxRefunded: vi.fn(),
    setSwapHtlcRefunded: vi.fn(),
  }))

  return { useTransactions }
})

function remoteSigner(address: string, balance: number, active = false) {
  return {
    active,
    balance,
    address,
    publicKey: 'service-public-key',
    start: 100_000,
    end: 300_000,
    proofSize: 98,
  }
}

describe('useSync remote signer reconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    vi.stubGlobal('Nimiq', {
      Policy: {
        BLOCKS_PER_BATCH: 32,
      },
      Address: {
        fromString: (value: string) => createAddress(value),
        fromUserFriendlyAddress: (value: string) => createAddress(value),
      },
      BufferUtils: {
        fromHex: vi.fn(() => new Uint8Array()),
        toUtf8: vi.fn(() => ''),
      },
    })

    state.localAddress = createAddress('NQ00 TEST LOCAL ADDRESS')
    state.localBalance = 0
    state.hasLocalWallet = true
    state.remoteAddress = createAddress('NQ11 TEST REMOTE ADDRESS')
    state.remoteBalance = 0
    state.remoteSigner = undefined
    state.remoteHeight = 128
    state.remotePublicKey = 'service-public-key'
    state.remoteProofSize = 98
    state.headTimestamp = 200_000
    state.height = 128
    state.lastMacroBlockHeight = 128
    state.consensus = 'established'
    state.isSendingTx = false
    state.isProcessingRemote = false
    state.isSyncingWallets = false
    state.isUpdatingTransactions = false
    state.headChangePendingDrainLock = false
    state.headChangeUpdatesLock = false
    state.htlcCheckLock = false
    state.client = {
      waitForConsensusEstablished: vi.fn(() => Promise.resolve()),
      addHeadChangedListener: vi.fn(),
      addTransactionListener: vi.fn(() => 1),
      removeListener: vi.fn(() => Promise.resolve()),
      getAccount: vi.fn(() => Promise.resolve({ type: 'basic', balance: 0 })),
      getTransaction: vi.fn(() => Promise.resolve(undefined)),
    }

    state.getBalance.mockReset()
    state.getBalance.mockResolvedValue({ data: 0, error: undefined })
    state.getAccountTransactions.mockReset()
    state.getAccountTransactions.mockResolvedValue({ data: [] })
    state.getAllOutgoingTransactionsFromHtlcs.mockReset()
    state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([])
    state.query.mockReset()
    state.query.mockResolvedValue([])
    state.run.mockReset()
    state.run.mockResolvedValue(undefined)
    state.sendTx.mockReset()
    state.sendTx.mockResolvedValue({ data: { tx: { hash: 'drain-hash' } }, error: undefined })
    state.discoverRemoteSignersFromBlockchain.mockReset()
    state.discoverRemoteSignersFromBlockchain.mockResolvedValue(undefined)
    state.updateSignersTableBalance.mockReset()
    state.updateSignersTableBalance.mockResolvedValue(undefined)
    state.updateRemoteSigner.mockReset()
    state.updateRemoteSigner.mockResolvedValue(undefined)
    state.getAllRemoteSigners.mockReset()
    state.getAllRemoteSigners.mockResolvedValue([])
    state.addRemoteSigner.mockReset()
    state.addRemoteSigner.mockResolvedValue(undefined)
    state.addReceiptTransaction.mockReset()
    state.addUnknownPaymentToMerchantTransaction.mockReset()
    state.addWithdrawalTransaction.mockReset()
    state.logger.log.mockReset()
    state.logger.warn.mockReset()
    state.logger.error.mockReset()
  })

  it('creates an HTLC during top-up when the remote address has no on-chain account yet', async () => {
    state.localBalance = 100_000
    state.remoteBalance = 0
    state.remoteAddress = createAddress('NQ22 TEST FRESH HTLC ADDRESS')
    state.getBalance.mockImplementation((address: unknown) => {
      const addressValue = address as ReturnType<typeof createAddress>
      if (addressValue.toUserFriendlyAddress() === 'NQ22 TEST FRESH HTLC ADDRESS')
        return Promise.resolve({ data: 0, error: NO_ACCOUNT_ERROR })
      return Promise.resolve({ data: 0, error: undefined })
    })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.handleFunds()

    expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({
      transfer: Transfer.LocalToRemote,
    }))
  })

  it('creates a fresh HTLC during top-up after a drain cleared the active remote address', async () => {
    state.localBalance = 100_000
    state.remoteBalance = 0
    state.remoteAddress = undefined as any
    state.getBalance.mockImplementation((address: unknown) => {
      if (!address)
        return Promise.resolve({ data: 0, error: 'Address missing' })
      return Promise.resolve({ data: 0, error: undefined })
    })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.handleFunds()

    expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({
      transfer: Transfer.LocalToRemote,
    }))
    expect(state.logger.error).not.toHaveBeenCalledWith(
      'Error while getting remote balance before handling funds',
      expect.anything(),
    )
  })

  it('keeps the previous remote balance when balance lookup fails', async () => {
    state.remoteBalance = 350_000
    state.remoteSigner = { ...remoteSigner('NQ11 TEST REMOTE ADDRESS', 350_000, true), address: state.remoteAddress }
    state.getBalance.mockImplementation((address: unknown) => {
      const addressValue = address as ReturnType<typeof createAddress>
      if (addressValue.toUserFriendlyAddress() === 'NQ11 TEST REMOTE ADDRESS')
        return Promise.resolve({ data: undefined, error: new Error('temporary consensus failure') })
      return Promise.resolve({ data: 0, error: undefined })
    })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.updateBalances()

    expect(state.remoteBalance).toBe(350_000)
    expect(state.logger.error).toHaveBeenCalledWith('Error while getting remote balance', expect.any(Error))
  })

  it('keeps the previous local balance when local balance lookup fails', async () => {
    state.localBalance = 42_000
    state.remoteAddress = undefined as any
    state.getBalance.mockResolvedValue({ data: undefined, error: new Error('temporary consensus failure') })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.updateBalances()

    expect(state.localBalance).toBe(42_000)
    expect(state.logger.error).toHaveBeenCalledWith('Error while getting local balance', expect.any(Error))
  })

  it('sets local balance to zero when the local account is absent on chain', async () => {
    state.localBalance = 42_000
    state.remoteAddress = undefined as any
    state.getBalance.mockResolvedValue({ data: 0, error: NO_ACCOUNT_ERROR })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.updateBalances()

    expect(state.localBalance).toBe(0)
    expect(state.logger.error).toHaveBeenCalledWith('Error while getting local balance', NO_ACCOUNT_ERROR)
  })

  it('waits for HTLC extension discovery before finishing balance updates', async () => {
    let resolveAccount: (account: { type: string, balance: number, timeout: number }) => void = () => {}
    const extensionTx = {
      transactionHash: 'extension-hash',
      recipient: 'NQ44 EXTENSION HTLC ADDRESS',
      data: { hashRoot: '0000000000000000000000000000000000000000000000000000000000000000' },
      timestamp: 150_000,
      validityStartHeight: 150,
    }

    state.remoteBalance = 10_000
    state.getBalance.mockImplementation((address: unknown) => {
      const addressValue = address as ReturnType<typeof createAddress>
      if (addressValue.toUserFriendlyAddress() === 'NQ11 TEST REMOTE ADDRESS')
        return Promise.resolve({ data: 0, error: undefined })
      return Promise.resolve({ data: 0, error: undefined })
    })
    state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([extensionTx] as any)
    state.getAllRemoteSigners.mockResolvedValue([])
    state.client.getAccount = vi.fn(() => new Promise(resolve => resolveAccount = resolve))

    const { useSync } = await import('./sync')
    const store = useSync()

    const updatePromise = store.updateBalances()
    let updateSettled = false
    updatePromise.then(() => updateSettled = true)
    for (let i = 0; i < 10 && !state.client.getAccount.mock.calls.length; i++)
      await Promise.resolve()

    expect(state.client.getAccount).toHaveBeenCalledWith('NQ44 EXTENSION HTLC ADDRESS')
    expect(updateSettled).toBe(false)

    state.getAllRemoteSigners.mockResolvedValue([{ address: createAddress('NQ44 EXTENSION HTLC ADDRESS') }] as any)
    resolveAccount({ type: 'htlc', balance: 123_000, timeout: 300_000 })
    await updatePromise

    expect(state.updateRemoteSigner).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      balance: 123_000,
    }))
  })

  it('logs HTLC extension discovery errors and allows later balance updates', async () => {
    const extensionTx = {
      transactionHash: 'extension-hash',
      recipient: 'NQ44 EXTENSION HTLC ADDRESS',
      data: { hashRoot: '0000000000000000000000000000000000000000000000000000000000000000' },
      timestamp: 150_000,
      validityStartHeight: 150,
    }
    const extensionError = new Error('account lookup failed')

    state.remoteBalance = 10_000
    state.getBalance.mockImplementation((address: unknown) => {
      const addressValue = address as ReturnType<typeof createAddress>
      if (addressValue.toUserFriendlyAddress() === 'NQ11 TEST REMOTE ADDRESS')
        return Promise.resolve({ data: 0, error: undefined })
      return Promise.resolve({ data: 0, error: undefined })
    })
    state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([extensionTx] as any)
    state.getAllRemoteSigners.mockResolvedValue([])
    state.client.getAccount = vi.fn()
      .mockRejectedValueOnce(extensionError)
      .mockResolvedValueOnce({ type: 'htlc', balance: 123_000, timeout: 300_000 })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.updateBalances()
    await store.updateBalances()

    expect(state.logger.error).toHaveBeenCalledWith('Error while checking HTLC extension transaction', extensionError)
    expect(state.updateRemoteSigner).toHaveBeenCalledTimes(1)
  })

  it('activates a single funded inactive signer after refreshing chain balances', async () => {
    const fundedSigner = remoteSigner('NQ22 TEST FUNDED REMOTE ADDRESS', 700_000, false)
    state.query.mockImplementation((sql = '') => {
      if (sql.includes('WHERE balance > 0'))
        return Promise.resolve([fundedSigner])
      return Promise.resolve([])
    })
    state.getBalance.mockResolvedValue({ data: 700_000, error: undefined })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.verifyRemoteSignersDb()

    expect(state.discoverRemoteSignersFromBlockchain.mock.invocationCallOrder[0]).toBeLessThan(state.updateSignersTableBalance.mock.invocationCallOrder[0])
    expect(state.updateRemoteSigner).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      balance: 700_000,
    }))
  })

  it('recovers one inactive funded remote signer per verification pass without replacing the active signer first', async () => {
    const firstSigner = remoteSigner('NQ22 TEST FUNDED REMOTE ADDRESS', 700_000, true)
    const secondSigner = remoteSigner('NQ33 TEST OLD FUNDED REMOTE ADDRESS', 900_000, false)
    state.query.mockImplementation((sql = '') => {
      if (sql.includes('WHERE balance > 0'))
        return Promise.resolve([firstSigner, secondSigner])
      return Promise.resolve([])
    })
    state.getBalance.mockImplementation((address: unknown) => {
      const addressValue = address as ReturnType<typeof createAddress>
      return Promise.resolve({
        data: addressValue.toUserFriendlyAddress() === 'NQ22 TEST FUNDED REMOTE ADDRESS' ? 700_000 : 900_000,
        error: undefined,
      })
    })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.verifyRemoteSignersDb()

    expect(state.updateRemoteSigner).not.toHaveBeenCalled()
    expect(state.sendTx).toHaveBeenCalledTimes(1)
    expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({
      transfer: Transfer.RemoteToLocalImmediateReclaim,
      amount: 900_000,
    }))
  })

  it('does not start duplicate drains after active-signer cleanup queues recovery transactions', async () => {
    const firstSigner = remoteSigner('NQ22 TEST FUNDED REMOTE ADDRESS', 700_000, true)
    const secondSigner = remoteSigner('NQ33 TEST OLD FUNDED REMOTE ADDRESS', 900_000, true)
    state.query.mockImplementation((sql = '') => {
      if (sql.includes('WHERE active = 1'))
        return Promise.resolve([firstSigner, secondSigner])
      if (sql.includes('WHERE balance > 0'))
        return Promise.resolve([firstSigner, secondSigner])
      return Promise.resolve([])
    })
    state.getBalance.mockImplementation((address: unknown) => {
      const addressValue = address as ReturnType<typeof createAddress>
      return Promise.resolve({
        data: addressValue.toUserFriendlyAddress() === 'NQ22 TEST FUNDED REMOTE ADDRESS' ? 700_000 : 900_000,
        error: undefined,
      })
    })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.verifyRemoteSignersDb()

    expect(state.sendTx).toHaveBeenCalledTimes(1)
  })

  it('routes swap HTLCs found behind an extension chain to the swap handler', async () => {
    const signer = remoteSigner('NQ22 TEST FUNDED REMOTE ADDRESS', 0, true)
    state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)

    const extensionTx = {
      transactionHash: 'extension-hash',
      sender: signer.address,
      senderType: 'basic',
      recipient: 'NQ44 EXTENSION HTLC ADDRESS',
      recipientType: 'htlc',
      value: 50_000,
      fee: 0,
      state: 'confirmed',
      timestamp: 150_000,
      data: { hashRoot: '0000000000000000000000000000000000000000000000000000000000000000' },
      proof: { raw: '' },
    }
    const swapLeafTx = {
      transactionHash: 'swap-leaf-hash',
      sender: 'NQ44 EXTENSION HTLC ADDRESS',
      senderType: 'htlc',
      recipient: 'NQ55 SWAP HTLC ADDRESS',
      recipientType: 'htlc',
      value: 50_000,
      fee: 0,
      state: 'confirmed',
      timestamp: 160_000,
      data: { hashRoot: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      proof: { raw: '' },
    }

    state.getAccountTransactions.mockImplementation(((address: any) => {
      if (address?.toUserFriendlyAddress?.() === signer.address)
        return Promise.resolve({ data: [extensionTx] })
      return Promise.resolve({ data: [] })
    }) as any)
    state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([swapLeafTx] as any)

    // Force the swap handler down its catch path so we can observe the leaf
    // reaching it without wiring up a Fastspot mock.
    vi.doMock('@/composables/useFastspotv1', () => ({
      useFastspotApiV1: vi.fn(() => Promise.resolve({
        getContract: vi.fn(() => Promise.reject(new Error('mocked fastspot failure'))),
      })),
    }))

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.updateTransactionHistory()

    expect(state.getAllOutgoingTransactionsFromHtlcs).toHaveBeenCalled()
    expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionHash: 'swap-leaf-hash' }),
    )
  })

  it('awaits centralized signer discovery before scanning remote signer history', async () => {
    const events: string[] = []
    state.discoverRemoteSignersFromBlockchain.mockImplementation(async () => {
      await Promise.resolve()
      events.push('discover')
    })
    state.getAllRemoteSigners.mockImplementation(async () => {
      events.push('getAllRemoteSigners')
      return []
    })
    state.getAccountTransactions.mockResolvedValue({ data: [] })
    state.query.mockImplementation((sql = '') => {
      if (sql.includes('all_transactions'))
        return Promise.resolve([])
      if (sql.includes('user_receipts'))
        return Promise.resolve([])
      return Promise.resolve([])
    })

    const { useSync } = await import('./sync')
    const store = useSync()

    await store.updateTransactionHistory()

    expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalled()
    expect(state.addRemoteSigner).not.toHaveBeenCalled()
    expect(events).toEqual(['discover', 'getAllRemoteSigners'])
  })
})
