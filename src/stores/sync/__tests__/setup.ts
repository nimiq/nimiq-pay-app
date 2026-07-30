import { defineStore } from 'pinia'
import { vi } from 'vitest'
import { computed } from 'vue'

export function createAddress(value: string) {
  return {
    toUserFriendlyAddress: () => value,
    equals: (other?: { toUserFriendlyAddress: () => string }) => other?.toUserFriendlyAddress() === value,
  }
}

function makeState() {
  const getBalance = vi.fn((_address?: unknown): Promise<{ data: any, error: any }> => Promise.resolve({ data: 0, error: undefined }))
  const getAccountTransactions = vi.fn((_address?: unknown): Promise<{ data: any[] }> => Promise.resolve({ data: [] }))
  const getAllOutgoingTransactionsFromHtlcs = vi.fn((_address?: unknown): Promise<any[]> => Promise.resolve([]))
  const query = vi.fn((_sql?: string, _params?: any[]): Promise<any[]> => Promise.resolve([]))
  const run = vi.fn((_sql?: string, _params?: any[]): Promise<void> => Promise.resolve())
  const sendTx = vi.fn((_args?: any): Promise<{ data: any, error: any }> => Promise.resolve({ data: { tx: { hash: 'drain-hash' } }, error: undefined }))
  const discoverRemoteSignersFromBlockchain = vi.fn((): Promise<void> => Promise.resolve())
  const updateSignersTableBalance = vi.fn((): Promise<void> => Promise.resolve())
  const updateRemoteSigner = vi.fn((_signer?: any): Promise<void> => Promise.resolve())
  const getAllRemoteSigners = vi.fn((): Promise<any[]> => Promise.resolve([]))
  const addRemoteSigner = vi.fn((_signer?: any): Promise<void> => Promise.resolve())
  const isOurRemoteSigner = vi.fn((_address?: string): Promise<boolean> => Promise.resolve(false))
  const registerOwnHtlcIfMissing = vi.fn((_address?: string): Promise<'ours' | 'foreign' | 'unknown'> => Promise.resolve('unknown'))
  const addReceiptTransaction = vi.fn()
  const scheduleIncomingPaymentNotification = vi.fn()
  const addUnknownPaymentToMerchantTransaction = vi.fn()
  const addWithdrawalTransaction = vi.fn()
  const addStakingtransaction = vi.fn()
  const addHtlcTransaction = vi.fn()
  const updateTransactionStatus = vi.fn()
  const updateTransactionCashbackClaimed = vi.fn()
  const refreshFromDb = vi.fn((): Promise<void> => Promise.resolve())
  const setNakaTxRefunded = vi.fn()
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
    remotePublicKey: 'service-public-key' as string | undefined,
    remoteProofSize: 98,
    headTimestamp: 200_000,
    height: 128,
    lastMacroBlockHeight: 128,
    networkId: 5,
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
      getTransaction: vi.fn((_hash?: string): Promise<any> => Promise.resolve(undefined)),
      sendTransaction: vi.fn((_tx?: any): Promise<any> => Promise.resolve({ state: 'pending' })),
    } as any,
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
    isOurRemoteSigner,
    registerOwnHtlcIfMissing,
    addReceiptTransaction,
    scheduleIncomingPaymentNotification,
    addUnknownPaymentToMerchantTransaction,
    addWithdrawalTransaction,
    addStakingtransaction,
    addHtlcTransaction,
    updateTransactionStatus,
    updateTransactionCashbackClaimed,
    refreshFromDb,
    setNakaTxRefunded,
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

export const state = makeState()

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
    Policy: { BLOCKS_PER_BATCH: 32 },
    Address: {
      fromString: (value: string) => createAddress(value),
      fromUserFriendlyAddress: (value: string) => createAddress(value),
    },
    PublicKey: { fromHex: () => ({ toAddress: () => ({ toUserFriendlyAddress: () => 'NQ11 COSIGNER ADDRESS' }) }) },
    BufferUtils: {
      fromHex: vi.fn(() => new Uint8Array()),
      toUtf8: vi.fn(() => ''),
    },
    AccountType: { Basic: 0, HTLC: 2 },
    Transaction: vi.fn().mockImplementation(() => ({
      proof: undefined as Uint8Array | undefined,
      serializeContent: () => new Uint8Array(),
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
    getTransaction: vi.fn(() => Promise.resolve(undefined)),
    sendTransaction: vi.fn(() => Promise.resolve({ state: 'pending' })),
  } as any

  for (const fn of [
    state.getBalance,
    state.getAccountTransactions,
    state.getAllOutgoingTransactionsFromHtlcs,
    state.query,
    state.run,
    state.sendTx,
    state.discoverRemoteSignersFromBlockchain,
    state.updateSignersTableBalance,
    state.updateRemoteSigner,
    state.getAllRemoteSigners,
    state.addRemoteSigner,
    state.isOurRemoteSigner,
    state.registerOwnHtlcIfMissing,
    state.addReceiptTransaction,
    state.scheduleIncomingPaymentNotification,
    state.addUnknownPaymentToMerchantTransaction,
    state.addWithdrawalTransaction,
    state.addStakingtransaction,
    state.addHtlcTransaction,
    state.updateTransactionStatus,
    state.updateTransactionCashbackClaimed,
    state.refreshFromDb,
    state.setNakaTxRefunded,
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
  state.getAccountTransactions.mockResolvedValue({ data: [] })
  state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([])
  state.query.mockResolvedValue([])
  state.run.mockResolvedValue(undefined)
  state.sendTx.mockResolvedValue({ data: { tx: { hash: 'drain-hash' } }, error: undefined })
  state.discoverRemoteSignersFromBlockchain.mockResolvedValue(undefined)
  state.updateSignersTableBalance.mockResolvedValue(undefined)
  state.updateRemoteSigner.mockResolvedValue(undefined)
  state.getAllRemoteSigners.mockResolvedValue([])
  state.addRemoteSigner.mockResolvedValue(undefined)
  state.isOurRemoteSigner.mockResolvedValue(false)
  state.registerOwnHtlcIfMissing.mockResolvedValue('unknown')
  state.refreshFromDb.mockResolvedValue(undefined)
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
  nakaBufferAddresses: [] as string[],
}))

vi.mock('@/lib/tx', () => ({
  toAccountType: (type: string) => type,
  buildTopUpReceipt: (tx: any) => ({
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
  }),
}))

vi.mock('@/stores/app', () => {
  const useApp = defineStore('app', () => ({
    pointsToken: computed(() => state.pointsToken),
    htlcThreshold: computed(() => state.htlcThreshold),
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
    registerOwnHtlcIfMissing: state.registerOwnHtlcIfMissing,
    blockHeightToTimestamp: state.blockHeightToTimestamp,
    discoverRemoteSignersFromBlockchain: state.discoverRemoteSignersFromBlockchain,
    updateSignersTableBalance: state.updateSignersTableBalance,
    updateRemoteSigner: state.updateRemoteSigner,
    init: state.initRemoteSigner,
    resolveHomeBalanceState: state.resolveHomeBalanceState,
  }))
  return { parseAddress, useRemoteSigner }
})

vi.mock('@/stores/transactions', () => {
  const useTransactions = defineStore('transactions', () => ({
    sendTx: state.sendTx,
    addReceiptTransaction: state.addReceiptTransaction,
    addUnknownPaymentToMerchantTransaction: state.addUnknownPaymentToMerchantTransaction,
    addWithdrawalTransaction: state.addWithdrawalTransaction,
    addStakingtransaction: state.addStakingtransaction,
    addHtlcTransaction: state.addHtlcTransaction,
    updateTransactionCashbackClaimed: state.updateTransactionCashbackClaimed,
    updateTransactionStatus: state.updateTransactionStatus,
    refreshFromDb: state.refreshFromDb,
    setNakaTxRefunded: state.setNakaTxRefunded,
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
