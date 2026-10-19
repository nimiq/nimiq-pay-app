import { defineStore } from 'pinia'
import { vi } from 'vitest'
import { computed, shallowReactive } from 'vue'

export function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
    equals: (other?: { toUserFriendlyAddress: () => string }) => other?.toUserFriendlyAddress() === value,
  }
}

function makeState() {
  const getBalance = vi.fn((_address?: unknown): Promise<{ data: any, error: any }> => Promise.resolve({ data: 0, error: undefined }))
  const getAccountTransactions = vi.fn((_address?: any, _limit?: number, _sinceHeight?: number): Promise<{ data: any[], error?: string }> => Promise.resolve({ data: [] }))
  const getLocalTransactions = vi.fn(async (_options?: { sinceHeight?: number, startAt?: string, limit?: number }): Promise<any[]> => (await getAccountTransactions(createAddress('NQ00 TEST LOCAL ADDRESS'))).data)
  const getAllTransactionsForAddress = vi.fn((_address?: unknown): Promise<{ transactions: any[], complete: boolean }> => Promise.resolve({ transactions: [], complete: true }))
  const getWalletContext = vi.fn((): { address: any, client: any, network: string, owner: string, generation: number } | undefined => undefined)
  const isWalletContextCurrent = vi.fn((_context: { client: unknown, network: string, owner: string, generation: number }): boolean => false)
  const findTransactionInHistory = vi.fn((_address?: unknown, _hash?: string): Promise<any> => Promise.resolve(undefined))
  const getAllOutgoingTransactionsFromHtlcs = vi.fn((_address?: any): Promise<any[]> => Promise.resolve([]))
  const query = vi.fn((_sql?: string, _params?: any[]): Promise<any[]> => Promise.resolve([]))
  const run = vi.fn((_sql?: string, _params?: any[]): Promise<void> => Promise.resolve())
  const sendTx = vi.fn((_args?: any, _context?: any): Promise<any> => Promise.resolve({
    outcome: 'submitted',
    tx: { hash: 'drain-hash' },
    serialized: 'serialized-drain',
  }))
  const scanLocalHtlcCreations = vi.fn((): Promise<any> => Promise.resolve({ creations: [], historyComplete: true, sawHtlcTransaction: false, errors: [] as string[] }))
  const listCosignerHtlcs = vi.fn((_options?: { fresh?: boolean }): Promise<string[] | undefined> => Promise.resolve([]))
  const discoverRemoteSignersFromBlockchain = vi.fn(async () => ({ added: 0, alreadyKnown: 0, localComplete: true, errors: [] as string[], createdHtlcs: [] as string[], historyComplete: true }))
  const registerValidatedRemoteSigner = vi.fn((candidate?: any): Promise<any> => Promise.resolve(candidate))
  const updateSignersTableBalance = vi.fn((): Promise<void> => Promise.resolve())
  const updateRemoteSigner = vi.fn((_signer?: any, _context?: any): Promise<void> => Promise.resolve())
  const updateRemoteSignerBalance = vi.fn((_balance?: number, _address?: any, _context?: any): Promise<boolean> => Promise.resolve(true))
  const deactivateRemoteSigner = vi.fn((_address?: any, _context?: any, _clearBalance?: boolean): Promise<boolean> => Promise.resolve(true))
  const activateRemoteSignerFromTransaction = vi.fn((_tx?: any, _context?: any): Promise<void> => Promise.resolve())
  const getAllRemoteSigners = vi.fn((): Promise<any[]> => Promise.resolve([]))
  const addRemoteSigner = vi.fn((_signer?: any): Promise<void> => Promise.resolve())
  const isOurRemoteSigner = vi.fn((_address?: string): Promise<boolean> => Promise.resolve(false))
  const isCosignerAddress = vi.fn((address?: string): boolean => address === 'NQ99 TEST COSIGNER')
  const kvGetItem = vi.fn((_key?: string): Promise<string | undefined> => Promise.resolve(undefined))
  const kvSetItem = vi.fn((_key?: string, _value?: string): Promise<void> => Promise.resolve())
  const registerOwnHtlcIfMissing = vi.fn((_address?: string): Promise<void> => Promise.resolve())
  const addReceiptTransactions = vi.fn((_txs?: any[], _context?: any): Promise<boolean> => Promise.resolve(true))
  const scheduleIncomingPaymentNotification = vi.fn()
  const toUnknownPaymentToMerchantTransaction = vi.fn((_tx?: any, _transfer?: string, _rail?: string): any => undefined)
  const saveTransactions = vi.fn((_txs?: any[]): Promise<boolean> => Promise.resolve(true))
  const updateTransactionStatus = vi.fn()
  const updateTransactionCashbackClaimed = vi.fn()
  const refreshFromDb = vi.fn((): Promise<void> => Promise.resolve())
  const restorePendingOutgoingTransactions = vi.fn((): Promise<boolean> => Promise.resolve(true))
  const setSwapHtlcRefunded = vi.fn()
  const setPolygonSwapHtlcRefunded = vi.fn()
  const refundPolygonSwapHtlc = vi.fn((_htlc?: any): Promise<{ refunded: boolean, preimage?: string, hash?: string }> => Promise.resolve({ refunded: true }))
  const updateSinglePolygonTransaction = vi.fn((_hash?: string): Promise<void> => Promise.resolve())
  const updatePointsBalance = vi.fn()
  const claimCashback = vi.fn((_tx?: any): Promise<{ error: any, errorType: any }> => Promise.resolve({ error: undefined, errorType: undefined }))
  const reconnect = vi.fn()
  const getOrderById = vi.fn((_args?: any): Promise<{ data: any, error: any }> => Promise.resolve({ data: undefined, error: undefined }))
  const getTransactionState = vi.fn((_args?: any): Promise<{ data: any, error: any }> => Promise.resolve({ data: undefined, error: undefined }))
  const getContract = vi.fn((..._args: any[]): Promise<any> => Promise.reject(new Error('mocked fastspot failure')))
  const initRemoteSigner = vi.fn((): Promise<void> => Promise.resolve())
  const initPolygon = vi.fn((): Promise<void> => Promise.resolve())
  const resolveHomeBalanceState = vi.fn((): Promise<void> => Promise.resolve())
  const blockHeightToTimestamp = vi.fn((height: number): Promise<number> => Promise.resolve(height * 1000))
  const setToast = vi.fn()
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

  return {
    localAddress: createAddress('NQ00 TEST LOCAL ADDRESS') as any,
    localBalance: 0,
    pendingNimSince: 0,
    hasLocalWallet: true,
    remoteAddress: createAddress('NQ11 TEST REMOTE ADDRESS') as any,
    remoteBalance: 0,
    remoteSigner: undefined as any,
    remoteHeight: 128,
    remotePublicKey: 'service-public-key',
    remoteProofSize: 98,
    headTimestamp: 200_000,
    height: 128,
    lastMacroBlockHeight: 128,
    networkId: 5,
    networkName: 'testalbatross',
    walletContextGeneration: 0,
    consensus: 'established' as 'connecting' | 'established' | 'syncing',
    isSendingTx: false,
    isProcessingRemote: false,
    isSyncingWallets: false,
    isUpdatingTransactions: false,
    headChangePendingDrainLock: false,
    headChangeUpdatesLock: false,
    htlcCheckLock: false,
    hasHtlcExpired: false,
    isHtlcActive: true,
    isHtlcPending: false,
    isRemoteOk: true,
    homeBalanceState: 'resolved-remote' as 'resolved-empty' | 'resolved-remote' | 'pending',
    htlcStart: 100_000,
    htlcEnd: 300_000,
    htlcThreshold: 0,
    pointsToken: undefined as string | undefined,
    client: {
      waitForConsensusEstablished: vi.fn((): Promise<void> => Promise.resolve()),
      addHeadChangedListener: vi.fn((_fn?: any): Promise<number> => Promise.resolve(1)),
      addTransactionListener: vi.fn((_fn?: any, _addrs?: any): Promise<number> => Promise.resolve(1)),
      removeListener: vi.fn((_id?: number): Promise<void> => Promise.resolve()),
      getAccount: vi.fn((_addr?: string): Promise<any> => Promise.resolve({ type: 'basic', balance: 0 })),
      getAccounts: vi.fn((addrs?: any[]): Promise<any[]> => Promise.resolve((addrs ?? []).map(() => ({ type: 'basic', balance: 0 })))),
      getTransaction: vi.fn((_hash?: string): Promise<any> => Promise.resolve(undefined)),
      sendTransaction: vi.fn((_tx?: any): Promise<any> => Promise.resolve({ state: 'pending' })),
      getTransactionsByAddress: vi.fn((_addr?: string): Promise<any[]> => Promise.resolve([])),
    } as any,
    getBalance,
    getAccountTransactions,
    getLocalTransactions,
    getAllTransactionsForAddress,
    getWalletContext,
    isWalletContextCurrent,
    findTransactionInHistory,
    getAllOutgoingTransactionsFromHtlcs,
    query,
    run,
    sendTx,
    discoverRemoteSignersFromBlockchain,
    scanLocalHtlcCreations,
    listCosignerHtlcs,
    registerValidatedRemoteSigner,
    updateSignersTableBalance,
    updateRemoteSigner,
    updateRemoteSignerBalance,
    deactivateRemoteSigner,
    activateRemoteSignerFromTransaction,
    getAllRemoteSigners,
    addRemoteSigner,
    isOurRemoteSigner,
    isCosignerAddress,
    kvGetItem,
    kvSetItem,
    registerOwnHtlcIfMissing,
    addReceiptTransactions,
    scheduleIncomingPaymentNotification,
    toUnknownPaymentToMerchantTransaction,
    saveTransactions,
    updateTransactionStatus,
    updateTransactionCashbackClaimed,
    refreshFromDb,
    restorePendingOutgoingTransactions,
    setSwapHtlcRefunded,
    setPolygonSwapHtlcRefunded,
    refundPolygonSwapHtlc,
    updateSinglePolygonTransaction,
    updatePointsBalance,
    claimCashback,
    reconnect,
    getOrderById,
    getTransactionState,
    getContract,
    initRemoteSigner,
    initPolygon,
    resolveHomeBalanceState,
    blockHeightToTimestamp,
    setToast,
    logger,
  }
}

export const state = shallowReactive(makeState())

export function remoteSignerFixture(address: string, balance: number, active = false) {
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

export function stubNimiqGlobal() {
  vi.stubGlobal('Nimiq', {
    Policy: { BLOCKS_PER_BATCH: 32, TRANSACTION_VALIDITY_WINDOW_BLOCKS: 120 },
    Address: {
      fromString: (value: string) => createAddress(value),
      fromUserFriendlyAddress: (value: string) => createAddress(value),
    },
    BufferUtils: {
      fromHex: vi.fn(() => new Uint8Array()),
      toUtf8: vi.fn(() => ''),
    },
    AccountType: { Basic: 0, HTLC: 2 },
    Transaction: vi.fn().mockImplementation(() => ({
      proof: undefined as Uint8Array | undefined,
      serializeContent: () => new Uint8Array(),
      hash: () => 'refund-hash',
    })),
    Signature: { create: vi.fn(() => new Uint8Array()) },
    SignatureProof: { singleSig: vi.fn(() => ({ serialize: () => new Uint8Array(1) })) },
    SerialBuffer: vi.fn().mockImplementation(() => ({
      writeUint8: vi.fn(),
      write: vi.fn(),
    })),
  })
}

export function resetSyncState() {
  state.localAddress = createAddress('NQ00 TEST LOCAL ADDRESS')
  state.localBalance = 0
  state.pendingNimSince = 0
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
  state.networkId = 5
  state.networkName = 'testalbatross'
  state.walletContextGeneration = 0
  state.consensus = 'established'
  state.isSendingTx = false
  state.isProcessingRemote = false
  state.isSyncingWallets = false
  state.isUpdatingTransactions = false
  state.headChangePendingDrainLock = false
  state.headChangeUpdatesLock = false
  state.htlcCheckLock = false
  state.hasHtlcExpired = false
  state.isHtlcActive = true
  state.isHtlcPending = false
  state.isRemoteOk = true
  state.homeBalanceState = 'resolved-remote'
  state.htlcStart = 100_000
  state.htlcEnd = 300_000
  state.htlcThreshold = 0
  state.pointsToken = undefined
  state.client = {
    waitForConsensusEstablished: vi.fn(() => Promise.resolve()),
    addHeadChangedListener: vi.fn(() => Promise.resolve(1)),
    addTransactionListener: vi.fn(() => Promise.resolve(1)),
    removeListener: vi.fn(() => Promise.resolve()),
    getAccount: vi.fn(() => Promise.resolve({ type: 'basic', balance: 0 })),
    getAccounts: vi.fn((addrs: any[]) => Promise.resolve(addrs.map(() => ({ type: 'basic', balance: 0 })))),
    getTransaction: vi.fn(() => Promise.resolve(undefined)),
    sendTransaction: vi.fn(() => Promise.resolve({ state: 'pending' })),
    getTransactionsByAddress: vi.fn(() => Promise.resolve([])),
  } as any

  for (const fn of [
    state.getBalance,
    state.getAccountTransactions,
    state.getLocalTransactions,
    state.getAllTransactionsForAddress,
    state.getWalletContext,
    state.isWalletContextCurrent,
    state.findTransactionInHistory,
    state.getAllOutgoingTransactionsFromHtlcs,
    state.query,
    state.run,
    state.sendTx,
    state.discoverRemoteSignersFromBlockchain,
    state.scanLocalHtlcCreations,
    state.listCosignerHtlcs,
    state.registerValidatedRemoteSigner,
    state.updateSignersTableBalance,
    state.updateRemoteSigner,
    state.updateRemoteSignerBalance,
    state.deactivateRemoteSigner,
    state.activateRemoteSignerFromTransaction,
    state.getAllRemoteSigners,
    state.addRemoteSigner,
    state.isOurRemoteSigner,
    state.isCosignerAddress,
    state.kvGetItem,
    state.kvSetItem,
    state.registerOwnHtlcIfMissing,
    state.addReceiptTransactions,
    state.scheduleIncomingPaymentNotification,
    state.toUnknownPaymentToMerchantTransaction,
    state.saveTransactions,
    state.updateTransactionStatus,
    state.updateTransactionCashbackClaimed,
    state.refreshFromDb,
    state.restorePendingOutgoingTransactions,
    state.setSwapHtlcRefunded,
    state.setPolygonSwapHtlcRefunded,
    state.refundPolygonSwapHtlc,
    state.updateSinglePolygonTransaction,
    state.updatePointsBalance,
    state.claimCashback,
    state.reconnect,
    state.getOrderById,
    state.getTransactionState,
    state.getContract,
    state.initRemoteSigner,
    state.initPolygon,
    state.resolveHomeBalanceState,
    state.blockHeightToTimestamp,
    state.setToast,
    state.logger.log,
    state.logger.warn,
    state.logger.error,
  ])
    fn.mockReset()

  state.getBalance.mockResolvedValue({ data: 0, error: undefined })
  state.toUnknownPaymentToMerchantTransaction.mockImplementation((tx: any, transfer?: string, rail?: string) => ({ hash: tx?.transactionHash, transfer, rail }))
  state.getAccountTransactions.mockResolvedValue({ data: [] })
  state.getLocalTransactions.mockImplementation(async () => (await state.getAccountTransactions(state.localAddress)).data)
  state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: true })
  state.getWalletContext.mockImplementation(() => state.localAddress && state.client
    ? {
        address: state.localAddress,
        client: state.client,
        network: state.networkName,
        owner: state.localAddress.toUserFriendlyAddress(),
        generation: state.walletContextGeneration,
      }
    : undefined)
  state.isWalletContextCurrent.mockImplementation((context) => {
    const current = state.getWalletContext()
    return !!current
      && current.client === context.client
      && current.network === context.network
      && current.owner === context.owner
      && current.generation === context.generation
  })
  state.findTransactionInHistory.mockResolvedValue(undefined)
  state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([])
  state.query.mockResolvedValue([])
  state.run.mockResolvedValue(undefined)
  state.sendTx.mockResolvedValue({ outcome: 'submitted', tx: { hash: 'drain-hash' }, serialized: 'serialized-drain' })
  state.discoverRemoteSignersFromBlockchain.mockResolvedValue({ added: 0, alreadyKnown: 0, localComplete: true, errors: [], createdHtlcs: [], historyComplete: true })
  state.scanLocalHtlcCreations.mockResolvedValue({ creations: [], historyComplete: true, sawHtlcTransaction: false, errors: [] })
  state.listCosignerHtlcs.mockResolvedValue([])
  state.registerValidatedRemoteSigner.mockImplementation(candidate => Promise.resolve(candidate))
  state.updateSignersTableBalance.mockResolvedValue(undefined)
  state.updateRemoteSigner.mockResolvedValue(undefined)
  state.updateRemoteSignerBalance.mockResolvedValue(true)
  state.deactivateRemoteSigner.mockResolvedValue(true)
  state.activateRemoteSignerFromTransaction.mockResolvedValue(undefined)
  state.getAllRemoteSigners.mockResolvedValue([])
  state.isCosignerAddress.mockImplementation(address => address === 'NQ99 TEST COSIGNER')
  state.kvGetItem.mockResolvedValue(undefined)
  state.kvSetItem.mockResolvedValue(undefined)
  state.addRemoteSigner.mockResolvedValue(undefined)
  state.isOurRemoteSigner.mockResolvedValue(false)
  state.registerOwnHtlcIfMissing.mockResolvedValue(undefined)
  state.refreshFromDb.mockResolvedValue(undefined)
  state.restorePendingOutgoingTransactions.mockResolvedValue(true)
  state.refundPolygonSwapHtlc.mockResolvedValue({ refunded: true })
  state.updateSinglePolygonTransaction.mockResolvedValue(undefined)
  state.claimCashback.mockResolvedValue({ error: undefined, errorType: undefined })
  state.getOrderById.mockResolvedValue({ data: undefined, error: undefined })
  state.getTransactionState.mockResolvedValue({ data: undefined, error: undefined })
  state.getContract.mockRejectedValue(new Error('mocked fastspot failure'))
  state.initRemoteSigner.mockResolvedValue(undefined)
  state.initPolygon.mockResolvedValue(undefined)
  state.resolveHomeBalanceState.mockResolvedValue(undefined)
  state.blockHeightToTimestamp.mockImplementation((height: number) => Promise.resolve(height * 1000))
}

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/composables/useApi', () => ({
  useCplApi: () => ({ getOrderById: state.getOrderById }),
  useRemoteSignerApi: () => ({ getTransactionState: state.getTransactionState }),
}))

vi.mock('@/composables/useFastspotv1', () => ({
  useFastspotApiV1: vi.fn(() => Promise.resolve({ getContract: state.getContract })),
}))

vi.mock('@/composables/usePolygonSync', () => ({
  usePolygonSync: () => ({ init: state.initPolygon }),
}))

vi.mock('@/composables/usePrice', () => ({
  usePrice: (value: number) => ({ crypto: { formatted: `${value}` } }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ setToast: state.setToast }),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock('@/lib', () => ({
  isDev: false,
  nakaBufferAddresses: ['NQ99 NAKA'],
}))

vi.mock('@/lib/analytics', () => ({
  trackTopUpReceived: vi.fn(),
  trackFundsBlocked: vi.fn(),
  trackSyncSlow: vi.fn(),
}))

vi.mock('@/lib/utils', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/utils')>(),
  getLegacyTransactionValidityStartHeight: vi.fn(() => undefined),
}))

vi.mock('@/lib/tx', () => ({
  toAccountType: (type: string) => type,
  buildTopUpReceipt: vi.fn((tx: any) => ({
    transfer: 'user-receipt',
    amount: tx.value,
    sender: tx.sender,
    senderType: tx.senderType,
    recipient: tx.recipient,
    recipientType: tx.recipientType,
    hash: tx.transactionHash,
    status: tx.state,
    timestamp: tx.timestamp,
    title: 'Top-Up',
    message: '',
    fee: tx.fee,
    proofSize: 98,
  })),
}))

vi.mock('@/stores/app', () => {
  const useApp = defineStore('app', () => ({
    pointsToken: computed(() => state.pointsToken),
    htlcThreshold: computed(() => state.htlcThreshold),
  }))
  const kv = () => ({ getItem: state.kvGetItem, setItem: state.kvSetItem, removeItem: vi.fn() })
  return { kv, useApp }
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
    pendingNimSince: computed({
      get: () => state.pendingNimSince,
      set: value => state.pendingNimSince = value,
    }),
    localWallet: computed(() => ({ privateKey: {}, publicKey: {} })),
    hasLocalWallet: computed(() => state.hasLocalWallet),
  }))
  return { useLocalWallet }
})

vi.mock('@/stores/locks', () => {
  const flag = (key: 'isProcessingRemote' | 'isSendingTx' | 'isSyncingWallets' | 'isUpdatingTransactions' | 'headChangePendingDrainLock' | 'headChangeUpdatesLock' | 'htlcCheckLock') => computed({
    get: () => state[key],
    set: value => state[key] = value,
  })
  const useLocks = defineStore('locks', () => ({
    isProcessingRemote: flag('isProcessingRemote'),
    isSendingTx: flag('isSendingTx'),
    isSyncingWallets: flag('isSyncingWallets'),
    isUpdatingTransactions: flag('isUpdatingTransactions'),
    headChangePendingDrainLock: flag('headChangePendingDrainLock'),
    headChangeUpdatesLock: flag('headChangeUpdatesLock'),
    htlcCheckLock: flag('htlcCheckLock'),
  }))
  return { useLocks }
})

vi.mock('@/stores/nimiq-network', () => {
  const useNimiqNetwork = defineStore('nimiq-network', () => ({
    getAccountTransactions: state.getAccountTransactions,
    getAllOutgoingTransactionsFromHtlcs: state.getAllOutgoingTransactionsFromHtlcs,
    getBalance: state.getBalance,
    reconnect: state.reconnect,
    client: computed(() => state.client),
    height: computed(() => state.height),
    lastMacroBlockHeight: computed(() => state.lastMacroBlockHeight),
    consensus: computed(() => state.consensus),
    headTimestamp: computed(() => state.headTimestamp),
    networkId: computed(() => state.networkId),
    networkName: computed(() => state.networkName),
  }))
  return {
    CashlinkExtraDataHex: { CLAIMING: 'claiming' },
    NO_ACCOUNT_ERROR: 'No account found',
    useNimiqNetwork,
  }
})

vi.mock('@/stores/points', () => {
  const usePoints = defineStore('points', () => ({
    updatePointsBalance: state.updatePointsBalance,
    claimCashback: state.claimCashback,
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
    return { ...remoteSigners, address: { toUserFriendlyAddress: () => remoteSigners.address } }
  }

  const sameWalletContext = (a: any, b: any) => a.client === b.client
    && a.network === b.network
    && a.owner === b.owner
    && a.generation === b.generation

  const useRemoteSigner = defineStore('remote-signer', () => ({
    remoteHeight: computed(() => state.remoteHeight),
    remoteBalance: computed({
      get: () => state.remoteBalance,
      set: value => state.remoteBalance = value,
    }),
    remoteAddress: computed(() => state.remoteAddress),
    hasHtlcExpired: computed(() => state.hasHtlcExpired),
    end: computed(() => state.htlcEnd),
    start: computed(() => state.htlcStart),
    isHtlcActive: computed({
      get: () => state.isHtlcActive,
      set: value => state.isHtlcActive = value,
    }),
    isHtlcPending: computed(() => state.isHtlcPending),
    isRemoteOk: computed(() => state.isRemoteOk),
    remotePublicKey: computed(() => state.remotePublicKey),
    remoteSigner: computed(() => state.remoteSigner),
    homeBalanceState: computed(() => state.homeBalanceState),
    remoteProofSize: computed(() => state.remoteProofSize),
    getAllRemoteSigners: state.getAllRemoteSigners,
    addRemoteSigner: state.addRemoteSigner,
    isOurRemoteSigner: state.isOurRemoteSigner,
    isCosignerAddress: state.isCosignerAddress,
    registerOwnHtlcIfMissing: state.registerOwnHtlcIfMissing,
    blockHeightToTimestamp: state.blockHeightToTimestamp,
    discoverRemoteSignersFromBlockchain: state.discoverRemoteSignersFromBlockchain,
    scanLocalHtlcCreations: state.scanLocalHtlcCreations,
    listCosignerHtlcs: state.listCosignerHtlcs,
    registerValidatedRemoteSigner: state.registerValidatedRemoteSigner,
    getWalletContext: state.getWalletContext,
    getWalletIdentity: () => {
      const context = state.getWalletContext()
      return context && { network: context.network, owner: context.owner }
    },
    isWalletContextCurrent: state.isWalletContextCurrent,
    getLocalTransactions: state.getLocalTransactions,
    getAllTransactionsForAddress: state.getAllTransactionsForAddress,
    findTransactionInHistory: state.findTransactionInHistory,
    updateSignersTableBalance: state.updateSignersTableBalance,
    updateRemoteSigner: state.updateRemoteSigner,
    updateRemoteSignerBalance: state.updateRemoteSignerBalance,
    deactivateRemoteSigner: state.deactivateRemoteSigner,
    activateRemoteSignerFromTransaction: state.activateRemoteSignerFromTransaction,
    getSignerWriteRevision: () => 0,
    init: state.initRemoteSigner,
    resolveHomeBalanceState: state.resolveHomeBalanceState,
  }))
  const sameWalletIdentity = (a: any, b: any) => a.network === b.network && a.owner === b.owner

  return { parseAddress, sameWalletContext, sameWalletIdentity, useRemoteSigner }
})

vi.mock('@/stores/transactions', () => {
  const useTransactions = defineStore('transactions', () => ({
    transactions: [] as any[],
    sendTx: state.sendTx,
    addReceiptTransactions: state.addReceiptTransactions,
    toUnknownPaymentToMerchantTransaction: state.toUnknownPaymentToMerchantTransaction,
    saveTransactions: state.saveTransactions,
    updateTransactionCashbackClaimed: state.updateTransactionCashbackClaimed,
    updateTransactionStatus: state.updateTransactionStatus,
    refreshFromDb: state.refreshFromDb,
    restorePendingOutgoingTransactions: state.restorePendingOutgoingTransactions,
    setSwapHtlcRefunded: state.setSwapHtlcRefunded,
    setPolygonSwapHtlcRefunded: state.setPolygonSwapHtlcRefunded,
  }))
  return { useTransactions }
})

vi.mock('@/stores/polygon-usdt', () => {
  const usePolygonUsdt = defineStore('polygon-usdt', () => ({
    refundPolygonSwapHtlc: state.refundPolygonSwapHtlc,
    updateSingleTransaction: state.updateSinglePolygonTransaction,
  }))
  return { usePolygonUsdt }
})

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    scheduleIncomingPaymentNotification: state.scheduleIncomingPaymentNotification,
  }),
}))
