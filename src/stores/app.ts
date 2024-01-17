import { defineStore } from 'pinia'
import { computed, reactive, ref, toRefs, watch } from 'vue'
import { useConn } from './conn'
import { SQLQuery } from '@/lib/sql-queries'
import { guessUserLanguage } from '@/i18n/i18n-setup'

export enum Fiat {
  USD = 'USD',
  EUR = 'EUR',
  CRC = 'CRC',
}

export enum Crypto {
  NIM = 'NIM',
}

const defaultKv = {
  pinHash: '',
  phoneNumber: '',
  referralCode: '',
  hasDoneBackup: false,
  selectedFiat: Fiat.USD,
  language: guessUserLanguage(),
  pointsToken: '',
  withdrawalAddress: '',
  pendingReferralCode: '',
  entropy: '',
}

type Kv = typeof defaultKv

export const useApp = defineStore('app', () => {
  const { query, run } = useConn()

  const kv = reactive<Kv>(defaultKv)
  const { entropy, hasDoneBackup, language, pendingReferralCode, phoneNumber, pinHash, pointsToken, referralCode, selectedFiat, withdrawalAddress } = toRefs(kv)

  query<{ key: string; value: string }[]>(SQLQuery.SelectKv).then(x => x.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {})).then(x => Object.assign(kv, x))

  watch(kv, async (newValue, oldValue) => {
    const diffKeys = Object.keys(newValue).filter(key => newValue[key as keyof Kv] !== oldValue?.[key as keyof Kv])
    if (diffKeys.length === 0)
      return
    const sqlQuery = `INSERT OR REPLACE INTO kv (key, value) VALUES ${diffKeys.map(() => `(?, ?)`).join(', ')}`
    await run(sqlQuery, diffKeys.flatMap(key => [key, newValue[key as keyof Kv]]))
  }, { immediate: true })

  const phoneNumberVerified = computed(() => !!kv.pointsToken)

  async function setEntropy() {
    if (pendingReferralCode.value)
      referralCode.value = pendingReferralCode.value

    // This case only happen when importing from words (login)
    if (entropy.value) {
      hasDoneBackup.value = true
    }
    else {
    // Maybe we should revisit this later. Right now this will be in memory all the times
      // @ts-expect-error 16 is the value we need to have to get the 12 words
      Nimiq.Entropy.SIZE = 16
      entropy.value = Nimiq.Entropy.generate().toHex().substring(0, 32)
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
  function updatePinInputTs() {
    lastPinInputTs.value = Date.now()
  }
  function shouldAskPin() {
    return Date.now() - lastPinInputTs.value > MIN_PIN_INPUT_INTERVAL
  }

  return {
    entropy,
    hasDoneBackup,
    language,
    pendingReferralCode,
    phoneNumber,
    pinHash,
    pointsToken,
    referralCode,
    selectedFiat,
    phoneNumberVerified,
    withdrawalAddress,
    setReferralCode,
    setEntropy,
    updatePinInputTs,
    shouldAskPin,
  }
})
