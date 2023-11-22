import { defineStore, storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import { computed, readonly, ref } from 'vue'
import { useConn } from './conn'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import { SQLQuery } from '@/lib/sql-queries'
import type { RemoteSigner } from '@/lib/sql-queries'

function useRemoteSignerDb() {
  const { db, waitForUnlock } = useConn()
  return {
    async getActiveRemoteSigner() {
      await waitForUnlock()
      const res = await db!.query(SQLQuery.GetActiveRemoteSigner)
      return res.values?.at(0)?.value as RemoteSigner | undefined
    },

    async setRemoteSigner({ active, balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      await waitForUnlock()
      // When we add a new wallet, we need to deactivate the previous one if the new address is different
      await db!.run(SQLQuery.DeactivateRemoteSigners)
      await db!.run(SQLQuery.InsertRemoteSigner, [address, balance, proofSize, publicKey, start, end, active])
    },

    async updateBalance(newBalance: number) {
      await waitForUnlock()
      await db!.run(SQLQuery.UpdateRemoteBalance, [newBalance])
    },

    async updateValidity(address: Nimiq.Address, newStart: number, newEnd: number) {
      await waitForUnlock()
      await db!.run(SQLQuery.UpdateValidityRemoteSigner, [newStart, newEnd, address])
    },
  }
}

export const useRemoteSigner = defineStore('remote-signer', () => {
  const { height } = useNimiqNetwork()
  const { getStatus, getRemoteSigner } = useRemoteSignerApi()
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { getActiveRemoteSigner, setRemoteSigner, updateBalance, updateValidity } = useRemoteSignerDb()

  const remoteSigner = ref<RemoteSigner>()

  /**
   * Initializes the remote signer variables with the following algorithm:
   * 1. Check if we have a local wallet:
   *    - If we have, go to next step
   *    - Otherwise, do nothing
   * 2. Check if we have a remote signer in the database:
   *    - If we have, go to next step
   *    - Otherwise, do nothing
   * 3. Get the remote signer from the API:
   *    - If we have it, go to next step
   *    - Otherwise, do nothing
   * 4. Update the remote signer in the database
   * 5. Set the remote signer in the store
   */
  async function init() {
    if (!hasLocalWallet.value)
      return
    console.log('Initializing remote signer')
    const remoteSignerDb = await getActiveRemoteSigner()
    console.log('Remote signer from db', remoteSignerDb)
    if (!remoteSignerDb)
      return
    console.log('Getting remote signer from API')
    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: localAddress })
    console.log('Remote signer from API', remoteSignerApi)
    if (error || !remoteSignerApi)
      return
    setRemoteSigner(remoteSignerApi)
    remoteSigner.value = remoteSignerApi
    console.log('Remote signer initialized')
  }

  const remoteHeight = computedAsync(() => getStatus().then(r => r.data?.blockHeight || 0), 0)
  const remoteAddress = computed(() => remoteSigner.value?.address)
  const start = computed(() => remoteSigner.value?.start || 0)
  const end = computed(() => remoteSigner.value?.end || 0)
  const remoteBalance = computed(() => remoteSigner.value?.balance || 0)
  const remotePublicKey = computed(() => remoteSigner.value?.publicKey || '')
  const remoteProofSize = computed(() => remoteSigner.value?.proofSize || 0)

  // Checks if the remote is in the validity window, which means that the remote
  // wallet and the local wallet have currently an active HTLC.
  const isHtlcActive = computed(() => start.value < height.value && end.value > height.value)
  const hasHtlcExpired = computed(() => remoteAddress && end.value < height.value)

  const isRemoteOk = computedAsync(async () => height.value && await getStatus().then(r => r.data?.status === 'good'), false)

  return {
    isRemoteOk,
    remoteAddress,
    remoteSigner: readonly(remoteSigner),
    hasSigner: computed(() => !!remoteSigner.value),
    start,
    end,
    remoteBalance,
    remotePublicKey,
    remoteProofSize,
    remoteHeight,

    isHtlcActive,
    hasHtlcExpired,

    updateBalance,
    updateValidity,

    init,
  }
})
