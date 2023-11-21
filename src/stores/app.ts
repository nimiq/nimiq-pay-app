import { useStorageAsync } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import type { StorageLikeAsync } from '@vueuse/core'
import { computed } from 'vue'
import { useConn } from './conn'
import { useRemoteSigner } from './remote-signer'
import { useLocalWallet } from './local-wallet'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'
import { useSync } from '@/composables/useSync'
import { useDevice } from '@/composables/useDevice'

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
  const phoneNumber = useStorageAsync('phoneNumber', '', kv())
  const referralCode = useStorageAsync('referralCode', '', kv())
  const pinCode = useStorageAsync('pinCode', '', kv())
  const hasDoneBackup = useStorageAsync('hasDoneBackup', false, kv())
  const selectedFiat = useStorageAsync('selectedFiat', 'USD', kv())
  const pointsToken = useStorageAsync('pointsToken', '', kv())

  // @ts-expect-error 16 is the value we need to have to get the 12 words
  Nimiq.Entropy.SIZE = 16
  // Maybe we should revisit this later. Right now this will be in memory all the times
  const entropy = useStorageAsync('entropy', Nimiq.Entropy.generate().toHex().substring(0, 32), kv())

  const { remoteBalance } = useRemoteSigner()
  const showRecoveryWordsAlert = computed(() => !hasDoneBackup.value && remoteBalance > 0)

  /**
   * Ensures that all the streams which the app relies on are initialized.
   * This is called from:
   *    - When the app is initialized AND the local wallet exists
   *    - When the setup flow is finished
   */
  async function init() {
    // FIXME This is a hack to make sure that the db is unlocked before initializing the rest of the app
    // This is needed because otherwise the db will raise an error
    if (useDevice().isWeb)
      await new Promise(resolve => setTimeout(resolve, 100))
    await useConn().init()
    if (!useLocalWallet().hasLocalWallet)
      return
    await useNimiqNetwork().init()
    await useRemoteSigner().init()
    useSync().syncWallets()
  }

  return {
    phoneNumber,
    referralCode,
    pinCode,
    entropy,
    hasDoneBackup,
    selectedFiat,
    pointsToken,
    showRecoveryWordsAlert,
    init,
  }
})
