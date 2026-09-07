/* eslint-disable perfectionist/sort-imports, import/no-duplicates */
import './__tests__/setup'
import { createPinia, setActivePinia } from 'pinia'
import type { ValidatedRemoteSigner } from '@/stores/remote-signer'
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
        discoveryResult: { added: 1, alreadyKnown: 0, localComplete: false, errors: ['Local history incomplete'] },
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

    it.each(['new', 'pending', 'included', 'confirmed'] as const)(
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
        return { added: 0, alreadyKnown: 0, localComplete: true, errors: [] }
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
        discoveryResult: { added: 1, alreadyKnown: 0, localComplete: true, errors: [] },
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
        discoveryResult: { added: 1, alreadyKnown: 0, localComplete: false, errors: ['HTLC history lookup failed'] },
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
})
