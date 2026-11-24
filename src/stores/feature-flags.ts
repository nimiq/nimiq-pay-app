import { Posthog } from '@capawesome/capacitor-posthog'
import { computedAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { polygonRpcOverride } from '@/lib/polygon/rpc-override'

const logger = useLogger('FeatureFlagsStore')

export const useFeatureFlags = defineStore('featureFlags', () => {
  const isUsdtMaintenanceActive = ref(false)
  const usdtMaintenanceMessage = ref<string | null>(null)
  const usdtMaintenanceNotice = computed(() => usdtMaintenanceMessage.value || i18n.t('USDT payments are temporarily unavailable due to maintenance. Please try again later.'))
  let usdtRefreshId = 0

  async function refreshUsdtMaintenance() {
    const refreshId = ++usdtRefreshId
    try {
      const { value } = await Posthog.getFeatureFlag({ key: 'usdt-maintenance' })
      if (refreshId !== usdtRefreshId)
        return
      isUsdtMaintenanceActive.value = value === true
      usdtMaintenanceMessage.value = null
      if (!isUsdtMaintenanceActive.value)
        return
    }
    catch (error) {
      logger.error('Error checking USDT maintenance flag:', error)
      return
    }

    try {
      const { value } = await Posthog.getFeatureFlagPayload({ key: 'usdt-maintenance' })
      if (refreshId === usdtRefreshId && typeof value === 'string' && value.trim())
        usdtMaintenanceMessage.value = value.trim()
    }
    catch (error) {
      logger.error('Error fetching USDT maintenance notice:', error)
    }
  }
  void refreshUsdtMaintenance()

  const isCryptocityPointsEnabled = ref(false)
  async function refreshCryptocityPoints() {
    try {
      const { value } = await Posthog.getFeatureFlag({ key: 'cryptocity-points' })
      isCryptocityPointsEnabled.value = value === true
    }
    catch (error) {
      logger.error('Error checking Cryptocity Points flag:', error)
    }
  }
  void refreshCryptocityPoints()

  const polygonRpcUrl = computedAsync(async () => {
    if (polygonRpcOverride) {
      logger.log('Polygon RPC override active', polygonRpcOverride)
      return polygonRpcOverride
    }
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
    isUsdtMaintenanceActive,
    usdtMaintenanceNotice,
    refreshUsdtMaintenance,
    isCryptocityPointsEnabled,
    refreshCryptocityPoints,
    polygonRpcUrl,
  }
})
