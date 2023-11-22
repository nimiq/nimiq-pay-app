import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import type { StorageLikeAsync } from '@vueuse/core'
import { useConn } from './conn'
import { SQLQuery } from '@/lib/sql-queries'

export function kv(): StorageLikeAsync {
  return {
    getItem: async key => useConn().query<string>(SQLQuery.SelectKv, [key], { single: true }),
    setItem: async (key, value) => useConn().run(SQLQuery.UpsertKv, [key, value]),
    removeItem: async key => useConn().run(SQLQuery.DeleteKv, [key]),
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
