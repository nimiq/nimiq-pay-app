import { createPinia, defineStore, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

const state = vi.hoisted(() => ({
  isNetworkReconnecting: false,
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    state.logger.warn.mockReset()
    state.logger.error.mockReset()
    vi.stubGlobal('Nimiq', {
      default: vi.fn(),
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

  async function initWithPendingHeadBlocks() {
    let onHeadChanged!: (hash: string) => Promise<void>
    const pendingBlocks: ((block: any) => void)[] = []
    const client = {
      getHeadBlock: vi.fn().mockResolvedValue({ hash: 'h0', height: 100, type: 'micro' }),
      getNetworkId: vi.fn().mockResolvedValue(5),
      getBlock: vi.fn(() => new Promise(resolve => pendingBlocks.push(resolve))),
      addConsensusChangedListener: vi.fn(),
      addHeadChangedListener: vi.fn((listener: typeof onHeadChanged) => onHeadChanged = listener),
      addPeerChangedListener: vi.fn(),
    }
    vi.mocked(Nimiq.Client.create).mockResolvedValue(client as any)
    const { useNimiqNetwork } = await import('./nimiq-network')
    const store = useNimiqNetwork()
    await store.init()
    return { store, onHeadChanged, pendingBlocks }
  }

  it('keeps the newest head when an older getBlock resolves last', async () => {
    const { store, onHeadChanged, pendingBlocks } = await initWithPendingHeadBlocks()

    const older = onHeadChanged('h1')
    const newer = onHeadChanged('h2')
    const newest = onHeadChanged('h3')
    pendingBlocks[1]({ hash: 'h2', height: 102, type: 'micro' })
    await newer
    // Applied without waiting for the newest event
    expect(store.head).toMatchObject({ hash: 'h2', height: 102 })

    pendingBlocks[0]({ hash: 'h1', height: 101, type: 'micro' })
    await older
    expect(store.head).toMatchObject({ hash: 'h2', height: 102 })
    expect(store.height).toBe(102)

    pendingBlocks[2]({ hash: 'h3', height: 103, type: 'micro' })
    await newest
    expect(store.head).toMatchObject({ hash: 'h3', height: 103 })
  })

  // On device, a macro block fires the head event twice, then the next micro block follows ~6ms later
  it.each([
    ['in order', [0, 1, 2]],
    ['micro first', [2, 0, 1]],
    ['one macro before micro, one after', [0, 2, 1]],
  ])('records a double macro head event followed by a micro block, resolved %s', async (_, order) => {
    const { store, onHeadChanged, pendingBlocks } = await initWithPendingHeadBlocks()
    const blocks = [
      { hash: 'macro', height: 120, type: 'macro' },
      { hash: 'macro', height: 120, type: 'macro' },
      { hash: 'micro', height: 121, type: 'micro' },
    ]

    const events = blocks.map(block => onHeadChanged(block.hash))
    for (const index of order) {
      pendingBlocks[index](blocks[index])
      await events[index]
    }

    expect(store.head).toMatchObject({ hash: 'micro', height: 121 })
    expect(store.lastMacroBlockHeight).toBe(120)
  })

  it('keeps a skip block that replaced a micro block at the same height when the micro block resolves last', async () => {
    const { store, onHeadChanged, pendingBlocks } = await initWithPendingHeadBlocks()

    const micro = onHeadChanged('micro')
    const skip = onHeadChanged('skip')
    pendingBlocks[1]({ hash: 'skip', height: 101, type: 'micro' })
    await skip
    pendingBlocks[0]({ hash: 'micro', height: 101, type: 'micro' })
    await micro

    expect(store.head).toMatchObject({ hash: 'skip', height: 101 })
  })

  // Albatross prefers the branch with the earlier skip block, even when it is shorter
  it('follows a rebranch to a lower head', async () => {
    const { store, onHeadChanged, pendingBlocks } = await initWithPendingHeadBlocks()

    const micro = onHeadChanged('micro')
    pendingBlocks[0]({ hash: 'micro', height: 102, type: 'micro' })
    await micro
    const skip = onHeadChanged('skip')
    pendingBlocks[1]({ hash: 'skip', height: 100, type: 'micro' })
    await skip

    expect(store.head).toMatchObject({ hash: 'skip', height: 100 })
    expect(store.height).toBe(100)
  })

  it('never lowers lastMacroBlockHeight when an older macro block resolves last', async () => {
    const { store, onHeadChanged, pendingBlocks } = await initWithPendingHeadBlocks()

    const older = onHeadChanged('m1')
    const newer = onHeadChanged('m2')
    pendingBlocks[1]({ hash: 'm2', height: 180, type: 'macro' })
    await newer
    pendingBlocks[0]({ hash: 'm1', height: 120, type: 'macro' })
    await older

    expect(store.head).toMatchObject({ hash: 'm2', height: 180 })
    expect(store.lastMacroBlockHeight).toBe(180)
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

  it('releases the reconnect lock when consensus never returns', async () => {
    vi.useFakeTimers()
    const client = {
      disconnectNetwork: vi.fn(() => Promise.resolve()),
      connectNetwork: vi.fn(() => Promise.resolve()),
    }
    const { useNimiqNetwork } = await import('./nimiq-network')
    const store = useNimiqNetwork()
    store.client = client as any
    store.peerCount = 0
    store.consensus = 'connecting'

    const first = store.reconnect()
    await vi.advanceTimersByTimeAsync(2 * 60 * 1e3)
    await first

    expect(state.isNetworkReconnecting).toBe(false)
    expect(state.logger.warn).toHaveBeenCalledWith('Reconnect timed out waiting for consensus', expect.anything())

    const second = store.reconnect()
    expect(second).not.toBe(first)
    await vi.advanceTimersByTimeAsync(0)
    expect(client.disconnectNetwork).toHaveBeenCalledTimes(2)
  })

  it('logs a failed reconnect and releases the lock', async () => {
    const error = new Error('connect failed')
    const { useNimiqNetwork } = await import('./nimiq-network')
    const store = useNimiqNetwork()
    store.client = {
      disconnectNetwork: vi.fn(() => Promise.resolve()),
      connectNetwork: vi.fn(() => Promise.reject(error)),
    } as any
    store.peerCount = 0

    await expect(store.reconnect()).resolves.toBeUndefined()
    expect(state.isNetworkReconnecting).toBe(false)
    expect(state.logger.error).toHaveBeenCalledWith('Reconnect failed', error)
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
