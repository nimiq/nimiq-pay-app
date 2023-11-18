import { defineStore } from 'pinia'
import { computedAsync, useStorageAsync } from '@vueuse/core'
import type { Serializer, StorageLikeAsync } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useConn } from './conn'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'
import { useRemoteSignerApi } from '@/composables/useApi'

// TODO What's type???
export enum WalletType {
  None = 'none',
  Raw = 'raw',
  Instant = 'instant',
  Bonus = 'bonus',
}

export enum WalletStatus {
  None = 'none',
  Pending = 'pending',
  Active = 'active',
  Expired = 'expired',
  Emptied = 'emptied',
}

// The remote signer interface is the type of the data that we store in the database
// and in the store. It is not the same as the one returned by the API, which it is
// get parsed in the useApi.ts file.
export interface RemoteSigner {
  address: string
  balance: number
  publicKey: string
  proofSize: number
  start: number
  end: number
  active: boolean
  status: WalletStatus
}

const storage: StorageLikeAsync = {
  async getItem(address) {
    await useConn().waitForUnlock()
    const res = await useConn().db!.query(`SELECT * FROM wallet WHERE address = ? AND active = true`, [address])
    return JSON.stringify(res.values?.at(0)?.value) || ''
  },
  async setItem(address, newWalletStr) {
    await useConn().waitForUnlock()
    // When we add a new wallet, we need to deactivate the previous one if the new address is different
    await useConn().db!.run(`UPDATE wallet SET active = false WHERE active = true AND address != ?`, [address])

    // We need to parse the wallet because the useStorageAsync requires to do so
    const { active, balance, end, proofSize, start, status, publicKey } = JSON.parse(newWalletStr) as Omit<RemoteSigner, 'id'>
    const args = [address, status, balance, proofSize, active, publicKey, start, end] // TODO Check this logix! some fields are missing
    await useConn().db!.run(`INSERT INTO wallet (address, type, status, balance, proofSize, active, publicKey, start, end) VALUES (?, 'remote', ?, ?, ?, ?, ?, ?, ?)`, args)
  },
  removeItem: () => {},
}

const serializer: Serializer<RemoteSigner> = {
  read: value => JSON.parse(value) as RemoteSigner,
  write: value => JSON.stringify(value),
}

export const useRemoteSigner = defineStore('remote-signer', () => {
  const { head } = useNimiqNetwork()
  const { getStatus, getRemoteSigner } = useRemoteSignerApi()

  const remoteHeight = computedAsync(() => getStatus().then(r => r.data?.blockHeight || 0), 0)

  const remoteAddress = ref<Nimiq.Address>(Nimiq.Address.fromString(''))
  const currentSigner = computedAsync(() => getRemoteSigner({ address: remoteAddress.value }).then(r => r.data))
  const remoteSigner = useStorageAsync('remote-signer', currentSigner.value!, storage, { serializer })
  const start = computed(() => remoteSigner.value?.start || 0)
  const end = computed(() => remoteSigner.value?.end || 0)
  const remoteBalance = computed(() => remoteSigner.value?.balance || 0)
  const remotePublicKey = computed(() => remoteSigner.value?.publicKey || '')
  const remoteProofSize = computed(() => remoteSigner.value?.proofSize || 0)

  // Checks if the remote is in the validity window, which means that the remote
  // wallet and the local wallet have currently an active HTLC.
  const htlcIsActive = computed(() => start.value < head.value!.height && end.value > head.value!.height)
  const htlcHasExpired = computed(() => end.value < head.value!.height)

  // Updates the balance of the current active wallet in the database and in the store
  const updateBalance = (newBalance: number) => remoteSigner.value = { ...remoteSigner.value, balance: newBalance }

  // Updates the validity of the current active wallet in the database and in the store
  const updateValidity = (newStart: number, newEnd: number) => remoteSigner.value = { ...remoteSigner.value, start: newStart, end: newEnd }

  return {
    remoteAddress,
    remoteSigner,
    hasSigner: computed(() => !!remoteSigner.value),
    start,
    end,
    remoteBalance,
    remotePublicKey,
    remoteProofSize,
    remoteHeight,

    htlcIsActive,
    htlcHasExpired,

    updateBalance,
    updateValidity,
  }
})
