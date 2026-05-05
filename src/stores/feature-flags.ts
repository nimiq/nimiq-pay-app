import { Posthog } from '@capawesome/capacitor-posthog'
import { computedAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { isTestnet } from '@/lib'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { polygonRpcOverride } from '@/lib/polygon/rpc-override'

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

  const polygonRpcUrl = computedAsync(async () => {
    // Dev override (set via DevModal) wins over everything else.
    if (polygonRpcOverride) {
      logger.log('Polygon RPC override active', polygonRpcOverride)
      return polygonRpcOverride
    }
    // Testnet override supersedes the mainnet PostHog flag.
    if (isTestnet) {
      logger.log('Testnet override active — using Polygon testnet RPC', polygonUsdtConfig.rpcUrl)
      return polygonUsdtConfig.rpcUrl
    }
    try {
      const { value } = await Posthog.getFeatureFlagPayload({ key: 'polygon-rpc-endpoint' })
      if (typeof value === 'string' && value) {
        logger.log('Using Polygon RPC URL from feature flag', value)
        return value
      }
      else {
        logger.log('Polygon RPC URL feature flag is not set or invalid, using default config value', { payload: value, default: polygonUsdtConfig.rpcUrl })
      }
    }
    catch (error) {
      logger.error('Error fetching Polygon RPC URL feature flag:', error)
    }
    return polygonUsdtConfig.rpcUrl
  }, polygonRpcOverride ?? polygonUsdtConfig.rpcUrl)

  return {
    isNakaAvailable,
    polygonRpcUrl,
  }
})
