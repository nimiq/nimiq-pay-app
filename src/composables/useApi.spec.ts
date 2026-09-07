import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const socket = vi.hoisted(() => ({
  send: vi.fn(),
  options: undefined as any,
  data: undefined as any,
}))

vi.mock('@vueuse/core', () => ({
  useWebSocket: (_url: URL, options: unknown) => {
    socket.options = options
    socket.data = ref<string>()
    return { send: socket.send, data: socket.data }
  },
}))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))
vi.mock('@/lib/index', () => ({ isTestnet: true, isDev: true }))
vi.mock('@/lib/mock-mode', () => ({ isMockEnabled: false }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ language: 'en' }), Crypto: {}, DECIMALS: 1e5 }))
vi.mock('./useTime', () => ({ toSeconds: (time: number) => time / 1000 }))

describe('cosigner WebSocket requests', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    socket.send.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it('times out reads and removes them from the reconnect queue', async () => {
    const { useRemoteSignerApi } = await import('./useApi')
    let result: unknown
    void useRemoteSignerApi().getRemoteSigner({ address: { toUserFriendlyAddress: () => 'NQ00 OWNER' } as any }).then(value => result = value)

    await vi.advanceTimersByTimeAsync(30_001)

    expect(result).toMatchObject({ hasError: true, status: 504 })
    socket.send.mockClear()
    socket.options.onConnected({ url: 'wss://cosigner' })
    expect(socket.send).not.toHaveBeenCalled()
  })

  it('returns a successful read without replaying it on reconnect', async () => {
    const { useRemoteSignerApi } = await import('./useApi')
    const request = useRemoteSignerApi().getTransactionState({ hash: 'tx-hash' })
    const { data: { id } } = JSON.parse(socket.send.mock.calls[0][0])
    socket.data.value = JSON.stringify({ event: 'result', data: { id, payload: { state: 'confirmed' } } })
    await nextTick()

    await expect(request).resolves.toMatchObject({ data: { state: 'confirmed' }, hasError: false })
    await vi.advanceTimersByTimeAsync(30_001)
    socket.send.mockClear()
    socket.options.onConnected({ url: 'wss://cosigner' })
    expect(socket.send).not.toHaveBeenCalled()
  })

  it('preserves unresolved sends for the send pipeline to reconcile', async () => {
    const { useRemoteSignerApi } = await import('./useApi')
    let result: unknown
    const request = useRemoteSignerApi().sendRawTransaction({ address: 'NQ00 OWNER', rawTx: 'serialized' })
    void request.then(value => result = value)
    const { data: { id } } = JSON.parse(socket.send.mock.calls[0][0])

    await vi.advanceTimersByTimeAsync(30_001)
    expect(result).toBeUndefined()
    socket.options.onConnected({ url: 'wss://cosigner' })
    expect(socket.send).toHaveBeenCalledTimes(2)
    socket.data.value = JSON.stringify({ event: 'result', data: { id, payload: { txSent: true } } })
    await nextTick()
    await expect(request).resolves.toMatchObject({ data: { txSent: true }, hasError: false })
  })
})
