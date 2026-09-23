import { createPinia, defineStore, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

const state = vi.hoisted(() => ({
  isNetworkReconnecting: false,
  logger: { log: vi.fn(), error: vi.fn() },
}))

vi.mock('@/composables/useLogger', () => ({ useLogger: () => state.logger }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ setToast: vi.fn(), clearToast: vi.fn() }) }))
vi.mock('@/lib', () => ({ isTestnet: true }))
vi.mock('@/lib/analytics', () => ({ reportCriticalError: vi.fn(), trackConsensusEstablished: vi.fn() }))
vi.mock('@/stores/locks', () => {
  const useLocks = defineStore('locks', () => ({
    isNetworkReconnecting: computed({
      get: () => state.isNetworkReconnecting,
      set: value => state.isNetworkReconnecting = value,
    }),
    isAppStarting: computed({ get: () => false, set: () => undefined }),
  }))
  return { useLocks }
})

describe('useNimiqNetwork', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    state.isNetworkReconnecting = false
    state.logger.log.mockReset()
    state.logger.error.mockReset()
    vi.stubGlobal('Nimiq', {
      Client: { create: vi.fn() },
      ClientConfiguration: class {
        network() {}
        seedNodes() {}
        syncMode() {}
        build() { return {} }
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an account error instead of hanging balance recovery', async () => {
    vi.useFakeTimers()
    const { useNimiqNetwork } = await import('./nimiq-network')
    const store = useNimiqNetwork()
    store.client = { getAccount: vi.fn(() => new Promise(() => {})) } as any
    let result: unknown
    void store.getBalance({} as any).then(value => result = value)

    await vi.advanceTimersByTimeAsync(30_001)

    expect(result).toMatchObject({ error: 'Error getting balance' })
  })

  it.each([12_345_678, 0])('returns the on-chain balance including %d luna', async (balance) => {
    const address = { value: 'unrelated' }
    const getAccount = vi.fn().mockResolvedValue({ balance })
    const { useNimiqNetwork } = await import('./nimiq-network')
    const store = useNimiqNetwork()
    store.client = { getAccount } as any

    await expect(store.getBalance(address as any)).resolves.toEqual({ data: balance, error: undefined })
    expect(getAccount).toHaveBeenCalledWith(address)
  })

  it('returns a zero fallback with an error when the account lookup fails', async () => {
    const { useNimiqNetwork } = await import('./nimiq-network')
    const store = useNimiqNetwork()
    store.client = { getAccount: vi.fn().mockRejectedValue(new Error('network failed')) } as any

    await expect(store.getBalance({} as any)).resolves.toEqual({ data: 0, error: 'Error getting balance' })
  })

  it('waits for an active reconnect instead of resolving early', async () => {
    let resolveDisconnect!: () => void
    const client = {
      disconnectNetwork: vi.fn(() => new Promise<void>(resolve => resolveDisconnect = resolve)),
      connectNetwork: vi.fn(() => Promise.resolve()),
    }
    const { useNimiqNetwork } = await import('./nimiq-network')
    const store = useNimiqNetwork()
    store.client = client as any
    store.peerCount = 1
    store.consensus = 'connecting'

    const first = store.reconnect()
    const second = store.reconnect()
    let secondSettled = false
    void second.then(() => secondSettled = true)
    await Promise.resolve()

    expect(client.disconnectNetwork).toHaveBeenCalledOnce()
    expect(secondSettled).toBe(false)

    resolveDisconnect()
    store.peerCount = 0
    store.consensus = 'established'
    await Promise.all([first, second])
    expect(client.connectNetwork).toHaveBeenCalledOnce()
  })

  it('disconnects a history client when its consensus wait times out', async () => {
    vi.useFakeTimers()
    const historyClient = {
      waitForConsensusEstablished: vi.fn(() => new Promise(() => {})),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    }
    vi.mocked(Nimiq.Client.create).mockResolvedValue(historyClient as any)
    const { useNimiqNetwork } = await import('./nimiq-network')
    const request = expect(useNimiqNetwork().createHistoryClient()).rejects.toThrow('Operation timed out')
    await vi.waitFor(() => expect(historyClient.waitForConsensusEstablished).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(30_000)

    await request
    expect(historyClient.disconnectNetwork).toHaveBeenCalledOnce()
  })

  it('disconnects a history client created after the creation timeout', async () => {
    vi.useFakeTimers()
    let finishCreation!: (client: any) => void
    const historyClient = {
      waitForConsensusEstablished: vi.fn(() => Promise.resolve()),
      disconnectNetwork: vi.fn(() => Promise.resolve()),
    }
    vi.mocked(Nimiq.Client.create).mockImplementationOnce(() => new Promise(resolve => finishCreation = resolve))
    const { useNimiqNetwork } = await import('./nimiq-network')
    const request = expect(useNimiqNetwork().createHistoryClient()).rejects.toThrow('Operation timed out')
    await vi.advanceTimersByTimeAsync(30_000)
    await request

    finishCreation(historyClient as any)
    await vi.waitFor(() => expect(historyClient.disconnectNetwork).toHaveBeenCalledOnce())
    expect(historyClient.waitForConsensusEstablished).not.toHaveBeenCalled()
  })
})
