import type { StorageLikeAsync } from '@vueuse/core'
import type { SupportedLanguage } from '@/i18n/i18n-setup'
import { Preferences } from '@capacitor/preferences'
import { useStorageAsync } from '@vueuse/core'
import { useReducedMotion } from 'motion-v'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { guessUserLanguage } from '@/i18n/i18n-setup'
import { nakaBufferAddresses } from '@/lib'
import { Asset, DEFAULT_ASSET } from '@/lib/assets'
import { addressesEqual } from '@/lib/ethereum'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from './conn'

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
  const topUpAddresses = useStorageAsync<SavedAddress[]>('topUpAddresses', [], kv(), { ...sharedOptions, serializer: savedAddressSerializer })
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
  const reopenMiniAppWebviewAfterResume = useStorageAsync('reopenMiniAppWebviewAfterResume', true, kvPreferences(), sharedOptions)

  const pendingReferralCode = ref('')
  const entropy = ref('')
  async function setEntropy() {
    if (pendingReferralCode.value)
      await kv().setItem('referralCode', pendingReferralCode.value)
    // This case only happen when importing from words (login)
    if (entropy.value) {
      await Promise.all([kv().setItem('entropy', entropy.value), kv().setItem('hasDoneBackup', 'true')])
      hasDoneBackup.value = true
      return
    }
    // Maybe we should revisit this later. Right now this will be in memory all the times
    const entropyDb = await kv().getItem('entropy')
    if (entropyDb) {
      entropy.value = entropyDb
    }
    else {
      Nimiq.Entropy.SIZE = 16
      entropy.value = Nimiq.Entropy.generate().toHex().substring(0, 32)
      await kv().setItem('entropy', entropy.value)
    }
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

  function addNewTopUpAddress(address: string) {
    // Prevent adding NAKA buffer address, just in case
    if (nakaBufferAddresses.includes(address))
      return

    // Preserve existing entry (and its alias) if the address is already saved.
    if (findSavedAddress(topUpAddresses.value, address))
      return

    const addresses = [...topUpAddresses.value, { address }]
    // Limit the number of addresses to 5
    topUpAddresses.value = addresses.length > 5 ? addresses.slice(addresses.length - 5) : addresses
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

  function removeSavedAddress(address: string) {
    for (const list of [withdrawalAddressesHistory, topUpAddresses]) {
      const next = list.value.filter(entry => !matchesAddress(entry, address))
      if (next.length !== list.value.length)
        list.value = next
    }
    if (withdrawalAddress.value === address)
      withdrawalAddress.value = ''
  }

  function setAddressAlias(address: string, alias: string) {
    const trimmed = alias.trim() || undefined
    for (const list of [withdrawalAddressesHistory, topUpAddresses]) {
      const target = findSavedAddress(list.value, address)
      if (!target || target.alias === trimmed)
        continue
      list.value = list.value.map(entry => entry === target
        ? trimmed ? { ...entry, alias: trimmed } : { address: entry.address }
        : entry,
      )
    }
  }

  // Indexed map so per-tx alias lookups in transaction lists stay O(1)
  // instead of re-scanning both saved-address lists for every row.
  const aliasMap = computed(() => {
    const map = new Map<string, string>()
    for (const list of [withdrawalAddressesHistory.value, topUpAddresses.value]) {
      for (const entry of list) {
        if (!entry.alias)
          continue
        const key = entry.address.startsWith('0x') ? entry.address.toLowerCase() : entry.address
        if (!map.has(key))
          map.set(key, entry.alias)
      }
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
    topUpAddresses,
    addNewTopUpAddress,
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
    reopenMiniAppWebviewAfterResume,
  }
})
