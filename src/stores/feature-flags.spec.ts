import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { useFeatureFlags } from './feature-flags'

const posthog = vi.hoisted(() => ({
  getFeatureFlag: vi.fn(),
  getFeatureFlagPayload: vi.fn(),
  isFeatureEnabled: vi.fn(),
}))

vi.mock('@capawesome/capacitor-posthog', () => ({ Posthog: posthog }))
const preferences = vi.hoisted(() => ({ get: vi.fn(async () => ({ value: null as string | null })), set: vi.fn(async () => undefined) }))
vi.mock('@capacitor/preferences', () => ({ Preferences: preferences }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), error: vi.fn() }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))
vi.mock('@/lib', () => ({ isTestnet: true }))

describe('maintenance flag for USDT', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    posthog.getFeatureFlag.mockResolvedValue({ value: null })
    posthog.getFeatureFlagPayload.mockResolvedValue({ value: null })
    posthog.isFeatureEnabled.mockResolvedValue({ enabled: false })
  })

  afterEach(() => {
    useFeatureFlags().$dispose()
  })

  it('keeps payments available when the flag is missing', async () => {
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.isUsdtMaintenanceActive).toBe(false)
    expect(posthog.getFeatureFlagPayload).not.toHaveBeenCalledWith({ key: 'usdt-maintenance' })
  })

  it('uses the built-in notice when maintenance has no payload', async () => {
    posthog.getFeatureFlag.mockResolvedValue({ value: true })
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.isUsdtMaintenanceActive).toBe(true)
    expect(flags.usdtMaintenanceNotice).toBe('USDT payments are temporarily unavailable due to maintenance. Please try again later.')
  })

  it('uses the PostHog notice and clears it when maintenance ends', async () => {
    posthog.getFeatureFlag.mockResolvedValue({ value: true })
    posthog.getFeatureFlagPayload.mockResolvedValue({ value: '  USDT upgrades in progress  ' })
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.usdtMaintenanceNotice).toBe('USDT upgrades in progress')

    posthog.getFeatureFlag.mockResolvedValue({ value: false })
    await flags.refreshUsdtMaintenance()
    expect(flags.isUsdtMaintenanceActive).toBe(false)
    expect(flags.usdtMaintenanceNotice).toBe('USDT payments are temporarily unavailable due to maintenance. Please try again later.')
  })

  it('keeps maintenance active if only the payload read fails', async () => {
    posthog.getFeatureFlag.mockResolvedValue({ value: true })
    posthog.getFeatureFlagPayload.mockRejectedValue(new Error('payload unavailable'))
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.isUsdtMaintenanceActive).toBe(true)
    expect(flags.usdtMaintenanceNotice).toContain('temporarily unavailable')
  })

  it('keeps payments available if the flag read fails', async () => {
    posthog.getFeatureFlag.mockRejectedValue(new Error('flags unavailable'))
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.isUsdtMaintenanceActive).toBe(false)
  })

  it('keeps the last active maintenance state if a later flag read fails', async () => {
    posthog.getFeatureFlag.mockResolvedValue({ value: true })
    posthog.getFeatureFlagPayload.mockResolvedValue({ value: 'Scheduled downtime' })
    const flags = useFeatureFlags()
    await flushPromises()

    posthog.getFeatureFlag.mockRejectedValue(new Error('flags unavailable'))
    await flags.refreshUsdtMaintenance()

    expect(flags.isUsdtMaintenanceActive).toBe(true)
    expect(flags.usdtMaintenanceNotice).toBe('Scheduled downtime')
  })
})

describe('cryptocity points flag', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    posthog.getFeatureFlag.mockResolvedValue({ value: null })
    posthog.getFeatureFlagPayload.mockResolvedValue({ value: null })
  })

  afterEach(() => {
    useFeatureFlags().$dispose()
  })

  it('hides points when the flag is missing', async () => {
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.isCryptocityPointsEnabled).toBe(false)
  })

  it('shows points when the flag is on and hides them once it is turned off', async () => {
    posthog.getFeatureFlag.mockImplementation(async ({ key }) => ({ value: key === 'cryptocity-points' }))
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.isCryptocityPointsEnabled).toBe(true)

    posthog.getFeatureFlag.mockResolvedValue({ value: false })
    await flags.refreshCryptocityPoints()
    expect(flags.isCryptocityPointsEnabled).toBe(false)
  })

  it('hides points if the flag read fails', async () => {
    posthog.getFeatureFlag.mockRejectedValue(new Error('flags unavailable'))
    const flags = useFeatureFlags()
    await flushPromises()

    expect(flags.isCryptocityPointsEnabled).toBe(false)
  })
})

describe('blocked widget origins', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    posthog.getFeatureFlag.mockResolvedValue({ value: null })
    posthog.getFeatureFlagPayload.mockResolvedValue({ value: null })
    posthog.isFeatureEnabled.mockResolvedValue({ enabled: false })
    preferences.get.mockResolvedValue({ value: null })
    preferences.set.mockResolvedValue(undefined)
  })

  afterEach(() => {
    useFeatureFlags().$dispose()
  })

  function payload(value: unknown) {
    posthog.getFeatureFlagPayload.mockImplementation(async ({ key }: { key: string }) => ({ value: key === 'mini-app-widgets' ? value : null }))
  }

  it('blocks nothing when the flag is missing', async () => {
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual([])
  })

  it.each([
    ['an object', { blockedOrigins: ['https://bad.example'] }],
    ['a JSON string', '{"blockedOrigins":["https://bad.example"]}'],
  ])('reads them from %s', async (_name, value) => {
    payload(value)
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
  })

  it.each([
    ['a list', '{blockedOrigins=[https://Bad.Example/app/, *]}', ['https://bad.example', '*']],
    ['an empty list', '{blockedOrigins=[]}', []],
    ['other keys', '{note=incident 12, blockedOrigins=[https://bad.example]}', ['https://bad.example']],
  ])('reads %s from the text Android hands over for an object payload', async (_name, value, expected) => {
    payload(value)
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual(expected)
  })

  it('normalises them, keeping *', async () => {
    payload({ blockedOrigins: ['https://Bad.Example/app/', '*'] })
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example', '*'])
  })

  it('keeps the last list when PostHog cannot answer', async () => {
    payload({ blockedOrigins: ['https://bad.example'] })
    const flags = useFeatureFlags()
    await flushPromises()
    posthog.getFeatureFlagPayload.mockRejectedValue(new Error('offline'))
    await flags.refreshBlockedWidgetOrigins()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
  })

  it.each([
    [null],
    ['not JSON'],
    ['{note=no list}'],
    ['{blockedOrigins=[null]}'],
    ['{blockedOrigins=[42, https://other.example]}'],
    ['{blockedOrigins=[{origin=https://other.example}]}'],
    [42],
    [{ blockedOrigins: 'https://bad.example' }],
    [{ blockedOrigins: [{ origin: 'https://other.example' }] }],
    [{ blockedOrigins: ['other.example'] }],
    [{ blockedOrigins: ['javascript:alert(1)'] }],
    [{}],
  ])('keeps the last list for the payload %j', async (value) => {
    payload({ blockedOrigins: ['https://bad.example'] })
    const flags = useFeatureFlags()
    await flushPromises()
    payload(value)
    await flags.refreshBlockedWidgetOrigins()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
  })

  it('lifts the block only with an empty list', async () => {
    payload({ blockedOrigins: ['https://bad.example'] })
    const flags = useFeatureFlags()
    await flushPromises()
    payload({ blockedOrigins: [] })
    await flags.refreshBlockedWidgetOrigins()
    expect(flags.blockedWidgetOrigins).toEqual([])
  })

  it('saves each list PostHog sends on the device', async () => {
    payload({ blockedOrigins: ['https://Bad.Example/app/'] })
    useFeatureFlags()
    await flushPromises()
    expect(preferences.set).toHaveBeenCalledWith({ key: 'blockedWidgetOrigins', value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
    payload(null)
    preferences.set.mockClear()
    await useFeatureFlags().refreshBlockedWidgetOrigins()
    expect(preferences.set).not.toHaveBeenCalled()
  })

  it('starts from the saved list while PostHog has no answer, also after a restart', async () => {
    preferences.get.mockResolvedValue({ value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
    const flags = useFeatureFlags()
    await flushPromises()
    expect(preferences.get).toHaveBeenCalledWith({ key: 'blockedWidgetOrigins' })
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
  })

  it('lets an answer from PostHog win over a saved list read after it', async () => {
    const saved = Promise.withResolvers<{ value: string }>()
    preferences.get.mockReturnValue(saved.promise)
    payload({ blockedOrigins: ['https://new.example'] })
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOriginsKnown).toBe(true)
    saved.resolve({ value: JSON.stringify({ blockedOrigins: ['https://old.example'] }) })
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual(['https://new.example'])
  })

  it('saves the latest list when refreshes overlap', async () => {
    preferences.get.mockResolvedValue({ value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
    const flags = useFeatureFlags()
    await flushPromises()
    const firstSave = Promise.withResolvers<undefined>()
    preferences.set.mockReturnValueOnce(firstSave.promise)
    payload({ blockedOrigins: [] })
    const lifting = flags.refreshBlockedWidgetOrigins()
    await flushPromises()
    payload({ blockedOrigins: ['https://bad.example'] })
    const blocking = flags.refreshBlockedWidgetOrigins()
    await flushPromises()
    firstSave.resolve(undefined)
    await Promise.all([lifting, blocking])
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
    expect(preferences.set).toHaveBeenLastCalledWith({ key: 'blockedWidgetOrigins', value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
  })

  it('neither saves nor replaces a list that did not change', async () => {
    preferences.get.mockResolvedValue({ value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
    payload({ blockedOrigins: ['https://bad.example'] })
    const flags = useFeatureFlags()
    await flushPromises()
    const list = flags.blockedWidgetOrigins
    await flags.refreshBlockedWidgetOrigins()
    expect(flags.blockedWidgetOrigins).toBe(list)
    expect(preferences.set).not.toHaveBeenCalled()
  })

  it('knows the block once the saved list is read, or could not be read', async () => {
    preferences.get.mockResolvedValue({ value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
    const flags = useFeatureFlags()
    expect(flags.blockedWidgetOriginsKnown).toBe(false)
    await flushPromises()
    expect(flags.blockedWidgetOriginsKnown).toBe(true)
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
    flags.$dispose()
    setActivePinia(createPinia())
    preferences.get.mockRejectedValue(new Error('storage'))
    const failed = useFeatureFlags()
    await flushPromises()
    expect(failed.blockedWidgetOriginsKnown).toBe(true)
  })

  it('stops waiting for the saved list after 5 s, and still applies it when it comes', async () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const saved = Promise.withResolvers<{ value: string }>()
    preferences.get.mockReturnValue(saved.promise)
    const flags = useFeatureFlags()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(flags.blockedWidgetOriginsKnown).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(flags.blockedWidgetOriginsKnown).toBe(true)
    saved.resolve({ value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
  })

  it('saves new lists even when the saved one never comes back', async () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    preferences.get.mockReturnValue(new Promise(() => {}))
    const flags = useFeatureFlags()
    await vi.advanceTimersByTimeAsync(5_000)
    payload({ blockedOrigins: ['https://bad.example'] })
    await flags.refreshBlockedWidgetOrigins()
    expect(preferences.set).toHaveBeenCalledWith({ key: 'blockedWidgetOrigins', value: JSON.stringify({ blockedOrigins: ['https://bad.example'] }) })
  })

  it('does not let a late read of the saved list hide a newer save', async () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const saved = Promise.withResolvers<{ value: string }>()
    preferences.get.mockReturnValue(saved.promise)
    const flags = useFeatureFlags()
    await vi.advanceTimersByTimeAsync(5_000)
    payload({ blockedOrigins: ['https://new.example'] })
    await flags.refreshBlockedWidgetOrigins()
    saved.resolve({ value: JSON.stringify({ blockedOrigins: ['https://old.example'] }) })
    await vi.advanceTimersByTimeAsync(0)
    payload({ blockedOrigins: ['https://old.example'] })
    await flags.refreshBlockedWidgetOrigins()
    expect(preferences.set).toHaveBeenLastCalledWith({ key: 'blockedWidgetOrigins', value: JSON.stringify({ blockedOrigins: ['https://old.example'] }) })
  })

  it('never lets an older answer replace a newer one', async () => {
    const flags = useFeatureFlags()
    await flushPromises()
    const older = Promise.withResolvers<{ value: unknown }>()
    posthog.getFeatureFlagPayload.mockReturnValueOnce(older.promise)
    const first = flags.refreshBlockedWidgetOrigins()
    payload({ blockedOrigins: ['https://new.example'] })
    await flags.refreshBlockedWidgetOrigins()
    older.resolve({ value: { blockedOrigins: ['https://old.example'] } })
    await first
    expect(flags.blockedWidgetOrigins).toEqual(['https://new.example'])
  })

  it('keeps working when the saved list cannot be read or written', async () => {
    preferences.get.mockRejectedValue(new Error('storage'))
    preferences.set.mockRejectedValue(new Error('storage'))
    payload({ blockedOrigins: ['https://bad.example'] })
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
  })
})
