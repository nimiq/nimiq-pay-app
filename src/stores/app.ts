import { type StorageLikeAsync, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { useConn } from './conn'
import { SQLQuery } from '@/lib/sql-queries'
import { type SupportedLanguage, guessUserLanguage } from '@/i18n/i18n-setup'

export enum Fiat {
  USD = 'USD',
  EUR = 'EUR',
  CRC = 'CRC',
}

export enum Crypto {
  NIM = 'NIM',
  BTC = 'BTC',
}

export const DECIMALS: Record<Crypto, number> = {
  [Crypto.NIM]: 5,
  [Crypto.BTC]: 8,
}

export enum PushNotificationsStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
}

function kv(): StorageLikeAsync {
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
function kvPreferences(): StorageLikeAsync {
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
  const language = useStorageAsync<SupportedLanguage>('language', guessUserLanguage(), kv(), sharedOptions)
  const pointsToken = useStorageAsync('pointsToken', '', kv(), sharedOptions)
  const withdrawalAddress = useStorageAsync('withdrawalAddress', '', kv(), sharedOptions)
  const withdrawalAddressesHistory = useStorageAsync<string[]>('withdrawalAddressesHistory', [], kv(), sharedOptions)
  const topUpAddresses = useStorageAsync<string[]>('topUpAddresses', [], kv(), sharedOptions)
  const pushNotificationsStatus = useStorageAsync<PushNotificationsStatus>('pushNotificationsStatus', PushNotificationsStatus.PROMPT, kvPreferences(), sharedOptions)
  const closedNotifications = useStorageAsync<string[]>('closedNotifications', [], kv(), sharedOptions)
  const isBiometricEnabled = useStorageAsync('isBiometricEnabled', false, kvPreferences())
  // TODO: maybe clean this from time to time?
  const displayedPaymentRequests = useStorageAsync<string[]>('displayedPaymentRequests', [], kv(), sharedOptions)

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
      // @ts-expect-error 16 is the value we need to have to get the 12 words
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
    const addresses = topUpAddresses.value
    addresses.push(address)
    topUpAddresses.value = addresses
    // Limit the number of addresses to 2
    if (addresses.length > 3)
      topUpAddresses.value = addresses.slice(addresses.length - 2)
  }

  function addNewWithdrawalAddress(address: string) {
    const addresses = withdrawalAddressesHistory.value
    addresses.push(address)
    withdrawalAddressesHistory.value = addresses
    // Limit the number of addresses to 3
    if (addresses.length > 3)
      withdrawalAddressesHistory.value = addresses.slice(addresses.length - 3)
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
    language,
    pointsToken,
    setEntropy,
    withdrawalAddress,
    withdrawalAddressesHistory,
    addNewWithdrawalAddress,
    topUpAddresses,
    addNewTopUpAddress,
    updatePinInputTs,
    shouldAskPin,
    clearPinInputTs,
    pushNotificationsStatus,
    closedNotifications,
    isBiometricEnabled,
    displayedPaymentRequests,
  }
})
