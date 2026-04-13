import { mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, ref, watch } from 'vue'
import { Asset, Chain } from '@/lib/assets'
import { DEFAULT_LIMIT, SQLQuery } from '@/lib/sql-queries'
import { Transfer } from '@/types/transactions'

const state = vi.hoisted(() => ({
  activeAsset: 'USDT',
  isSendingTx: false,
  remoteBalance: 0,
  query: vi.fn(async () => []),
  run: vi.fn(async () => undefined),
  updateActiveRemoteBalance: vi.fn(async () => undefined),
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
  const useLocalWallet = defineStore('local-wallet', () => ({}))

  return { useLocalWallet }
})

vi.mock('@/stores/nimiq-network', () => {
  const useNimiqNetwork = defineStore('nimiq-network', () => ({
    client: computed(() => null),
  }))

  return { useNimiqNetwork }
})

vi.mock('@/stores/remote-signer', () => {
  const useRemoteSigner = defineStore('remote-signer', () => ({
    updateActiveRemoteBalance: state.updateActiveRemoteBalance,
    remoteBalance: computed(() => state.remoteBalance),
  }))

  return { useRemoteSigner }
})

vi.mock('@/stores/sync', () => {
  const useSync = defineStore('sync', () => ({}))

  return { useSync }
})

describe('useTransactions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.activeAsset = Asset.USDT
    state.isSendingTx = false
    state.remoteBalance = 0
    state.query.mockReset()
    state.query.mockResolvedValue([])
    state.run.mockReset()
    state.run.mockResolvedValue(undefined)
    state.updateActiveRemoteBalance.mockReset()
    state.updateActiveRemoteBalance.mockResolvedValue(undefined)
    state.logger.log.mockReset()
    state.logger.warn.mockReset()
    state.logger.error.mockReset()
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
})
