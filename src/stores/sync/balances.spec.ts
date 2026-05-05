import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAddress, resetSyncState, state, stubNimiqGlobal } from './__tests__/setup'

describe('useSyncBalances', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubNimiqGlobal()
    resetSyncState()
  })

  it('warns about missing remote address every BLOCKS_PER_BATCH', async () => {
    state.remoteAddress = undefined
    state.height = 64 // multiple of 32
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.logger.warn).toHaveBeenCalledWith('Remote address not found')
  })

  it('does not warn about missing remote address when height is not on a batch boundary', async () => {
    state.remoteAddress = undefined
    state.height = 65
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.logger.warn).not.toHaveBeenCalledWith('Remote address not found')
  })

  it('skips balance lookups when isSendingTx is true', async () => {
    state.isSendingTx = true
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.getBalance).not.toHaveBeenCalled()
  })

  it('queues a re-run when an update is already in flight', async () => {
    let resolveLocal: (value: { data: any, error: any }) => void = () => {}
    state.getBalance.mockImplementationOnce(() => new Promise<{ data: any, error: any }>((r) => {
      resolveLocal = r
    }))
    const { useSyncBalances } = await import('./balances')
    const balances = useSyncBalances()
    const first = balances.updateBalances()
    await Promise.resolve()
    await balances.updateBalances()
    expect(state.logger.log).toHaveBeenCalledWith('Balance update already running. Scheduling another update')
    resolveLocal({ data: 0, error: undefined })
    await first
  })

  it('writes localBalance from getBalance success', async () => {
    state.localBalance = 0
    state.getBalance.mockResolvedValueOnce({ data: 50_000, error: undefined })
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.localBalance).toBe(50_000)
  })

  it('keeps the previous local balance when local balance lookup fails', async () => {
    state.localBalance = 42_000
    state.remoteAddress = undefined
    state.getBalance.mockResolvedValue({ data: undefined, error: new Error('temporary consensus failure') })
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.localBalance).toBe(42_000)
    expect(state.logger.error).toHaveBeenCalledWith('Error while getting local balance', expect.any(Error))
  })

  it('zeroes localBalance on NO_ACCOUNT_ERROR', async () => {
    state.localBalance = 42_000
    state.remoteAddress = undefined
    state.getBalance.mockResolvedValue({ data: 0, error: 'No account found' })
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.localBalance).toBe(0)
  })

  it('keeps the previous remote balance when remote balance lookup fails', async () => {
    state.remoteBalance = 350_000
    state.remoteSigner = { ...{ active: true, balance: 350_000, address: state.remoteAddress, publicKey: 'k', start: 0, end: 0, proofSize: 98 } }
    state.getBalance.mockImplementation((address: any) => {
      if (address?.toUserFriendlyAddress?.() === 'NQ11 TEST REMOTE ADDRESS')
        return Promise.resolve({ data: undefined, error: new Error('temporary consensus failure') })
      return Promise.resolve({ data: 0, error: undefined })
    })
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.remoteBalance).toBe(350_000)
    expect(state.logger.error).toHaveBeenCalledWith('Error while getting remote balance', expect.any(Error))
  })

  it('falls back to remoteSigner.balance when consensus is not established', async () => {
    state.consensus = 'syncing'
    state.remoteBalance = 0
    state.remoteSigner = { balance: 777 }
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.remoteBalance).toBe(777)
  })

  it('discovers HTLC extension when remote balance is zero and updates the signer', async () => {
    const extensionTx = {
      transactionHash: 'extension-hash',
      recipient: 'NQ44 EXTENSION HTLC ADDRESS',
      data: { hashRoot: '0000000000000000000000000000000000000000000000000000000000000000' },
      timestamp: 150_000,
      validityStartHeight: 150,
    }
    state.remoteBalance = 10_000
    state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([extensionTx] as any)
    // Second pass returns the newly discovered address to break the rerun loop.
    state.getAllRemoteSigners
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ address: createAddress('NQ44 EXTENSION HTLC ADDRESS') }] as any)
    state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 123_000, timeout: 300_000 })) as any
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.client.getAccount).toHaveBeenCalledWith('NQ44 EXTENSION HTLC ADDRESS')
    expect(state.updateRemoteSigner).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      balance: 123_000,
    }))
  })

  it('logs HTLC extension errors and continues balance updates', async () => {
    const extensionTx = {
      transactionHash: 'extension-hash',
      recipient: 'NQ44 EXTENSION HTLC ADDRESS',
      data: { hashRoot: '0000000000000000000000000000000000000000000000000000000000000000' },
      timestamp: 150_000,
      validityStartHeight: 150,
    }
    const extensionError = new Error('account lookup failed')
    state.remoteBalance = 10_000
    state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([extensionTx] as any)
    state.getAllRemoteSigners.mockResolvedValue([])
    state.client.getAccount = vi.fn().mockRejectedValueOnce(extensionError) as any
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.logger.error).toHaveBeenCalledWith('Error while checking HTLC extension transaction', extensionError)
  })

  it('skips HTLC extension discovery when remote balance lookup failed', async () => {
    state.remoteBalance = 0
    state.getBalance.mockImplementation((address: any) => {
      if (address?.toUserFriendlyAddress?.() === 'NQ11 TEST REMOTE ADDRESS')
        return Promise.resolve({ data: undefined, error: new Error('boom') })
      return Promise.resolve({ data: 0, error: undefined })
    })
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.getAllOutgoingTransactionsFromHtlcs).not.toHaveBeenCalled()
  })

  it('skips HTLC extension discovery when remote balance is non-zero', async () => {
    state.getBalance.mockImplementation((address: any) => {
      if (address?.toUserFriendlyAddress?.() === 'NQ11 TEST REMOTE ADDRESS')
        return Promise.resolve({ data: 5_000, error: undefined })
      return Promise.resolve({ data: 0, error: undefined })
    })
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.getAllOutgoingTransactionsFromHtlcs).not.toHaveBeenCalled()
  })

  it('updates points balance every 10 blocks', async () => {
    state.height = 100
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.updatePointsBalance).toHaveBeenCalled()
  })

  it('does not update points balance when height is not a multiple of 10', async () => {
    state.height = 101
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    expect(state.updatePointsBalance).not.toHaveBeenCalled()
  })

  it('reruns updateBalancesOnce when shouldUpdateBalancesAgain is set during HTLC discovery', async () => {
    const extensionTx = {
      transactionHash: 'extension-hash',
      recipient: 'NQ44 EXTENSION HTLC ADDRESS',
      data: { hashRoot: '0000000000000000000000000000000000000000000000000000000000000000' },
      timestamp: 150_000,
      validityStartHeight: 150,
    }
    state.remoteBalance = 10_000
    state.getAllOutgoingTransactionsFromHtlcs.mockResolvedValue([extensionTx] as any)
    state.getAllRemoteSigners
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ address: createAddress('NQ44 EXTENSION HTLC ADDRESS') }] as any)
    state.client.getAccount = vi.fn(() => Promise.resolve({ type: 'htlc', balance: 123_000, timeout: 300_000 })) as any
    const { useSyncBalances } = await import('./balances')
    await useSyncBalances().updateBalances()
    // Local + remote getBalance pairs across the two update passes (initial + rerun).
    expect(state.getBalance.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
