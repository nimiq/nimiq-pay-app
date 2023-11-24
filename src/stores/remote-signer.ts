import { defineStore, storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import { computed, readonly, ref } from 'vue'
import { useConn } from './conn'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import { SQLQuery } from '@/lib/sql-queries'
import type { RemoteSigner } from '@/lib/sql-queries'

function useRemoteSignerDb() {
  const { run, query } = useConn()
  return {
    async getActiveRemoteSigner() {
      const res = await query<RemoteSigner | undefined>(SQLQuery.GetActiveRemoteSigner, [], { single: true })
      if (res)
        res.address = Nimiq.Address.fromUserFriendlyAddress(res.address as unknown as string) // Deserialize address from db
      return res
    },

    async setRemoteSigner({ active, balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      // When we add a new wallet, we need to deactivate the previous one if the new address is different
      await run(SQLQuery.DeactivateRemoteSigners)
      // eslint-disable-next-line no-console
      console.log('✒️ Updating Remote Signer', { address: address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, active })
      await run(SQLQuery.InsertRemoteSigner, [address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, active])
    },

    async updateBalance(newBalance: number, address: Nimiq.Address) {
      // eslint-disable-next-line no-console
      console.log(`✒️ Updating balance of remote signer ${address.toUserFriendlyAddress()} to ${newBalance}`)
      await run(SQLQuery.UpdateRemoteBalance, [newBalance, address.toUserFriendlyAddress()])
    },

    async updateActiveWallet({ balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      // eslint-disable-next-line no-console
      console.log(`✒️ Updating active wallet ${address.toUserFriendlyAddress()} to`, { start, end, proofSize, publicKey, balance })
      await run(SQLQuery.UpdateActiveWallet, [start, end, proofSize, publicKey, balance, address.toUserFriendlyAddress()])
    },
  }
}

export const useRemoteSigner = defineStore('remote-signer', () => {
  const { client } = useNimiqNetwork()
  const { height } = storeToRefs(useNimiqNetwork())
  const { getStatus, getRemoteSigner } = useRemoteSignerApi()
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { getActiveRemoteSigner, setRemoteSigner, updateBalance, updateActiveWallet: _updateActiveWallet } = useRemoteSignerDb()

  const remoteSigner = ref<RemoteSigner>()

  async function updateRemoteSigner(signer: RemoteSigner) {
    setRemoteSigner(signer)
    remoteSigner.value = signer
  }

  async function updateActiveWallet() {
    if (!remoteSigner.value)
      return
    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: remoteSigner.value.address })
    if (error || !remoteSignerApi)
      return
    remoteSigner.value = remoteSignerApi
    await _updateActiveWallet(remoteSignerApi)
  }

  const status = computedAsync(async () => height.value ? (await getStatus()).data : undefined)
  const remoteHeight = computed(() => status.value?.blockHeight || 0)
  const remotePublicKey = computed(() => status.value?.servicePublicKey || undefined)
  const remoteAddress = computed(() => remoteSigner.value?.address)
  const start = computed(() => remoteSigner.value?.start || 0)
  const end = computed(() => remoteSigner.value?.end || 0)
  // TODO: maybe get this from blockchain?
  const remoteBalance = computed(() => remoteSigner.value?.balance || 0)
  const remoteProofSize = computed(() => remoteSigner.value?.proofSize || 0)

  // Checks if the remote is in the validity window, which means that the remote
  // wallet and the local wallet have currently an active HTLC.
  const isHtlcActive = computed(() => start.value < height.value && end.value > height.value)
  const hasHtlcExpired = computed(() => remoteAddress.value && end.value < height.value)

  const isRemoteOk = computed(() => status.value?.status === 'good' || false)

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

    const remoteSignerDb = await getActiveRemoteSigner()
    if (remoteSignerDb) {
      remoteSigner.value = remoteSignerDb
      return
    }
    else {
      const { data: remoteSignerApi, error } = await getRemoteSigner({ address: localAddress })
      if (error || !remoteSignerApi) {
        // eslint-disable-next-line no-console
        console.log('📡 No remote signer found in the database and no remote signer found in the API. Waiting for funds to be sent')
        return
      }

      await updateRemoteSigner(remoteSignerApi)
    }

    client!.addHeadChangedListener(async () => {
      const account = await client!.getAccount(remoteAddress.value!)
      await updateBalance(account.balance, remoteAddress.value!)
    })
  }

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
    updateActiveWallet,
    updateRemoteSigner,

    init,
  }
})
