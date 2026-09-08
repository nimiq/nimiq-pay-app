/* eslint-disable perfectionist/sort-imports, import/no-duplicates */
import './__tests__/setup'
import { flushPromises } from '@vue/test-utils'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLQuery } from '@/lib/sql-queries'
import { PaymentMethod, PointsHashPrefix, Rail, Transfer } from '@/types/transactions'
import { createAddress, resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useSyncTransactions', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  describe('updateSingleTransaction', () => {
    it('skips when !hasLocalWallet', async () => {
      state.hasLocalWallet = false
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(state.getTransactionState).not.toHaveBeenCalled()
      expect(state.client.getTransaction).not.toHaveBeenCalled()
    })

    it('uses remote-signer API when consensus is not established', async () => {
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'confirmed', timestamp: 12 }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(state.getTransactionState).toHaveBeenCalledWith({ hash: 'h1' })
      expect(state.client.getTransaction).not.toHaveBeenCalled()
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'confirmed', timestamp: 12 })
    })

    it('uses client.getTransaction when consensus is established', async () => {
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'confirmed', timestamp: 12 })) as any
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'confirmed', timestamp: 12 })
    })

    it.each(['client', 'cosigner'])('resolves pending transactions when the %s lookup stalls', async (source) => {
      vi.useFakeTimers()
      try {
        if (source === 'client') {
          state.client.getTransaction.mockReturnValue(new Promise(() => {}))
          state.getTransactionState.mockResolvedValue({ data: { state: 'confirmed', timestamp: 12 }, error: undefined })
        }
        else {
          state.client.getTransaction.mockRejectedValue(new Error('not found'))
          state.getTransactionState.mockReturnValue(new Promise(() => {}))
          state.getAllTransactionsForAddress.mockResolvedValue({
            transactions: [{ transactionHash: 'h1', state: 'confirmed', timestamp: 12 }],
            complete: true,
          })
        }
        const { useSyncTransactions } = await import('./transactions')
        const { useSyncState } = await import('./state')
        const syncState = useSyncState()
        syncState.pendingTransactions.push({ transactionHash: 'h1', sender: 'NQ00 TEST LOCAL ADDRESS' } as any)
        let completed = false
        void useSyncTransactions().updateSingleTransaction('h1').then(() => completed = true)

        await vi.advanceTimersByTimeAsync(30_001)

        expect(completed).toBe(true)
        expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'confirmed', timestamp: 12 })
        expect(syncState.pendingTransactions).toHaveLength(0)
      }
      finally {
        vi.useRealTimers()
      }
    })

    it('persists failed when client.getTransaction reports unsuccessful execution', async () => {
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'confirmed',
        executionResult: false,
        timestamp: 12,
      })) as any
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateSingleTransaction('h1')

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'failed', timestamp: 12 })
    })

    it.each(['failed', 'invalidated'] as const)('does not fetch a transaction already marked %s', async (status) => {
      const { useTransactions } = await import('@/stores/transactions')
      ;(useTransactions().transactions as any[]).push({ hash: 'h1', status } as any)
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'h1' } as any, { transactionHash: 'other' } as any)
      syncState.pendingRemoteDrainTxs.push({ hash: 'h1' } as any, { hash: 'other-drain' } as any)
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'included', timestamp: 12 }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateSingleTransaction('h1')

      expect(state.client.getTransaction).not.toHaveBeenCalled()
      expect(state.getTransactionState).not.toHaveBeenCalled()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(syncState.pendingTransactions.map(tx => tx.transactionHash)).toEqual(['other'])
      expect(syncState.pendingRemoteDrainTxs.map(tx => tx.hash)).toEqual(['other-drain'])
      expect(syncState.isTransactionPending).toBe(true)
    })

    it('releases the send barrier after batch refresh records a failed payment', async () => {
      const { useTransactions } = await import('../transactions')
      const { useSyncState } = await import('./state')
      const { useSyncTransactions } = await import('./transactions')
      const transactions = useTransactions().transactions as unknown as { hash: string, status: string }[]
      transactions.push({ hash: 'failed-payment', status: 'pending' })
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'failed-payment', state: 'pending' } as any)
      state.query.mockResolvedValue([{ hash: 'failed-payment', status: 'pending' }])
      state.client.getTransaction.mockResolvedValue({ state: 'included', executionResult: false, timestamp: 5, value: 1 })
      state.updateTransactionStatus.mockImplementation(({ status }: { status: string }) => {
        transactions[0].status = status
      })

      const refreshing = useSyncTransactions()
      await refreshing.updateTransactionsInDb()
      expect(transactions[0].status).toBe('failed')
      state.client.getTransaction.mockClear()
      await refreshing.updateSingleTransaction('failed-payment')

      expect(syncState.isTransactionPending).toBe(false)
      expect(state.client.getTransaction).not.toHaveBeenCalled()
      expect(state.getTransactionState).not.toHaveBeenCalled()
    })

    it.each([false, true])('checks cosigner executionResult=%s before updating pending status', async (executionResult) => {
      const { useTransactions } = await import('@/stores/transactions')
      ;(useTransactions().transactions as any[]).push({ hash: 'h1', status: 'pending' } as any)
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'included', executionResult, timestamp: 12 }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateSingleTransaction('h1')

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: executionResult ? 'included' : 'failed', timestamp: 12 })
    })

    it('falls back to remote-signer API when client.getTransaction throws', async () => {
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('rpc'))) as any
      state.getTransactionState.mockResolvedValue({ data: { state: 'included', timestamp: 5 }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(state.getTransactionState).toHaveBeenCalledWith({ hash: 'h1' })
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'included', timestamp: 5 })
    })

    it('persists failed state from remote-signer API and clears pending transactions', async () => {
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({
        data: { state: 'failed', timestamp: 12 },
        error: undefined,
      })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'h1' } as any)
      syncState.pendingRemoteDrainTxs.push({ hash: 'h1' } as any)

      await useSyncTransactions().updateSingleTransaction('h1')

      expect(state.getTransactionState).toHaveBeenCalledWith({ hash: 'h1' })
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'failed', timestamp: 12 })
      expect(syncState.pendingTransactions).toHaveLength(0)
      expect(syncState.pendingRemoteDrainTxs).toHaveLength(0)
    })

    it('persists failed state from remote-signer API fallback', async () => {
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('rpc'))) as any
      state.getTransactionState.mockResolvedValue({
        data: { state: 'failed', timestamp: 5 },
        error: undefined,
      })
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateSingleTransaction('h1')

      expect(state.getTransactionState).toHaveBeenCalledWith({ hash: 'h1' })
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'failed', timestamp: 5 })
    })

    it('removes hash from pendingTransactions when state !== \'pending\'', async () => {
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'confirmed', timestamp: 12 })) as any
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'h1' } as any)
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(syncState.pendingTransactions).toHaveLength(0)
    })

    it('removes hash from pendingRemoteDrainTxs when state !== \'pending\'', async () => {
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'confirmed', timestamp: 12 })) as any
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({ hash: 'h1' } as any)
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(syncState.pendingRemoteDrainTxs).toHaveLength(0)
    })

    it('returns without updating status when remote-signer API reports \'unknown\'', async () => {
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    })

    it.each(['new', 'pending'] as const)('retains a restored pending transaction while its state is %s', async (transactionState) => {
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: transactionState, timestamp: 12 })) as any
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'h1', sender: 'NQ00 TEST LOCAL ADDRESS' } as any)

      await useSyncTransactions().updateSingleTransaction('h1')

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: transactionState, timestamp: 12 })
      expect(syncState.pendingTransactions.map(tx => tx.transactionHash)).toEqual(['h1'])
    })

    it.each([
      { name: 'included', transaction: { state: 'included', timestamp: 12 }, expectedState: 'included' },
      { name: 'failed', transaction: { state: 'confirmed', executionResult: false, timestamp: 12 }, expectedState: 'failed' },
    ])('removes an ordinary pending transaction only after the $name state is stored', async ({ transaction, expectedState }) => {
      const statusWrite = deferred<void>()
      state.client.getTransaction = vi.fn(() => Promise.resolve(transaction)) as any
      state.updateTransactionStatus.mockReturnValue(statusWrite.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'h1', sender: 'NQ00 TEST LOCAL ADDRESS' } as any)
      const removePendingSpy = vi.spyOn(syncState.pendingTransactions, 'splice')

      const update = useSyncTransactions().updateSingleTransaction('h1')
      await vi.waitFor(() => expect(state.updateTransactionStatus).toHaveBeenCalled())

      expect(syncState.pendingTransactions.map(tx => tx.transactionHash)).toEqual(['h1'])
      statusWrite.resolve()
      await update

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: expectedState, timestamp: 12 })
      expect(state.updateTransactionStatus).toHaveBeenCalledBefore(removePendingSpy)
      expect(syncState.pendingTransactions).toHaveLength(0)
    })

    it('preserves a concurrent pending insertion while removing the resolved hash', async () => {
      const statusWrite = deferred<void>()
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'included', timestamp: 12 })) as any
      state.updateTransactionStatus.mockReturnValue(statusWrite.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'resolved-hash', sender: 'NQ00 TEST LOCAL ADDRESS' } as any)

      const update = useSyncTransactions().updateSingleTransaction('resolved-hash')
      await vi.waitFor(() => expect(state.updateTransactionStatus).toHaveBeenCalled())
      syncState.pendingTransactions.push({ transactionHash: 'concurrent-hash', sender: 'NQ00 TEST LOCAL ADDRESS' } as any)
      statusWrite.resolve()
      await update

      expect(syncState.pendingTransactions.map(tx => tx.transactionHash)).toEqual(['concurrent-hash'])
    })

    it('retains a legacy pending transaction when address history is incomplete', async () => {
      const legacyHash = 'legacy-incomplete-hash'
      state.consensus = 'syncing'
      state.height = 1_000
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: false })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({
        transactionHash: legacyHash,
        sender: 'NQ77 LEGACY SENDER',
        validityStartHeight: 100,
      } as any)

      await useSyncTransactions().updateSingleTransaction(legacyHash)

      expect(state.getAllTransactionsForAddress).toHaveBeenCalledWith(expect.objectContaining({
        toUserFriendlyAddress: expect.any(Function),
      }))
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(syncState.pendingTransactions).toContainEqual(expect.objectContaining({ transactionHash: legacyHash }))
    })

    it('expires an absent pending transaction only after complete address history and numeric validity', async () => {
      const statusWrite = deferred<void>()
      state.consensus = 'syncing'
      state.height = 221
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: true })
      state.updateTransactionStatus.mockReturnValue(statusWrite.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({
        transactionHash: 'expired-hash',
        sender: 'NQ77 LEGACY SENDER',
        validityStartHeight: 100,
        timestamp: 42,
      } as any)

      const update = useSyncTransactions().updateSingleTransaction('expired-hash')
      await vi.waitFor(() => expect(state.updateTransactionStatus).toHaveBeenCalled())
      expect(syncState.pendingTransactions.map(tx => tx.transactionHash)).toEqual(['expired-hash'])
      statusWrite.resolve()
      await update

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'expired-hash', status: 'expired', timestamp: 42 })
      expect(syncState.pendingTransactions).toHaveLength(0)
    })

    it('recovers and persists a legacy outgoing height before expiring an absent transaction', async () => {
      const { getLegacyTransactionValidityStartHeight } = await import('@/lib/utils')
      vi.mocked(getLegacyTransactionValidityStartHeight).mockReturnValueOnce(100)
      state.query.mockResolvedValue({ hash: 'legacy', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ22 RECIPIENT', raw: 'serialized-content' } as any)
      state.client.getTransaction.mockRejectedValue(new Error('not found'))
      state.height = 1000
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: true })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      useSyncState().pendingTransactions.push({ transactionHash: 'legacy', sender: 'NQ00 TEST LOCAL ADDRESS', validityStartHeight: null } as any)
      await useSyncTransactions().updateSingleTransaction('legacy')
      expect(state.run).toHaveBeenCalledWith(SQLQuery.BackfillTxValidityStartHeight, [100, 'legacy'])
      expect(state.updateTransactionStatus).toHaveBeenCalledWith(expect.objectContaining({ hash: 'legacy', status: 'expired' }))
      expect(useSyncState().isTransactionPending).toBe(false)
    })

    it.each([null, undefined])('retains an absent pending transaction with %s validity height', async (validityStartHeight) => {
      state.consensus = 'syncing'
      state.height = 1_000
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: true })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({
        transactionHash: 'nullable-validity-hash',
        sender: 'NQ77 LEGACY SENDER',
        validityStartHeight,
      } as any)

      await useSyncTransactions().updateSingleTransaction('nullable-validity-hash')

      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(state.logger.warn).toHaveBeenCalledWith('Cannot expire pending transaction without validity height', {
        hash: 'nullable-validity-hash',
        validityStartHeight,
      })
      expect(syncState.pendingTransactions.map(tx => tx.transactionHash)).toEqual(['nullable-validity-hash'])
    })

    it('uses a transaction found in incomplete legacy history as authoritative resolution evidence', async () => {
      const legacyHash = 'legacy-hit-hash'
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({
        transactions: [{ transactionHash: legacyHash, state: 'included', timestamp: 55 }],
        complete: false,
      })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({
        transactionHash: legacyHash,
        sender: 'NQ77 LEGACY SENDER',
        validityStartHeight: 100,
      } as any)

      await useSyncTransactions().updateSingleTransaction(legacyHash)

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: legacyHash, status: 'included', timestamp: 55 })
      expect(syncState.pendingTransactions).toHaveLength(0)
    })

    it('expires a drain-only pending row after complete history proves expired absence', async () => {
      state.consensus = 'syncing'
      state.height = 221
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: true })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({
        hash: 'drain-expired-hash',
        sender: 'NQ77 DRAIN SENDER',
        validityStartHeight: 100,
        timestamp: 42,
      } as any)

      await useSyncTransactions().updateSingleTransaction('drain-expired-hash')

      const historyAddress = state.getAllTransactionsForAddress.mock.calls[0]?.[0] as { toUserFriendlyAddress: () => string }
      expect(historyAddress.toUserFriendlyAddress()).toBe('NQ77 DRAIN SENDER')
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({
        hash: 'drain-expired-hash',
        status: 'expired',
        timestamp: 42,
      })
      expect(syncState.pendingRemoteDrainTxs).toHaveLength(0)
    })

    it('retains a drain-only pending row when sender history is incomplete', async () => {
      state.consensus = 'syncing'
      state.height = 1_000
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: false })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({
        hash: 'drain-incomplete-hash',
        sender: 'NQ77 DRAIN SENDER',
        validityStartHeight: 100,
      } as any)

      await useSyncTransactions().updateSingleTransaction('drain-incomplete-hash')

      expect(state.getAllTransactionsForAddress).toHaveBeenCalledOnce()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(syncState.pendingRemoteDrainTxs.map(tx => tx.hash)).toEqual(['drain-incomplete-hash'])
    })

    it('resolves a drain-only pending row from a positive incomplete history hit', async () => {
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({
        transactions: [{ transactionHash: 'drain-history-hit', state: 'included', timestamp: 55 }],
        complete: false,
      })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({
        hash: 'drain-history-hit',
        sender: 'NQ77 DRAIN SENDER',
        validityStartHeight: 100,
      } as any)

      await useSyncTransactions().updateSingleTransaction('drain-history-hit')

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({
        hash: 'drain-history-hit',
        status: 'included',
        timestamp: 55,
      })
      expect(syncState.pendingRemoteDrainTxs).toHaveLength(0)
    })

    it('stores drain-only history resolution before removing the pending row', async () => {
      const statusWrite = deferred<void>()
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({
        transactions: [{ transactionHash: 'drain-write-order', state: 'confirmed', timestamp: 55 }],
        complete: true,
      })
      state.updateTransactionStatus.mockReturnValue(statusWrite.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({
        hash: 'drain-write-order',
        sender: 'NQ77 DRAIN SENDER',
      } as any)
      const removePendingSpy = vi.spyOn(syncState.pendingRemoteDrainTxs, 'splice')

      const update = useSyncTransactions().updateSingleTransaction('drain-write-order')
      await vi.waitFor(() => expect(state.updateTransactionStatus).toHaveBeenCalled())
      expect(syncState.pendingRemoteDrainTxs.map(tx => tx.hash)).toEqual(['drain-write-order'])
      statusWrite.resolve()
      await update

      expect(state.updateTransactionStatus).toHaveBeenCalledBefore(removePendingSpy)
      expect(syncState.pendingRemoteDrainTxs).toHaveLength(0)
    })

    it('preserves a concurrent unrelated drain while resolving a drain-only history hit', async () => {
      const statusWrite = deferred<void>()
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({
        transactions: [{ transactionHash: 'resolved-drain', state: 'included', timestamp: 55 }],
        complete: true,
      })
      state.updateTransactionStatus.mockReturnValue(statusWrite.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({
        hash: 'resolved-drain',
        sender: 'NQ77 DRAIN SENDER',
      } as any)

      const update = useSyncTransactions().updateSingleTransaction('resolved-drain')
      await vi.waitFor(() => expect(state.updateTransactionStatus).toHaveBeenCalled())
      syncState.pendingRemoteDrainTxs.push({ hash: 'concurrent-drain' } as any)
      statusWrite.resolve()
      await update

      expect(syncState.pendingRemoteDrainTxs.map(tx => tx.hash)).toEqual(['concurrent-drain'])
    })

    it.each([null, undefined])('retains a drain-only pending row with %s validity height', async (validityStartHeight) => {
      state.consensus = 'syncing'
      state.height = 1_000
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: true })
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({
        hash: 'drain-nullable-validity',
        sender: 'NQ77 DRAIN SENDER',
        validityStartHeight,
      } as any)

      await useSyncTransactions().updateSingleTransaction('drain-nullable-validity')

      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(state.logger.warn).toHaveBeenCalledWith('Cannot expire pending transaction without validity height', {
        hash: 'drain-nullable-validity',
        validityStartHeight,
      })
      expect(syncState.pendingRemoteDrainTxs.map(tx => tx.hash)).toEqual(['drain-nullable-validity'])
    })

    it('does not commit drain-only history after wallet context replacement', async () => {
      const history = deferred<{ transactions: any[], complete: boolean }>()
      state.consensus = 'syncing'
      state.getTransactionState.mockResolvedValue({ data: { state: 'unknown' }, error: undefined })
      state.getAllTransactionsForAddress.mockReturnValue(history.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingRemoteDrainTxs.push({
        hash: 'drain-stale-context',
        sender: 'NQ77 DRAIN SENDER',
      } as any)

      const update = useSyncTransactions().updateSingleTransaction('drain-stale-context')
      await vi.waitFor(() => expect(state.getAllTransactionsForAddress).toHaveBeenCalled())
      syncState.walletContextGeneration += 1
      syncState.pendingRemoteDrainTxs.splice(0, 1, {
        hash: 'drain-stale-context',
        sender: 'NQ88 REPLACEMENT SENDER',
        replacement: true,
      } as any)
      history.resolve({
        transactions: [{ transactionHash: 'drain-stale-context', state: 'included', timestamp: 55 }],
        complete: true,
      })
      await update

      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(syncState.pendingRemoteDrainTxs).toContainEqual(expect.objectContaining({
        hash: 'drain-stale-context',
        replacement: true,
      }))
    })

    it.each([
      {
        name: 'owner',
        before: () => {},
        replaceContext: () => state.localAddress = createAddress('NQ88 REPLACEMENT OWNER'),
      },
      {
        name: 'network',
        before: () => {},
        replaceContext: () => state.networkName = 'mainalbatross',
      },
      {
        name: 'client identity including undefined',
        before: () => state.client = undefined,
        replaceContext: () => state.client = { getTransaction: vi.fn() } as any,
      },
      {
        name: 'wallet generation',
        before: () => {},
        replaceContext: () => {},
      },
    ])('does not commit after $name context replacement', async ({ name, before, replaceContext }) => {
      const transactionState = deferred<{ data: { state: string, timestamp: number }, error: undefined }>()
      before()
      state.consensus = 'syncing'
      state.getTransactionState.mockReturnValue(transactionState.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'h1', sender: 'NQ00 TEST LOCAL ADDRESS' } as any)

      const update = useSyncTransactions().updateSingleTransaction('h1')
      await vi.waitFor(() => expect(state.getTransactionState).toHaveBeenCalled())
      replaceContext()
      if (name === 'wallet generation')
        syncState.walletContextGeneration += 1
      syncState.pendingTransactions.splice(0, syncState.pendingTransactions.length, {
        transactionHash: 'h1',
        sender: 'NQ88 REPLACEMENT OWNER',
        replacement: true,
      } as any)
      transactionState.resolve({ data: { state: 'included', timestamp: 12 }, error: undefined })
      await update

      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(syncState.pendingTransactions).toContainEqual(expect.objectContaining({
        transactionHash: 'h1',
        replacement: true,
      }))
    })
  })

  describe('updateTransactionHistory', () => {
    it('skips when isUpdatingTransactions is already true', async () => {
      state.isUpdatingTransactions = true
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.getAccountTransactions).not.toHaveBeenCalled()
    })

    it('filters out txs sent from local or remote address', async () => {
      const localTx = {
        transactionHash: 'local-tx',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        senderType: 'basic',
        recipient: 'NQ99 OTHER',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { raw: '' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS')
          return Promise.resolve({ data: [localTx] })
        return Promise.resolve({ data: [] })
      }) as any)
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.getLocalTransactions).toHaveBeenCalledWith({ sinceHeight: 0, limit: 100 })
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })

    it.each(['pending HTLC', 'replaced HTLC', 'replaced wallet'])('ingests the first page independently of %s and stalled older pages', async (scenario) => {
      const page = deferred<any[]>()
      const olderPage = deferred<any[]>()
      const receipt = {
        transactionHash: 'latest-deposit',
        sender: 'NQ77 EXTERNAL',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        senderType: 'basic',
        recipientType: 'basic',
        value: 1800000,
        fee: 0,
        state: 'included',
        timestamp: 1,
        data: { raw: '' },
        proof: { raw: '' },
      }
      state.getLocalTransactions.mockReturnValueOnce(page.promise).mockReturnValue(olderPage.promise)
      const { useSyncTransactions } = await import('./transactions')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      if (scenario === 'pending HTLC')
        syncState.pendingHtlcCreationTransactions.push({ transactionHash: 'creation' } as any)
      const update = useSyncTransactions().updateTransactionHistory()
      await flushPromises()
      if (scenario === 'replaced HTLC')
        state.remoteAddress = createAddress('NQ88 REPLACEMENT HTLC')
      if (scenario === 'replaced wallet')
        state.localAddress = createAddress('NQ88 REPLACEMENT OWNER')
      page.resolve([receipt, ...Array.from({ length: 99 }, (_, index) => ({ ...receipt, sender: 'NQ00 TEST LOCAL ADDRESS', transactionHash: `outgoing-${index}` }))])
      await flushPromises()
      const savedBeforeOlderPage = state.addReceiptTransaction.mock.calls.length
      syncState.pendingHtlcCreationTransactions = []
      olderPage.resolve([])
      await update
      expect(savedBeforeOlderPage).toBe(scenario === 'replaced wallet' ? 0 : 1)
    })

    it('loads full local history through bounded cursor pages', async () => {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        transactionHash: `local-${index}`,
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ99 OTHER',
        senderType: 'basic',
        recipientType: 'basic',
        data: { raw: '' },
        proof: { raw: '' },
      }))
      state.getLocalTransactions.mockImplementation((options?: { startAt?: string }) => Promise.resolve(options?.startAt ? [] : firstPage))
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateTransactionHistory()

      expect(state.getLocalTransactions).toHaveBeenNthCalledWith(1, { sinceHeight: 0, limit: 100 })
      expect(state.getLocalTransactions).toHaveBeenNthCalledWith(2, { sinceHeight: 0, startAt: 'local-99', limit: 100 })
    })

    it('marks NAKA reversal when sender is in nakaBufferAddresses', async () => {
      vi.doMock('@/lib', () => ({ isDev: false, nakaBufferAddresses: ['NQ99 NAKA'] }))
      vi.resetModules()
      const nakaTx = {
        transactionHash: 'naka-tx',
        sender: 'NQ99 NAKA',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { raw: '' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS')
          return Promise.resolve({ data: [nakaTx] })
        return Promise.resolve({ data: [] })
      }) as any)
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.setNakaTxRefunded).toHaveBeenCalledWith(100)
      vi.doUnmock('@/lib')
    })

    it('skips already-saved hashes', async () => {
      const tx = {
        transactionHash: 'known-hash',
        sender: 'NQ77 KNOWN SENDER',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { raw: '' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS')
          return Promise.resolve({ data: [tx] })
        return Promise.resolve({ data: [] })
      }) as any)
      state.query.mockImplementation((sql = '') => {
        if (sql === SQLQuery.GetAllUserReceipts)
          return Promise.resolve([{ hash: 'known-hash', sender: 'NQ77 KNOWN SENDER' }])
        return Promise.resolve([])
      })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })

    it('updates an already-saved Nimiq Pay HTLC deposit with its owner', async () => {
      const tx = {
        transactionHash: 'known-htlc-hash',
        sender: 'NQ33 NIMIQ PAY HTLC',
        senderType: 'htlc',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { raw: '' },
        proof: { type: 'early-resolve', raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS')
          return Promise.resolve({ data: [tx] })
        return Promise.resolve({ data: [] })
      }) as any)
      state.query.mockImplementation((sql = '') => {
        if (sql === SQLQuery.GetAllUserReceipts)
          return Promise.resolve([{ hash: 'known-htlc-hash', sender: 'NQ33 NIMIQ PAY HTLC' }])
        return Promise.resolve([])
      })
      const { buildTopUpReceipt } = await import('@/lib/tx')
      vi.mocked(buildTopUpReceipt).mockResolvedValueOnce({
        transfer: Transfer.UserReceipt,
        amount: 100,
        sender: 'NQ44 HTLC OWNER',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        hash: 'known-htlc-hash',
        status: 'confirmed',
        timestamp: 1,
        title: 'Top-Up',
        message: '',
        fee: 0,
        proofSize: 98,
      } as any)
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateTransactionHistory()

      expect(state.addReceiptTransaction).toHaveBeenCalledWith(expect.objectContaining({
        hash: 'known-htlc-hash',
        sender: 'NQ44 HTLC OWNER',
      }), expect.objectContaining({ client: state.client, generation: state.walletContextGeneration, network: state.networkName, owner: state.localAddress.toUserFriendlyAddress() }))
    })

    describe('own-HTLC drain filtering', () => {
      function ownHtlcDrain(proofType: 'timeout-resolve' | 'early-resolve', creator = 'NQ00 TEST LOCAL ADDRESS') {
        return {
          transactionHash: 'drain-hash',
          sender: 'NQ44 SOME HTLC ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          value: 521,
          fee: 0,
          state: 'confirmed',
          timestamp: 1,
          data: { raw: '' },
          proof: { type: proofType, creator, raw: '' },
        }
      }

      function mockLocalAddressTxs(...txs: any[]) {
        state.getAccountTransactions.mockImplementation(((address: any) => {
          if (address?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS')
            return Promise.resolve({ data: txs })
          return Promise.resolve({ data: [] })
        }) as any)
      }

      it('drops a timeout-resolve drain whose creator is the local address', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve'))
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
        expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith(
          'NQ44 SOME HTLC ADDRESS',
          expect.objectContaining({
            generation: 0,
            network: 'testalbatross',
            owner: 'NQ00 TEST LOCAL ADDRESS',
          }),
        )
      })

      it('drops an early-resolve drain whose creator is the local address', async () => {
        mockLocalAddressTxs(ownHtlcDrain('early-resolve'))
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
        expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith(
          'NQ44 SOME HTLC ADDRESS',
          expect.objectContaining({
            generation: 0,
            network: 'testalbatross',
            owner: 'NQ00 TEST LOCAL ADDRESS',
          }),
        )
      })

      it('does not register an own HTLC from history after wallet context invalidation', async () => {
        let finishHistory!: (transactions: any[]) => void
        state.getLocalTransactions.mockReturnValueOnce(new Promise(resolve => finishHistory = resolve))
        const { useSyncTransactions } = await import('./transactions')

        const update = useSyncTransactions().updateTransactionHistory()
        await vi.waitFor(() => expect(state.getLocalTransactions).toHaveBeenCalledOnce())
        state.walletContextGeneration += 1
        finishHistory([ownHtlcDrain('timeout-resolve')])
        await update

        expect(state.registerOwnHtlcIfMissing).not.toHaveBeenCalled()
        expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
      })

      it('does not persist history receipts after wallet context invalidation during receipt construction', async () => {
        const tx = {
          transactionHash: 'stale-history-receipt',
          sender: 'NQ77 EXTERNAL',
          senderType: 'basic',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          value: 521,
          fee: 0,
          state: 'confirmed',
          timestamp: 1,
          data: { raw: '' },
          proof: { raw: '' },
        }
        mockLocalAddressTxs(tx)
        let finishReceipt!: (receipt: any) => void
        const { buildTopUpReceipt } = await import('@/lib/tx')
        vi.mocked(buildTopUpReceipt).mockClear()
        vi.mocked(buildTopUpReceipt).mockReturnValueOnce(new Promise(resolve => finishReceipt = resolve) as any)
        const { useSyncTransactions } = await import('./transactions')

        const update = useSyncTransactions().updateTransactionHistory()
        await vi.waitFor(() => expect(buildTopUpReceipt).toHaveBeenCalledOnce())
        state.walletContextGeneration += 1
        finishReceipt({ hash: tx.transactionHash, sender: tx.sender })
        await update

        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
      })

      it('keeps a foreign HTLC drain (creator != local) as a Top-Up', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve', 'NQ77 FOREIGN CREATOR'))
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).toHaveBeenCalledWith(expect.objectContaining({
          hash: 'drain-hash',
          title: 'Top-Up',
        }), expect.objectContaining({ client: state.client, generation: state.walletContextGeneration, network: state.networkName, owner: state.localAddress.toUserFriendlyAddress() }))
        expect(state.registerOwnHtlcIfMissing).not.toHaveBeenCalled()
      })

      it('does NOT fire scheduleIncomingPaymentNotification for foreign-HTLC found during history refresh', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve', 'NQ77 FOREIGN CREATOR'))
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        // Receipt is persisted via the refresh path, but the notifier must stay silent
        // — that's the listener-only contract for incoming-payment notifications.
        expect(state.addReceiptTransaction).toHaveBeenCalled()
        expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
      })
    })

    it('awaits centralized signer discovery before scanning remote signer history', async () => {
      const events: string[] = []
      state.discoverRemoteSignersFromBlockchain.mockImplementation(async () => {
        await Promise.resolve()
        events.push('discover')
        return { added: 0, alreadyKnown: 0, localComplete: true, errors: [] }
      })
      state.getAllRemoteSigners.mockImplementation(async () => {
        events.push('getAllRemoteSigners')
        return []
      })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(events).toEqual(['discover', 'getAllRemoteSigners'])
    })

    it('routes swap HTLCs found behind an extension chain to the swap handler', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
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
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: 'swap-leaf-hash' }),
      )
    })

    it('routes withdrawal txs to addWithdrawalTransaction when recipient is a known top-up sender', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS' }
      state.getAllRemoteSigners.mockResolvedValue([{ address: createAddress(signer.address) }] as any)
      const withdrawalTx = {
        transactionHash: 'withdrawal-hash',
        sender: signer.address,
        senderType: 'basic',
        recipient: 'NQ77 KNOWN TOP UP',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { raw: '' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === signer.address)
          return Promise.resolve({ data: [withdrawalTx] })
        return Promise.resolve({ data: [] })
      }) as any)
      state.query.mockImplementation((sql = '') => {
        if (sql === SQLQuery.GetUserReceiptSenders)
          return Promise.resolve([{ sender: 'NQ77 KNOWN TOP UP' }])
        return Promise.resolve([])
      })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.addWithdrawalTransaction).toHaveBeenCalledWith(expect.objectContaining({
        hash: 'withdrawal-hash',
        transfer: Transfer.UserPayment,
      }))
    })

    it('routes unknown-recipient txs through addUnknownPaymentToMerchantTransaction', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS' }
      state.getAllRemoteSigners.mockResolvedValue([{ address: createAddress(signer.address) }] as any)
      const unknownTx = {
        transactionHash: 'unknown-hash',
        sender: signer.address,
        senderType: 'basic',
        recipient: 'NQ88 UNKNOWN MERCHANT',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { raw: '' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === signer.address)
          return Promise.resolve({ data: [unknownTx] })
        return Promise.resolve({ data: [] })
      }) as any)
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: 'unknown-hash' }),
      )
    })

    it('routes BTC_LN swap to addUnknownPaymentToMerchantTransaction with Rail.BitcoinLightning', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS' }
      state.getAllRemoteSigners.mockResolvedValue([{ address: createAddress(signer.address) }] as any)
      const swapTx = {
        transactionHash: 'btc-ln-hash',
        sender: signer.address,
        senderType: 'basic',
        recipient: 'NQ55 SWAP HTLC ADDRESS',
        recipientType: 'htlc',
        value: 50_000,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { hashRoot: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === signer.address)
          return Promise.resolve({ data: [swapTx] })
        return Promise.resolve({ data: [] })
      }) as any)
      state.getContract.mockResolvedValue({
        from: { asset: SwapAsset.NIM },
        to: { asset: SwapAsset.BTC_LN, amount: 1e8, fee: 0 },
      })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalledWith(
        swapTx,
        Transfer.UserPaymentToAtomicSwap,
        Rail.BitcoinLightning,
        '',
        expect.objectContaining({ currency: 'BTC' }),
        expect.objectContaining({ imported: true }),
      )
    })

    it('logs swap fetch errors and falls back to addUnknownPaymentToMerchantTransaction', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS' }
      state.getAllRemoteSigners.mockResolvedValue([{ address: createAddress(signer.address) }] as any)
      const swapTx = {
        transactionHash: 'swap-hash',
        sender: signer.address,
        senderType: 'basic',
        recipient: 'NQ55 SWAP HTLC ADDRESS',
        recipientType: 'htlc',
        value: 50_000,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { hashRoot: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === signer.address)
          return Promise.resolve({ data: [swapTx] })
        return Promise.resolve({ data: [] })
      }) as any)
      state.getContract.mockRejectedValue(new Error('fastspot down'))
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.logger.error).toHaveBeenCalledWith('Error fetching contract info from Fastspot:', 'fastspot down')
      expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalledWith(swapTx)
    })

    it('logs error when contract.from.asset is not NIM', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS' }
      state.getAllRemoteSigners.mockResolvedValue([{ address: createAddress(signer.address) }] as any)
      const swapTx = {
        transactionHash: 'foreign-swap-hash',
        sender: signer.address,
        senderType: 'basic',
        recipient: 'NQ55 SWAP HTLC ADDRESS',
        recipientType: 'htlc',
        value: 50_000,
        fee: 0,
        state: 'confirmed',
        timestamp: 1,
        data: { hashRoot: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        proof: { raw: '' },
      }
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === signer.address)
          return Promise.resolve({ data: [swapTx] })
        return Promise.resolve({ data: [] })
      }) as any)
      state.getContract.mockResolvedValue({
        from: { asset: 'BTC' },
        to: { asset: SwapAsset.NIM, amount: 1, fee: 0 },
      })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.logger.error).toHaveBeenCalledWith(expect.stringContaining('swap from another asset than NIM'))
      expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalledWith(swapTx)
    })
  })

  describe('updateTransactionsInDb', () => {
    it.each(['client', 'cosigner'])('preserves failures recorded during a %s batch lookup unless execution succeeds', async (source) => {
      for (const status of ['failed', 'invalidated']) {
        for (const executionResult of [undefined, false, true]) {
          state.updateTransactionStatus.mockClear()
          state.consensus = source === 'client' ? 'established' : 'syncing'
          state.query.mockResolvedValue([{ hash: 'race', status: 'pending' }])
          const lookup = deferred<any>()
          if (source === 'client')
            state.client.getTransaction.mockReturnValue(lookup.promise)
          else
            state.getTransactionState.mockReturnValue(lookup.promise)
          const { useTransactions } = await import('../transactions')
          const { useSyncTransactions } = await import('./transactions')
          const transactions = useTransactions().transactions as unknown as { hash: string, status: string }[]
          transactions.splice(0, transactions.length, { hash: 'race', status: 'pending' } as any)

          const updating = useSyncTransactions().updateTransactionsInDb()
          await flushPromises()
          transactions[0].status = status as 'failed' | 'invalidated'
          const tx = { state: 'included', executionResult, timestamp: 5, value: 1 }
          lookup.resolve(source === 'client' ? tx : { data: tx, error: undefined })
          await updating

          if (executionResult === undefined)
            expect(state.updateTransactionStatus).not.toHaveBeenCalled()
          else
            expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'race', status: executionResult ? 'included' : 'failed', timestamp: 5 })
        }
      }
    })

    it.each(['established', 'syncing'])('skips invalid transactions during batch refresh with consensus %s', async (consensus) => {
      state.consensus = consensus as typeof state.consensus
      state.query.mockResolvedValue([
        { hash: 'failed', status: 'failed' },
        { hash: 'invalidated', status: 'invalidated' },
      ])
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateTransactionsInDb()

      expect(state.client.getTransaction).not.toHaveBeenCalled()
      expect(state.getTransactionState).not.toHaveBeenCalled()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(state.logger.error).not.toHaveBeenCalled()
    })

    it('checks failed execution from the cosigner during batch refresh', async () => {
      state.consensus = 'syncing'
      state.query.mockResolvedValue([{ hash: 'h1', status: 'pending' }])
      state.getTransactionState.mockResolvedValue({ data: { state: 'included', executionResult: false, timestamp: 5, value: 1 }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateTransactionsInDb()

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'failed', timestamp: 5 })
    })

    it('ignores USDT rows', async () => {
      state.query.mockResolvedValue([{ asset: 'USDT', hash: 'h1', status: 'pending' }])
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.client.getTransaction).not.toHaveBeenCalled()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    })

    it('claims cashback for confirmed merchant payments paid in NIM', async () => {
      state.pointsToken = 'token'
      state.query.mockResolvedValue([{
        hash: 'h1',
        status: 'confirmed',
        timestamp: 100,
        transfer: Transfer.UserPaymentToMerchant,
        paymentMethod: PaymentMethod.NIM,
        isCashbackClaimed: false,
      }])
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.claimCashback).toHaveBeenCalled()
      expect(state.updateTransactionCashbackClaimed).toHaveBeenCalledWith({ hash: 'h1' })
    })

    it('marks cashback claimed when claimCashback returns CPL_PAYMENT_REQUEST_ALREADY_PROCESSED', async () => {
      state.pointsToken = 'token'
      state.claimCashback.mockResolvedValue({ error: 'duplicate', errorType: 'CPL_PAYMENT_REQUEST_ALREADY_PROCESSED' })
      state.query.mockResolvedValue([{
        hash: 'h1',
        status: 'confirmed',
        timestamp: 100,
        transfer: Transfer.UserPaymentToMerchant,
        paymentMethod: PaymentMethod.NIM,
        isCashbackClaimed: false,
      }])
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.updateTransactionCashbackClaimed).toHaveBeenCalledWith({ hash: 'h1' })
    })

    it('returns early when status is confirmed and timestamp is set', async () => {
      state.query.mockResolvedValue([{
        hash: 'h1',
        status: 'confirmed',
        timestamp: 100,
        transfer: Transfer.UserPayment,
        paymentMethod: PaymentMethod.NIM,
      }])
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.client.getTransaction).not.toHaveBeenCalled()
      expect(state.getTransactionState).not.toHaveBeenCalled()
    })

    it('uses CPL API for hashes with PointsHashPrefix', async () => {
      state.query.mockResolvedValue([{
        hash: `${PointsHashPrefix}h1`,
        status: 'pending',
        timestamp: undefined,
        paymentRef: 'ref-1',
      }])
      state.getOrderById.mockResolvedValue({ data: { status: 'confirmed' }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.getOrderById).toHaveBeenCalledWith({ id: 'ref-1' })
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({
        hash: `${PointsHashPrefix}h1`,
        status: 'confirmed',
        timestamp: undefined,
      })
    })

    it('uses remote-signer API when consensus not established', async () => {
      state.consensus = 'syncing'
      state.query.mockResolvedValue([{ hash: 'h1', status: 'pending', timestamp: undefined }])
      state.getTransactionState.mockResolvedValue({ data: { state: 'confirmed', timestamp: 5, value: 1 }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.getTransactionState).toHaveBeenCalledWith({ hash: 'h1' })
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'confirmed', timestamp: 5 })
    })

    it('uses client.getTransaction when consensus is established', async () => {
      state.query.mockResolvedValue([{ hash: 'h1', status: 'pending', timestamp: undefined }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'confirmed', timestamp: 5, value: 1 })) as any
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'confirmed', timestamp: 5 })
    })

    it('persists failed when client history reports unsuccessful execution', async () => {
      state.query.mockResolvedValue([{ hash: 'h1', status: 'pending', timestamp: undefined }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'confirmed',
        executionResult: false,
        timestamp: 5,
        value: 1,
      })) as any
      const { useSyncTransactions } = await import('./transactions')

      await useSyncTransactions().updateTransactionsInDb()

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'failed', timestamp: 5 })
    })

    it('skips updateTransactionStatus when state and timestamp are unchanged', async () => {
      state.query.mockResolvedValue([{ hash: 'h1', status: 'included', timestamp: 5 }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'included', timestamp: 5, value: 1 })) as any
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    })

    it('logs and continues when getTransaction throws', async () => {
      state.query.mockResolvedValue([{ hash: 'h1', status: 'pending', timestamp: undefined }])
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('rpc'))) as any
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionsInDb()
      expect(state.logger.error).toHaveBeenCalledWith('[updateTransactionsInDb] Error while getting transaction', expect.any(Error))
    })
  })
})
