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
  networkId: 5,
  client: {
    waitForConsensusEstablished: vi.fn(async () => undefined),
    sendTransaction: vi.fn(async () => undefined),
  },
  query: vi.fn(async () => []),
  run: vi.fn(async () => undefined),
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
    updateRemoteSigner: state.updateRemoteSigner,
    remoteAddress: computed(() => state.remoteAddress),
    remoteBalance: computed(() => state.remoteBalance),
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
    state.networkId = 5
    state.client = {
      waitForConsensusEstablished: vi.fn(async () => undefined),
      sendTransaction: vi.fn(async () => undefined),
    }
    state.query.mockReset()
    state.query.mockResolvedValue([])
    state.run.mockReset()
    state.run.mockResolvedValue(undefined)
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
