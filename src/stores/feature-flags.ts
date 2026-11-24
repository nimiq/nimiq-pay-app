import { Preferences } from '@capacitor/preferences'
import { Posthog } from '@capawesome/capacitor-posthog'
import { computedAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { polygonRpcOverride } from '@/lib/polygon/rpc-override'
import { safeOrigin } from '@/lib/url-safety'
import { promiseWithTimeout } from '@/lib/utils'

const logger = useLogger('FeatureFlagsStore')

const BLOCKED_WIDGET_ORIGINS_KEY = 'blockedWidgetOrigins'

/** Undefined when the payload holds no list: only a list, even an empty one, replaces the last one. */
function parseBlockedOrigins(raw: unknown): string[] | undefined {
  let payload = raw
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw
  }
  catch {
    // Android hands an object payload over as Java's text for a map: {blockedOrigins=[https://a.example, *]}.
    const listed = /(?:^\{|, )blockedOrigins=\[([^\]]*)\]/.exec(raw as string)
    if (!listed) {
      logger.error('The blocked widget origins are not JSON')
      return undefined
    }
    payload = { blockedOrigins: listed[1] ? listed[1].split(', ') : [] }
  }
  const origins = (payload as { blockedOrigins?: unknown } | null | undefined)?.blockedOrigins
  // Normalised, so that "https://Bad.Example/" still blocks the site during an incident.
  const normalised = Array.isArray(origins) ? origins.map(origin => origin === '*' ? origin : typeof origin === 'string' ? safeOrigin(origin, '') : '') : undefined
  // One entry that is neither "*" nor a site keeps the last list, so that a typo never lifts a block.
  return normalised?.every(origin => origin === '*' || /^https?:\/\//.test(origin)) ? normalised : undefined
}

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
  // Cold start read; App.vue refreshes again on resume
  void refreshUsdtMaintenance()

  // Points backend disabled for now; hide the entry point unless the flag is on
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

  // Saved: a block holds until PostHog sends another list, also offline, after a restart or with the flag turned off.
  const blockedWidgetOrigins = ref<string[]>([])
  // Until then widgets count every site as blocked, so a cold start reaches no blocked one.
  const blockedWidgetOriginsKnown = ref(false)
  let appliedBlockRefresh = 0
  let blockRefreshes = 0
  let savedBlock: string | null = null
  let blockSaved = false
  const savedBlockRead = Preferences.get({ key: BLOCKED_WIDGET_ORIGINS_KEY })
    .then(({ value }) => {
      if (!blockSaved)
        savedBlock = value
      const saved = parseBlockedOrigins(value)
      if (saved && !appliedBlockRefresh)
        blockedWidgetOrigins.value = saved
    })
    .catch(error => logger.error('Error reading the saved blocked widget origins:', error))
  const savedBlockWait = promiseWithTimeout(savedBlockRead, 5000)
    .catch(() => logger.error('Gave up waiting for the saved blocked widget origins'))
  void savedBlockWait.finally(() => {
    blockedWidgetOriginsKnown.value = true
  })
  let savingBlock: Promise<void> = savedBlockWait
  async function refreshBlockedWidgetOrigins() {
    const refresh = ++blockRefreshes
    let origins: string[] | undefined
    try {
      origins = parseBlockedOrigins((await Posthog.getFeatureFlagPayload({ key: 'mini-app-widgets' })).value)
    }
    catch (error) {
      logger.error('Error fetching blocked widget origins:', error)
    }
    if (!origins || refresh < appliedBlockRefresh)
      return
    appliedBlockRefresh = refresh
    blockedWidgetOriginsKnown.value = true
    const block = JSON.stringify({ blockedOrigins: origins })
    if (block !== JSON.stringify({ blockedOrigins: blockedWidgetOrigins.value }))
      blockedWidgetOrigins.value = origins
    // In turn, so that overlapping refreshes leave the latest list saved.
    savingBlock = savingBlock.then(async () => {
      if (block === savedBlock)
        return
      blockSaved = true
      await Preferences.set({ key: BLOCKED_WIDGET_ORIGINS_KEY, value: block })
      savedBlock = block
    }).catch(error => logger.error('Error saving the blocked widget origins:', error))
    await savingBlock
  }
  void refreshBlockedWidgetOrigins()

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
    isUsdtMaintenanceActive,
    usdtMaintenanceNotice,
    refreshUsdtMaintenance,
    isCryptocityPointsEnabled,
    refreshCryptocityPoints,
    blockedWidgetOrigins,
    blockedWidgetOriginsKnown,
    refreshBlockedWidgetOrigins,
    polygonRpcUrl,
  }
})
