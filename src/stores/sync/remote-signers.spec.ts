/* eslint-disable perfectionist/sort-imports, import/no-duplicates */
import './__tests__/setup'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Transfer } from '@/types/transactions'
import { createAddress, remoteSignerFixture, resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncRemoteSigners', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  describe('drainRemoteSigner', () => {
    it('updates the db balance to 0 and returns false when remote signer has zero balance', async () => {
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 EMPTY SIGNER'),
        end: 100_000,
      } as any)
      expect(result).toBe(false)
      expect(state.run).toHaveBeenCalledWith(expect.any(String), [0, 'NQ22 EMPTY SIGNER'])
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('logs and returns false on getBalance error', async () => {
      state.getBalance.mockResolvedValue({ data: undefined, error: new Error('boom') })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 ERR SIGNER'),
        end: 100_000,
      } as any)
      expect(result).toBe(false)
      expect(state.logger.error).toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('sends Transfer.RemoteToLocalAfterTimeout when end < headTimestamp', async () => {
      state.headTimestamp = 400_000
      state.getBalance.mockResolvedValue({ data: 500_000, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 EXPIRED SIGNER'),
        end: 100_000,
      } as any)
      expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({
        transfer: Transfer.RemoteToLocalAfterTimeout,
        amount: 500_000,
      }))
    })

    it('sends Transfer.RemoteToLocalImmediateReclaim when end >= headTimestamp', async () => {
      state.headTimestamp = 100_000
      state.getBalance.mockResolvedValue({ data: 500_000, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 ACTIVE SIGNER'),
        end: 200_000,
      } as any)
      expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({
        transfer: Transfer.RemoteToLocalImmediateReclaim,
        amount: 500_000,
      }))
    })

    it('pushes the returned tx into pendingRemoteDrainTxs and returns true', async () => {
      state.headTimestamp = 100_000
      state.getBalance.mockResolvedValue({ data: 500_000, error: undefined })
      state.sendTx.mockResolvedValue({ data: { tx: { hash: 'drain-hash' } }, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 SIGNER'),
        end: 200_000,
      } as any)
      expect(result).toBe(true)
      expect(useSyncState().pendingRemoteDrainTxs).toEqual([{ hash: 'drain-hash' }])
    })

    it('logs and returns false when sendTx errors', async () => {
      state.headTimestamp = 100_000
      state.getBalance.mockResolvedValue({ data: 500_000, error: undefined })
      state.sendTx.mockResolvedValue({ data: undefined, error: new Error('send boom') })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 SIGNER'),
        end: 200_000,
      } as any)
      expect(result).toBe(false)
      expect(state.logger.error).toHaveBeenCalled()
    })

    it('logs and returns false when sendTx returns no data', async () => {
      state.headTimestamp = 100_000
      state.getBalance.mockResolvedValue({ data: 500_000, error: undefined })
      state.sendTx.mockResolvedValue({ data: undefined, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 SIGNER'),
        end: 200_000,
      } as any)
      expect(result).toBe(false)
      expect(state.logger.error).toHaveBeenCalledWith(
        'Error while draining remote signer. No transaction returned',
        expect.any(Object),
      )
    })
  })

  describe('verifyRemoteSignersDb', () => {
    it('skips when a verification is already in flight', async () => {
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      useSyncState().isVerifyingRemoteSignersDb = true
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
    })

    it('skips when a transaction is pending', async () => {
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      useSyncState().pendingTransactions.push({ transactionHash: 'h' } as any)
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
    })

    it('skips when a transaction is currently being sent', async () => {
      state.isSendingTx = true
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
    })

    it('calls discoverRemoteSignersFromBlockchain BEFORE updateSignersTableBalance', async () => {
      const events: string[] = []
      state.discoverRemoteSignersFromBlockchain.mockImplementation(async () => {
        events.push('discover')
      })
      state.updateSignersTableBalance.mockImplementation(async () => {
        events.push('balance')
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(events).toEqual(['discover', 'balance'])
    })

    it('activates a single funded inactive signer', async () => {
      const fundedSigner = remoteSignerFixture('NQ22 TEST FUNDED REMOTE ADDRESS', 700_000, false)
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('WHERE balance > 0'))
          return Promise.resolve([fundedSigner])
        return Promise.resolve([])
      })
      state.getBalance.mockResolvedValue({ data: 700_000, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.updateRemoteSigner).toHaveBeenCalledWith(expect.objectContaining({
        active: true,
        balance: 700_000,
      }))
    })

    it('drains the older funded signer when multiple are funded but only one is active', async () => {
      const firstSigner = remoteSignerFixture('NQ22 TEST FUNDED REMOTE ADDRESS', 700_000, true)
      const secondSigner = remoteSignerFixture('NQ33 TEST OLD FUNDED REMOTE ADDRESS', 900_000, false)
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('WHERE balance > 0'))
          return Promise.resolve([firstSigner, secondSigner])
        return Promise.resolve([])
      })
      state.getBalance.mockImplementation((address: any) => {
        return Promise.resolve({
          data: address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS' ? 700_000 : 900_000,
          error: undefined,
        })
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
      expect(state.sendTx).toHaveBeenCalledTimes(1)
      expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({
        transfer: Transfer.RemoteToLocalImmediateReclaim,
        amount: 900_000,
      }))
    })

    it('stops after recovery transactions are queued by ensureSingleRemoteActive', async () => {
      const firstSigner = remoteSignerFixture('NQ22 TEST FUNDED REMOTE ADDRESS', 700_000, true)
      const secondSigner = remoteSignerFixture('NQ33 TEST OLD FUNDED REMOTE ADDRESS', 900_000, true)
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('WHERE active = 1'))
          return Promise.resolve([firstSigner, secondSigner])
        if (sql.includes('WHERE balance > 0'))
          return Promise.resolve([firstSigner, secondSigner])
        return Promise.resolve([])
      })
      state.getBalance.mockImplementation((address: any) => {
        return Promise.resolve({
          data: address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS' ? 700_000 : 900_000,
          error: undefined,
        })
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.sendTx).toHaveBeenCalledTimes(1)
    })

    it('writes new balance and bails when ensureSingleRemoteSignerWithBalance sees a chain mismatch', async () => {
      const inactiveSigner = remoteSignerFixture('NQ22 TEST FUNDED REMOTE ADDRESS', 500, false)
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('WHERE balance > 0'))
          return Promise.resolve([inactiveSigner])
        return Promise.resolve([])
      })
      state.getBalance.mockResolvedValue({ data: 700, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.run).toHaveBeenCalledWith(expect.any(String), [700, 'NQ22 TEST FUNDED REMOTE ADDRESS'])
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
    })

    it('logs and bails when balance lookup fails inside ensureSingleRemoteSignerWithBalance', async () => {
      const inactiveSigner = remoteSignerFixture('NQ22 TEST FUNDED REMOTE ADDRESS', 500, false)
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('WHERE balance > 0'))
          return Promise.resolve([inactiveSigner])
        return Promise.resolve([])
      })
      state.getBalance.mockResolvedValue({ data: undefined, error: new Error('rpc') })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(state.logger.error).toHaveBeenCalledWith(
        'Error while getting balance in ensureSingleRemoteSignerWithBalance',
        expect.any(Error),
      )
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
    })
  })
})
