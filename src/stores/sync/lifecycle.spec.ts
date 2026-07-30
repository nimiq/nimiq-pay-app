import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncLifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('syncWallets', () => {
    it('early-returns when hasLocalWallet is false', async () => {
      state.hasLocalWallet = false
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      expect(state.initRemoteSigner).not.toHaveBeenCalled()
      expect(state.client.waitForConsensusEstablished).not.toHaveBeenCalled()
    })

    it('runs init pipeline through to remote signer verification', async () => {
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      expect(state.initRemoteSigner).toHaveBeenCalled()
      expect(state.initPolygon).toHaveBeenCalled()
      expect(state.client.waitForConsensusEstablished).toHaveBeenCalled()
      expect(state.resolveHomeBalanceState).toHaveBeenCalled()
      expect(state.discoverRemoteSignersFromBlockchain).toHaveBeenCalled()
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

    it('logs polygon init failure without throwing', async () => {
      state.initPolygon.mockRejectedValueOnce(new Error('boom'))
      const { useSyncLifecycle } = await import('./lifecycle')
      await useSyncLifecycle().syncWallets()
      // Allow the catch handler microtask to run.
      await Promise.resolve()
      await Promise.resolve()
      expect(state.logger.error).toHaveBeenCalledWith('Failed to initialize Polygon sync', expect.any(Error))
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

    it('skips txs already stored under any transfer type, including a Mini App HTLC redeem', async () => {
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('transfer IN ('))
          return Promise.resolve([{ hash: 'h1', transfer: 'htlc' }])
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

    it('drops a drain from a registered own HTLC and registers it if missing', async () => {
      state.registerOwnHtlcIfMissing.mockResolvedValue('ours')
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
      expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith('NQ44 EXTENSION HTLC ADDRESS')
    })

    it('keeps a Mini App HTLC drain that registration refused to claim as ours', async () => {
      // proof.creator is the local wallet because sendNewHtlcTransaction defaults the Mini App
      // HTLC's sender to it — but registerOwnHtlcIfMissing rejected the contract shape, so the
      // drain belongs in the history rather than being dropped as internal traffic.
      state.registerOwnHtlcIfMissing.mockResolvedValue('foreign')
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'mini-app-drain-hash',
        sender: 'NQ55 MINI APP HTLC ADDRESS',
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
      expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith('NQ55 MINI APP HTLC ADDRESS')
      expect(state.addReceiptTransaction).toHaveBeenCalled()
    })

    it('defers an own-HTLC drain whose contract shape could not be read this round', async () => {
      // registerOwnHtlcIfMissing couldn't read the creation tx this round (e.g. a timed-out
      // query) — the drain must be neither recorded nor claimed as ours; wait for the next refresh.
      state.registerOwnHtlcIfMissing.mockResolvedValue('unknown')
      const listener = await captureLocalTxListener()
      await listener({
        transactionHash: 'unreadable-drain-hash',
        sender: 'NQ66 MAYBE OWN HTLC ADDRESS',
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
      expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith('NQ66 MAYBE OWN HTLC ADDRESS')
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })

    it('keeps foreign HTLC drains (creator != local) as Top-Up', async () => {
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
      expect(state.addReceiptTransaction).toHaveBeenCalledWith(expect.objectContaining({ hash: 'foreign-htlc-hash', title: 'Top-Up' }))
      expect(state.registerOwnHtlcIfMissing).not.toHaveBeenCalled()
    })

    it('saves a receipt for a fresh external transaction', async () => {
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
      }))
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
          if (sql.includes('transfer IN ('))
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
        state.registerOwnHtlcIfMissing.mockResolvedValue('ours')
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

    it('pushes incoming remote transactions onto pendingPaymentTransactions', async () => {
      let remoteListener: ((tx: any) => void) | undefined
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
      const tx = { transactionHash: 'remote-tx' }
      remoteListener!(tx)
      const { useSyncState } = await import('./state')
      expect(useSyncState().pendingPaymentTransactions).toContainEqual(tx)
    })
  })
})
