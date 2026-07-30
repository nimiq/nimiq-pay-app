/* eslint-disable perfectionist/sort-imports, import/no-duplicates */
import './__tests__/setup'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentMethod, PointsHashPrefix, Rail, Transfer } from '@/types/transactions'
import { createAddress, resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

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

    it('falls back to remote-signer API when client.getTransaction throws', async () => {
      state.client.getTransaction = vi.fn(() => Promise.reject(new Error('rpc'))) as any
      state.getTransactionState.mockResolvedValue({ data: { state: 'included', timestamp: 5 }, error: undefined })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateSingleTransaction('h1')
      expect(state.getTransactionState).toHaveBeenCalledWith({ hash: 'h1' })
      expect(state.updateTransactionStatus).toHaveBeenCalledWith({ hash: 'h1', status: 'included', timestamp: 5 })
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
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
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
        // Dedup now reads SelectAllTransactions (`transfer IN (...)`), not GetAllUserReceipts (`transfer = 'user-receipt'`).
        if (sql.includes('transfer IN ('))
          return Promise.resolve([{ hash: 'known-hash', sender: 'NQ77 KNOWN SENDER' }])
        return Promise.resolve([])
      })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
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
        state.registerOwnHtlcIfMissing.mockResolvedValue('ours')
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
        expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith('NQ44 SOME HTLC ADDRESS')
      })

      it('drops an early-resolve drain whose creator is the local address', async () => {
        mockLocalAddressTxs(ownHtlcDrain('early-resolve'))
        state.registerOwnHtlcIfMissing.mockResolvedValue('ours')
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
        expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith('NQ44 SOME HTLC ADDRESS')
      })

      it('keeps a Mini App HTLC drain that registration refused to claim as ours', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve'))
        // registerOwnHtlcIfMissing saw a foreign contract shape and declined to register it.
        state.registerOwnHtlcIfMissing.mockResolvedValue('foreign')
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).toHaveBeenCalledWith(expect.objectContaining({
          hash: 'drain-hash',
        }))
      })

      it('defers an own-HTLC drain whose contract shape could not be read this round', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve'))
        // registerOwnHtlcIfMissing couldn't read the creation tx this round (e.g. a timed-out
        // query) — the drain must be neither recorded nor claimed as ours; wait for the next refresh.
        state.registerOwnHtlcIfMissing.mockResolvedValue('unknown')
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
      })

      it('keeps a foreign HTLC drain (creator != local) as a Top-Up', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve', 'NQ77 FOREIGN CREATOR'))
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).toHaveBeenCalledWith(expect.objectContaining({
          hash: 'drain-hash',
          title: 'Top-Up',
        }))
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
      })
      state.getAllRemoteSigners.mockImplementation(async () => {
        events.push('getAllRemoteSigners')
        return []
      })
      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()
      expect(events).toEqual(['discover', 'getAllRemoteSigners'])
    })

    it('skips the remote signer scan entirely when no cosigner key is available', async () => {
      state.remotePublicKey = undefined
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
      state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'extension-hash',
            sender: signer.address,
            senderType: 'basic',
            recipient: 'NQ44 EXTENSION HTLC ADDRESS',
            recipientType: 'htlc',
            value: 50_000,
            fee: 0,
            state: 'confirmed',
            timestamp: 150_000,
            data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ11 COSIGNER ADDRESS', hashRoot: '0'.repeat(64), hashCount: 1 },
            proof: { raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.getAllOutgoingTransactionsFromHtlcs).not.toHaveBeenCalled()
      expect(state.addHtlcTransaction).not.toHaveBeenCalled()
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
        data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ11 COSIGNER ADDRESS', hashRoot: '0000000000000000000000000000000000000000000000000000000000000000', hashCount: 1 },
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
      expect(state.addHtlcTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ hash: 'swap-leaf-hash' }),
      )
    })

    it('does not traverse a Mini App HTLC that mimics the zero hash root', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
      state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'mimic-hash',
            sender: 'NQ22 TEST FUNDED REMOTE ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ55 MINI APP HTLC ADDRESS',
            recipientType: 'htlc',
            value: 500,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            // Zero hash root, but the recipient is a real counterparty rather than our cosigner.
            data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', hashRoot: '0'.repeat(64), hashCount: 1 },
            proof: { raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.getAllOutgoingTransactionsFromHtlcs).not.toHaveBeenCalled()
      expect(state.addHtlcTransaction).toHaveBeenCalledWith(expect.objectContaining({ hash: 'mimic-hash' }))
    })

    it('records an HTLC creation as Transfer.HTLC when Fastspot does not know the contract', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
      state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)
      state.getContract.mockRejectedValue(new Error('fastspot down'))
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'mini-app-htlc-hash',
            sender: 'NQ22 TEST FUNDED REMOTE ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ55 MINI APP HTLC ADDRESS',
            recipientType: 'htlc',
            value: 500,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', hashRoot: 'ab'.repeat(32), hashCount: 1 },
            proof: { raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.addHtlcTransaction).toHaveBeenCalledWith(expect.objectContaining({
        hash: 'mini-app-htlc-hash',
        transfer: 'htlc',
        title: 'New HTLC',
        amount: 500,
      }))
      expect(state.addUnknownPaymentToMerchantTransaction).not.toHaveBeenCalled()
    })

    it('still records a Payment when Fastspot knows the contract but the pair is unsupported', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
      state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)
      state.getContract.mockResolvedValue({ from: { asset: 'BTC' }, to: { asset: 'NIM', amount: 1, fee: 0 } })
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'real-swap-hash',
            sender: 'NQ22 TEST FUNDED REMOTE ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ66 SWAP HTLC ADDRESS',
            recipientType: 'htlc',
            value: 700,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', hashRoot: 'cd'.repeat(32), hashCount: 1 },
            proof: { raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalled()
      expect(state.addHtlcTransaction).not.toHaveBeenCalled()
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
        if (sql.includes('transfer = '))
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

    it('does not overwrite a stored Mini App HTLC redeem with a Top-Up', async () => {
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'redeem-hash',
            sender: 'NQ55 MINI APP HTLC ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ00 TEST LOCAL ADDRESS',
            recipientType: 'basic',
            value: 500,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            data: { raw: '' },
            proof: { type: 'regular-transfer', raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)
      // SelectAllTransactions (`transfer IN (...)`) already holds the redeem we sent ourselves.
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('transfer IN ('))
          return Promise.resolve([{ hash: 'redeem-hash', transfer: 'htlc', sender: 'NQ55 MINI APP HTLC ADDRESS' }])
        return Promise.resolve([])
      })

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })
  })

  describe('updateTransactionsInDb', () => {
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
