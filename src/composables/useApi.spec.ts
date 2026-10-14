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
const logger = vi.hoisted(() => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }))

vi.mock('@/composables/useLogger', () => ({ useLogger: () => logger }))
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

  it('marks a rejection after reconnect as replayed', async () => {
    const { useRemoteSignerApi } = await import('./useApi')
    const request = useRemoteSignerApi().sendRawTransaction({ address: 'NQ00 OWNER', rawTx: 'serialized' })
    const { data: { id } } = JSON.parse(socket.send.mock.calls[0][0])
    socket.options.onConnected({ url: 'wss://cosigner' })
    socket.data.value = JSON.stringify({ event: 'error', data: { id, statusCode: 412 } })
    await nextTick()
    await expect(request).resolves.toMatchObject({ hasError: true, status: 412, replayed: true })
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

describe('points API failure logs', () => {
  beforeEach(() => logger.error.mockReset())

  afterEach(() => vi.unstubAllGlobals())

  it('logs neither the token nor phone credentials when a request throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const { usePointsApi } = await import('./useApi')
    const api = usePointsApi()

    await api.verify({ phoneNumber: '+34600000000', accessCode: '123456' })
    await api.payWithPoints({ token: 'secret-token', rail: 'cpl' as any, reference: 'ref-1', recipient: 'merchant' })

    const logged = JSON.stringify(logger.error.mock.calls)
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logged).not.toContain('secret-token')
    expect(logged).not.toContain('+34600000000')
    expect(logged).not.toContain('123456')
    expect(logged).toContain('ref-1')
    expect(logged).toContain('merchant')
  })

  it('logs neither the token nor phone credentials when an error response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })))
    const { usePointsApi } = await import('./useApi')
    const api = usePointsApi()

    await api.authorize({ phoneNumber: '+34600000000', publicKey: 'public-key' })
    await api.getBalance({ token: 'secret-token' })

    const logged = JSON.stringify(logger.error.mock.calls)
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logged).not.toContain('secret-token')
    expect(logged).not.toContain('+34600000000')
    expect(logged).not.toContain('public-key')
  })
})
