import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFeatureFlags } from './feature-flags'

const posthog = vi.hoisted(() => ({
  getFeatureFlag: vi.fn(),
  getFeatureFlagPayload: vi.fn(),
  isFeatureEnabled: vi.fn(),
}))

vi.mock('@capawesome/capacitor-posthog', () => ({ Posthog: posthog }))
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

  it('normalises them, keeping *', async () => {
    payload({ blockedOrigins: ['https://Bad.Example/app/', '*'] })
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example', '*'])
  })

  it.each([['not JSON'], [42], [{ blockedOrigins: 'https://bad.example' }]])('blocks nothing for the malformed payload %j', async (value) => {
    payload(value)
    const flags = useFeatureFlags()
    await flushPromises()
    expect(flags.blockedWidgetOrigins).toEqual([])
  })

  it('keeps what it knows when PostHog cannot answer, and clears it when the block is lifted', async () => {
    payload({ blockedOrigins: ['https://bad.example'] })
    const flags = useFeatureFlags()
    await flushPromises()
    posthog.getFeatureFlagPayload.mockRejectedValue(new Error('offline'))
    await flags.refreshBlockedWidgetOrigins()
    expect(flags.blockedWidgetOrigins).toEqual(['https://bad.example'])
    payload(null)
    await flags.refreshBlockedWidgetOrigins()
    expect(flags.blockedWidgetOrigins).toEqual([])
  })
})
