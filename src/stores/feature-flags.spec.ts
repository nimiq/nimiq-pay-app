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
