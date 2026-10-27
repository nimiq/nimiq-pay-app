import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDecrypt } from './useDecrypt'

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    conn: {
      sqlite: {
        isSecretStored: vi.fn(async () => ({ result: true })),
        checkEncryptionSecret: vi.fn(),
        changeEncryptionSecret: vi.fn(async () => { calls.push('rekey') }),
      },
      open: vi.fn(async () => { calls.push('open') }),
      close: vi.fn(async () => { calls.push('close') }),
      isOpen: true,
    },
    app: {
      pinHash: '',
      setEntropy: vi.fn(async () => {}),
      updatePinInputTs: vi.fn(),
      migrateTopUpAddresses: vi.fn(async () => {}),
    },
  }
})

vi.mock('pinia', () => ({ storeToRefs: (store: Record<string, unknown>) => Object.fromEntries(Object.keys(store).map(k => [k, ref(store[k])])) }))
vi.mock('@/stores/conn', () => ({ useConn: () => mocks.conn }))
vi.mock('@/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => ({ isWeb: false }) }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))

// Resolves checkEncryptionSecret calls by hand, in call order, to hold a decrypt mid-flight.
function deferSecretChecks() {
  const pending: Array<(valid: boolean) => void> = []
  mocks.conn.sqlite.checkEncryptionSecret.mockImplementation(() => new Promise((resolve) => {
    pending.push(valid => resolve({ result: valid }))
  }))
  return pending
}

describe('useDecrypt decrypt', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.conn.isOpen = false
  })

  it('runs the unlock once when a second submit lands mid-decrypt', async () => {
    const checks = deferSecretChecks()
    const { useDecrypt } = await import('./useDecrypt')
    const { decrypt, decrypted } = useDecrypt()

    const first = decrypt('1111')
    const second = decrypt('1111')
    await vi.waitFor(() => expect(checks).toHaveLength(1))
    checks[0](true)

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(mocks.conn.sqlite.checkEncryptionSecret).toHaveBeenCalledTimes(1)
    expect(mocks.conn.open).toHaveBeenCalledTimes(1)
    expect(mocks.app.setEntropy).toHaveBeenCalledTimes(1)
    expect(decrypted.value).toBe(true)
  })

  it('runs a later submit with its own PIN only after a failed one settles', async () => {
    const checks = deferSecretChecks()
    const { useDecrypt } = await import('./useDecrypt')
    const { decrypt, decrypted } = useDecrypt()

    const wrong = decrypt('0000')
    const right = decrypt('1111')
    await vi.waitFor(() => expect(checks).toHaveLength(1))
    // The second submit must not start while the first is still running.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(checks).toHaveLength(1)

    checks[0](false)
    await expect(wrong).resolves.toBe('Invalid PIN')
    await vi.waitFor(() => expect(checks).toHaveLength(2))
    expect(mocks.conn.sqlite.checkEncryptionSecret).toHaveBeenLastCalledWith('1111')
    checks[1](true)

    await expect(right).resolves.toBeUndefined()
    expect(mocks.conn.open).toHaveBeenCalledTimes(1)
    expect(decrypted.value).toBe(true)
  })
})

describe('changePin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls.length = 0
    mocks.conn.isOpen = true
  })

  it('closes the db before the native rekey and reopens it after', async () => {
    await expect(useDecrypt().changePin('2222', '1111')).resolves.toBeUndefined()
    expect(mocks.calls).toEqual(['close', 'rekey', 'open'])
  })

  it('reopens the db when the rekey fails so queries are not left waiting', async () => {
    mocks.conn.sqlite.changeEncryptionSecret.mockRejectedValueOnce(new Error('Oldpassphrase is wrong secret'))
    await expect(useDecrypt().changePin('2222', '1111')).resolves.toBe('Something went wrong changing the PIN')
    expect(mocks.calls).toEqual(['close', 'open'])
  })

  it('reports an error when the reopen fails', async () => {
    mocks.conn.open.mockRejectedValueOnce(new Error('Operation timed out'))
    await expect(useDecrypt().changePin('2222', '1111')).resolves.toBe('Something went wrong changing the PIN')
    expect(mocks.calls).toEqual(['close', 'rekey'])
  })
})
