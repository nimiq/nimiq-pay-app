import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import type { StorageLikeAsync } from '@vueuse/core'
import { computed, ref } from 'vue'
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
}

function kv(): StorageLikeAsync {
  return {
    getItem: async key => useConn().query<{ value: string }>(SQLQuery.SelectKv, [key], { single: true }).then(x => x?.value),
    setItem: async (key, value) => useConn().run(SQLQuery.UpsertKv, [key, value]),
    removeItem: async key => useConn().run(SQLQuery.DeleteKv, [key]),
  }
}

export const useApp = defineStore('app', () => {
  const sharedOptions = { writeDefaults: false }
  const phoneNumber = useStorageAsync('phoneNumber', '', kv(), sharedOptions)
  const referralCode = useStorageAsync('referralCode', '', kv(), sharedOptions)
  const hasDoneBackup = useStorageAsync('hasDoneBackup', false, kv(), sharedOptions)
  const selectedFiat = useStorageAsync<Fiat>('selectedFiat', Fiat.USD, kv(), sharedOptions)
  const language = useStorageAsync<SupportedLanguage>('language', guessUserLanguage(), kv(), sharedOptions)
  const pointsToken = useStorageAsync('pointsToken', '', kv(), sharedOptions)
  const withdrawalAddress = useStorageAsync('withdrawalAddress', '', kv(), sharedOptions)
  const phoneNumberVerified = computed(() => !!pointsToken.value)

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

  return {
    phoneNumber,
    phoneNumberVerified,
    referralCode,
    setReferralCode,
    entropy,
    hasDoneBackup,
    selectedFiat,
    language,
    pointsToken,
    setEntropy,
    withdrawalAddress,
  }
})
