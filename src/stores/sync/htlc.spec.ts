/* eslint-disable perfectionist/sort-imports, import/no-duplicates */
import './__tests__/setup'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Transfer } from '@/types/transactions'
import { resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

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
      const { useSyncState } = await import('./state')
      // Touch nodesAreSynced to start the async computed
      const syncState = useSyncState()
      void syncState.nodesAreSynced
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
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
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      void syncState.nodesAreSynced
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

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
  })
})
