import { defineStore, storeToRefs } from 'pinia'
import { computedAsync, until } from '@vueuse/core'
import { computed, readonly, ref } from 'vue'
import { useConn } from './conn'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import { type RemoteSigner, SQLQuery } from '@/lib/sql-queries'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('remote-signer')

export function parseAddress<T extends RemoteSigner | RemoteSigner[] | undefined>(remoteSigners: T): T {
  if (!remoteSigners)
    return undefined as T
  if (Array.isArray(remoteSigners))
    return remoteSigners.map(parseAddress) as T
  return { ...remoteSigners, address: Nimiq.Address.fromUserFriendlyAddress(remoteSigners.address as unknown as string) }
}

function useRemoteSignerDb() {
  const { run, query } = useConn()
  return {
    async getAllRemoteSigners() {
      return await query<RemoteSigner[]>(SQLQuery.GetAllRemoteSigners).then(parseAddress)
    },

    async getActiveRemoteSigner() {
      return await query<RemoteSigner | undefined>(SQLQuery.GetActiveRemoteSigner, [], { single: true }).then(parseAddress)
    },

    async setRemoteSigner({ active, balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      // When we add a new wallet, we need to deactivate the previous one if the new address is different
      await run(SQLQuery.DeactivateRemoteSigners)

      logger.log('✒️ Updating Remote Signer', { address: address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, active })
      await run(SQLQuery.InsertRemoteSigner, [address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, active])
    },

    async deactivateAllRemoteSigners() {
      await run(SQLQuery.DeactivateRemoteSigners)
    },

    async updateBalance(newBalance: number, address: Nimiq.Address) {
      logger.log(`✒️ Updating balance of remote signer ${address.toUserFriendlyAddress()} to ${newBalance}`)
      await run(SQLQuery.UpdateRemoteBalance, [newBalance, address.toUserFriendlyAddress()])
    },

    async updateActiveWallet({ balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      logger.log(`✒️ Updating active wallet ${address.toUserFriendlyAddress()} to`, { start, end, proofSize, publicKey, balance })
      await run(SQLQuery.UpdateActiveWallet, [start, end, proofSize, publicKey, balance, address.toUserFriendlyAddress()])
    },
  }
}

export const useRemoteSigner = defineStore('remote-signer', () => {
  const { client, getAccounts } = useNimiqNetwork()
  const { height } = storeToRefs(useNimiqNetwork())
  const { getStatus, getRemoteSigner } = useRemoteSignerApi()
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { getActiveRemoteSigner, getAllRemoteSigners, setRemoteSigner, updateBalance, updateActiveWallet: _updateActiveWallet, deactivateAllRemoteSigners } = useRemoteSignerDb()

  const remoteSigner = ref<RemoteSigner>()

  const status = computedAsync(async () => height.value ? (await getStatus()).data : undefined)
  const remoteHeight = computed(() => status.value?.blockHeight || 0)
  const remotePublicKey = computed(() => status.value?.servicePublicKey || undefined)
  const remoteAddress = computed(() => remoteSigner.value?.address)
  const start = computed(() => remoteSigner.value?.start || 0)
  const end = computed(() => remoteSigner.value?.end || 0)
  const remoteBalance = ref(0)
  const remoteProofSize = computed(() => remoteSigner.value?.proofSize || 0)

  // Checks if the remote is in the validity window, which means that the remote
  // wallet and the local wallet have currently an active HTLC.
  const isHtlcActive = computed(() => remoteBalance.value > 0 && start.value < height.value && end.value > height.value)
  const blocksUntilHtlcActive = computed(() => Math.min(Math.max(((start.value - height.value) + 1), 0), 10))
  const hasHtlcExpired = computed(() => remoteAddress.value && end.value < height.value)
  const isHtlcPending = computed(() => start.value > height.value)

  const isRemoteOk = computed(() => status.value?.status === 'good' || false)

  async function updateRemoteSigner(signer: RemoteSigner | undefined) {
    logger.log('📡 Updating remote signer', signer)
    if (signer)
      await setRemoteSigner(signer)
    else
      await deactivateAllRemoteSigners()
    remoteSigner.value = signer
  }

  async function updateActiveWallet() {
    if (!remoteSigner.value)
      return
    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: remoteSigner.value.address })
    if (error || !remoteSignerApi)
      return
    remoteSigner.value = remoteSignerApi
    remoteBalance.value = remoteSignerApi.balance || 0
    await _updateActiveWallet(remoteSignerApi)
  }

  async function updateRemoteFromApi() {
    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: localAddress })
    if (error || !remoteSignerApi) {
      logger.log('📡 No remote signer found in the database and no remote signer found in the API. Waiting for funds to be sent')
      return
    }
    await updateRemoteSigner(remoteSignerApi)
  }

  /**
   * Fetches all the remote signers from the database and updates their balance from the blockchain
   */
  async function updateSignersTableBalance() {
    const remoteSigners = await getAllRemoteSigners()
    if (!remoteSigners)
      return
    // Don't check if validity end is more than 2.5 weeks in the past, because those wallets are already extended and not used anymore
    const oneWeekAgo = height.value - 2.5 /* weeks */ * 7 /* days */ * 24 /* hours */ * 60 /* minutes */ * 1 /* blocks per minute */
    const remoteSignersToCheck = remoteSigners.filter(remoteSigner => remoteSigner.end > (height.value - oneWeekAgo))

    if (remoteSignersToCheck.length === 0)
      return

    // eslint-disable-next-line no-console
    console.log('📡 Updating remote signers table balance')
    const addresses = remoteSignersToCheck.map(remoteSigner => remoteSigner.address)
    const { data: accounts, error } = await getAccounts(addresses)
    if (error || !accounts) {
      logger.error('Error getting accounts for Remote Signers', error)
      return
    }

    // Assuming accounts are in the same order as addresses
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i]
      const remoteSigner = remoteSignersToCheck[i]
      const newBalance = account.balance
      if (remoteSigner.balance !== newBalance) {
        logger.log(`✒️ Updating balance of remote signer ${remoteSigner.address.toUserFriendlyAddress()} to ${newBalance}`)
        await updateBalance(newBalance, remoteSigner.address)
      }
    }
  }

  /**
   * Fetches all the remote signers from the blockchain and saves them in the database as inactive
   * The updateRemoteFromApi will set the active one
   */
  async function getRemoteSignersFromBlockchain() {
    const transactions = await client!.getTransactionsByAddress(localAddress.value)
    await until(remotePublicKey).not.toBeUndefined()

    logger.log('All Transactions from Blockchain', transactions?.map(tx => tx.toPlain()))
    const htlcTransactions = transactions?.filter(tx => tx.recipientType === Nimiq.Account.Type.HTLC)
    for (const tx of htlcTransactions) {
      const htlcData = Nimiq.HashedTimeLockedContract.dataToPlain(tx.data.raw)
      await updateRemoteSigner({
        active: false,
        balance: 0,
        address: tx.recipient as Nimiq.Address,
        publicKey: remotePublicKey.value!,
        start: tx.validityStartHeight,
        end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
        proofSize: tx.proof.raw.length,
      })
    }
  }

  /**
   * Initializes the remote signer variables with the following algorithm:
   * 1. Check if we have a local wallet:
   *    - If we don't have, do nothing
   * 2. Check if we have a remote signer in the database:
   * 3. Get the remote signer from the API:
   * 4. Update the remote signer in the database
   * 5. Set the remote signer in the store
   */
  async function init() {
    if (!hasLocalWallet.value)
      return

    remoteSigner.value = await getActiveRemoteSigner()
    await updateSignersTableBalance()

    if (!remoteSigner.value) {
      logger.log('📡 We don\'t have a remote signer in the database. Getting it from the API')
      await getRemoteSignersFromBlockchain()
    }

    await updateRemoteFromApi()

    client!.addHeadChangedListener(async () => {
      // Check if there is a new remote wallet that we don't have in the database, only if the one we have has 0 balance
      // Mainly for the case when the user recovers the wallet from the words
      if (remoteBalance.value === 0 && height.value % 10 === 0)
        await updateRemoteFromApi()
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
    blocksUntilHtlcActive,
    hasHtlcExpired,
    isHtlcPending,

    updateBalance,
    updateActiveWallet,
    updateRemoteSigner,
    updateSignersTableBalance,

    getAllRemoteSigners,

    init,
  }
})
