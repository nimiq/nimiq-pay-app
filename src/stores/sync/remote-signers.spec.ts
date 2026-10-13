/* eslint-disable perfectionist/sort-imports, import/no-duplicates */
import './__tests__/setup'
import { createPinia, setActivePinia } from 'pinia'
import type { ValidatedRemoteSigner } from '@/stores/remote-signer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HTLC_HISTORY_CHECKED_KV_KEY } from '@/lib/sql-queries'
import { Transfer } from '@/types/transactions'
import { createAddress, remoteSignerFixture, resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncRemoteSigners', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((resolvePromise) => {
      resolve = resolvePromise
    })
    return { promise, resolve }
  }

  function targetedCandidate(address: string, balance = 700_000): ValidatedRemoteSigner {
    return {
      status: 'importable' as const,
      address,
      balance,
      timeout: 300_000,
      expired: false,
      owner: state.localAddress.toUserFriendlyAddress(),
      cosignerRecipient: 'NQ99 TEST COSIGNER',
      creationTransactionHash: `creation-${address}`,
      creationState: 'confirmed' as const,
      signer: {
        active: false,
        address: createAddress(address) as any,
        balance,
        end: 300_000,
        proofSize: 104,
        publicKey: 'target-public-key',
        start: 100_000,
      },
    }
  }

  it('reports verification as slow only once discovery stays incomplete past the threshold, once per session', async () => {
    const { trackSyncSlow } = await import('@/lib/analytics')
    const { useSyncRemoteSigners } = await import('./remote-signers')
    const store = useSyncRemoteSigners()
    const discoveryResult = { added: 0, alreadyKnown: 0, localComplete: false, errors: ['Local history incomplete'], createdHtlcs: [], historyComplete: false }
    let now = 1_000_000
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now)

    try {
      // A fast incomplete run is normal right after startup.
      await store.verifyRemoteSignersDb({ discoveryResult })
      expect(trackSyncSlow).not.toHaveBeenCalled()

      now += 2 * 60 * 1e3 + 1
      await store.verifyRemoteSignersDb({ discoveryResult })
      expect(trackSyncSlow).toHaveBeenCalledOnce()
      expect(trackSyncSlow).toHaveBeenCalledWith(expect.objectContaining({ duration_ms: 2 * 60 * 1e3 + 1, finished: true, discovery_complete: false, error_count: 1 }))

      now += 10 * 60 * 1e3
      await store.verifyRemoteSignersDb({ discoveryResult })
      expect(trackSyncSlow).toHaveBeenCalledOnce()
    }
    finally {
      dateNow.mockRestore()
    }
  })

  describe('recoverRemoteSigner', () => {
    it('recovers the exact inactive target after incomplete global discovery without global reconciliation', async () => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      const unrelatedSigner = {
        ...remoteSignerFixture('NQ33 ACTIVE SIGNER', 900_000, true),
        address: createAddress('NQ33 ACTIVE SIGNER'),
      }
      state.remoteSigner = unrelatedSigner
      state.remoteAddress = unrelatedSigner.address
      state.getBalance.mockResolvedValue({ data: target.balance, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const store = useSyncRemoteSigners()
      const verifyRemoteSignersDb = vi.spyOn(store, 'verifyRemoteSignersDb')

      await store.verifyRemoteSignersDb({
        discoveryResult: { added: 1, alreadyKnown: 0, localComplete: false, errors: ['Local history incomplete'], createdHtlcs: [], historyComplete: false },
      })
      verifyRemoteSignersDb.mockClear()

      const result = await store.recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'submitted', transactionHash: 'drain-hash' })
      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledWith(target)
      expect(state.getAllTransactionsForAddress).toHaveBeenCalledWith(target.signer.address)
      expect(state.sendTx).toHaveBeenCalledTimes(1)
      expect(state.sendTx).toHaveBeenCalledWith(
        expect.objectContaining({ sender: target.signer.address, proofSize: 104 }),
        expect.objectContaining({ owner: target.owner }),
      )
      expect(state.remoteSigner).toBe(unrelatedSigner)
      expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
      expect(verifyRemoteSignersDb).not.toHaveBeenCalled()
      expect(state.updateSignersTableBalance).not.toHaveBeenCalled()
      expect(state.query).not.toHaveBeenCalled()
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
    })

    it('rejects when the wallet or network is unavailable', async () => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.localAddress = undefined as any
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'rejected', reason: 'Wallet or network unavailable' })
      expect(state.registerValidatedRemoteSigner).not.toHaveBeenCalled()
    })

    it('returns target registration errors without starting recovery', async () => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.registerValidatedRemoteSigner.mockRejectedValueOnce(new Error('HTLC no longer valid'))
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'rejected', reason: 'HTLC no longer valid' })
      expect(state.getAllTransactionsForAddress).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it.each(['pending transaction', 'active send'] as const)(
      'defers for wallet busy after registering the target because of %s',
      async (busyState) => {
        const target = targetedCandidate('NQ22 TARGET SIGNER')
        const { useSyncRemoteSigners } = await import('./remote-signers')
        const { useSyncState } = await import('./state')
        if (busyState === 'pending transaction')
          useSyncState().pendingTransactions.push({ transactionHash: 'pending' } as any)
        else
          state.isSendingTx = true

        const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

        expect(result).toEqual({ status: 'deferred', reason: 'wallet-busy' })
        expect(state.registerValidatedRemoteSigner).toHaveBeenCalledWith(target)
        expect(state.getAllTransactionsForAddress).not.toHaveBeenCalled()
        expect(state.sendTx).not.toHaveBeenCalled()
      },
    )

    it('defers when the exact target history is incomplete', async () => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: false })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'deferred', reason: 'history-incomplete' })
      expect(state.getBalance).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it.each(['new', 'pending', 'included'] as const)(
      'defers when exact target history contains a %s outgoing transaction',
      async (transactionState) => {
        const target = targetedCandidate('NQ22 TARGET SIGNER')
        state.getAllTransactionsForAddress.mockResolvedValue({
          complete: true,
          transactions: [{ sender: target.address, state: transactionState, executionResult: undefined }],
        })
        const { useSyncRemoteSigners } = await import('./remote-signers')

        const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

        expect(result).toEqual({ status: 'deferred', reason: 'outgoing-transaction' })
        expect(state.sendTx).not.toHaveBeenCalled()
      },
    )

    it.each([0, 123])('uses current residual balance %s after a confirmed outgoing transfer', async (balance) => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.getAllTransactionsForAddress.mockResolvedValue({
        complete: true,
        transactions: [{ sender: target.address, state: 'confirmed', executionResult: true }],
      })
      state.getBalance.mockResolvedValue({ data: balance, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().recoverRemoteSigner(target)

      if (balance > 0) {
        expect(state.sendTx).toHaveBeenCalledWith(expect.objectContaining({ amount: balance, sender: target.signer.address }), expect.any(Object))
      }
      else {
        expect(state.sendTx).not.toHaveBeenCalled()
      }
    })

    it('ignores failed, invalidated, and unrelated outgoing history', async () => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.getAllTransactionsForAddress.mockResolvedValue({
        complete: true,
        transactions: [
          { sender: target.address, state: 'confirmed', executionResult: false },
          { sender: target.address, state: 'invalidated', executionResult: true },
          { sender: 'NQ33 UNRELATED SIGNER', state: 'pending', executionResult: true },
        ],
      })
      state.getBalance.mockResolvedValue({ data: target.balance, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'submitted', transactionHash: 'drain-hash' })
      expect(state.sendTx).toHaveBeenCalledOnce()
    })

    it('returns unknown with the staged hash and never retries', async () => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.getBalance.mockResolvedValue({ data: target.balance, error: undefined })
      state.sendTx.mockResolvedValue({
        outcome: 'unknown',
        stagedTx: { hash: 'staged-hash' },
        stagedHash: 'staged-hash',
        error: 'Broadcast outcome unknown',
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'unknown', transactionHash: 'staged-hash' })
      expect(state.sendTx).toHaveBeenCalledTimes(1)
    })

    it('recovers different targets concurrently without selecting or mutating an active signer', async () => {
      const first = targetedCandidate('NQ22 FIRST TARGET', 700_000)
      const second = targetedCandidate('NQ33 SECOND TARGET', 900_000)
      state.getBalance.mockImplementation(async (address: any) => ({
        data: address.toUserFriendlyAddress() === first.address ? first.balance : second.balance,
        error: undefined,
      }))
      state.sendTx.mockImplementation(async ({ sender }: any) => ({
        outcome: 'submitted',
        tx: { hash: `drain-${sender.toUserFriendlyAddress()}` },
        serialized: 'serialized-drain',
      }))
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const store = useSyncRemoteSigners()

      const results = await Promise.all([
        store.recoverRemoteSigner(first),
        store.recoverRemoteSigner(second),
      ])

      expect(results).toEqual([
        { status: 'submitted', transactionHash: `drain-${first.address}` },
        { status: 'submitted', transactionHash: `drain-${second.address}` },
      ])
      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledTimes(2)
      expect(state.getAllTransactionsForAddress).toHaveBeenCalledWith(first.signer.address)
      expect(state.getAllTransactionsForAddress).toHaveBeenCalledWith(second.signer.address)
      expect(state.sendTx).toHaveBeenCalledTimes(2)
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
      expect(state.query).not.toHaveBeenCalled()
    })

    it.each([
      ['wallet', 'submitted', () => { state.localAddress = createAddress('NQ44 REPLACEMENT OWNER') as any }],
      ['wallet', 'unknown', () => { state.localAddress = createAddress('NQ44 REPLACEMENT OWNER') as any }],
      ['network', 'submitted', () => { state.networkName = 'mainalbatross' }],
      ['network', 'unknown', () => { state.networkName = 'mainalbatross' }],
      ['client', 'submitted', () => { state.client = { ...state.client } as any }],
      ['client', 'unknown', () => { state.client = { ...state.client } as any }],
      ['generation', 'submitted', () => { state.walletContextGeneration += 1 }],
      ['generation', 'unknown', () => { state.walletContextGeneration += 1 }],
    ] as const)(
      'preserves transaction certainty when %s context becomes stale after a %s drain',
      async (_dimension, outcome, replaceContext) => {
        const target = targetedCandidate('NQ22 TARGET SIGNER')
        const send = deferred<any>()
        state.getBalance.mockResolvedValue({ data: target.balance, error: undefined })
        state.sendTx.mockReturnValueOnce(send.promise)
        const { useSyncRemoteSigners } = await import('./remote-signers')

        const recovery = useSyncRemoteSigners().recoverRemoteSigner(target)
        await vi.waitFor(() => expect(state.sendTx).toHaveBeenCalledOnce())
        replaceContext()
        send.resolve(outcome === 'submitted'
          ? { outcome, tx: { hash: 'obsolete-drain-hash' }, serialized: 'serialized-drain' }
          : { outcome, stagedTx: { hash: 'obsolete-staged-hash' }, stagedHash: 'obsolete-staged-hash', error: 'Broadcast outcome unknown' })

        await expect(recovery).resolves.toEqual(outcome === 'submitted'
          ? { status: 'submitted', transactionHash: 'obsolete-drain-hash' }
          : { status: 'unknown', transactionHash: 'obsolete-staged-hash' })
        expect(state.sendTx).toHaveBeenCalledTimes(1)
      },
    )

    it.each([
      ['wallet', () => state.localAddress = createAddress('NQ44 REPLACEMENT OWNER') as any],
      ['network', () => state.networkName = 'mainalbatross'],
      ['client', () => state.client = { ...state.client } as any],
      ['generation', () => state.walletContextGeneration += 1],
    ])('rejects when %s changes during target registration', async (_dimension, replaceContext) => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.registerValidatedRemoteSigner.mockImplementationOnce(async () => {
        replaceContext()
        return target
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'rejected', reason: 'Wallet or network changed during recovery' })
      expect(state.getAllTransactionsForAddress).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it.each([
      ['wallet', () => state.localAddress = createAddress('NQ44 REPLACEMENT OWNER') as any],
      ['network', () => state.networkName = 'mainalbatross'],
      ['client', () => state.client = { ...state.client } as any],
      ['generation', () => state.walletContextGeneration += 1],
    ])('rejects when %s changes during exact target history lookup', async (_dimension, replaceContext) => {
      const target = targetedCandidate('NQ22 TARGET SIGNER')
      state.getAllTransactionsForAddress.mockImplementationOnce(async () => {
        replaceContext()
        return { transactions: [], complete: true }
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner(target)

      expect(result).toEqual({ status: 'rejected', reason: 'Wallet or network changed during recovery' })
      expect(state.getBalance).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })
  })

  describe('drainRemoteSigner', () => {
    it('updates zero balance only for the current wallet and returns undefined', async () => {
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const address = createAddress('NQ22 EMPTY SIGNER')
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address,
        end: 100_000,
      } as any)

      expect(result).toBeUndefined()
      expect(state.updateRemoteSignerBalance).toHaveBeenCalledWith(0, address, expect.objectContaining({
        client: state.client,
        owner: state.localAddress.toUserFriendlyAddress(),
        network: state.networkName,
        generation: state.walletContextGeneration,
      }))
      expect(state.run).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('returns rejected on getBalance error', async () => {
      state.getBalance.mockResolvedValue({ data: undefined, error: new Error('boom') })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 ERR SIGNER'),
        end: 100_000,
      } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'boom' })
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('returns rejected without a wallet context', async () => {
      state.localAddress = undefined as any
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 SIGNER'),
        end: 100_000,
      } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'Nimiq network unavailable' })
      expect(state.getBalance).not.toHaveBeenCalled()
    })

    it('does not drain into a replacement wallet after balance lookup', async () => {
      state.getBalance.mockImplementation(async () => {
        state.walletContextGeneration += 1
        return { data: 500_000, error: undefined }
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 STALE SIGNER'),
        end: 100_000,
      } as any)

      expect(result).toEqual({ outcome: 'rejected', error: 'Wallet or network changed before sending' })
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it.each([
      [100_000, 400_000, Transfer.RemoteToLocalAfterTimeout, undefined],
      [200_000, 100_000, Transfer.RemoteToLocalImmediateReclaim, 104],
    ])('returns send result unchanged with address-specific proof size for end %s at head %s', async (end, headTimestamp, transfer, proofSize) => {
      state.headTimestamp = headTimestamp
      state.getBalance.mockResolvedValue({ data: 500_000, error: undefined })
      const submitted = { outcome: 'submitted', tx: { hash: 'drain-hash' }, serialized: 'serialized-drain' }
      state.sendTx.mockResolvedValue(submitted)
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')

      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 SIGNER'),
        end,
        proofSize: 104,
      } as any)

      expect(state.sendTx).toHaveBeenCalledWith(
        expect.objectContaining({ transfer, amount: 500_000, ...(proofSize ? { proofSize } : {}) }),
        expect.objectContaining({
          client: state.client,
          generation: state.walletContextGeneration,
          network: state.networkName,
          owner: state.localAddress.toUserFriendlyAddress(),
        }),
      )
      expect(result).toBe(submitted)
      expect(useSyncState().pendingRemoteDrainTxs).toEqual([])
    })

    it('drains an explicit inactive target when no active signer is selected', async () => {
      state.remoteAddress = undefined as any
      state.getBalance.mockResolvedValue({ data: 500_000, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().drainRemoteSigner({
        address: createAddress('NQ22 INACTIVE SIGNER'),
        end: 200_000,
        proofSize: 104,
      } as any)

      expect(result?.outcome).toBe('submitted')
      expect(state.sendTx).toHaveBeenCalledWith(
        {
          transfer: Transfer.RemoteToLocalImmediateReclaim,
          amount: 500_000,
          sender: expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) }),
          proofSize: 104,
        },
        expect.objectContaining({ owner: state.localAddress.toUserFriendlyAddress() }),
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
        return { added: 0, alreadyKnown: 0, localComplete: true, errors: [], createdHtlcs: [], historyComplete: true }
      })
      state.updateSignersTableBalance.mockImplementation(async () => {
        events.push('balance')
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      await useSyncRemoteSigners().verifyRemoteSignersDb()
      expect(events).toEqual(['discover', 'balance'])
    })

    it('can reconcile an already completed discovery without scanning again', async () => {
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({
        discoveryResult: { added: 1, alreadyKnown: 0, localComplete: true, errors: [], createdHtlcs: [], historyComplete: true },
      })

      expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
      expect(state.updateSignersTableBalance).toHaveBeenCalledOnce()
    })

    it.each([
      ['one inactive signer', [false]],
      ['an active and an inactive signer', [true, false]],
      ['multiple active signers', [true, true]],
    ] as const)('does not reconcile %s after incomplete discovery', async (_, activeFlags) => {
      const signers = activeFlags.map((active, index) => remoteSignerFixture(`NQ${index} RECOVERED SIGNER`, 700_000, active))
      state.discoverRemoteSignersFromBlockchain.mockResolvedValueOnce({
        added: signers.length,
        alreadyKnown: 0,
        localComplete: false,
        errors: ['Local history lookup timed out'],
        createdHtlcs: [],
        historyComplete: false,
      })
      state.query.mockImplementation(async (sql = '') => {
        if (sql.includes('WHERE active = 1'))
          return signers.filter(signer => signer.active)
        if (sql.includes('WHERE balance > 0'))
          return signers
        return []
      })
      state.getBalance.mockResolvedValue({ data: 700_000, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      const store = useSyncRemoteSigners()

      await store.verifyRemoteSignersDb()

      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
      expect(state.updateSignersTableBalance).not.toHaveBeenCalled()
      expect(useSyncState().isVerifyingRemoteSignersDb).toBe(false)

      await store.verifyRemoteSignersDb()

      expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalledTimes(2)
      if (signers.length === 1) {
        expect(state.updateRemoteSigner).toHaveBeenCalledWith(
          expect.objectContaining({ active: true }),
          expect.objectContaining({
            client: state.client,
            generation: state.walletContextGeneration,
            network: state.networkName,
            owner: state.localAddress.toUserFriendlyAddress(),
          }),
        )
      }
      else {
        expect(state.sendTx).toHaveBeenCalledOnce()
      }
    })

    it('defers reconciliation for an incomplete discovery supplied by the manual scan', async () => {
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')

      await useSyncRemoteSigners().verifyRemoteSignersDb({
        discoveryResult: { added: 1, alreadyKnown: 0, localComplete: false, errors: ['HTLC history lookup failed'], createdHtlcs: [], historyComplete: false },
      })

      expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
      expect(state.updateSignersTableBalance).not.toHaveBeenCalled()
      expect(state.query).not.toHaveBeenCalled()
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
      expect(useSyncState().isVerifyingRemoteSignersDb).toBe(false)
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
      expect(state.updateRemoteSigner).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true,
          balance: 700_000,
        }),
        expect.objectContaining({
          client: state.client,
          generation: state.walletContextGeneration,
          network: state.networkName,
          owner: state.localAddress.toUserFriendlyAddress(),
        }),
      )
    })

    it.each([
      ['owner', () => state.localAddress = createAddress('NQ44 REPLACEMENT OWNER') as any],
      ['network', () => state.networkName = 'mainalbatross'],
      ['client', () => state.client = { ...state.client } as any],
      ['generation', () => state.walletContextGeneration += 1],
    ])('does not drain a signer selected before %s changes during balance lookup', async (_dimension, replaceContext) => {
      const firstBalance = deferred<{ data: number, error: undefined }>()
      const firstSigner = remoteSignerFixture('NQ22 TEST FUNDED REMOTE ADDRESS', 700_000, true)
      const secondSigner = remoteSignerFixture('NQ33 TEST OLD FUNDED REMOTE ADDRESS', 900_000, true)
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('WHERE active = 1'))
          return Promise.resolve([firstSigner, secondSigner])
        return Promise.resolve([])
      })
      state.getBalance.mockImplementationOnce(() => firstBalance.promise)
        .mockResolvedValue({ data: 900_000, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const verification = useSyncRemoteSigners().verifyRemoteSignersDb()
      await vi.waitFor(() => expect(state.getBalance).toHaveBeenCalledOnce())
      replaceContext()
      firstBalance.resolve({ data: 700_000, error: undefined })
      await verification

      expect(state.sendTx).not.toHaveBeenCalled()
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
      expect(state.sendTx).toHaveBeenCalledWith(
        expect.objectContaining({
          transfer: Transfer.RemoteToLocalImmediateReclaim,
          amount: 900_000,
          proofSize: 98,
        }),
        expect.objectContaining({
          client: state.client,
          generation: state.walletContextGeneration,
          network: state.networkName,
          owner: state.localAddress.toUserFriendlyAddress(),
        }),
      )
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
      expect(state.updateRemoteSignerBalance).toHaveBeenCalledWith(700, expect.objectContaining({
        toUserFriendlyAddress: expect.any(Function),
      }), expect.objectContaining({
        client: state.client,
        owner: state.localAddress.toUserFriendlyAddress(),
        network: state.networkName,
        generation: state.walletContextGeneration,
      }))
      expect(state.run).not.toHaveBeenCalled()
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

  describe('stray funded HTLC sweep', () => {
    const activeAddress = 'NQ11 TEST REMOTE ADDRESS'
    const strayAddress = 'NQ98 TEST STRAY HTLC'

    function htlcAccount(balance: number, overrides: Record<string, unknown> = {}) {
      return {
        type: 'htlc',
        balance,
        sender: state.localAddress.toUserFriendlyAddress(),
        recipient: 'NQ99 TEST COSIGNER',
        timeout: 300_000,
        ...overrides,
      }
    }

    function mockAccounts(accounts: Record<string, unknown>) {
      state.client.getAccounts = vi.fn((addresses: { toUserFriendlyAddress: () => string }[]) => Promise.resolve(
        addresses.map(address => accounts[address.toUserFriendlyAddress()] ?? { type: 'basic', balance: 0 }),
      ))
    }

    function discovery(createdHtlcs: string[], localComplete = false, historyComplete = true) {
      return { added: 0, alreadyKnown: 0, localComplete, errors: localComplete ? [] : ['HTLC metadata unavailable'], createdHtlcs, historyComplete }
    }

    async function htlcHistoryChecked() {
      const { useSyncState } = await import('./state')
      return useSyncState().htlcHistoryChecked
    }

    function persistedHtlcHistoryCheck() {
      return state.kvSetItem.mock.calls.some(([key, value]) => key === HTLC_HISTORY_CHECKED_KV_KEY && value === '1')
    }

    function mockRecoverableStray(balance: number, end = 300_000) {
      const candidate = targetedCandidate(strayAddress, balance)
      candidate.signer.end = end
      state.registerValidatedRemoteSigner.mockResolvedValue(candidate)
      state.getBalance.mockResolvedValue({ data: balance, error: undefined })
    }

    it('drains a funded HTLC beside the funded active one after incomplete discovery', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(860_000) })
      mockRecoverableStray(860_000)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledExactlyOnceWith({ address: strayAddress })
      expect(state.sendTx).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ transfer: Transfer.RemoteToLocalImmediateReclaim, amount: 860_000 }),
        expect.anything(),
      )
      expect(state.sendTx.mock.calls[0][0].sender.toUserFriendlyAddress()).toBe(strayAddress)
      expect(state.updateRemoteSigner).not.toHaveBeenCalled()
    })

    it('skips the remaining reconciliation after starting a drain', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(860_000) })
      mockRecoverableStray(860_000)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress], true) })

      expect(state.sendTx).toHaveBeenCalledOnce()
      expect(state.updateSignersTableBalance).not.toHaveBeenCalled()
    })

    it('recovers a lone funded HTLC beside an empty active signer', async () => {
      mockAccounts({ [strayAddress]: htlcAccount(769_000) })
      mockRecoverableStray(769_000)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledExactlyOnceWith({ address: strayAddress })
      expect(state.sendTx).toHaveBeenCalledOnce()
    })

    it('leaves an included HTLC creation that is not activated yet', async () => {
      mockAccounts({ [strayAddress]: htlcAccount(860_000) })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'creation-hash', recipient: strayAddress, state: 'included' } as any)

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.registerValidatedRemoteSigner).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
      // Two funded HTLCs exist until the creation is activated, so the history is not clean yet.
      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    it('does not record a clean history while our own funded creation sits beside the active HTLC', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(860_000) })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      useSyncState().pendingHtlcCreationTransactions.push({ transactionHash: 'creation-hash', recipient: strayAddress, state: 'included' } as any)

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.sendTx).not.toHaveBeenCalled()
      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    it('reclaims an expired stray HTLC with the timeout path without asking the cosigner', async () => {
      // Past timeout only our key can move it, so cosigner metadata is irrelevant and may be unavailable.
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(56_000, { timeout: 150_000 }) })
      state.getBalance.mockResolvedValue({ data: 56_000, error: undefined })
      state.registerValidatedRemoteSigner.mockRejectedValue(new Error('Cosigner metadata unavailable'))
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.registerValidatedRemoteSigner).not.toHaveBeenCalled()
      expect(state.sendTx).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: 56_000 }),
        expect.anything(),
      )
      expect(state.sendTx.mock.calls[0][0].sender.toUserFriendlyAddress()).toBe(strayAddress)
    })

    it('defers an expired-looking stray without consensus, since the head time is then the device clock', async () => {
      state.getBalance.mockResolvedValue({ data: 56_000, error: undefined })
      state.consensus = 'connecting'
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const result = await useSyncRemoteSigners().recoverRemoteSigner({ address: strayAddress }, 150_000)

      expect(result).toEqual({ status: 'deferred', reason: 'no-consensus' })
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('skips an expired stray HTLC that is empty by the time it would be reclaimed', async () => {
      mockAccounts({ [strayAddress]: htlcAccount(56_000, { timeout: 150_000 }) })
      state.getBalance.mockResolvedValue({ data: 0, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([strayAddress]) })

      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('defers an expired stray HTLC while its history is incomplete', async () => {
      mockAccounts({ [strayAddress]: htlcAccount(56_000, { timeout: 150_000 }) })
      state.getBalance.mockResolvedValue({ data: 56_000, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({ transactions: [], complete: false })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([strayAddress]) })

      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('defers an expired stray HTLC that already has an outgoing transaction', async () => {
      mockAccounts({ [strayAddress]: htlcAccount(56_000, { timeout: 150_000 }) })
      state.getBalance.mockResolvedValue({ data: 56_000, error: undefined })
      state.getAllTransactionsForAddress.mockResolvedValue({
        transactions: [{ sender: strayAddress, state: 'pending', executionResult: undefined }],
        complete: true,
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([strayAddress]) })

      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('recovers a lone funded HTLC when no signer is active', async () => {
      state.remoteAddress = undefined
      mockAccounts({ [strayAddress]: htlcAccount(769_000) })
      mockRecoverableStray(769_000)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([strayAddress]) })

      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledExactlyOnceWith({ address: strayAddress })
      expect(state.sendTx).toHaveBeenCalledOnce()
    })

    it('drains the oldest funded HTLC first when no signer is active', async () => {
      state.remoteAddress = undefined
      mockAccounts({ [activeAddress]: htlcAccount(261_000, { timeout: 500_000 }), [strayAddress]: htlcAccount(860_000) })
      mockRecoverableStray(860_000)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledExactlyOnceWith({ address: strayAddress })
      expect(state.sendTx).toHaveBeenCalledOnce()
    })

    it('checks stored signers missing from local history', async () => {
      state.getAllRemoteSigners.mockResolvedValue([{ ...remoteSignerFixture(strayAddress, 0), address: createAddress(strayAddress) }])
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(56_000) })
      mockRecoverableStray(56_000)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress]) })

      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledExactlyOnceWith({ address: strayAddress })
    })

    it.each([
      ['a foreign sender', { sender: 'NQ66 TEST SOMEONE ELSE' }],
      ['a non-cosigner recipient', { recipient: 'NQ55 TEST SWAP PARTNER' }],
    ])('ignores a funded HTLC with %s', async (_, overrides) => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(860_000, overrides) })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.registerValidatedRemoteSigner).not.toHaveBeenCalled()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('records the HTLC history check when full history shows no stray funded HTLC', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000) })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress]) })

      expect(persistedHtlcHistoryCheck()).toBe(true)
      expect(await htlcHistoryChecked()).toBe(true)
    })

    it('records the HTLC history check for a wallet without HTLC history', async () => {
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([]) })

      expect(persistedHtlcHistoryCheck()).toBe(true)
      expect(state.client.getAccounts).not.toHaveBeenCalled()
    })

    it('keeps verifying when the sweep hits a database error', async () => {
      state.getAllRemoteSigners.mockRejectedValue(new Error('database closed'))
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await expect(useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress], true) })).resolves.toBeUndefined()

      expect(persistedHtlcHistoryCheck()).toBe(false)
      expect(state.updateSignersTableBalance).toHaveBeenCalled()
    })

    it('keeps verifying when recording the clean check fails', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000) })
      state.kvSetItem.mockRejectedValue(new Error('database is locked'))
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await expect(useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress], true) })).resolves.toBeUndefined()

      expect(await htlcHistoryChecked()).not.toBe(true)
      expect(state.updateSignersTableBalance).toHaveBeenCalled()
    })

    it('does not rewrite an HTLC history check that is already recorded', async () => {
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      useSyncState().htlcHistoryChecked = true
      useSyncState().htlcExtensionsWalked = true

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([]) })

      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    it('does not record the HTLC history check when local history is incomplete', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000) })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress], false, false) })

      expect(persistedHtlcHistoryCheck()).toBe(false)
      expect(await htlcHistoryChecked()).not.toBe(true)
    })

    it('does not record the HTLC history check when an account lookup fails', async () => {
      state.client.getAccounts = vi.fn(() => Promise.reject(new Error('light client error')))
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress]) })

      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    it('does not record the HTLC history check while a stray funded HTLC remains', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(860_000) })
      state.registerValidatedRemoteSigner.mockRejectedValue(new Error('Cosigner metadata unavailable'))
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })

      expect(state.sendTx).not.toHaveBeenCalled()
      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    it('stops draining when another signer is activated mid-sweep', async () => {
      const laterStray = 'NQ97 TEST LATER STRAY'
      mockAccounts({
        [activeAddress]: htlcAccount(261_000, { timeout: 500_000 }),
        [strayAddress]: htlcAccount(860_000),
        [laterStray]: htlcAccount(120_000, { timeout: 400_000 }),
      })
      state.registerValidatedRemoteSigner.mockImplementationOnce(async () => {
        state.remoteAddress = createAddress(laterStray)
        throw new Error('HTLC account does not match cosigner metadata')
      })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress, laterStray]) })

      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledOnce()
      expect(state.sendTx).not.toHaveBeenCalled()
    })

    it('recovers a later stray when the earliest one cannot be recovered', async () => {
      const laterStray = 'NQ97 TEST LATER STRAY'
      mockAccounts({
        [activeAddress]: htlcAccount(261_000, { timeout: 500_000 }),
        [strayAddress]: htlcAccount(860_000),
        [laterStray]: htlcAccount(120_000, { timeout: 400_000 }),
      })
      state.registerValidatedRemoteSigner
        .mockRejectedValueOnce(new Error('HTLC account does not match cosigner metadata'))
        .mockResolvedValueOnce(targetedCandidate(laterStray, 120_000))
      state.getBalance.mockResolvedValue({ data: 120_000, error: undefined })
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress, laterStray]) })

      expect(state.registerValidatedRemoteSigner.mock.calls.map(([candidate]) => candidate.address)).toEqual([strayAddress, laterStray])
      expect(state.sendTx).toHaveBeenCalledOnce()
      expect(state.sendTx.mock.calls[0][0].sender.toUserFriendlyAddress()).toBe(laterStray)
      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    function mockExtension(parent: string, child: string, complete = true) {
      state.getAllTransactionsForAddress.mockImplementation((address: any) => Promise.resolve({
        transactions: address.toUserFriendlyAddress() === parent ? [{ sender: parent, recipient: child, recipientType: 'htlc' }] : [],
        complete: address.toUserFriendlyAddress() === parent ? complete : true,
      }))
    }

    it('recovers a funded extension of an empty root HTLC before recording the history check', async () => {
      state.remoteAddress = undefined
      mockExtension(activeAddress, strayAddress)
      mockAccounts({ [strayAddress]: htlcAccount(860_000) })
      mockRecoverableStray(860_000)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress]) })

      expect(state.registerValidatedRemoteSigner).toHaveBeenCalledExactlyOnceWith({ address: strayAddress })
      expect(state.sendTx).toHaveBeenCalledOnce()
      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    it('does not record the HTLC history check when extension history is incomplete', async () => {
      mockExtension(activeAddress, strayAddress, false)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress]) })

      expect(persistedHtlcHistoryCheck()).toBe(false)
    })

    it('stops following HTLC extensions once a clean walk is recorded', async () => {
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      useSyncState().htlcHistoryChecked = true
      useSyncState().htlcExtensionsWalked = true

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress], true) })

      expect(state.getAllTransactionsForAddress).not.toHaveBeenCalled()
    })

    it('still follows HTLC extensions on an upgraded install backfilled as checked', async () => {
      // An older version may have stored the root but never its funded extension.
      state.remoteAddress = createAddress(strayAddress)
      mockExtension(activeAddress, strayAddress)
      mockAccounts({ [strayAddress]: htlcAccount(860_000) })
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const { useSyncState } = await import('./state')
      useSyncState().htlcHistoryChecked = true
      useSyncState().htlcExtensionsWalked = false

      await useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress], true) })

      expect(state.client.getAccounts).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ toUserFriendlyAddress: expect.any(Function) })]))
      expect(state.getAllTransactionsForAddress).toHaveBeenCalled()
      expect(state.kvSetItem).toHaveBeenCalledWith('htlcExtensionsWalked', '1')
      expect(useSyncState().htlcExtensionsWalked).toBe(true)
    })

    function historyScan(createdHtlcs: string[]) {
      return { context: state.getWalletContext(), creations: createdHtlcs.map(recipient => ({ recipient })), historyComplete: true, sawHtlcTransaction: true, errors: [] }
    }

    async function flushMicrotasks() {
      for (let i = 0; i < 50; i++)
        await Promise.resolve()
    }

    it('records the HTLC history check from the history scan before cosigner validation finishes', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000) })
      const scan = historyScan([activeAddress])
      state.scanLocalHtlcCreations.mockResolvedValue(scan)
      const validation = deferred<any>()
      state.discoverRemoteSignersFromBlockchain.mockReturnValue(validation.promise)
      const { useSyncRemoteSigners } = await import('./remote-signers')

      const verifying = useSyncRemoteSigners().verifyRemoteSignersDb()
      await flushMicrotasks()

      expect(persistedHtlcHistoryCheck()).toBe(true)
      // Discovery rescans: HTLCs created while the sweep ran would be missing from the earlier scan.
      expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalledExactlyOnceWith()
      validation.resolve(discovery([activeAddress], true))
      await verifying
    })

    it('drains a stray HTLC found by the history scan without waiting for cosigner validation', async () => {
      mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(860_000) })
      mockRecoverableStray(860_000)
      state.scanLocalHtlcCreations.mockResolvedValue(historyScan([activeAddress, strayAddress]))
      const { useSyncRemoteSigners } = await import('./remote-signers')

      await useSyncRemoteSigners().verifyRemoteSignersDb()

      expect(state.sendTx).toHaveBeenCalledOnce()
      expect(state.discoverRemoteSignersFromBlockchain).not.toHaveBeenCalled()
    })

    it('waits for consensus before looking up accounts', async () => {
      vi.useFakeTimers()
      try {
        state.client.waitForConsensusEstablished = vi.fn(() => new Promise(() => {}))
        mockAccounts({ [activeAddress]: htlcAccount(261_000), [strayAddress]: htlcAccount(860_000) })
        const { useSyncRemoteSigners } = await import('./remote-signers')

        const verification = useSyncRemoteSigners().verifyRemoteSignersDb({ discoveryResult: discovery([activeAddress, strayAddress]) })
        await vi.advanceTimersByTimeAsync(30_000)
        await verification

        expect(state.client.getAccounts).not.toHaveBeenCalled()
        expect(state.sendTx).not.toHaveBeenCalled()
      }
      finally {
        vi.useRealTimers()
      }
    })
  })
})
