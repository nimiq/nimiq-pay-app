import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  it('exposes BLOCKS_PER_BATCH-derived auto-extend lookahead constant', async () => {
    const mod = await import('./state')
    expect(mod.HTLC_AUTO_EXTEND_LOOKAHEAD_BLOCKS).toBe(120 * Nimiq.Policy.BLOCKS_PER_BATCH)
    expect(mod.MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA)
      .toBe(mod.HTLC_AUTO_EXTEND_LOOKAHEAD_BLOCKS)
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

  it('htlcCanBeExtended is false when head + lookahead is below HTLC mid-point', async () => {
    state.htlcStart = 100_000
    state.htlcEnd = 300_000
    state.headTimestamp = 100_000 // mid = 200_000, lookahead = 120 * 32 = 3840 → false
    const { useSyncState } = await import('./state')
    expect(useSyncState().htlcCanBeExtended).toBe(false)
  })

  it('htlcCanBeExtended is true once head + lookahead crosses HTLC mid-point', async () => {
    state.htlcStart = 100_000
    state.htlcEnd = 300_000
    state.headTimestamp = 199_000 // 199_000 + 3840 > 200_000 → true
    const { useSyncState } = await import('./state')
    expect(useSyncState().htlcCanBeExtended).toBe(true)
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

  it('clears wallet-scoped pending state when the wallet changes', async () => {
    const { useSyncState } = await import('./state')
    const store = useSyncState()
    store.setWalletContext('NQ00 TEST LOCAL ADDRESS')
    store.pendingTransactions.push({ transactionHash: 'pending' } as any)
    store.pendingPaymentTransactions.push({ transactionHash: 'payment' } as any)
    store.pendingRemoteDrainTxs.push({ hash: 'drain' } as any)
    store.pendingHtlcCreationTransactions.push({ transactionHash: 'creation' } as any)

    store.setWalletContext('NQ01 NEXT LOCAL ADDRESS')

    expect(store.pendingTransactions).toEqual([])
    expect(store.pendingPaymentTransactions).toEqual([])
    expect(store.pendingRemoteDrainTxs).toEqual([])
    expect(store.pendingHtlcCreationTransactions).toEqual([])
  })
})
