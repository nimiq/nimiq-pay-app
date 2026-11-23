import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const get = vi.fn()
const app = reactive({ entropy: '', address: 'NQ07 AAAA' })
vi.mock('@aparajita/capacitor-secure-storage', async () => {
  const actual = await vi.importActual<typeof import('@aparajita/capacitor-secure-storage')>('@aparajita/capacitor-secure-storage')
  return { ...actual, SecureStorage: { get } }
})
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: () => ({ hasLocalWallet: !!app.entropy, localAddress: { toUserFriendlyAddress: () => app.address } }) }))

const { StorageError, StorageErrorType } = await import('@aparajita/capacitor-secure-storage')
const { accountKey, currentAccountKey, readSavedWidgets, widgetAccountKey } = await import('./mini-app-widget-accounts')

beforeEach(() => {
  vi.useRealTimers()
  get.mockReset()
  app.entropy = ''
  app.address = 'NQ07 AAAA'
})

describe('the key', () => {
  it('differs by account and does not hold the address', () => {
    const a = widgetAccountKey('NQ07 AAAA')
    expect(a).toMatch(/^miniAppWidgets:v1:[0-9a-f]{64}$/)
    expect(widgetAccountKey('NQ07 BBBB')).not.toBe(a)
    expect(a).not.toContain('AAAA')
  })

  it('is the unlocked wallet\'s, and none while no wallet is unlocked', () => {
    expect(currentAccountKey()).toBeUndefined()
    app.entropy = 'abc'
    expect(currentAccountKey()).toBe(widgetAccountKey('NQ07 AAAA'))
  })

  it('waits for the wallet, which is read after the database opens', async () => {
    const key = accountKey()
    await Promise.resolve()
    app.entropy = 'abc'
    await expect(key).resolves.toBe(widgetAccountKey('NQ07 AAAA'))
  })

  it('gives up waiting for the wallet after 5 s', async () => {
    vi.useFakeTimers()
    const key = accountKey().then(() => 'answered', () => 'failed')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await key).toBe('failed')
  })
})

describe('reading', () => {
  it('asks the device\'s store only, never iCloud', async () => {
    get.mockResolvedValue([{ widgetId: 'swap' }])
    await expect(readSavedWidgets('k')).resolves.toEqual([{ widgetId: 'swap' }])
    expect(get).toHaveBeenCalledWith('k', false, false)
  })

  it.each([
    ['nothing saved', () => get.mockResolvedValue(null)],
    ['not a list', () => get.mockResolvedValue({ widgetId: 'swap' })],
    ['an entry it can never read', () => get.mockRejectedValue(new StorageError('Invalid data', StorageErrorType.invalidData))],
  ])('answers none for %s', async (_, given) => {
    given()
    await expect(readSavedWidgets('k')).resolves.toEqual([])
  })

  it.each([
    ['an error of the system', new StorageError('busy', StorageErrorType.osError)],
    ['an unknown error', new StorageError('?', StorageErrorType.unknownError)],
    ['another failure', new Error('bridge')],
  ])('fails on %s, which may pass', async (_, error) => {
    get.mockRejectedValue(error)
    await expect(readSavedWidgets('k')).rejects.toBe(error)
  })

  it('fails after 5 s without an answer', async () => {
    vi.useFakeTimers()
    get.mockReturnValue(new Promise(() => {}))
    const read = readSavedWidgets('k').catch(error => error)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await read).toBeInstanceOf(Error)
  })
})
