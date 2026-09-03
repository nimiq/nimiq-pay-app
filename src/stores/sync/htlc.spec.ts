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

    it('shows toast and resets isProcessingRemote on HTLC creation error', async () => {
      state.localBalance = 100_000
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      state.sendTx.mockResolvedValue({ data: undefined, error: new Error('boom') })
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
      state.sendTx.mockResolvedValue({ data: undefined, error: 'cosigner rejected' })
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

    it('falls back to RemoteToLocalAfterTimeout claim when extend tx errors', async () => {
      state.remoteBalance = 250
      state.isHtlcActive = true
      state.htlcStart = 100_000
      state.htlcEnd = 300_000
      state.headTimestamp = 199_000
      state.sendTx
        .mockResolvedValueOnce({ data: undefined, error: new Error('extend boom') })
        .mockResolvedValueOnce({ data: { tx: { hash: 'claim-hash' } }, error: undefined })
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
        .mockResolvedValueOnce({ data: undefined, error: new Error('extend boom') })
        .mockResolvedValueOnce({ data: undefined, error: new Error('claim boom') })
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
      state.sendTx.mockResolvedValue({ data: undefined, error: new Error('boom') })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkRemoteValidity()
      expect(state.setToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
      expect(state.isProcessingRemote).toBe(false)
    })

    it('logs error when sendTx returns no transaction data', async () => {
      state.remoteBalance = 750
      state.hasHtlcExpired = true
      state.sendTx.mockResolvedValue({ data: undefined, error: undefined })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkRemoteValidity()
      expect(state.logger.error).toHaveBeenCalledWith('No transaction returned from sendTx when recovering HTLC in checkRemoteValidity')
    })
  })

  describe('checkHtlcState', () => {
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
      state.client.getTransaction = vi.fn(() => Promise.resolve({ state: 'included', transactionHash: 'h1' })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.isHtlcActive).toBe(true)
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([
        expect.objectContaining({ transactionHash: 'h1', state: 'included' }),
      ])
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
      state.activateRemoteSignerFromTransaction.mockImplementation(async () => {
        state.remoteBalance = 100
        state.htlcStart = 200_000
        state.htlcEnd = 300_000
      })
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push(included as any)

      await useSyncHtlc().checkHtlcState()

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(included)
      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([
        expect.objectContaining({ transactionHash: 'h1', state: 'included' }),
      ])
      expect(state.isHtlcActive).toBe(true)
    })

    it('keeps included creations monitored while another creation remains pending', async () => {
      state.remoteBalance = 100
      state.client.getTransaction = vi.fn((hash: string) => Promise.resolve({
        state: hash === 'included-hash' ? 'included' : 'pending',
        transactionHash: hash,
      })) as any
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push(
        { transactionHash: 'included-hash' } as any,
        { transactionHash: 'pending-hash' } as any,
      )

      await useSyncHtlc().checkHtlcState()

      expect(useSyncState().pendingHtlcCreationTransactions).toEqual([
        expect.objectContaining({ transactionHash: 'included-hash', state: 'included' }),
        expect.objectContaining({ transactionHash: 'pending-hash' }),
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
      state.updateRemoteSigner.mockImplementation(async (signer?: any) => {
        state.remoteAddress = signer?.address
        state.remoteBalance = signer?.balance ?? 0
      })
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().checkHtlcState()

      expect(state.updateRemoteSigner).toHaveBeenCalledWith(undefined)
      expect(state.isHtlcActive).toBe(false)
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

      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(confirmed)
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
      const { SQLQuery } = await import('@/lib/sql-queries')
      const { useSyncHtlc } = await import('./htlc')

      await useSyncHtlc().checkHtlcState()

      expect(state.query).toHaveBeenCalledWith(SQLQuery.SelectPendingHtlcCreations)
      expect(state.client.getTransaction).toHaveBeenCalledWith(included.transactionHash)
      expect(state.activateRemoteSignerFromTransaction).toHaveBeenCalledWith(included)
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
      state.activateRemoteSignerFromTransaction.mockRejectedValue(new Error('Cosigner key unavailable'))
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'h1' } as any)

      await expect(useSyncHtlc().checkHtlcState()).resolves.toBeUndefined()

      expect(useSyncState().pendingHtlcCreationTransactions).toHaveLength(1)
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
      const polygonRow = { address: '0xrelayhash', htlc_id: '0xhtlcid', swap_id: 'swap-1' }
      state.query.mockResolvedValue([polygonRow])
      state.refundPolygonSwapHtlc.mockResolvedValue({ refunded: false, preimage: '0xdeadbeef' })
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.refundPolygonSwapHtlc).toHaveBeenCalledWith(polygonRow)
      expect(state.updateSinglePolygonTransaction).toHaveBeenCalledWith('0xrelayhash')
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

    it('refunds funded native HTLC and marks setSwapHtlcRefunded', async () => {
      state.query.mockResolvedValue([{ address: 'NQ55 SWAP HTLC ADDRESS' }])
      state.client.getAccount = vi.fn(() => Promise.resolve({ balance: 100_000, type: 'htlc' })) as any
      state.client.sendTransaction = vi.fn(() => Promise.resolve({ state: 'pending' })) as any
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().checkExpiredSwapHtlcs()
      expect(state.setSwapHtlcRefunded).toHaveBeenCalledWith('NQ55 SWAP HTLC ADDRESS')
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

    it('skips when htlcCheckLock is held', async () => {
      state.height = 100
      state.htlcCheckLock = true
      state.remoteBalance = 100
      const { useSyncHtlc } = await import('./htlc')
      await useSyncHtlc().maybeCheckHtlcState()
      // Lock was already held; no balance side-effects expected
      expect(state.client.waitForConsensusEstablished).not.toHaveBeenCalled()
    })

    it('runs checkHtlcState and clears the lock', async () => {
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

    it('clears the lock when reconciliation throws', async () => {
      state.height = 130
      state.query.mockRejectedValue(new Error('database unavailable'))
      const { useSyncHtlc } = await import('./htlc')

      await expect(useSyncHtlc().maybeCheckHtlcState()).rejects.toThrow('database unavailable')

      expect(state.htlcCheckLock).toBe(false)
    })
  })
})
