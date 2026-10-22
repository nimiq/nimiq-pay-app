import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  it('expresses the auto-extend lookahead as 120 one-second-block batches in ms', async () => {
    const mod = await import('./state')
    expect(mod.HTLC_AUTO_EXTEND_LOOKAHEAD_MS).toBe(120 * Nimiq.Policy.BLOCKS_PER_BATCH * 1000)
  })

  it('marks nodesAreSynced false initially and true once heights match within a batch', async () => {
    state.height = 10_000
    state.remoteHeight = 10_000
    const { useSyncState } = await import('./state')
    const store = useSyncState()
    expect(store.nodesAreSynced).toBe(false)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(store.nodesAreSynced).toBe(true)
  })

  it('marks nodesAreSynced false when remote drifts more than BLOCKS_PER_BATCH from local', async () => {
    state.height = 10_000
    state.remoteHeight = 10_000 + Nimiq.Policy.BLOCKS_PER_BATCH + 1
    const { useSyncState } = await import('./state')
    const store = useSyncState()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(store.nodesAreSynced).toBe(false)
  })

  it('htlcCanBeExtended returns false when start or end is zero', async () => {
    state.htlcStart = 0
    state.htlcEnd = 0
    const { useSyncState } = await import('./state')
    expect(useSyncState().htlcCanBeExtended).toBe(false)
  })

  describe('htlcCanBeExtended with a 14-day HTLC in ms', () => {
    const start = 1_700_000_000_000
    const mid = start + 7 * 24 * 60 * 60 * 1000

    beforeEach(() => {
      state.htlcStart = start
      state.htlcEnd = start + 14 * 24 * 60 * 60 * 1000
    })

    it('is false while head + lookahead has not passed the mid-point', async () => {
      const { HTLC_AUTO_EXTEND_LOOKAHEAD_MS, useSyncState } = await import('./state')
      state.headTimestamp = mid - HTLC_AUTO_EXTEND_LOOKAHEAD_MS
      expect(useSyncState().htlcCanBeExtended).toBe(false)
    })

    it('is true once head + lookahead passes the mid-point', async () => {
      const { HTLC_AUTO_EXTEND_LOOKAHEAD_MS, useSyncState } = await import('./state')
      state.headTimestamp = mid - HTLC_AUTO_EXTEND_LOOKAHEAD_MS + 1
      expect(useSyncState().htlcCanBeExtended).toBe(true)
    })

    it('is true a minute before the mid-point, not only seconds before it', async () => {
      state.headTimestamp = mid - 60_000
      const { useSyncState } = await import('./state')
      expect(useSyncState().htlcCanBeExtended).toBe(true)
    })
  })

  it('blocksUntilNextMacroBlock returns 0 when lastMacroBlockHeight is 0', async () => {
    state.lastMacroBlockHeight = 0
    state.height = 50
    const { useSyncState } = await import('./state')
    expect(useSyncState().blocksUntilNextMacroBlock).toBe(0)
  })

  it('blocksUntilNextMacroBlock surfaces blocks left when within 50-block window', async () => {
    state.lastMacroBlockHeight = 100
    state.height = 110 // 100 + 32 - 110 = 22 (< 50)
    const { useSyncState } = await import('./state')
    expect(useSyncState().blocksUntilNextMacroBlock).toBe(22)
  })

  it('blocksUntilNextMacroBlock returns 0 once remaining blocks exceed the 50-block window', async () => {
    state.lastMacroBlockHeight = 1000
    state.height = 900 // 1000 + 32 - 900 = 132 (>= 50)
    const { useSyncState } = await import('./state')
    expect(useSyncState().blocksUntilNextMacroBlock).toBe(0)
  })

  it('isTransactionPending tracks pendingTransactions, drains, and HTLC creation arrays', async () => {
    const { useSyncState } = await import('./state')
    const store = useSyncState()
    expect(store.isTransactionPending).toBe(false)
    store.pendingTransactions.push({ transactionHash: 'h' } as any)
    expect(store.isTransactionPending).toBe(true)
    store.pendingTransactions.length = 0
    store.pendingRemoteDrainTxs.push({ hash: 'd' } as any)
    expect(store.isTransactionPending).toBe(true)
    store.pendingRemoteDrainTxs.length = 0
    store.pendingHtlcCreationTransactions.push({ transactionHash: 'c' } as any)
    expect(store.isTransactionPending).toBe(true)
  })

  it('increments wallet generation while preserving only same-context pending state', async () => {
    const { useSyncState } = await import('./state')
    const store = useSyncState()
    const owner = 'NQ00 TEST LOCAL ADDRESS'
    const otherOwner = 'NQ01 NEXT LOCAL ADDRESS'
    const pending = { transactionHash: 'pending' } as any

    const first = store.setWalletContext(owner, 'testnet')
    store.pendingTransactions.push(pending)
    const second = store.setWalletContext(owner, 'testnet')

    expect(second).toBe(first + 1)
    expect(store.walletContextGeneration).toBe(second)
    expect(store.pendingTransactions).toEqual([pending])

    store.setWalletContext(owner, 'mainnet')
    expect(store.pendingTransactions).toEqual([])

    store.pendingTransactions.push(pending)
    store.setWalletContext(otherOwner, 'mainnet')
    expect(store.pendingTransactions).toEqual([])
  })

  it('clears every pending collection when the wallet context changes', async () => {
    const { useSyncState } = await import('./state')
    const store = useSyncState()
    store.setWalletContext('NQ00 TEST LOCAL ADDRESS', 'testnet')
    store.pendingTransactions.push({ transactionHash: 'pending' } as any)
    store.pendingPaymentTransactions.push({ transactionHash: 'payment' } as any)
    store.pendingRemoteDrainTxs.push({ hash: 'drain' } as any)
    store.pendingHtlcCreationTransactions.push({ transactionHash: 'creation' } as any)

    store.setWalletContext('NQ01 NEXT LOCAL ADDRESS', 'testnet')

    expect(store.pendingTransactions).toEqual([])
    expect(store.pendingPaymentTransactions).toEqual([])
    expect(store.pendingRemoteDrainTxs).toEqual([])
    expect(store.pendingHtlcCreationTransactions).toEqual([])
  })

  it('reports each funds block reason once per wallet and remembers the last one', async () => {
    const { trackFundsBlocked } = await import('@/lib/analytics')
    vi.mocked(trackFundsBlocked).mockClear()
    const { useSyncState } = await import('./state')
    const store = useSyncState()
    store.setWalletContext('NQ00 A', 'test')

    store.reportFundsBlocked('pending_tx', { pending_tx_hashes: ['a'] })
    store.reportFundsBlocked('pending_tx', { pending_tx_hashes: ['b'] })
    store.reportFundsBlocked('htlc_not_ready')
    expect(trackFundsBlocked).toHaveBeenCalledTimes(2)
    expect(store.lastFundsBlockReason).toBe('htlc_not_ready')

    store.setWalletContext('NQ00 B', 'test')
    expect(store.lastFundsBlockReason).toBeUndefined()
    store.reportFundsBlocked('pending_tx')
    expect(trackFundsBlocked).toHaveBeenCalledTimes(3)
  })
})
