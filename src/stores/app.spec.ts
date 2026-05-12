import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { Asset } from '@/lib/assets'

vi.mock('@vueuse/core', () => ({
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

vi.mock('./conn', () => ({
  useConn: () => ({
    query: vi.fn(),
    run: vi.fn(),
  }),
}))

describe('useApp withdrawal storage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
