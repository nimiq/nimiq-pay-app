/* eslint-disable perfectionist/sort-imports, import/no-duplicates */
import './__tests__/setup'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Transfer } from '@/types/transactions'
import { createAddress, remoteSignerFixture, resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncHtlc', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((resolvePromise) => {
      resolve = resolvePromise
    })
    return { promise, resolve }
  }

  // nodesAreSynced is an async computed; touch it then flush microtasks so it resolves to true.
  async function primeNodesAreSynced() {
    const { useSyncState } = await import('./state')
    void useSyncState().nodesAreSynced
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  describe('handleFunds', () => {
    it('returns immediately when localBalance is 0', async () => {
      state.localBalance = 0
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.getBalance).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('delays when isSendingTx is true', async () => {
      state.localBalance = 100
      state.isSendingTx = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('aborts and logs when remote getBalance returns a non-NO_ACCOUNT error', async () => {
      state.localBalance = 100_000
      state.getBalance.mockResolvedValue({ data: undefined, error: new Error('temporary') })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.logger.error).toHaveBeenCalledWith('Error while getting remote balance before handling funds', expect.any(Error))
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('creates an HTLC (Transfer.LocalToRemote) when remote balance is 0 and no HTLC pending', async () => {
      state.localBalance = 100_000
      state.isHtlcPending = false
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.LocalToRemote })
    })

    it('does not create HTLC when one is already pending', async () => {
      state.localBalance = 100_000
      state.isHtlcPending = true
      state.isHtlcActive = false
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it.each([0, 50_000])('quietly retries after a busy send with remote balance %s', async (balance) => {
      state.localBalance = 100_000
      state.height = 1000
      state.remoteHeight = 1000
      state.isHtlcActive = true
      state.isRemoteOk = true
      state.getBalance.mockResolvedValue({ data: balance, error: undefined })
      state.sendTx.mockResolvedValueOnce({ outcome: 'rejected', reason: 'busy', error: 'pending' })
      const { useSyncHtlc } = await import('./htlc')
      await primeNodesAreSynced()
      const store = useSyncHtlc()

      await store.handleFunds()

      expect(state.setToast).not.toHaveBeenCalled()
      expect(state.logger.error).not.toHaveBeenCalled()
      expect(state.isProcessingRemote).toBe(false)

      await store.handleFunds()
      expect(state.sendTx).toHaveBeenCalledTimes(2)
    })

    it('shows toast and resets isProcessingRemote on HTLC creation error', async () => {
      state.localBalance = 100_000
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      state.sendTx.mockResolvedValue({ outcome: 'rejected', error: 'boom' })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.setToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
      expect(state.isProcessingRemote).toBe(false)
    })

    it('liquidates active HTLC when nodes are synced and remote ok', async () => {
      state.localBalance = 100_000
      state.height = 1000
      state.remoteHeight = 1000
      state.isHtlcActive = true
      state.isRemoteOk = true
      state.getBalance.mockResolvedValue({ data: 50_000, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await primeNodesAreSynced()
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.RemoteToLocal })
    })

    it('logs liquidation context when topping up an active HTLC fails', async () => {
      state.localBalance = 100_000
      state.height = 1000
      state.remoteHeight = 1000
      state.remoteBalance = 50_000
      state.isHtlcActive = true
      state.isRemoteOk = true
      state.getBalance.mockResolvedValue({ data: 50_000, error: undefined })
      state.sendTx.mockResolvedValue({ outcome: 'rejected', error: 'cosigner rejected' })
      const { useSyncHtlc } = await import('./htlc')
      await primeNodesAreSynced()

      await useSyncHtlc().handleFunds()

      expect(state.logger.log).toHaveBeenCalledWith('Preparing to top up deposit by liquidating active HTLC', expect.objectContaining({
        localBalance: 100_000,
        remoteBalance: 50_000,
        remoteAddress: 'NQ11 TEST REMOTE ADDRESS',
        nodesAreSynced: true,
        isHtlcActive: true,
        isRemoteOk: true,
      }))
      expect(state.logger.error).toHaveBeenCalledWith('Error while liquidating HTLC', 'cosigner rejected', expect.objectContaining({
        localBalance: 100_000,
        remoteBalance: 50_000,
        remoteAddress: 'NQ11 TEST REMOTE ADDRESS',
        pendingRemoteDrainTxs: 0,
        pendingTransactions: 0,
        pendingHtlcCreationTransactions: 0,
      }))
    })

    it('delays handleFunds when nodes are not synced and HTLC inactive', async () => {
      state.localBalance = 100_000
      state.height = 1000
      state.remoteHeight = 100_000 // far apart
      state.isHtlcActive = false
      state.getBalance.mockResolvedValue({ data: 50_000, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('accumulates (no HTLC touch) when below threshold and a remote balance already exists', async () => {
      state.localBalance = 50_000
      state.htlcThreshold = 100_000
      state.remoteBalance = 100_000
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).not.toHaveBeenCalled()
      // Guarded before the remote-balance fetch, so no RPC is wasted while below threshold.
      expect(state.getBalance).not.toHaveBeenCalled()
    })

    it('creates an HTLC below threshold when no remote balance exists yet (force, do not keep pending)', async () => {
      state.localBalance = 50_000
      state.htlcThreshold = 100_000
      state.remoteBalance = 0
      state.isHtlcPending = false
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.LocalToRemote })
    })

    it('creates an HTLC below threshold when stale expired remote balance is already drained on-chain', async () => {
      state.localBalance = 50_000
      state.htlcThreshold = 100_000
      state.remoteBalance = 100_000
      state.hasHtlcExpired = true
      state.isHtlcActive = false
      state.isHtlcPending = false
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.getBalance).toHaveBeenCalledWith(state.remoteAddress)
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.LocalToRemote })
    })

    it('creates an HTLC once localBalance reaches htlcThreshold', async () => {
      state.localBalance = 100_000
      state.htlcThreshold = 100_000
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.LocalToRemote })
    })

    it('does not liquidate an active HTLC when localBalance is below htlcThreshold', async () => {
      state.localBalance = 50_000
      state.htlcThreshold = 100_000
      state.remoteBalance = 100_000
      state.isHtlcActive = true
      state.isRemoteOk = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('liquidates an active HTLC once localBalance reaches htlcThreshold', async () => {
      state.localBalance = 100_000
      state.htlcThreshold = 100_000
      state.height = 1000
      state.remoteHeight = 1000
      state.isHtlcActive = true
      state.isRemoteOk = true
      state.getBalance.mockResolvedValue({ data: 50_000, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await primeNodesAreSynced()
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.RemoteToLocal })
    })

    it('creates an HTLC immediately when htlcThreshold is 0 (regression)', async () => {
      state.localBalance = 1
      state.htlcThreshold = 0
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().handleFunds()
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.LocalToRemote })
    })
  })

  describe('extendValidity', () => {
    it('skips when remoteBalance is 0', async () => {
      state.remoteBalance = 0
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().extendValidity()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('skips when isHtlcActive is false', async () => {
      state.remoteBalance = 100
      state.isHtlcActive = false
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().extendValidity()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('skips when remoteHeight is -1', async () => {
      state.remoteBalance = 100
      state.isHtlcActive = true
      state.remoteHeight = -1
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().extendValidity()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('delays when isSendingTx is true', async () => {
      state.remoteBalance = 100
      state.isHtlcActive = true
      state.htlcStart = 100_000
      state.htlcEnd = 300_000
      state.headTimestamp = 199_000 // satisfies htlcCanBeExtended
      state.isSendingTx = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().extendValidity()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('sends Transfer.ExtendRemote when htlcCanBeExtended is true', async () => {
      state.remoteBalance = 100
      state.isHtlcActive = true
      state.htlcStart = 100_000
      state.htlcEnd = 300_000
      state.headTimestamp = 199_000
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().extendValidity()
      expect(state.sendTx).toHaveBeenCalledWith({ transfer: Transfer.ExtendRemote })
    })

    it('does not reclaim after an uncertain extension outcome', async () => {
      state.remoteBalance = 250
      state.isHtlcActive = true
      state.htlcStart = 100_000
      state.htlcEnd = 300_000
      state.headTimestamp = 199_000
      state.sendTx.mockResolvedValue({
        outcome: 'unknown',
        stagedTx: { hash: 'extension-hash' },
        stagedHash: 'extension-hash',
        error: 'response lost',
      })
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().extendValidity()

      expect(state.sendTx).toHaveBeenCalledTimes(1)
      expect(state.sendTx).not.toHaveBeenCalledWith(
        expect.objectContaining({ transfer: Transfer.RemoteToLocalAfterTimeout }),
      )
    })

    it('falls back to RemoteToLocalAfterTimeout claim when extend tx errors', async () => {
      state.remoteBalance = 250
      state.isHtlcActive = true
      state.htlcStart = 100_000
      state.htlcEnd = 300_000
      state.headTimestamp = 199_000
      state.sendTx
        .mockResolvedValueOnce({ outcome: 'rejected', error: 'extend boom' })
        .mockResolvedValueOnce({ outcome: 'submitted', tx: { hash: 'claim-hash' }, serialized: 'claim' })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().extendValidity()
      expect(state.sendTx).toHaveBeenNthCalledWith(1, { transfer: Transfer.ExtendRemote })
      expect(state.sendTx).toHaveBeenNthCalledWith(2, expect.objectContaining({
        transfer: Transfer.RemoteToLocalAfterTimeout,
        amount: 250,
      }))
    })

    it('logs claim failure when both extend and timeout claim fail', async () => {
      state.remoteBalance = 250
      state.isHtlcActive = true
      state.htlcStart = 100_000
      state.htlcEnd = 300_000
      state.headTimestamp = 199_000
      state.sendTx
        .mockResolvedValueOnce({ outcome: 'rejected', error: 'extend boom' })
        .mockResolvedValueOnce({ outcome: 'rejected', error: 'claim boom' })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().extendValidity()
      expect(state.logger.error).toHaveBeenCalledWith('Error while claiming funds from Remote after extending error', expect.any(Object))
    })
  })

  describe('checkRemoteValidity', () => {
    it('skips when remoteBalance is 0', async () => {
      state.remoteBalance = 0
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkRemoteValidity()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('skips when not expired', async () => {
      state.remoteBalance = 100
      state.hasHtlcExpired = false
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkRemoteValidity()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('skips when isSendingTx', async () => {
      state.remoteBalance = 100
      state.hasHtlcExpired = true
      state.isSendingTx = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkRemoteValidity()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('sends Transfer.RemoteToLocalAfterTimeout when expired', async () => {
      state.remoteBalance = 750
      state.hasHtlcExpired = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkRemoteValidity()
      expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({
        transfer: Transfer.RemoteToLocalAfterTimeout,
        amount: 750,
      }))
    })

    it('shows toast and resets isProcessingRemote on send failure', async () => {
      state.remoteBalance = 750
      state.hasHtlcExpired = true
      state.sendTx.mockResolvedValue({ outcome: 'rejected', error: 'boom' })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkRemoteValidity()
      expect(state.setToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
      expect(state.isProcessingRemote).toBe(false)
    })

    it('keeps recovery pending without showing a retry error when outcome is unknown', async () => {
      state.remoteBalance = 750
      state.hasHtlcExpired = true
      state.sendTx.mockResolvedValue({
        outcome: 'unknown',
        stagedTx: { hash: 'recovery-hash' },
        stagedHash: 'recovery-hash',
        error: 'response lost',
      })
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().checkRemoteValidity()

      expect(state.setToast).not.toHaveBeenCalled()
      expect(state.isProcessingRemote).toBe(true)
    })
  })

  describe('checkHtlcState', () => {
    it('queues one fresh reconciliation after many overlapping triggers', async () => {
      const predecessorAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      const childAddress = 'NQ22 TEST CHILD HTLC ADDRESS'
      const childHash = 'child-hash'
      const predecessorBalance = deferred<{ data: number, error: undefined }>()
      let chainState: 'included' | 'pending' = 'pending'
      state.remoteAddress = createAddress(childAddress) as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: childHash,
        recipient: childAddress,
        sender: predecessorAddress,
        senderType: 2,
        status: 'pending',
      }])
      state.client.getTransaction = vi.fn(async () => chainState === 'pending'
        ? {
            state: 'pending',
            transactionHash: childHash,
            sender: predecessorAddress,
            senderType: 'htlc',
            recipient: childAddress,
          }
        : {
            state: 'included',
            transactionHash: childHash,
            sender: 'NQ00 TEST LOCAL ADDRESS',
            recipient: childAddress,
            value: 100,
            validityStartHeight: 100,
            timestamp: 200_000,
            data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
          }) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      state.getAllRemoteSigners.mockResolvedValue([
        { ...remoteSignerFixture(predecessorAddress, 10, false), address: createAddress(predecessorAddress) },
      ])
      state.getBalance.mockReturnValue(predecessorBalance.promise)
      state.updateRemoteSigner.mockImplementation(async (signer?: any) => {
        state.remoteAddress = signer?.address
        state.remoteBalance = signer?.balance ?? 0
      })
      state.activateRemoteSignerFromTransaction.mockImplementation(async (transaction: any) => {
        state.remoteAddress = createAddress(transaction.recipient) as any
        state.remoteBalance = transaction.value
        state.htlcStart = transaction.timestamp
        state.htlcEnd = transaction.data.timeout
      })
      const { SQLQuery } = await import('@/lib/sql-queries')
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      const htlc = useSyncHtlc()

      const firstRun = htlc.checkHtlcState()
      await vi.waitFor(() => expect(state.getBalance).toHaveBeenCalled())
      const overlappingRuns = [htlc.checkHtlcState(), htlc.checkHtlcState(), htlc.checkHtlcState()]
      chainState = 'included'
      predecessorBalance.resolve({ data: 77, error: undefined })
      await Promise.all([firstRun, ...overlappingRuns])

      const selectPendingQuery = state.query.mock.calls.filter(([query]) => query === SQLQuery.SelectPendingHtlcCreations)
      expect(selectPendingQuery).toHaveLength(2)
      expect(state.client.getTransaction).toHaveBeenCalledTimes(2)
      expect(state.remoteAddress?.toUserFriendlyAddress()).toBe(childAddress)
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([expect.objectContaining({ state: 'included' })])
    })

    it('times out a stalled predecessor balance lookup and runs the queued reconciliation', async () => {
      vi.useFakeTimers()
      const predecessorAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      const childAddress = 'NQ22 TEST CHILD HTLC ADDRESS'
      const childHash = 'balance-timeout-child-hash'
      let chainState: 'included' | 'pending' = 'pending'
      state.remoteAddress = createAddress(childAddress) as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: childHash,
        recipient: childAddress,
        sender: predecessorAddress,
        senderType: 2,
        status: 'pending',
      }])
      state.client.getTransaction = vi.fn(async () => chainState === 'pending'
        ? {
            state: 'pending',
            transactionHash: childHash,
            sender: predecessorAddress,
            senderType: 'htlc',
            recipient: childAddress,
          }
        : {
            state: 'included',
            transactionHash: childHash,
            sender: 'NQ00 TEST LOCAL ADDRESS',
            recipient: childAddress,
            value: 100,
            validityStartHeight: 100,
            timestamp: 200_000,
            data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
          }) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      state.getAllRemoteSigners.mockResolvedValue([
        { ...remoteSignerFixture(predecessorAddress, 10, false), address: createAddress(predecessorAddress) },
      ])
      state.getBalance.mockReturnValue(new Promise(() => {}))
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      const htlc = useSyncHtlc()
      let settled = false

      const firstRun = htlc.checkHtlcState().then(() => settled = true)
      await vi.waitFor(() => expect(state.getBalance).toHaveBeenCalled())
      const queuedRun = htlc.checkHtlcState()
      chainState = 'included'
      await vi.advanceTimersByTimeAsync(30_000)

      expect(settled).toBe(true)
      await Promise.all([firstRun, queuedRun])
      expect(state.query).toHaveBeenCalledTimes(2)
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([expect.objectContaining({ state: 'included' })])
    })

    it('runs a queued reconciliation after the current run fails', async () => {
      let rejectFirstQuery!: (error: Error) => void
      const firstQuery = new Promise<any[]>((_, reject) => rejectFirstQuery = reject)
      state.query
        .mockImplementationOnce(() => firstQuery)
        .mockResolvedValueOnce([])
      const { SQLQuery } = await import('@/lib/sql-queries')
      const { useSyncHtlc } = await import('./htlc')
      const htlc = useSyncHtlc()

      const firstRun = htlc.checkHtlcState()
      await vi.waitFor(() => expect(state.query).toHaveBeenCalledWith(SQLQuery.SelectPendingHtlcCreations))
      const queuedRun = htlc.checkHtlcState()
      rejectFirstQuery(new Error('query failed'))

      await expect(Promise.all([firstRun, queuedRun])).resolves.toEqual([undefined, undefined])
      expect(state.query).toHaveBeenCalledTimes(2)
      expect(state.logger.error).toHaveBeenCalledWith('Error reconciling HTLC state', expect.any(Error))
    })

    it.each(['pending', 'invalidated', 'confirmed'] as const)('monitors an active included creation until %s', async (nextState) => {
      const childHash = 'included-reorg-hash'
      const childAddress = 'NQ22 TEST CHILD HTLC ADDRESS'
      let chainState: 'included' | 'pending' | 'invalidated' | 'confirmed' = 'included'
      let dbStatus: 'included' | 'pending' | 'invalidated' | 'confirmed' = 'included'
      const included = {
        transactionHash: childHash,
        state: 'included',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        senderType: 'basic',
        recipient: childAddress,
        value: 100,
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
      }
      state.query.mockImplementation(async () =>
        dbStatus === 'invalidated'
          ? []
          : [{
              hash: childHash,
              sender: included.sender,
              recipient: childAddress,
              status: dbStatus,
              validityStartHeight: 100,
            }])
      state.client.getTransaction = vi.fn(() => Promise.resolve(
        chainState === 'included' ? included : { ...included, state: chainState },
      )) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      state.activateRemoteSignerFromTransaction.mockImplementation(async () => {
        state.remoteAddress = createAddress(childAddress)
        state.remoteBalance = 100
      })
      state.deactivateRemoteSigner.mockImplementation(async () => {
        state.remoteAddress = undefined
        state.remoteBalance = 0
        return true
      })
      state.updateRemoteSigner.mockImplementation(async (signer?: any) => {
        state.remoteAddress = signer?.address
        state.remoteBalance = signer?.balance ?? 0
      })
      state.updateTransactionStatus.mockImplementation(async ({ status }: { status: 'included' | 'pending' | 'invalidated' | 'confirmed' }) => {
        dbStatus = status
      })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      const htlc = useSyncHtlc()

      await htlc.checkHtlcState()

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({
        hash: childHash,
        status: 'included',
        timestamp: included.timestamp,
      })
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(1)

      state.activateRemoteSignerFromTransaction.mockClear()
      await htlc.checkHtlcState()

      expect(useSyncState().isTransactionPending).toBe(false)

      chainState = nextState
      await htlc.checkHtlcState()

      expect(state.client.getTransaction).toHaveBeenCalledTimes(3)
      if (nextState !== 'confirmed')
        expect(state.deactivateRemoteSigner).toHaveBeenCalled()
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
      expect(state.remoteAddress?.toUserFriendlyAddress()).toBe(nextState === 'confirmed' ? childAddress : undefined)
      expect(dbStatus).toBe(nextState === 'invalidated' ? 'failed' : nextState)
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(nextState === 'pending' ? 1 : 0)
      expect(useSyncState().isTransactionPending).toBe(nextState === 'pending')
    })

    it('monitors an older included creation without reactivating it over a newer signer', async () => {
      state.remoteAddress = createAddress('NQ22 NEWER SIGNER')
      state.htlcStart = 300_000
      state.client.getTransaction.mockResolvedValue({ transactionHash: 'old', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ33 OLD SIGNER', state: 'included', timestamp: 200_000, validityStartHeight: 100 } as any)
      state.activateRemoteSignerFromTransaction.mockRejectedValue(new Error('Accepted HTLC account is unavailable'))
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'old', state: 'included', validityStartHeight: 100 } as any)
      await useSyncHtlc().checkHtlcState()
      expect(state.activateRemoteSignerFromTransaction).not.toHaveBeenCalled()
      expect(useSyncState().isTransactionPending).toBe(false)
      expect(state.remoteAddress?.toUserFriendlyAddress()).toBe('NQ22 NEWER SIGNER')
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([expect.objectContaining({ transactionHash: 'old', state: 'included' })])
    })

    it('does not resurrect a removed hash from a stale hydration race and performs a fresh queued query', async () => {
      const staleHash = 'stale-hydration-hash'
      const firstQuery = deferred<any[]>()
      let queryCount = 0
      state.client = undefined as any
      state.query.mockImplementation(() => {
        queryCount += 1
        return queryCount === 1 ? firstQuery.promise : Promise.resolve([])
      })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      const htlc = useSyncHtlc()
      syncState.pendingHtlcCreationTransactions.push({ transactionHash: staleHash, state: 'pending' } as any)

      const firstRun = htlc.checkHtlcState()
      await vi.waitFor(() => expect(state.query).toHaveBeenCalledTimes(1))
      syncState.pendingHtlcCreationTransactions.splice(0, 1)
      const queuedRun = htlc.checkHtlcState()
      firstQuery.resolve([{ hash: staleHash, status: 'pending' }])
      await Promise.all([firstRun, queuedRun])

      expect(state.query).toHaveBeenCalledTimes(2)
      expect(syncState.pendingHtlcCreationTransactions).not.toContainEqual(
        expect.objectContaining({ transactionHash: staleHash }),
      )
    })

    it('does not overwrite a concurrent pending insertion with a stale whole-array commit', async () => {
      const lookup = deferred<any>()
      state.client.getTransaction = vi.fn(() => lookup.promise) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      const original = { transactionHash: 'original-hash', recipient: 'NQ11 TEST REMOTE ADDRESS' } as any
      const concurrent = { transactionHash: 'concurrent-hash' } as any
      syncState.pendingHtlcCreationTransactions.push(original)

      const reconciliation = useSyncHtlc().checkHtlcState()
      await vi.waitFor(() => expect(state.client.getTransaction).toHaveBeenCalledWith('original-hash'))
      syncState.pendingHtlcCreationTransactions = [original, concurrent]
      lookup.resolve({ state: 'confirmed', transactionHash: 'original-hash', recipient: 'NQ11 TEST REMOTE ADDRESS' })
      await reconciliation

      expect(syncState.pendingHtlcCreationTransactions).toEqual([concurrent])
    })

    it.each([
      ['owner', () => state.localAddress = createAddress('NQ44 REPLACEMENT OWNER') as any],
      ['network', () => state.networkName = 'mainalbatross'],
      ['client', () => state.client = { ...state.client, getTransaction: vi.fn() } as any],
      ['generation', () => state.walletContextGeneration += 1],
    ])('ignores stale %s context after an in-flight lookup', async (_dimension, replaceContext) => {
      const lookup = deferred<any>()
      const originalClient = state.client
      originalClient.getTransaction = vi.fn(() => lookup.promise) as any
      const included = {
        transactionHash: 'stale-context-hash',
        state: 'included',
        value: 100,
        recipient: 'NQ22 TEST CHILD HTLC ADDRESS',
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
      }
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: included.transactionHash } as any)

      const reconciliation = useSyncHtlc().checkHtlcState()
      await vi.waitFor(() => expect(originalClient.getTransaction).toHaveBeenCalledWith(included.transactionHash))
      replaceContext()
      lookup.resolve(included)
      await reconciliation

      expect(state.activateRemoteSignerFromTransaction).not.toHaveBeenCalled()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(useSyncState().pendingHtlcCreationTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: included.transactionHash }),
      )
    })

    it('hydrates a stale pending barrier before client readiness without waiting', async () => {
      state.client = undefined as any
      state.query.mockResolvedValue([{ hash: 'offline-hash', status: 'pending' }])
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: 'offline-hash' }),
      )
    })

    it('hydrates a queued pending barrier before consensus readiness without waiting', async () => {
      state.consensus = 'syncing'
      state.query.mockResolvedValue([{ hash: 'syncing-hash', status: 'pending' }])
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: 'syncing-hash' }),
      )
      expect(state.client.waitForConsensusEstablished).not.toHaveBeenCalled()
      expect(state.client.getTransaction).not.toHaveBeenCalled()
    })

    it.each(['included', 'confirmed'])('delegates a %s creation to shared live-account activation', async (status) => {
      const included = {
        transactionHash: 'included-hash',
        state: status,
        value: 100,
        recipient: 'NQ22 TEST CHILD HTLC ADDRESS',
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
      }
      state.client.getTransaction = vi.fn(() => Promise.resolve(included)) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 77, timeout: 400_000 })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: included.transactionHash } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionHash: included.transactionHash,
          timestamp: included.timestamp,
          value: 100,
          data: expect.objectContaining({ timeout: 300_000 }),
        }),
        expect.objectContaining({
          client: state.client,
          generation: state.walletContextGeneration,
          network: state.networkName,
          owner: state.localAddress.toUserFriendlyAddress(),
        }),
      )
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(status === 'included' ? 1 : 0)
    })

    it.each(['NQ11 TEST REMOTE ADDRESS', 'NQ22 TEST OLD HTLC ADDRESS'])('resolves a drained confirmed creation at %s without restoring historical funds', async (recipient) => {
      const confirmed = {
        transactionHash: 'drained-creation',
        state: 'confirmed',
        recipient,
        value: 11011200000,
        timestamp: 200_000,
      }
      state.remoteBalance = 11011700000
      state.client.getTransaction = vi.fn().mockResolvedValue(confirmed)
      state.client.getAccount = vi.fn().mockResolvedValue({ type: 'basic', balance: 0 })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: confirmed.transactionHash } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(confirmed, expect.any(Object))
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: confirmed.transactionHash, status: 'confirmed', timestamp: confirmed.timestamp })
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([])
    })

    it.each(['included', 'confirmed'])('keeps a %s creation barrier when live account evidence fails', async (status) => {
      const included = {
        transactionHash: 'included-account-failure-hash',
        state: status,
        value: 100,
        recipient: 'NQ22 TEST CHILD HTLC ADDRESS',
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
      }
      state.client.getTransaction = vi.fn(() => Promise.resolve(included)) as any
      state.activateRemoteSignerFromTransaction.mockRejectedValue(new Error('account unavailable'))
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: included.transactionHash } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalled()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(useSyncState().pendingHtlcCreationTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: included.transactionHash, state: 'pending' }),
      )
    })

    it('skips when isSendingTx', async () => {
      state.isSendingTx = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkHtlcState()
      expect(state.client.waitForConsensusEstablished).not.toHaveBeenCalled()
    })

    it('marks isHtlcActive true when balance > 0, time window valid, no pending HTLC creation', async () => {
      state.remoteBalance = 100
      state.htlcStart = 100_000
      state.headTimestamp = 200_000
      state.htlcEnd = 300_000
      state.isHtlcActive = false
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkHtlcState()
      expect(state.isHtlcActive).toBe(true)
    })

    it('marks isHtlcActive true when all pending HTLC creation transactions are confirmed', async () => {
      state.remoteBalance = 100
      state.htlcStart = 100_000
      state.headTimestamp = 200_000
      state.htlcEnd = 300_000
      state.isHtlcActive = false
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'confirmed', transactionHash: 'h1' })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)
      await useSyncHtlc().checkHtlcState()
      expect(state.isHtlcActive).toBe(true)
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(0)
    })

    it('marks an included HTLC creation active without waiting for confirmation', async () => {
      state.remoteBalance = 100
      state.htlcStart = 100_000
      state.headTimestamp = 200_000
      state.htlcEnd = 300_000
      state.isHtlcActive = false
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'included',
        transactionHash: 'h1',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        value: 100,
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
      })) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.isHtlcActive).toBe(true)
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([expect.objectContaining({ state: 'included' })])
    })

    it('activates an accepted unknown broadcast while stored balance is still zero', async () => {
      state.remoteBalance = 0
      state.isHtlcActive = false
      const included = {
        transactionHash: 'h1',
        state: 'included',
        value: 100,
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', timeout: 300_000 },
      }
      state.client.getTransaction = vi.fn(() => Promise.resolve(included)) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      state.activateRemoteSignerFromTransaction.mockImplementation(async () => {
        state.remoteBalance = 100
        state.htlcStart = 200_000
        state.htlcEnd = 300_000
      })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push(included as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(included, expect.objectContaining({
        client: state.client,
        generation: state.walletContextGeneration,
        network: state.networkName,
        owner: state.localAddress.toUserFriendlyAddress(),
      }))
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([expect.objectContaining({ state: 'included' })])
      expect(state.isHtlcActive).toBe(true)
    })

    it('monitors an included creation while another creation still blocks sending', async () => {
      state.remoteBalance = 100
      state.client.getTransaction = vi.fn((hash: string) => Promise.resolve(hash === 'included-hash'
        ? {
            state: 'included',
            transactionHash: hash,
            recipient: 'NQ22 TEST NEW HTLC ADDRESS',
            value: 100,
            validityStartHeight: 100,
            timestamp: 200_000,
            data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
          }
        : { state: 'pending', transactionHash: hash })) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push(
        { transactionHash: 'included-hash' } as any,
        { transactionHash: 'pending-hash' } as any,
      )

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([
        expect.objectContaining({ transactionHash: 'included-hash', state: 'included' }),
        expect.objectContaining({ transactionHash: 'pending-hash', state: 'pending' }),
      ])
      expect(state.isHtlcActive).toBe(false)
    })

    it('clears an invalidated unknown broadcast and marks its transaction failed', async () => {
      state.remoteBalance = 0
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'invalidated', transactionHash: 'h1', timestamp: 200_000 })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(0)
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'failed', timestamp: 200_000 })
    })

    it('clears an active signer when an included creation is later invalidated', async () => {
      state.remoteAddress = createAddress('NQ22 TEST NEW HTLC ADDRESS') as any
      state.remoteBalance = 100
      state.isHtlcActive = true
      state.query.mockResolvedValue([{ hash: 'h1', recipient: 'NQ22 TEST NEW HTLC ADDRESS', status: 'included' }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'invalidated',
        transactionHash: 'h1',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        timestamp: 200_000,
      })) as any
      state.deactivateRemoteSigner.mockImplementation(async (address: any) => {
        if (state.remoteAddress?.equals(address)) {
          state.remoteAddress = undefined
          state.remoteBalance = 0
        }
        return true
      })
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().checkHtlcState()

      expect(state.deactivateRemoteSigner).toHaveBeenCalledWith(
        expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }),
        expect.objectContaining({
          client: state.client,
          generation: state.walletContextGeneration,
          network: state.networkName,
          owner: state.localAddress.toUserFriendlyAddress(),
        }),
        true,
      )
      expect(state.deactivateRemoteSigner.mock.calls[0]?.[0].toUserFriendlyAddress()).toBe('NQ22 TEST NEW HTLC ADDRESS')
      expect(state.updateRemoteSigner).not.toHaveBeenCalledWith(undefined, expect.anything())
      expect(state.isHtlcActive).toBe(false)
    })

    it('deactivates the exact child after authoritative rejection and a missing predecessor account', async () => {
      const previousAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      const childAddress = 'NQ22 TEST NEW HTLC ADDRESS'
      state.remoteAddress = createAddress(childAddress) as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: 'no-account-child',
        recipient: childAddress,
        sender: previousAddress,
        senderType: 2,
        status: 'included',
      }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'invalidated',
        transactionHash: 'no-account-child',
        sender: previousAddress,
        senderType: 'htlc',
        recipient: childAddress,
        timestamp: 200_000,
      })) as any
      state.getAllRemoteSigners.mockResolvedValue([
        { ...remoteSignerFixture(previousAddress, 10, false), address: createAddress(previousAddress) },
      ])
      state.getBalance.mockResolvedValue({ data: undefined, error: 'No account found' })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      expect(state.deactivateRemoteSigner).toHaveBeenCalledWith(
        expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }),
        expect.objectContaining({
          client: state.client,
          generation: state.walletContextGeneration,
          network: state.networkName,
          owner: state.localAddress.toUserFriendlyAddress(),
        }),
        true,
      )
      const deactivatedAddress = state.deactivateRemoteSigner.mock.calls[0]?.[0]
      expect(deactivatedAddress.toUserFriendlyAddress()).toBe(childAddress)
      expect(state.updateRemoteSigner).not.toHaveBeenCalledWith(undefined, expect.anything())
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'no-account-child', status: 'failed', timestamp: 200_000 })
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(0)
    })

    it('deactivates the exact child after authoritative expiry and an empty predecessor', async () => {
      const previousAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      const childAddress = 'NQ22 TEST NEW HTLC ADDRESS'
      state.remoteAddress = createAddress(childAddress) as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: 'empty-predecessor-child',
        recipient: childAddress,
        sender: previousAddress,
        senderType: 2,
        status: 'included',
      }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'expired',
        transactionHash: 'empty-predecessor-child',
        sender: previousAddress,
        senderType: 'htlc',
        recipient: childAddress,
        timestamp: 200_000,
      })) as any
      state.getAllRemoteSigners.mockResolvedValue([
        { ...remoteSignerFixture(previousAddress, 10, false), address: createAddress(previousAddress) },
      ])
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      const deactivatedAddress = state.deactivateRemoteSigner.mock.calls[0]?.[0]
      expect(deactivatedAddress.toUserFriendlyAddress()).toBe(childAddress)
      expect(state.deactivateRemoteSigner).toHaveBeenCalledWith(deactivatedAddress, expect.any(Object), true)
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'empty-predecessor-child', status: 'expired', timestamp: 200_000 })
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(0)
    })

    it('retains a nonterminal child when its predecessor account is missing', async () => {
      const previousAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      const childAddress = 'NQ22 TEST NEW HTLC ADDRESS'
      state.remoteAddress = createAddress(childAddress) as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: 'pending-no-account-child',
        recipient: childAddress,
        sender: previousAddress,
        senderType: 2,
        status: 'included',
      }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'pending',
        transactionHash: 'pending-no-account-child',
        sender: previousAddress,
        senderType: 'htlc',
        recipient: childAddress,
      })) as any
      state.getAllRemoteSigners.mockResolvedValue([
        { ...remoteSignerFixture(previousAddress, 10, false), address: createAddress(previousAddress) },
      ])
      state.getBalance.mockResolvedValue({ data: undefined, error: 'No account found' })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      expect(state.deactivateRemoteSigner).not.toHaveBeenCalled()
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
      expect(state.updateTransactionStatus).toHaveBeenCalledWith(expect.objectContaining({ hash: 'pending-no-account-child', status: 'pending' }))
      expect(useSyncState().pendingHtlcCreationTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: 'pending-no-account-child' }),
      )
    })

    it('restores the extension transaction sender instead of guessing another funded signer', async () => {
      const previousAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      const unrelatedAddress = 'NQ33 TEST UNRELATED HTLC ADDRESS'
      state.remoteAddress = createAddress('NQ22 TEST NEW HTLC ADDRESS') as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: 'h1',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        sender: previousAddress,
        senderType: 2,
        status: 'included',
      }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'invalidated',
        transactionHash: 'h1',
        sender: previousAddress,
        senderType: 'htlc',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        timestamp: 200_000,
      })) as any
      state.getAllRemoteSigners.mockResolvedValue([
        { ...remoteSignerFixture(unrelatedAddress, 900, false), address: createAddress(unrelatedAddress) },
        { ...remoteSignerFixture(previousAddress, 10, false), address: createAddress(previousAddress) },
      ])
      state.getBalance.mockImplementation(async (address: any) => ({
        data: address.toUserFriendlyAddress() === previousAddress ? 77 : 900,
        error: undefined,
      }))
      state.updateRemoteSigner.mockImplementation(async (signer?: any) => {
        state.remoteAddress = signer?.address
        state.remoteBalance = signer?.balance ?? 0
      })
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().checkHtlcState()

      expect(state.updateRemoteSigner).toHaveBeenCalledWith(expect.objectContaining({
        active: true,
        balance: 77,
        address: expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }),
      }), expect.objectContaining({
        client: state.client,
        generation: state.walletContextGeneration,
        network: state.networkName,
        owner: state.localAddress.toUserFriendlyAddress(),
      }))
      expect(state.remoteAddress?.toUserFriendlyAddress()).toBe(previousAddress)
      expect(state.getBalance).toHaveBeenCalledTimes(1)
    })

    it('retains rollback state when the predecessor balance lookup fails', async () => {
      const previousAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      state.remoteAddress = createAddress('NQ22 TEST NEW HTLC ADDRESS') as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: 'h1',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        sender: previousAddress,
        senderType: 2,
        status: 'included',
      }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'invalidated',
        transactionHash: 'h1',
        sender: previousAddress,
        senderType: 'htlc',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
      })) as any
      state.getAllRemoteSigners.mockResolvedValue([
        { ...remoteSignerFixture(previousAddress, 10, false), address: createAddress(previousAddress) },
      ])
      state.getBalance.mockResolvedValue({ data: undefined, error: new Error('rpc') })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(1)
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    })

    it('rolls back an optimistically active extension when a reorg returns it to pending', async () => {
      const previousAddress = 'NQ11 TEST PREVIOUS HTLC ADDRESS'
      state.remoteAddress = createAddress('NQ22 TEST NEW HTLC ADDRESS') as any
      state.remoteBalance = 100
      state.query.mockResolvedValue([{
        hash: 'h1',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        sender: previousAddress,
        senderType: 2,
        status: 'included',
      }])
      state.client.getTransaction = vi.fn(() => Promise.resolve({
        state: 'pending',
        transactionHash: 'h1',
        sender: previousAddress,
        senderType: 'htlc',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
      })) as any
      state.getAllRemoteSigners.mockResolvedValue([{ ...remoteSignerFixture(previousAddress, 10, false), address: createAddress(previousAddress) }])
      state.getBalance.mockResolvedValue({ data: 77, error: undefined })
      state.updateRemoteSigner.mockImplementation(async (signer?: any) => {
        state.remoteAddress = signer?.address
        state.remoteBalance = signer?.balance ?? 0
      })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      expect(state.remoteAddress?.toUserFriendlyAddress()).toBe(previousAddress)
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(1)
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'pending', timestamp: undefined })
      expect(state.isHtlcActive).toBe(false)
    })

    it('clears an expired broadcast and persists its authoritative state', async () => {
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'expired', transactionHash: 'h1', timestamp: 200_000 })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(0)
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'expired', timestamp: 200_000 })
    })

    it('preserves the restored timestamp through reconciliation and expiry', async () => {
      state.height = 250
      state.query.mockResolvedValue([{
        hash: 'timestamp',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 CHILD',
        status: 'pending',
        timestamp: 123_456,
        validityStartHeight: 100,
      }])
      state.client.getTransaction.mockRejectedValue(new Error('not found'))
      state.findTransactionInHistory.mockResolvedValue(undefined)
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'timestamp', timestamp: 123_456 } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'timestamp', status: 'expired', timestamp: 123_456 })
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([])
    })

    it.each(['included', 'confirmed', 'invalidated'])('resolves legacy creation from %s sender history without a height', async (status) => {
      const transaction = { transactionHash: 'legacy', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ22 CHILD', state: status, timestamp: 123_456, validityStartHeight: 100 }
      state.query.mockResolvedValue([{ hash: 'legacy', sender: transaction.sender, recipient: transaction.recipient, status: 'pending', validityStartHeight: null }])
      state.client.getTransaction.mockRejectedValue(new Error('not found'))
      state.findTransactionInHistory.mockResolvedValue(transaction as any)
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      const { SQLQuery } = await import('@/lib/sql-queries')

      await useSyncHtlc().checkHtlcState()

      expect(state.run).toHaveBeenCalledWith(SQLQuery.BackfillTxValidityStartHeight, [100, 'legacy'])
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'legacy', status: status === 'invalidated' ? 'failed' : status, timestamp: 123_456 })
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(status === 'included' ? 1 : 0)
    })

    it.each(['complete', 'incomplete', 'write-failed', 'context-changed', 'boundary'])('backfills decoded legacy height with %s recovery', async (scenario) => {
      const { getLegacyTransactionValidityStartHeight } = await import('@/lib/utils')
      vi.mocked(getLegacyTransactionValidityStartHeight).mockReturnValueOnce(100)
      state.height = scenario === 'boundary' ? 100 + Nimiq.Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS : 10_000
      state.query.mockResolvedValue([{
        hash: 'legacy-raw',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 CHILD',
        status: 'pending',
        timestamp: 123,
        validityStartHeight: null,
        raw: 'verified-content',
      }])
      state.client.getTransaction.mockRejectedValue(new Error('not found'))
      state.findTransactionInHistory.mockResolvedValue(undefined)
      if (scenario === 'incomplete')
        state.findTransactionInHistory.mockRejectedValue(new Error('incomplete'))
      if (scenario === 'write-failed')
        state.run.mockRejectedValueOnce(new Error('disk failure'))
      if (scenario === 'context-changed')
        state.run.mockImplementationOnce(async () => { state.walletContextGeneration += 1 })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      if (scenario === 'complete') {
        expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'legacy-raw', status: 'expired', timestamp: 123 })
        expect(useSyncState().pendingHtlcCreationTransactions).toEqual([])
      }
      else {
        expect(state.updateTransactionStatus).not.toHaveBeenCalled()
        expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(1)
      }
    })

    it('uses the persisted legacy height after restart without decoding again', async () => {
      const { getLegacyTransactionValidityStartHeight } = await import('@/lib/utils')
      vi.mocked(getLegacyTransactionValidityStartHeight).mockClear().mockReturnValueOnce(100)
      const row = {
        hash: 'restart-legacy',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 CHILD',
        status: 'pending',
        timestamp: 123,
        validityStartHeight: null as number | null,
        raw: 'verified-content',
      }
      const { SQLQuery } = await import('@/lib/sql-queries')
      state.query.mockImplementation(async () => [{ ...row }])
      state.run.mockImplementation(async (sql, values) => {
        if (sql === SQLQuery.BackfillTxValidityStartHeight)
          row.validityStartHeight = values![0] as number
      })
      state.height = 100
      state.client.getTransaction.mockRejectedValue(new Error('not found'))
      state.findTransactionInHistory.mockResolvedValue(undefined)
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      await useSyncHtlc().checkHtlcState()
      expect(row.validityStartHeight).toBe(100)

      setActivePinia(createPinia())
      state.height = 10_000
      await useSyncHtlc().checkHtlcState()

      expect(getLegacyTransactionValidityStartHeight).toHaveBeenCalledOnce()
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([])
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: row.hash, status: 'expired', timestamp: 123 })
    })

    it('expires an absent broadcast after its validity window', async () => {
      state.remoteBalance = 0
      state.height = 250
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('not found'))) as any
      state.findTransactionInHistory.mockResolvedValue(undefined)
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({
        transactionHash: 'h1',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        validityStartHeight: 100,
      } as any)

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(0)
      expect(state.findTransactionInHistory).toHaveBeenCalledWith(expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }), 'h1')
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'expired', timestamp: undefined })
    })

    it.each([
      ['null', null],
      ['omitted', undefined],
    ])('retains a legacy HTLC creation with %s validity height', async (_name, validityStartHeight) => {
      const legacyHash = `legacy-${_name}-height`
      state.height = 10_000
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('not found'))) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({
        transactionHash: legacyHash,
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        validityStartHeight,
      } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.findTransactionInHistory).toHaveBeenCalled()
      expect(state.logger.warn).toHaveBeenCalledWith('Cannot expire pending HTLC creation without validity height', {
        hash: legacyHash,
        validityStartHeight,
      })
      expect(state.updateTransactionStatus).not.toHaveBeenCalledWith(
        expect.objectContaining({ hash: legacyHash, status: 'expired' }),
      )
      expect(useSyncState().pendingHtlcCreationTransactions).toContainEqual(
        expect.objectContaining({ transactionHash: legacyHash }),
      )
    })

    it('uses complete sender history before expiring an empty accepted HTLC', async () => {
      state.remoteBalance = 0
      state.height = 250
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('temporary rpc failure'))) as any
      const confirmed = {
        transactionHash: 'h1',
        state: 'confirmed',
        executionResult: true,
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        value: 100,
        timestamp: 200_000,
        validityStartHeight: 100,
        data: { type: 'htlc', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ99 COSIGNER ADDRESS', timeout: 300_000 },
      }
      state.findTransactionInHistory.mockResolvedValue(confirmed)
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({
        transactionHash: 'h1',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        validityStartHeight: 100,
      } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(confirmed, expect.any(Object))
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([])
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'confirmed', timestamp: 200_000 })
      expect(state.updateTransactionStatus).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }))
    })

    it('retains expired-window recovery when sender history is unavailable', async () => {
      state.height = 250
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('temporary rpc failure'))) as any
      state.findTransactionInHistory.mockRejectedValue(new Error('history unavailable'))
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({
        transactionHash: 'h1',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        validityStartHeight: 100,
      } as any)

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(1)
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    })

    it('stops waiting for a pending HTLC lookup and retains recovery state', async () => {
      vi.useFakeTimers()
      state.client.getTransaction = vi.fn(() => new Promise(() => {})) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)

      let settled = false
      void useSyncHtlc().checkHtlcState().then(() => settled = true)
      await vi.waitFor(() => expect(state.client.getTransaction).toHaveBeenCalledWith('h1'))
      await vi.advanceTimersByTimeAsync(30_000)

      expect(settled).toBe(true)
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([
        expect.objectContaining({ transactionHash: 'h1' }),
      ])
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    })

    it('rehydrates a pending HTLC creation from DB before checking chain state', async () => {
      const included = {
        transactionHash: 'persisted-hash',
        state: 'included',
        value: 100,
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', timeout: 300_000 },
      }
      state.query.mockResolvedValue([{ hash: included.transactionHash }])
      state.client.getTransaction = vi.fn(() => Promise.resolve(included)) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      const { SQLQuery } = await import('@/lib/sql-queries')
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().checkHtlcState()

      expect(state.query).toHaveBeenCalledWith(SQLQuery.SelectPendingHtlcCreations)
      expect(state.client.getTransaction).toHaveBeenCalledWith(included.transactionHash)
      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(included, expect.objectContaining({
        client: state.client,
        generation: state.walletContextGeneration,
        network: state.networkName,
        owner: state.localAddress.toUserFriendlyAddress(),
      }))
    })

    it('durably activates an included HTLC even when memory already has its address', async () => {
      const included = {
        transactionHash: 'persisted-hash',
        state: 'included',
        value: 100,
        recipient: 'NQ11 TEST REMOTE ADDRESS',
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', timeout: 300_000 },
      }
      state.query.mockResolvedValue([{ hash: included.transactionHash }])
      state.client.getTransaction = vi.fn(() => Promise.resolve(included)) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')

      await useSyncHtlc().checkHtlcState()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(included, expect.objectContaining({
        client: state.client,
        generation: state.walletContextGeneration,
        network: state.networkName,
        owner: state.localAddress.toUserFriendlyAddress(),
      }))
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([expect.objectContaining({ state: 'included' })])
    })

    it('retains an accepted HTLC when signer activation is not ready yet', async () => {
      const included = {
        transactionHash: 'h1',
        state: 'included',
        value: 100,
        recipient: 'NQ22 TEST NEW HTLC ADDRESS',
        validityStartHeight: 100,
        timestamp: 200_000,
        data: { type: 'htlc', timeout: 300_000 },
      }
      state.client.getTransaction = vi.fn(() => Promise.resolve(included)) as any
      state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 100, timeout: 300_000 })) as any
      state.activateRemoteSignerFromTransaction.mockRejectedValue(new Error('Cosigner key unavailable'))
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)

      await expect(useSyncHtlc().checkHtlcState()).resolves.toBeUndefined()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(included, expect.objectContaining({
        client: state.client,
        generation: state.walletContextGeneration,
        network: state.networkName,
        owner: state.localAddress.toUserFriendlyAddress(),
      }))
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([
        expect.objectContaining({ transactionHash: 'h1', state: 'pending' }),
      ])
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
    })

    it('marks isHtlcActive false and keeps unconfirmed pending entries when at least one not confirmed', async () => {
      state.remoteBalance = 100
      state.htlcStart = 100_000
      state.headTimestamp = 200_000
      state.htlcEnd = 300_000
      state.isHtlcActive = true
      state.client.getTransaction = vi.fn((hash: string) => Promise.resolve({ state: hash === 'h1' ? 'confirmed' : 'pending', transactionHash: hash })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any, { transactionHash: 'h2' } as any)
      await useSyncHtlc().checkHtlcState()
      expect(state.isHtlcActive).toBe(false)
      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(1)
    })

    it('marks isHtlcActive false when getTransaction throws', async () => {
      state.remoteBalance = 100
      state.htlcStart = 100_000
      state.headTimestamp = 200_000
      state.htlcEnd = 300_000
      state.isHtlcActive = true
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('rpc'))) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)
      await useSyncHtlc().checkHtlcState()
      expect(state.isHtlcActive).toBe(false)
      expect(state.logger.error).toHaveBeenCalledWith('Error checking pending HTLC transactions', expect.any(Error))
    })

    it('marks isHtlcActive false when balance is 0 or window not active', async () => {
      state.remoteBalance = 0
      state.isHtlcActive = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkHtlcState()
      expect(state.isHtlcActive).toBe(false)
    })
  })

  describe('checkExpiredSwapHtlcs', () => {
    it('throttles repeated calls within one BLOCKS_PER_BATCH window', async () => {
      const { useSyncHtlc } = await import('./htlc')
      const htlc = useSyncHtlc()
      await htlc.checkExpiredSwapHtlcs()
      const firstQueryCalls = state.query.mock.calls.length
      await htlc.checkExpiredSwapHtlcs()
      expect(state.query.mock.calls.length).toBe(firstQueryCalls)
    })

    it('marks legacy polygon row (no htlc_id) as expired without on-chain refund', async () => {
      state.query.mockResolvedValue([{ address: '0xabc', htlc_id: null }])
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.run).toHaveBeenCalledWith(expect.any(String), ['0xabc'])
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: '0xabc', status: 'expired', timestamp: undefined })
      expect(state.refundPolygonSwapHtlc).not.toHaveBeenCalled()
    })

    it('reclaims polygon row with htlc_id via refundPolygonSwapHtlc', async () => {
      const polygonRow = { address: '0xrelayhash', htlc_id: '0xhtlcid', swap_id: 'swap-1' }
      state.query.mockResolvedValue([polygonRow])
      state.refundPolygonSwapHtlc.mockResolvedValue({ refunded: true, hash: '0xrefundhash' })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.refundPolygonSwapHtlc).toHaveBeenCalledWith(polygonRow)
      expect(state.updateTransactionStatus).not.toHaveBeenCalled()
      expect(state.updateSinglePolygonTransaction).not.toHaveBeenCalled()
    })

    it('falls back to updateSingleTransaction when Lightning preimage arrives late', async () => {
      const polygonRow = { address: '0xhtlcid', htlc_id: '0xhtlcid', tx_hash: '0xrelayhash', swap_id: 'swap-1' }
      state.query.mockResolvedValue([polygonRow])
      state.refundPolygonSwapHtlc.mockResolvedValue({ refunded: false, preimage: '0xdeadbeef' })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.refundPolygonSwapHtlc).toHaveBeenCalledWith(polygonRow)
      expect(state.updateSinglePolygonTransaction).toHaveBeenCalledWith('0xrelayhash')
    })

    it('deletes a provisional Polygon row when Lightning preimage proves redemption', async () => {
      const provisionalRow = { address: '0xhtlcid', htlc_id: '0xhtlcid', swap_id: 'swap-1' }
      state.query.mockResolvedValue([provisionalRow])
      state.refundPolygonSwapHtlc.mockResolvedValue({ refunded: false, preimage: '0xdeadbeef' })
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().checkExpiredSwapHtlcs()

      expect(state.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM swap_htlcs'), ['0xhtlcid'])
      expect(state.updateSinglePolygonTransaction).not.toHaveBeenCalled()
    })

    it('logs and continues when refundPolygonSwapHtlc throws (row left for retry)', async () => {
      const polygonRow = { address: '0xrelayhash', htlc_id: '0xhtlcid', swap_id: 'swap-1' }
      state.query.mockResolvedValue([polygonRow])
      state.refundPolygonSwapHtlc.mockRejectedValue(new Error('relay down'))
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.logger.error).toHaveBeenCalledWith('Polygon HTLC refund failed; will retry next sweep', expect.any(Error))
      // Row not deleted — only the swap_quotes cleanup ran
      expect(state.run).not.toHaveBeenCalledWith(expect.stringContaining('swap_htlcs'), ['0xrelayhash'])
    })

    it('returns early when htlcCheckLock is held', async () => {
      state.htlcCheckLock = true
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.query).not.toHaveBeenCalled()
    })

    it('deletes empty native swap HTLC from db', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 0 })) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.run).toHaveBeenCalledWith(expect.any(String), ['NQ55 SWAP HTLC ADDRESS'])
      expect(state.setSwapHtlcRefunded).not.toHaveBeenCalled()
    })

    it('refunds funded native HTLC and marks setSwapHtlcRefunded once execution succeeds', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 100_000, type: 'htlc' })) as any
      state.client.sendTransaction = vi.fn(() => Promise.resolve({ state: 'included', executionResult: true })) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.setSwapHtlcRefunded).toHaveBeenCalledWith('NQ55 SWAP HTLC ADDRESS')
    })

    it('does not mark a native refund done before its execution is known', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 100_000, type: 'htlc' })) as any
      state.client.sendTransaction = vi.fn(() => Promise.resolve({ state: 'pending' })) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.setSwapHtlcRefunded).not.toHaveBeenCalled()
    })

    it('does not mark a native refund done when its execution failed', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 100_000, type: 'htlc' })) as any
      state.client.sendTransaction = vi.fn(() => Promise.resolve({ state: 'included', executionResult: false })) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.logger.error).toHaveBeenCalledWith('Error while sending refund swap HTLC tx', expect.any(Object))
      expect(state.setSwapHtlcRefunded).not.toHaveBeenCalled()
    })

    it('holds the swap lock until the refund flag is written', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 100_000, type: 'htlc' })) as any
      state.client.sendTransaction = vi.fn(() => Promise.resolve({ state: 'included', executionResult: true })) as any
      const flagWrite = deferred<void>()
      state.setSwapHtlcRefunded.mockReturnValue(flagWrite.promise)
      const { useSyncHtlc } = await import('./htlc')

      const sweep = useSyncHtlc().checkExpiredSwapHtlcs()
      await vi.waitFor(() => expect(state.setSwapHtlcRefunded).toHaveBeenCalled())
      expect(state.htlcCheckLock).toBe(true)

      flagWrite.resolve()
      await sweep
      expect(state.htlcCheckLock).toBe(false)
    })

    it('marks an empty native HTLC refunded when its history shows our refund landed', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 0 })) as any
      state.client.getTransactionsByAddress = vi.fn(() => Promise.resolve([
        { sender: 'NQ66 FUNDER', recipient: 'NQ55 SWAP HTLC ADDRESS', executionResult: true },
        { sender: 'NQ55 SWAP HTLC ADDRESS', recipient: state.localAddress.toUserFriendlyAddress(), executionResult: true },
      ])) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.setSwapHtlcRefunded).toHaveBeenCalledWith('NQ55 SWAP HTLC ADDRESS')
      expect(state.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM swap_htlcs'), ['NQ55 SWAP HTLC ADDRESS'])
    })

    it('keeps an empty native HTLC row when its history lookup fails', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 0 })) as any
      state.client.getTransactionsByAddress = vi.fn(() => Promise.reject(new Error('history unavailable'))) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.logger.error).toHaveBeenCalledWith('Error while refunding swap HTLC', expect.any(Error))
      expect(state.run).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM swap_htlcs'), ['NQ55 SWAP HTLC ADDRESS'])
    })

    it('releases the swap lock when an HTLC balance lookup hangs', async () => {
      vi.useFakeTimers()
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => new Promise(() => {})) as any
      const { useSyncHtlc } = await import('./htlc')

      const sweep = useSyncHtlc().checkExpiredSwapHtlcs()
      await vi.advanceTimersByTimeAsync(30_000)

      expect(state.htlcCheckLock).toBe(false)
      expect(state.logger.error).toHaveBeenCalledWith('Error while refunding swap HTLC', expect.any(Error))
      await sweep
    })

    it('releases the swap lock when a refund broadcast hangs', async () => {
      vi.useFakeTimers()
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 100_000, type: 'htlc' })) as any
      state.client.sendTransaction = vi.fn(() => new Promise(() => {})) as any
      const { useSyncHtlc } = await import('./htlc')

      const sweep = useSyncHtlc().checkExpiredSwapHtlcs()
      await vi.advanceTimersByTimeAsync(30_000)

      expect(state.htlcCheckLock).toBe(false)
      expect(state.logger.error).toHaveBeenCalledWith('Error while refunding swap HTLC', expect.any(Error))
      expect(state.setSwapHtlcRefunded).not.toHaveBeenCalled()
      await sweep
    })

    it('logs refund send failure when sendTransaction returns invalidated', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 100_000, type: 'htlc' })) as any
      state.client.sendTransaction = vi.fn(() => Promise.resolve({ state: 'invalidated' })) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.logger.error).toHaveBeenCalledWith('Error while sending refund swap HTLC tx', expect.any(Object))
      expect(state.setSwapHtlcRefunded).not.toHaveBeenCalled()
    })

    it('logs refund construction errors and continues to next HTLC', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.reject(new Error('rpc boom'))) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.logger.error).toHaveBeenCalledWith('Error while refunding swap HTLC', expect.any(Error))
    })
  })

  describe('maybeCheckHtlcState', () => {
    it('skips when consensus is not established', async () => {
      state.consensus = 'syncing'
      state.height = 100
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().maybeCheckHtlcState()
      expect(state.htlcCheckLock).toBe(false)
    })

    it('skips when localHeight is not a multiple of 10', async () => {
      state.height = 101
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().maybeCheckHtlcState()
      expect(state.htlcCheckLock).toBe(false)
    })

    it('keeps the swap lock separate from queued creation reconciliation', async () => {
      state.height = 100
      state.htlcCheckLock = true
      state.remoteBalance = 100
      state.htlcStart = 100_000
      state.headTimestamp = 200_000
      state.htlcEnd = 300_000
      state.isHtlcActive = false
      const { SQLQuery } = await import('@/lib/sql-queries')
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().maybeCheckHtlcState()

      expect(state.query).toHaveBeenCalledWith(SQLQuery.SelectPendingHtlcCreations)
      expect(state.isHtlcActive).toBe(true)
      expect(state.htlcCheckLock).toBe(true)
    })

    it('runs checkHtlcState without taking the swap lock', async () => {
      state.height = 100
      state.remoteBalance = 100
      state.htlcStart = 100_000
      state.headTimestamp = 200_000
      state.htlcEnd = 300_000
      state.isHtlcActive = false
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().maybeCheckHtlcState()
      expect(state.isHtlcActive).toBe(true)
      expect(state.htlcCheckLock).toBe(false)
    })

    it('leaves the swap lock untouched when reconciliation throws', async () => {
      state.height = 130
      state.query.mockRejectedValue(new Error('database unavailable'))
      const { useSyncHtlc } = await import('./htlc')

      await expect(useSyncHtlc().maybeCheckHtlcState()).rejects.toThrow('database unavailable')

      expect(state.htlcCheckLock).toBe(false)
    })
  })
})
