import { Posthog } from '@capawesome/capacitor-posthog'
import { computedAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('FeatureFlagsStore')

export const useFeatureFlags = defineStore('featureFlags', () => {
  const isNakaAvailable = computedAsync(async () => {
    try {
      const { enabled } = await Posthog.isFeatureEnabled({ key: 'naka-card' })
      logger.log(`NAKA feature flag is ${enabled ? 'enabled' : 'disabled'}`)
      return enabled
    }
    catch (error) {
      logger.error('Error checking NAKA feature flag:', error)
      return false
    }
  }, false)

  return {
    isNakaAvailable,
  }
})
