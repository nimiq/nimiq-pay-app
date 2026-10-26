import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDecrypt } from './useDecrypt'

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    conn: {
      sqlite: { changeEncryptionSecret: vi.fn(async () => { calls.push('rekey') }) },
      open: vi.fn(async () => { calls.push('open') }),
      close: vi.fn(async () => { calls.push('close') }),
      isOpen: true,
    },
    app: { pinHash: '' },
  }
})

vi.mock('pinia', () => ({ storeToRefs: (store: Record<string, unknown>) => Object.fromEntries(Object.keys(store).map(k => [k, ref(store[k])])) }))
vi.mock('@/stores/conn', () => ({ useConn: () => mocks.conn }))
vi.mock('@/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => ({ isWeb: false }) }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), error: vi.fn() }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))

describe('changePin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls.length = 0
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
