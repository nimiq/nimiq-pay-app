import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { Asset } from '@/lib/assets'
import { SQLQuery } from '@/lib/sql-queries'

vi.mock('@vueuse/core', () => ({
  // useLogger (imported by app.ts) debounces its log flush at module load.
  useDebounceFn: <T>(fn: T) => fn,
  useStorageAsync: <T>(_key: string, defaultValue: T) => {
    const value = Array.isArray(defaultValue)
      ? [...defaultValue] as T
      : defaultValue && typeof defaultValue === 'object'
        ? { ...defaultValue } as T
        : defaultValue

    return ref(value)
  },
}))

vi.mock('motion-v', () => ({
  useReducedMotion: () => ref(false),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  guessUserLanguage: () => 'en',
}))

vi.mock('@/lib', () => ({
  nakaBufferAddresses: [],
}))

const { queryMock, runMock } = vi.hoisted(() => ({ queryMock: vi.fn(), runMock: vi.fn() }))

vi.mock('./conn', () => ({
  useConn: () => ({ query: queryMock, run: runMock }),
}))

describe('useApp withdrawal storage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    queryMock.mockReset().mockResolvedValue(undefined)
    runMock.mockReset().mockResolvedValue(undefined)
  })

  it('keeps the selected withdrawal address separated by active asset', async () => {
    const { useApp } = await import('./app')
    const app = useApp()

    app.activeAsset = Asset.NIM
    app.withdrawalAddress = 'NQ00 NIM ADDRESS'

    app.activeAsset = Asset.USDT
    expect(app.withdrawalAddress).toBe('')

    app.withdrawalAddress = '0x1111111111111111111111111111111111111111'

    app.activeAsset = Asset.NIM
    expect(app.withdrawalAddress).toBe('NQ00 NIM ADDRESS')

    app.activeAsset = Asset.USDT
    expect(app.withdrawalAddress).toBe('0x1111111111111111111111111111111111111111')
  })

  it('keeps more than three withdrawal addresses for history reconstruction', async () => {
    const { useApp } = await import('./app')
    const app = useApp()

    app.addNewWithdrawalAddress('0x0000000000000000000000000000000000000001')
    app.addNewWithdrawalAddress('0x0000000000000000000000000000000000000002')
    app.addNewWithdrawalAddress('0x0000000000000000000000000000000000000003')
    app.addNewWithdrawalAddress('0x0000000000000000000000000000000000000004')

    expect(app.withdrawalAddressesHistory).toEqual([
      { address: '0x0000000000000000000000000000000000000001' },
      { address: '0x0000000000000000000000000000000000000002' },
      { address: '0x0000000000000000000000000000000000000003' },
      { address: '0x0000000000000000000000000000000000000004' },
    ])
  })

  it('sets and clears an alias for a withdrawal address', async () => {
    const { useApp } = await import('./app')
    const app = useApp()

    app.addNewWithdrawalAddress('NQ77 ALICE')
    app.setAddressAlias('NQ77 ALICE', 'Alice')
    expect(app.getAlias('NQ77 ALICE')).toBe('Alice')

    app.setAddressAlias('NQ77 ALICE', '')
    expect(app.getAlias('NQ77 ALICE')).toBeUndefined()
  })

  it('looks up Ethereum aliases case-insensitively', async () => {
    const { useApp } = await import('./app')
    const app = useApp()

    const checksummed = '0xAbCdEf0000000000000000000000000000000001'
    const lower = checksummed.toLowerCase()
    app.addNewWithdrawalAddress(checksummed, 'Kraken')

    expect(app.getAlias(checksummed)).toBe('Kraken')
    expect(app.getAlias(lower)).toBe('Kraken')
  })

  it('preserves an existing alias when re-adding the same address', async () => {
    const { useApp } = await import('./app')
    const app = useApp()

    app.addNewWithdrawalAddress('NQ77 BOB', 'Bob')
    app.addNewWithdrawalAddress('NQ77 BOB')

    expect(app.withdrawalAddressesHistory).toEqual([{ address: 'NQ77 BOB', alias: 'Bob' }])
  })

  // New-wallet entropy needs the Nimiq WASM CSPRNG. When the global is unavailable (undefined in
  // this spec) setEntropy must reject — no silent fallback — so the caller surfaces an error.
  it('rejects entropy generation when the Nimiq global is unavailable', async () => {
    const { useApp } = await import('./app')
    const app = useApp()

    await expect(app.setEntropy()).rejects.toThrow()
    expect(app.entropy).toBe('')
  })

  it('reports whether an address is already saved', async () => {
    const { useApp } = await import('./app')
    const app = useApp()

    expect(app.isSavedAddress('NQ77 ZARA')).toBe(false)
    app.addNewWithdrawalAddress('NQ77 ZARA')
    expect(app.isSavedAddress('NQ77 ZARA')).toBe(true)
  })

  describe('topUpAddresses migration (APP-171)', () => {
    it('folds aliased entries into withdrawal history and drops the unaliased ones', async () => {
      queryMock.mockResolvedValueOnce({ value: JSON.stringify([
        { address: 'NQ77 ALICE', alias: 'Alice' },
        { address: 'NQ00 NOALIAS' },
      ]) })
      const { useApp } = await import('./app')
      const app = useApp()

      await app.migrateTopUpAddresses()

      expect(app.withdrawalAddressesHistory).toEqual([{ address: 'NQ77 ALICE', alias: 'Alice' }])
      expect(runMock).toHaveBeenCalledWith(SQLQuery.DeleteKv, ['topUpAddresses'])
    })

    it('does not clobber existing history and is a no-op when the key is gone', async () => {
      // queryMock defaults to undefined → no topUpAddresses key
      const { useApp } = await import('./app')
      const app = useApp()
      app.addNewWithdrawalAddress('NQ11 EXISTING', 'Existing')

      await app.migrateTopUpAddresses()

      expect(app.withdrawalAddressesHistory).toEqual([{ address: 'NQ11 EXISTING', alias: 'Existing' }])
      expect(runMock).not.toHaveBeenCalledWith(SQLQuery.DeleteKv, ['topUpAddresses'])
    })
  })
})
