import { useStorageAsync } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import type { StorageLikeAsync } from '@vueuse/core'
import { useConn } from './conn'

export function kv(): StorageLikeAsync {
  const { waitForUnlock } = useConn()
  const { db } = storeToRefs(useConn())

  return {
    async getItem(key) {
      await waitForUnlock()
      const res = await db.value!.query('SELECT value FROM kv WHERE key = ?', [key])
      return res.values?.at(0)?.value
    },
    async setItem(key, value) {
      await waitForUnlock()
      await db.value!.run('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)', [key, value])
    },
    removeItem: async (key) => {
      await waitForUnlock()
      db.value!.run('DELETE FROM kv WHERE key = ?', [key])
    },
  } satisfies StorageLikeAsync
}

export const useApp = defineStore('app', () => {
  const sharedOptions = { writeDefaults: false }
  const phoneNumber = useStorageAsync('phoneNumber', '', kv(), sharedOptions)
  const referralCode = useStorageAsync('referralCode', '', kv(), sharedOptions)
  const hasDoneBackup = useStorageAsync('hasDoneBackup', false, kv(), sharedOptions)
  const selectedFiat = useStorageAsync('selectedFiat', 'USD', kv(), sharedOptions)
  const pointsToken = useStorageAsync('pointsToken', '', kv(), sharedOptions)

  // @ts-expect-error 16 is the value we need to have to get the 12 words
  Nimiq.Entropy.SIZE = 16
  // Maybe we should revisit this later. Right now this will be in memory all the times
  const entropy = useStorageAsync('entropy', Nimiq.Entropy.generate().toHex().substring(0, 32), kv())

  return {
    phoneNumber,
    referralCode,
    entropy,
    hasDoneBackup,
    selectedFiat,
    pointsToken,
  }
})
