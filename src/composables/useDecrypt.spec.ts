import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  sqlite: {
    isSecretStored: vi.fn(async () => ({ result: true })),
    checkEncryptionSecret: vi.fn(),
  },
  openDb: vi.fn(async () => {}),
  closeDb: vi.fn(async () => {}),
  setEntropy: vi.fn(async () => {}),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({ sqlite: mocks.sqlite, open: mocks.openDb, close: mocks.closeDb, isOpen: ref(false) }),
}))
vi.mock('@/stores/app', () => ({
  useApp: () => ({
    pinHash: ref(''),
    setEntropy: mocks.setEntropy,
    updatePinInputTs: vi.fn(),
    migrateTopUpAddresses: vi.fn(async () => {}),
  }),
}))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => ({ isWeb: false }) }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (msg: string) => msg } }))

// Resolves checkEncryptionSecret calls by hand, in call order, to hold a decrypt mid-flight.
function deferSecretChecks() {
  const pending: Array<(valid: boolean) => void> = []
  mocks.sqlite.checkEncryptionSecret.mockImplementation(() => new Promise((resolve) => {
    pending.push(valid => resolve({ result: valid }))
  }))
  return pending
}

describe('useDecrypt decrypt', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
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
    expect(mocks.sqlite.checkEncryptionSecret).toHaveBeenCalledTimes(1)
    expect(mocks.openDb).toHaveBeenCalledTimes(1)
    expect(mocks.setEntropy).toHaveBeenCalledTimes(1)
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
    expect(mocks.sqlite.checkEncryptionSecret).toHaveBeenLastCalledWith('1111')
    checks[1](true)

    await expect(right).resolves.toBeUndefined()
    expect(mocks.openDb).toHaveBeenCalledTimes(1)
    expect(decrypted.value).toBe(true)
  })
})
