import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createAddress, resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncLifecycle', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    vi.resetModules()
    pinia = createPinia()
    setActivePinia(pinia)
    stubNimiqGlobal()
    resetSyncState()
    const { useSyncState } = await import('./state')
    const syncState = useSyncState(pinia)
    const getWalletContext = state.getWalletContext.getMockImplementation()!
    state.getWalletContext.mockImplementation(() => {
      const context = getWalletContext()
      return context && { ...context, generation: syncState.walletContextGeneration }
    })
  })

  afterEach(async () => {
    state.hasLocalWallet = false
    await nextTick()
    await flushPromises()
    disposePinia(pinia)
    setActivePinia(undefined)
    vi.useRealTimers()
  })

  describe('syncWallets', () => {
    it.each(['connecting', 'syncing', 'no-client'])('starts Polygon independently while Nimiq is %s', async (readiness) => {
      state.consensus = readiness === 'syncing' ? 'syncing' : 'connecting'
      if (readiness === 'no-client')
        state.client = undefined
      state.initPolygon.mockReturnValue(new Promise(() => {}))
      const { useSyncLifecycle } = await import('./lifecycle')

      await useSyncLifecycle().syncWallets()

      expect(state.initPolygon).toHaveBeenCalledOnce()
      expect(state.getBalance).not.toHaveBeenCalled()
      expect(state.isSyncingWallets).toBe(false)
    })

    it('early-returns when hasLocalWallet is false', async () => {
      state.hasLocalWallet = false
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      expect(state.initRemoteSigner).not.toHaveBeenCalled()
      expect(state.initPolygon).not.toHaveBeenCalled()
      expect(state.client.waitForConsensusEstablished).not.toHaveBeenCalled()
    })

    it('restores pending outgoing transactions before remote signer initialization', async () => {
      state.consensus = 'connecting'
      const { useSyncLifecycle } = await import('./lifecycle')

      await useSyncLifecycle().syncWallets()

      expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce()
      expect(state.restorePendingOutgoingTransactions.mock.invocationCallOrder[0])
        .toBeLessThan(state.initRemoteSigner.mock.invocationCallOrder[0])
    })

    it('hydrates online when pending restoration fails transiently', async () => {
      state.consensus = 'connecting'
      state.restorePendingOutgoingTransactions.mockResolvedValueOnce(false).mockResolvedValue(true)
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      state.consensus = 'established'

      await lifecycle.syncWallets()

      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledTimes(2))
      expect(state.initRemoteSigner).toHaveBeenCalled()
      expect(state.getBalance).toHaveBeenCalled()
      expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2)
    })

    it('registers the incoming listener before slow signer verification', async () => {
      state.consensus = 'connecting'
      let finishVerification!: () => void
      state.discoverRemoteSignersFromBlockchain.mockReturnValue(new Promise<any>(resolve => finishVerification = () => resolve({ added: 0, alreadyKnown: 0, localComplete: true, errors: [] })))
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      state.consensus = 'established'
      const syncing = lifecycle.syncWallets()
      await vi.waitFor(() => expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalled())
      const registered = state.client.addTransactionListener.mock.calls.some((call: any[]) =>
        call[1]?.[0]?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS',
      )
      finishVerification()
      await syncing
      expect(registered).toBe(true)
    })

    it.each([false, true])('processes deposits during slow signer verification while respecting the send lock (%s)', async (sending) => {
      state.consensus = 'connecting'
      state.isHtlcActive = false
      state.htlcThreshold = 500_000
      state.initRemoteSigner.mockImplementation(async () => {
        // Reproduce the initial reconciliation finishing before signer hydration.
        await flushPromises()
        state.remoteBalance = 10_000_000
      })
      state.getBalance.mockImplementation(async address => ({
        data: address === state.localAddress ? 600_000 : 10_000_000,
        error: undefined,
      }))
      let finishVerification!: () => void
      state.discoverRemoteSignersFromBlockchain.mockReturnValue(new Promise((resolve) => {
        finishVerification = () => resolve({ added: 0, alreadyKnown: 0, localComplete: true, errors: [] })
      }))
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      state.consensus = 'established'
      const syncing = lifecycle.syncWallets()
      try {
        await vi.waitFor(() => expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalled())
        expect(state.isSyncingWallets).toBe(true)
        expect(state.isHtlcActive).toBe(true)
        state.isSendingTx = sending

        const onHead = state.client.addHeadChangedListener.mock.calls[1][0]
        await onHead()

        if (sending)
          expect(state.sendTx).not.toHaveBeenCalled()
        else
          expect(state.sendTx).toHaveBeenCalledWith({ transfer: 'remote-to-local' })
      }
      finally {
        finishVerification()
        await syncing
      }
    })

    it('runs init pipeline through to remote signer verification', async () => {
      state.consensus = 'connecting'
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      state.consensus = 'established'
      await lifecycle.syncWallets()
      expect(state.initRemoteSigner).toHaveBeenCalled()
      expect(state.initPolygon).toHaveBeenCalled()
      expect(state.client.waitForConsensusEstablished).not.toHaveBeenCalled()
      expect(state.resolveHomeBalanceState).toHaveBeenCalled()
      expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalled()
    })

    it('hydrates offline and completes before the client becomes ready', async () => {
      const onlineClient = state.client
      state.client = undefined
      state.consensus = 'connecting'
      const { useSyncBalances } = await import('./balances')
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      const callOrder: string[] = []
      const originalSetWalletContext = syncState.setWalletContext
      vi.spyOn(syncState, 'setWalletContext').mockImplementation((...args) => {
        callOrder.push('set-wallet-context')
        return originalSetWalletContext(...args)
      })
      vi.spyOn(useSyncHtlc(), 'checkHtlcState').mockImplementation(async () => {
        callOrder.push('check-htlc-state')
      })
      const updateBalances = vi.spyOn(useSyncBalances(), 'updateBalances')
      state.restorePendingOutgoingTransactions.mockImplementation(async () => {
        callOrder.push('restore-pending')
        return true
      })
      state.initRemoteSigner.mockImplementation(async () => {
        callOrder.push('init-remote-signer')
      })
      const { useSyncLifecycle } = await import('./lifecycle')

      let completed = false
      const syncing = useSyncLifecycle().syncWallets().then(() => completed = true)
      await vi.waitFor(() => expect(state.initRemoteSigner).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(completed).toBe(true))
      const completedOffline = completed
      const balanceCallsBeforeReadiness = updateBalances.mock.calls.length
      state.client = onlineClient
      await syncing

      expect(callOrder[0]).toBe('set-wallet-context')
      expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce()
      expect(useSyncHtlc().checkHtlcState).toHaveBeenCalledOnce()
      expect(state.initRemoteSigner).toHaveBeenCalledOnce()
      expect(balanceCallsBeforeReadiness).toBe(0)
      expect(completedOffline).toBe(true)
      expect(state.isSyncingWallets).toBe(false)
    })

    it('registers two head listeners and one local transaction listener', async () => {
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      expect(state.client.addHeadChangedListener).toHaveBeenCalledTimes(2)
      // One for local address (handleIncomingTransaction); the remote address listener
      // is registered by an immediate watch on remoteAddress that fires when the store is created.
      const localListenerCalls = state.client.addTransactionListener.mock.calls.filter((call: any[]) =>
        call[1]?.[0]?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS',
      )
      expect(localListenerCalls).toHaveLength(1)
    })

    it('serializes established readiness with mounted startup', async () => {
      let activeInits = 0
      let maxActiveInits = 0
      const initResolvers: Array<() => void> = []
      state.initRemoteSigner.mockImplementation(() => {
        activeInits += 1
        maxActiveInits = Math.max(maxActiveInits, activeInits)
        return new Promise<void>((resolve) => {
          initResolvers.push(() => {
            activeInits -= 1
            resolve()
          })
        })
      })
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      await vi.waitFor(() => expect(initResolvers).toHaveLength(1))

      const startup = lifecycle.syncWallets()
      await nextTick()
      expect(maxActiveInits).toBe(1)
      initResolvers.shift()!()
      await vi.waitFor(() => expect(initResolvers).toHaveLength(1))
      initResolvers.shift()!()
      await startup

      expect(maxActiveInits).toBe(1)
    })

    it('finishes pending restoration before HTLC reconciliation starts', async () => {
      state.consensus = 'connecting'
      let finishRestoration!: (restored: boolean) => void
      state.restorePendingOutgoingTransactions.mockImplementationOnce(() => new Promise(resolve => finishRestoration = resolve))
      const { useSyncHtlc } = await import('./htlc')
      const checkHtlcState = vi.spyOn(useSyncHtlc(), 'checkHtlcState').mockResolvedValue(undefined)
      const { useSyncLifecycle } = await import('./lifecycle')

      const startup = useSyncLifecycle().syncWallets()
      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce())
      expect(checkHtlcState).not.toHaveBeenCalled()
      finishRestoration(true)
      await startup

      expect(checkHtlcState).toHaveBeenCalledOnce()
    })

    it('does not run height-triggered HTLC reconciliation during pending restoration', async () => {
      state.consensus = 'connecting'
      let finishRestoration!: (restored: boolean) => void
      state.restorePendingOutgoingTransactions.mockImplementationOnce(() => new Promise(resolve => finishRestoration = resolve))
      const { useSyncHtlc } = await import('./htlc')
      const maybeCheckHtlcState = vi.spyOn(useSyncHtlc(), 'maybeCheckHtlcState').mockResolvedValue(undefined)
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()

      state.consensus = 'established'
      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce())
      state.height = 130
      await nextTick()

      expect(maybeCheckHtlcState).not.toHaveBeenCalled()
      state.consensus = 'connecting'
      finishRestoration(true)
      await vi.waitFor(() => expect(maybeCheckHtlcState).toHaveBeenCalledOnce())
      await nextTick()
    })

    it('removes a listener whose registration completes after context becomes stale', async () => {
      state.isSyncingWallets = true
      let finishRegistration!: (id: number) => void
      state.client.addHeadChangedListener.mockImplementationOnce(() => new Promise(resolve => finishRegistration = resolve))
      const oldClient = state.client
      const { useSyncState } = await import('./state')
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      state.isSyncingWallets = false

      const startup = lifecycle.syncWallets()
      await vi.waitFor(() => expect(oldClient.addHeadChangedListener).toHaveBeenCalledOnce())
      useSyncState().walletContextGeneration += 1
      finishRegistration(41)
      await startup

      expect(oldClient.removeListener).toHaveBeenCalledWith(41)
      expect(oldClient.addHeadChangedListener).toHaveBeenCalledOnce()
    })

    it('logs polygon init failure without throwing', async () => {
      state.initPolygon.mockRejectedValueOnce(new Error('boom'))
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      // Allow the catch handler microtask to run.
      await Promise.resolve()
      await Promise.resolve()
      expect(state.logger.error).toHaveBeenCalledWith('Failed to initialize Polygon sync', expect.any(Error))
    })

    it('refreshes included payments on each head without keeping the send lock', async () => {
      const { useSyncTransactions } = await import('./transactions')
      const update = vi.spyOn(useSyncTransactions(), 'updateSingleTransaction').mockResolvedValue()
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      state.height = 101
      state.query.mockResolvedValue([{ hash: 'confirming-payment' }])
      const { useSyncState } = await import('./state')
      expect(useSyncState().isTransactionPending).toBe(false)
      const callback = state.client.addHeadChangedListener.mock.calls[1][0]
      await callback()
      expect(update).toHaveBeenCalledWith('confirming-payment')
      expect(useSyncState().isTransactionPending).toBe(false)
    })

    it('removes previous head + transaction listeners on re-sync', async () => {
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      await lifecycle.syncWallets()
      const callsBefore = state.client.removeListener.mock.calls.length
      await lifecycle.syncWallets()
      expect(state.client.removeListener.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  describe('handleIncomingTransaction', () => {
    async function captureLocalTxListener() {
      let captured: ((tx: any) => Promise<void>) | undefined
      state.client.addTransactionListener.mockImplementation(async (fn: any, addresses?: any[]) => {
        if (addresses?.[0]?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS')
          captured = fn
        return 1
      })
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      if (!captured)
        throw new Error('Local transaction listener was not registered')
      return captured
    }

    it('ignores txs sent from the local address', async () => {
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'h1',
        sender: 'NQ00 TEST LOCAL ADDRESS',
        senderType: 'basic',
        recipient: 'NQ99 OTHER',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        data: { raw: '' },
      })
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })

    it('ignores txs sent from the remote address', async () => {
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'h1',
        sender: 'NQ11 TEST REMOTE ADDRESS',
        senderType: 'basic',
        recipient: 'NQ99 OTHER',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        data: { raw: '' },
      })
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })

    it('ignores add-stake txs to the staking contract from non-remote senders', async () => {
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'h1',
        sender: 'NQ77 OUTSIDE STAKER',
        senderType: 'basic',
        recipient: 'NQ_STAKING',
        recipientType: 'staking',
        value: 100,
        fee: 0,
        state: 'confirmed',
        data: { type: 'add-stake', raw: '' },
      })
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })

    it('skips txs whose hash is already in user_receipts', async () => {
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('transfer = '))
          return Promise.resolve([{ hash: 'h1' }])
        return Promise.resolve([])
      })
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'h1',
        sender: 'NQ77 EXTERNAL',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        data: { raw: '' },
      })
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })

    it('marks NAKA reversal when sender is in nakaBufferAddresses', async () => {
      vi.doMock('@/lib', () => ({ isDev: false, nakaBufferAddresses: ['NQ99 NAKA'] }))
      vi.resetModules()
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'h1',
        sender: 'NQ99 NAKA',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 250,
        fee: 0,
        state: 'confirmed',
        data: { raw: '' },
      })
      expect(state.setNakaTxRefunded).toHaveBeenCalledWith(250)
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
      vi.doUnmock('@/lib')
    })

    it('drops own-HTLC drains identified by proof.creator and registers them', async () => {
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'drain-hash',
        sender: 'NQ44 EXTENSION HTLC ADDRESS',
        senderType: 'htlc',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 521,
        fee: 0,
        state: 'confirmed',
        timestamp: 9,
        data: { raw: '' },
        proof: { type: 'timeout-resolve', creator: 'NQ00 TEST LOCAL ADDRESS', raw: '' },
      })
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
      expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith(
        'NQ44 EXTENSION HTLC ADDRESS',
        expect.objectContaining({
          client: state.client,
          network: 'testalbatross',
          owner: 'NQ00 TEST LOCAL ADDRESS',
        }),
      )
    })

    it('keeps foreign HTLC drains (creator != local) as Top-Up', async () => {
      const { useSyncState } = await import('./state')
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'foreign-htlc-hash',
        sender: 'NQ44 FOREIGN HTLC ADDRESS',
        senderType: 'htlc',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        timestamp: 9,
        data: { raw: '' },
        proof: { type: 'timeout-resolve', creator: 'NQ77 FOREIGN CREATOR', raw: '' },
      })
      expect(state.addReceiptTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ hash: 'foreign-htlc-hash', title: 'Top-Up' }),
        expect.objectContaining({ client: state.client, generation: useSyncState().walletContextGeneration, network: state.networkName, owner: state.localAddress.toUserFriendlyAddress() }),
      )
      expect(state.registerOwnHtlcIfMissing).not.toHaveBeenCalled()
    })

    it('saves a receipt for a fresh external transaction', async () => {
      const { useSyncState } = await import('./state')
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'h1',
        sender: 'NQ77 NEW TOP-UP',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 1000,
        fee: 0,
        state: 'confirmed',
        timestamp: 5,
        data: { raw: '' },
      })
      expect(state.addReceiptTransaction).toHaveBeenCalledWith(expect.objectContaining({
        hash: 'h1',
        amount: 1000,
        sender: 'NQ77 NEW TOP-UP',
      }), expect.objectContaining({ client: state.client, generation: useSyncState().walletContextGeneration, network: state.networkName, owner: state.localAddress.toUserFriendlyAddress() }))
    })

    describe('local notification dispatch', () => {
      it('fires scheduleIncomingPaymentNotification for a fresh external top-up', async () => {
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'notif-h1',
          sender: 'NQ77 NEW TOP-UP',
          senderType: 'basic',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          value: 4242,
          fee: 0,
          state: 'confirmed',
          timestamp: 5,
          data: { raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).toHaveBeenCalledTimes(1)
        expect(state.scheduleIncomingPaymentNotification).toHaveBeenCalledWith(expect.objectContaining({
          hash: 'notif-h1',
          amount: 4242,
        }))
      })

      it('fires for foreign-HTLC drain', async () => {
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'foreign-htlc-notif',
          sender: 'NQ44 FOREIGN HTLC',
          senderType: 'htlc',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          value: 99,
          fee: 0,
          state: 'confirmed',
          timestamp: 9,
          data: { raw: '' },
          proof: { type: 'timeout-resolve', creator: 'NQ77 FOREIGN CREATOR', raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).toHaveBeenCalledTimes(1)
      })

      it('does NOT fire when sender is local address', async () => {
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'self-h',
          sender: 'NQ00 TEST LOCAL ADDRESS',
          senderType: 'basic',
          recipient: 'NQ99 OTHER',
          recipientType: 'basic',
          value: 1,
          fee: 0,
          state: 'confirmed',
          data: { raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
      })

      it('does NOT fire when sender is remote address', async () => {
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'remote-h',
          sender: 'NQ11 TEST REMOTE ADDRESS',
          senderType: 'basic',
          recipient: 'NQ99 OTHER',
          recipientType: 'basic',
          value: 1,
          fee: 0,
          state: 'confirmed',
          data: { raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
      })

      it('does NOT fire when hash already in DB', async () => {
        state.query.mockImplementation((sql = '') => {
          if (sql.includes('transfer = '))
            return Promise.resolve([{ hash: 'dup-h' }])
          return Promise.resolve([])
        })
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'dup-h',
          sender: 'NQ77 EXTERNAL',
          senderType: 'basic',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          value: 100,
          fee: 0,
          state: 'confirmed',
          data: { raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
      })

      it('does NOT fire on own-HTLC drain', async () => {
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'own-htlc-drain',
          sender: 'NQ44 EXTENSION HTLC',
          senderType: 'htlc',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          value: 1,
          fee: 0,
          state: 'confirmed',
          timestamp: 9,
          data: { raw: '' },
          proof: { type: 'timeout-resolve', creator: 'NQ00 TEST LOCAL ADDRESS', raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
      })

      it('does NOT fire on NAKA reversal', async () => {
        vi.doMock('@/lib', () => ({ isDev: false, nakaBufferAddresses: ['NQ99 NAKA'] }))
        vi.resetModules()
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'naka-h',
          sender: 'NQ99 NAKA',
          senderType: 'basic',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          value: 250,
          fee: 0,
          state: 'confirmed',
          data: { raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
        vi.doUnmock('@/lib')
      })

      it('does NOT fire on add-stake from non-remote sender', async () => {
        const listener = await captureLocalTxListener()
        await listener({
          transactionHash: 'stake-h',
          sender: 'NQ77 OUTSIDE STAKER',
          senderType: 'basic',
          recipient: 'NQ_STAKING',
          recipientType: 'staking',
          value: 100,
          fee: 0,
          state: 'confirmed',
          data: { type: 'add-stake', raw: '' },
        })
        expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
      })
    })
  })

  describe('watchers', () => {
    it('kicks off checkExpiredSwapHtlcs on store creation when consensus is established', async () => {
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      // The immediate consensus watch dispatches checkExpiredSwapHtlcs.
      await Promise.resolve()
      await Promise.resolve()
      // checkExpiredSwapHtlcs reads the expired swap HTLC table.
      const querySqls = state.query.mock.calls.map(c => c[0] ?? '')
      expect(querySqls.some(sql => sql.includes('swap_htlcs'))).toBe(true)
    })

    it('registers a remote-address transaction listener on store creation', async () => {
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      await Promise.resolve()
      await Promise.resolve()
      const remoteListenerCalls = state.client.addTransactionListener.mock.calls.filter((call: any[]) =>
        call[1]?.[0]?.toUserFriendlyAddress?.() === 'NQ11 TEST REMOTE ADDRESS',
      )
      expect(remoteListenerCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('does not register a remote-address listener when remoteAddress is undefined', async () => {
      state.remoteAddress = undefined
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      await Promise.resolve()
      await Promise.resolve()
      expect(state.client.addTransactionListener).not.toHaveBeenCalled()
    })

    it.each([false, true, undefined])('reconciles listener executionResult=%s without another lookup', async (executionResult) => {
      let remoteListener: ((tx: any) => Promise<void>) | undefined
      state.client.addTransactionListener.mockImplementation(async (fn: any, addresses?: any[]) => {
        if (addresses?.[0]?.toUserFriendlyAddress?.() === 'NQ11 TEST REMOTE ADDRESS')
          remoteListener = fn
        return 1
      })
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      await Promise.resolve()
      await Promise.resolve()
      expect(remoteListener).toBeDefined()
      const { useSyncState } = await import('./state')
      const syncState = useSyncState()
      syncState.pendingTransactions.push({ transactionHash: 'remote-tx' } as any)
      const tx = { transactionHash: 'remote-tx', state: 'included', timestamp: 123, executionResult }
      await remoteListener!(tx)

      expect(syncState.pendingPaymentTransactions).toContainEqual(tx)
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({
        hash: 'remote-tx',
        status: executionResult === false ? 'failed' : 'included',
        timestamp: 123,
        executionResult,
      })
      expect(syncState.pendingTransactions).toEqual([])
      expect(state.client.getTransaction).not.toHaveBeenCalled()
      expect(state.getTransactionState).not.toHaveBeenCalled()
    })

    it('ignores local and remote callbacks after wallet context becomes stale', async () => {
      state.isSyncingWallets = true
      let localListener!: (tx: any) => Promise<void>
      let remoteListener!: (tx: any) => void
      state.client.addTransactionListener.mockImplementation(async (fn: any, addresses?: any[]) => {
        const address = addresses?.[0]?.toUserFriendlyAddress?.()
        if (address === 'NQ00 TEST LOCAL ADDRESS')
          localListener = fn
        else if (address === 'NQ11 TEST REMOTE ADDRESS')
          remoteListener = fn
        return 1
      })
      const { useSyncState } = await import('./state')
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      state.isSyncingWallets = false
      await lifecycle.syncWallets()
      expect(localListener).toBeDefined()
      expect(remoteListener).toBeDefined()
      state.query.mockClear()
      useSyncState().pendingPaymentTransactions = []
      useSyncState().walletContextGeneration += 1

      const tx = {
        transactionHash: 'stale-listener-tx',
        sender: 'NQ77 EXTERNAL',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        data: { raw: '' },
      }
      await localListener(tx)
      remoteListener(tx)

      expect(state.query).not.toHaveBeenCalled()
      expect(useSyncState().pendingPaymentTransactions).toEqual([])
    })

    it('stops a local callback when wallet context changes during its receipt query', async () => {
      state.isSyncingWallets = true
      let localListener!: (tx: any) => Promise<void>
      state.client.addTransactionListener.mockImplementation(async (fn: any, addresses?: any[]) => {
        if (addresses?.[0]?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS')
          localListener = fn
        return 1
      })
      const { useSyncState } = await import('./state')
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      state.isSyncingWallets = false
      await lifecycle.syncWallets()
      state.query.mockClear()
      let finishReceiptQuery!: (receipts: any[]) => void
      state.query.mockImplementationOnce(() => new Promise(resolve => finishReceiptQuery = resolve))

      const callback = localListener({
        transactionHash: 'stale-during-query',
        sender: 'NQ77 EXTERNAL',
        senderType: 'basic',
        recipient: 'NQ00 TEST LOCAL ADDRESS',
        recipientType: 'basic',
        value: 100,
        fee: 0,
        state: 'confirmed',
        data: { raw: '' },
      })
      await vi.waitFor(() => expect(state.query).toHaveBeenCalledOnce())
      useSyncState().walletContextGeneration += 1
      finishReceiptQuery([])
      await callback

      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
      expect(state.registerOwnHtlcIfMissing).not.toHaveBeenCalled()
      expect(state.scheduleIncomingPaymentNotification).not.toHaveBeenCalled()
    })

    it('ignores an old remote callback after the registered address is replaced', async () => {
      let oldRemoteListener!: (tx: any) => void
      state.client.addTransactionListener.mockImplementation(async (fn: any, addresses?: any[]) => {
        if (addresses?.[0]?.toUserFriendlyAddress?.() === 'NQ11 TEST REMOTE ADDRESS')
          oldRemoteListener = fn
        return 1
      })
      const { useSyncState } = await import('./state')
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      await vi.waitFor(() => expect(oldRemoteListener).toBeDefined())
      useSyncState().pendingPaymentTransactions = []

      state.remoteAddress = createAddress('NQ22 REPLACEMENT REMOTE ADDRESS')
      oldRemoteListener({ transactionHash: 'old-remote-tx' })

      expect(useSyncState().pendingPaymentTransactions).toEqual([])
    })

    it('retries hydration and pending reconciliation when an undefined client becomes ready', async () => {
      const onlineClient = state.client
      state.client = undefined
      state.consensus = 'established'
      const { useSyncState } = await import('./state')
      const { useSyncTransactions } = await import('./transactions')
      const updateSingleTransaction = vi.spyOn(useSyncTransactions(), 'updateSingleTransaction').mockResolvedValue(undefined)
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      useSyncState().pendingTransactions.push({ transactionHash: 'pending-hash' } as any)

      state.client = onlineClient

      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce())
      expect(state.initRemoteSigner).toHaveBeenCalledOnce()
      expect(updateSingleTransaction).toHaveBeenCalledWith('pending-hash')
    })

    it('completes the online sync pipeline when an offline startup becomes ready', async () => {
      const onlineClient = state.client
      state.client = undefined
      state.consensus = 'connecting'
      const { useSyncBalances } = await import('./balances')
      const { useSyncHtlc } = await import('./htlc')
      const { useSyncRemoteSigners } = await import('./remote-signers')
      const updateBalances = vi.spyOn(useSyncBalances(), 'updateBalances')
      const handleFunds = vi.spyOn(useSyncHtlc(), 'handleFunds')
      const checkRemoteValidity = vi.spyOn(useSyncHtlc(), 'checkRemoteValidity')
      const extendValidity = vi.spyOn(useSyncHtlc(), 'extendValidity')
      const verifyRemoteSignersDb = vi.spyOn(useSyncRemoteSigners(), 'verifyRemoteSignersDb')
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()

      state.client = onlineClient
      state.consensus = 'established'

      await vi.waitFor(() => expect(onlineClient.addHeadChangedListener).toHaveBeenCalledTimes(2))
      expect(state.initPolygon).toHaveBeenCalledOnce()
      expect(updateBalances).toHaveBeenCalled()
      expect(state.resolveHomeBalanceState).toHaveBeenCalledOnce()
      expect(verifyRemoteSignersDb).toHaveBeenCalledOnce()
      expect(handleFunds).toHaveBeenCalledOnce()
      expect(checkRemoteValidity).toHaveBeenCalledOnce()
      expect(extendValidity).toHaveBeenCalledOnce()
      expect(onlineClient.addTransactionListener).toHaveBeenCalledWith(expect.any(Function), [state.localAddress])
    })

    it('retries hydration when an existing client reaches consensus', async () => {
      state.consensus = 'connecting'
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      await nextTick()
      expect(state.restorePendingOutgoingTransactions).not.toHaveBeenCalled()

      state.consensus = 'established'

      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce())
      expect(state.initRemoteSigner).toHaveBeenCalledOnce()
    })

    it('does not retry while consensus is connecting or wallet sync is running', async () => {
      state.consensus = 'connecting'
      state.isSyncingWallets = true
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()

      state.consensus = 'established'
      await nextTick()

      expect(state.restorePendingOutgoingTransactions).not.toHaveBeenCalled()
      expect(state.initRemoteSigner).not.toHaveBeenCalled()
    })

    it.each(['sync starts', 'consensus drops', 'wallet generation changes'] as const)(
      'cancels a readiness retry when %s during remote signer init',
      async (change) => {
        state.consensus = 'connecting'
        let finishInit!: () => void
        state.initRemoteSigner.mockImplementationOnce(() => new Promise<void>(resolve => finishInit = resolve))
        const { useSyncState } = await import('./state')
        const { useSyncLifecycle } = await import('./lifecycle')
        useSyncLifecycle()
        state.consensus = 'established'
        await vi.waitFor(() => expect(state.initRemoteSigner).toHaveBeenCalledOnce())

        if (change === 'sync starts')
          state.isSyncingWallets = true
        else if (change === 'consensus drops')
          state.consensus = 'connecting'
        else
          useSyncState().setWalletContext(state.localAddress.toUserFriendlyAddress(), state.networkName)
        finishInit()
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(state.restorePendingOutgoingTransactions).not.toHaveBeenCalled()
      },
    )

    it('cancels a stale client retry after remote signer init', async () => {
      state.consensus = 'connecting'
      const initResolvers: Array<() => void> = []
      state.initRemoteSigner.mockImplementation(() => new Promise<void>(resolve => initResolvers.push(resolve)))
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      state.consensus = 'established'
      await vi.waitFor(() => expect(initResolvers).toHaveLength(1))

      state.client = {
        ...state.client,
        addHeadChangedListener: vi.fn(() => Promise.resolve(2)),
        addTransactionListener: vi.fn(() => Promise.resolve(2)),
        removeListener: vi.fn(() => Promise.resolve()),
      }
      expect(initResolvers).toHaveLength(1)
      initResolvers.shift()!()
      await vi.waitFor(() => expect(initResolvers).toHaveLength(1))
      const staleRestoreCalls = state.restorePendingOutgoingTransactions.mock.calls.length
      initResolvers.shift()!()
      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalled())

      expect(staleRestoreCalls).toBe(0)
    })

    it('cancels reconciliation when sync starts during pending restoration', async () => {
      state.consensus = 'connecting'
      let finishRestoration!: (restored: boolean) => void
      state.restorePendingOutgoingTransactions.mockImplementationOnce(() => new Promise<boolean>(resolve => finishRestoration = resolve))
      const { useSyncHtlc } = await import('./htlc')
      const checkHtlcState = vi.spyOn(useSyncHtlc(), 'checkHtlcState').mockResolvedValue(undefined)
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      state.consensus = 'established'
      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce())

      state.isSyncingWallets = true
      finishRestoration(true)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(checkHtlcState).not.toHaveBeenCalled()
    })

    it('reruns DB hydration when the established client is replaced', async () => {
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()
      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledOnce())

      state.client = {
        ...state.client,
        addHeadChangedListener: vi.fn(() => Promise.resolve(2)),
        addTransactionListener: vi.fn(() => Promise.resolve(2)),
        removeListener: vi.fn(() => Promise.resolve()),
      }

      await vi.waitFor(() => expect(state.restorePendingOutgoingTransactions).toHaveBeenCalledTimes(2))
      expect(state.initRemoteSigner).toHaveBeenCalledTimes(2)
    })

    it('removes every listener through the client that registered it', async () => {
      state.consensus = 'connecting'
      let oldListenerId = 0
      const oldClient = {
        ...state.client,
        addHeadChangedListener: vi.fn(() => Promise.resolve(++oldListenerId)),
        addTransactionListener: vi.fn(() => Promise.resolve(++oldListenerId)),
        removeListener: vi.fn(() => Promise.resolve()),
      }
      let newListenerId = 100
      const newClient = {
        ...state.client,
        addHeadChangedListener: vi.fn(() => Promise.resolve(++newListenerId)),
        addTransactionListener: vi.fn(() => Promise.resolve(++newListenerId)),
        removeListener: vi.fn(() => Promise.resolve()),
      }
      state.client = oldClient
      const { useSyncLifecycle } = await import('./lifecycle')
      const lifecycle = useSyncLifecycle()
      await vi.waitFor(() => expect(oldClient.addTransactionListener).toHaveBeenCalledOnce())

      state.isSyncingWallets = true
      state.consensus = 'established'
      await lifecycle.syncWallets()
      const registeredByOldClient = Array.from({ length: oldListenerId }, (_, index) => index + 1)

      state.consensus = 'connecting'
      state.client = newClient
      state.remoteAddress = {
        toUserFriendlyAddress: () => 'NQ22 NEXT REMOTE ADDRESS',
        equals: () => false,
      } as any
      await vi.waitFor(() => expect(newClient.addTransactionListener).toHaveBeenCalledOnce())

      state.isSyncingWallets = true
      state.consensus = 'established'
      await lifecycle.syncWallets()

      expect(oldClient.removeListener.mock.calls.map(([id]: [number]) => id)).toEqual(expect.arrayContaining(registeredByOldClient))
      expect(newClient.removeListener.mock.calls.map(([id]: [number]) => id).every((id: number) => id >= 101)).toBe(true)
    })

    it('serializes coalesced height and readiness retry triggers', async () => {
      const { SQLQuery } = await import('@/lib/sql-queries')
      state.consensus = 'connecting'
      state.height = 129
      let activeQueries = 0
      let maxActiveQueries = 0
      const resolvers: Array<() => void> = []
      state.query.mockImplementation((sql = '') => {
        if (sql !== SQLQuery.SelectPendingHtlcCreations)
          return Promise.resolve([])
        activeQueries += 1
        maxActiveQueries = Math.max(maxActiveQueries, activeQueries)
        return new Promise<any[]>((resolve) => {
          resolvers.push(() => {
            activeQueries -= 1
            resolve([])
          })
        })
      })
      const { useSyncLifecycle } = await import('./lifecycle')
      useSyncLifecycle()

      state.consensus = 'established'
      state.height = 130
      await vi.waitFor(() => expect(resolvers).toHaveLength(1))
      resolvers.shift()!()
      await vi.waitFor(() => expect(resolvers).toHaveLength(1))
      resolvers.shift()!()
      await vi.waitFor(() => expect(activeQueries).toBe(0))

      expect(maxActiveQueries).toBe(1)
    })
  })
})
