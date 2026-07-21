import type { StorageLikeAsync } from '@vueuse/core'
import type { SupportedLanguage } from '@/i18n/i18n-setup'
import { Preferences } from '@capacitor/preferences'
import { useStorageAsync } from '@vueuse/core'
import { useReducedMotion } from 'motion-v'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { guessUserLanguage } from '@/i18n/i18n-setup'
// import { nakaBufferAddresses } from '@/lib'
import { Asset, DEFAULT_ASSET } from '@/lib/assets'
import { addressesEqual } from '@/lib/ethereum'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from './conn'

const logger = useLogger('useApp')

export interface SavedAddress { address: string, alias?: string }

// One-way migration: legacy `string[]` entries are rewritten as `{ address }`
// on first read; the next write persists the new shape and the old form is gone.
const savedAddressSerializer = {
  read: (raw: string): SavedAddress[] => {
    if (!raw)
      return []
    try {
      const parsed = JSON.parse(raw) as Array<string | SavedAddress>
      if (!Array.isArray(parsed))
        return []
      return parsed.map(entry => typeof entry === 'string' ? { address: entry } : entry)
    }
    catch {
      return []
    }
  },
  write: (value: SavedAddress[]) => JSON.stringify(value),
}

function matchesAddress(entry: SavedAddress, address: string): boolean {
  if (address.startsWith('0x') && entry.address.startsWith('0x'))
    return addressesEqual(entry.address, address)
  return entry.address === address
}

function findSavedAddress(list: SavedAddress[], address: string): SavedAddress | undefined {
  return list.find(entry => matchesAddress(entry, address))
}

export enum Fiat {
  USD = 'USD',
  EUR = 'EUR',
  CRC = 'CRC',
  GMD = 'GMD',
}

export enum Crypto {
  NIM = 'NIM',
  BTC = 'BTC',
  USDT = 'USDT',
}

export const DECIMALS: Record<Crypto, number> = {
  [Crypto.NIM]: 5,
  [Crypto.BTC]: 8,
  [Crypto.USDT]: 6,
}

// Min NIM (in luna) that must accumulate in the local staging wallet before a new HTLC is
// created. Batches micro-payments into one HTLC instead of one per payment. 0 = create immediately.
export const DEFAULT_HTLC_THRESHOLD_LUNA = 5 * 1e5

export enum PushNotificationsStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
}

export enum LocalNotificationsStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
}

export function kv(): StorageLikeAsync {
  return {
    getItem: async key => useConn().query<{ value: string }>(SQLQuery.SelectKv, [key], { single: true }).then(x => x?.value),
    setItem: async (key, value) => useConn().run(SQLQuery.UpsertKv, [key, value]),
    removeItem: async key => useConn().run(SQLQuery.DeleteKv, [key]),
  }
}

/**
 * This storage will be available even before the user has logged in.
 * Meant to only store non-sensitive data that doesn't require high read/write load.
 * Uses UserDefaults on iOS and SharedPreferences on Android.
 * Stored data is cleared if the app is uninstalled.
 */
export function kvPreferences(): StorageLikeAsync {
  return {
    getItem: async key => Preferences.get({ key }).then(x => x.value),
    setItem: async (key, value) => Preferences.set({ key, value }),
    removeItem: async key => Preferences.remove({ key }),
  }
}

export const useApp = defineStore('app', () => {
  const sharedOptions = { writeDefaults: false }
  const pinHash = useStorageAsync('pinHash', '', kv(), sharedOptions)
  const phoneNumber = useStorageAsync('phoneNumber', '', kv(), sharedOptions)
  const referralCode = useStorageAsync('referralCode', '', kv(), sharedOptions)
  const hasDoneBackup = useStorageAsync('hasDoneBackup', false, kv(), sharedOptions)
  const selectedFiat = useStorageAsync<Fiat>('selectedFiat', Fiat.USD, kv(), sharedOptions)
  const activeAsset = useStorageAsync<Asset>('activeAsset', DEFAULT_ASSET, kv(), sharedOptions)
  const isNimiqAsset = computed(() => activeAsset.value === Asset.NIM)
  const withdrawalAddressByAsset = useStorageAsync<Record<Asset, string>>('withdrawalAddressByAsset', {
    [Asset.NIM]: '',
    [Asset.USDT]: '',
  }, kv(), sharedOptions)
  const language = useStorageAsync<SupportedLanguage>('language', guessUserLanguage(), kv(), sharedOptions)
  const pointsToken = useStorageAsync('pointsToken', '', kv(), sharedOptions)
  const withdrawalAddress = computed({
    get: () => withdrawalAddressByAsset.value[activeAsset.value] || '',
    set: (value: string) => {
      withdrawalAddressByAsset.value = {
        ...withdrawalAddressByAsset.value,
        [activeAsset.value]: value,
      }
    },
  })
  const withdrawalAddressesHistory = useStorageAsync<SavedAddress[]>('withdrawalAddressesHistory', [], kv(), { ...sharedOptions, serializer: savedAddressSerializer })
  const pushNotificationsStatus = useStorageAsync<PushNotificationsStatus>('pushNotificationsStatus', PushNotificationsStatus.PROMPT, kvPreferences(), sharedOptions)
  const localNotificationsStatus = useStorageAsync<LocalNotificationsStatus>('localNotificationsStatus', LocalNotificationsStatus.PROMPT, kvPreferences(), sharedOptions)
  const closedNotifications = useStorageAsync<string[]>('closedNotifications', [], kv(), sharedOptions)
  const isBiometricEnabled = useStorageAsync('isBiometricEnabled', false, kvPreferences())
  // TODO: maybe clean this from time to time?
  const displayedPaymentRequests = useStorageAsync<string[]>('displayedPaymentRequests', [], kv(), sharedOptions)
  const showAnimations = useStorageAsync('showAnimations', !useReducedMotion().value, kvPreferences(), sharedOptions)
  // Dev-menu reveal toggle for tx soft-hide feature (APP-132). Pre-login storage so it survives across logins.
  const showHiddenTransactions = useStorageAsync('showHiddenTransactions', false, kvPreferences(), sharedOptions)
  const decimalsAmount = useStorageAsync('decimalsAmount', 0, kv(), sharedOptions)
  const htlcThreshold = useStorageAsync('htlcThreshold', DEFAULT_HTLC_THRESHOLD_LUNA, kv(), sharedOptions)
  const hasDismissedPendingNimHint = useStorageAsync('hasDismissedPendingNimHint', false, kv(), sharedOptions)
  const reopenMiniAppWebviewAfterResume = useStorageAsync('reopenMiniAppWebviewAfterResume', true, kvPreferences(), sharedOptions)
  // Last app version whose changelog the user has seen. Pre-login storage so the
  // "What's New" card/modal state survives across logins (see useChangelog).
  const lastSeenChangelogVersion = useStorageAsync('lastSeenChangelogVersion', '', kvPreferences(), sharedOptions)
  // How many times the "What's New" card has been shown for changelogCardVersion, so it
  // auto-hides after a few appearances even if the user never opens or dismisses it.
  const changelogCardVersion = useStorageAsync('changelogCardVersion', '', kvPreferences(), sharedOptions)
  const changelogCardShownCount = useStorageAsync('changelogCardShownCount', 0, kvPreferences(), sharedOptions)

  const pendingReferralCode = ref('')
  const entropy = ref('')
  async function setEntropy() {
    logger.log('🌱 setEntropy: entry', { hasInMemoryEntropy: !!entropy.value })
    if (pendingReferralCode.value)
      await kv().setItem('referralCode', pendingReferralCode.value)
    // This case only happen when importing from words (login)
    if (entropy.value) {
      await Promise.all([kv().setItem('entropy', entropy.value), kv().setItem('hasDoneBackup', 'true')])
      hasDoneBackup.value = true
      logger.log('🌱 setEntropy: done (imported)')
      return
    }
    // Maybe we should revisit this later. Right now this will be in memory all the times
    const entropyDb = await kv().getItem('entropy')
    if (entropyDb) {
      entropy.value = entropyDb
    }
    else {
      // Generating a brand-new wallet needs the Nimiq WASM CSPRNG. If WASM failed to instantiate
      // this throws and the caller surfaces a recoverable error to the user — no silent fallback.
      Nimiq.Entropy.SIZE = 16
      entropy.value = Nimiq.Entropy.generate().toHex().substring(0, 32)
      await kv().setItem('entropy', entropy.value)
    }
    logger.log('🌱 setEntropy: done', { fromDb: !!entropyDb })
  }

  async function setReferralCode(referralCode: string) {
    pendingReferralCode.value = referralCode
  }

  // We track when the user has input the pin code for the last time
  // We will use this to determine if we should ask for the pin code again
  // when the user is about to do a sensitive operation
  const MIN_PIN_INPUT_INTERVAL = 1000 * 60 * 5 // 5 minutes
  const lastPinInputTs = ref(0)
  function clearPinInputTs() {
    lastPinInputTs.value = 0
  }
  function updatePinInputTs() {
    lastPinInputTs.value = Date.now()
  }
  function shouldAskPin() {
    return Date.now() - lastPinInputTs.value > MIN_PIN_INPUT_INTERVAL
  }

  // One-time (APP-171): we no longer auto-save incoming-payment senders. Drop the old
  // `topUpAddresses` list, but keep any user-set aliases by folding them into withdrawal
  // history so they still label transactions. Deleting the KV key is the "already ran"
  // marker → idempotent, no version flag needed.
  async function migrateTopUpAddresses() {
    const raw = await kv().getItem('topUpAddresses')
    if (raw == null)
      return
    for (const entry of savedAddressSerializer.read(raw)) {
      if (entry.alias?.trim())
        addNewWithdrawalAddress(entry.address, entry.alias)
    }
    await kv().removeItem('topUpAddresses')
  }

  function addNewWithdrawalAddress(address: string, alias?: string) {
    const trimmedAlias = alias?.trim() || undefined
    const existing = findSavedAddress(withdrawalAddressesHistory.value, address)
    const next: SavedAddress = trimmedAlias
      ? { address, alias: trimmedAlias }
      : existing ?? { address }
    const last = withdrawalAddressesHistory.value[withdrawalAddressesHistory.value.length - 1]
    if (existing && existing === last && (existing.alias ?? '') === (next.alias ?? ''))
      return
    withdrawalAddressesHistory.value = [
      ...withdrawalAddressesHistory.value.filter(entry => entry !== existing),
      next,
    ]
  }

  function isSavedAddress(address: string): boolean {
    return !!findSavedAddress(withdrawalAddressesHistory.value, address)
  }

  function removeSavedAddress(address: string) {
    const next = withdrawalAddressesHistory.value.filter(entry => !matchesAddress(entry, address))
    if (next.length !== withdrawalAddressesHistory.value.length)
      withdrawalAddressesHistory.value = next
    if (withdrawalAddress.value === address)
      withdrawalAddress.value = ''
  }

  function setAddressAlias(address: string, alias: string) {
    const trimmed = alias.trim() || undefined
    const target = findSavedAddress(withdrawalAddressesHistory.value, address)
    if (!target || target.alias === trimmed)
      return
    withdrawalAddressesHistory.value = withdrawalAddressesHistory.value.map(entry => entry === target
      ? trimmed ? { ...entry, alias: trimmed } : { address: entry.address }
      : entry,
    )
  }

  // Indexed map so per-tx alias lookups in transaction lists stay O(1)
  // instead of re-scanning the saved-address list for every row.
  const aliasMap = computed(() => {
    const map = new Map<string, string>()
    for (const entry of withdrawalAddressesHistory.value) {
      if (!entry.alias)
        continue
      const key = entry.address.startsWith('0x') ? entry.address.toLowerCase() : entry.address
      if (!map.has(key))
        map.set(key, entry.alias)
    }
    return map
  })

  function getAlias(address: string): string | undefined {
    const key = address.startsWith('0x') ? address.toLowerCase() : address
    return aliasMap.value.get(key)
  }

  return {
    pinHash,
    phoneNumber,
    phoneNumberVerified: computed(() => !!pointsToken.value),
    referralCode,
    setReferralCode,
    entropy,
    hasDoneBackup,
    selectedFiat,
    activeAsset,
    isNimiqAsset,
    language,
    pointsToken,
    setEntropy,
    withdrawalAddress,
    withdrawalAddressesHistory,
    addNewWithdrawalAddress,
    isSavedAddress,
    migrateTopUpAddresses,
    setAddressAlias,
    getAlias,
    removeSavedAddress,
    updatePinInputTs,
    shouldAskPin,
    clearPinInputTs,
    pushNotificationsStatus,
    localNotificationsStatus,
    closedNotifications,
    isBiometricEnabled,
    displayedPaymentRequests,
    showAnimations,
    showHiddenTransactions,
    decimalsAmount,
    htlcThreshold,
    hasDismissedPendingNimHint,
    reopenMiniAppWebviewAfterResume,
    lastSeenChangelogVersion,
    changelogCardVersion,
    changelogCardShownCount,
  }
})
