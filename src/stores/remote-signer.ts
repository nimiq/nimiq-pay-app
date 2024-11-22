import type { Address, PlainTransactionDetails } from '@nimiq/core'
import { useRemoteSignerApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { type RemoteSigner, SQLQuery } from '@/lib/sql-queries'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { computedAsync, until, useInterval } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, ref } from 'vue'
import { useConn } from './conn'

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

      logger.log('✒️ Updating Remote Signer in db', { address: address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, active })
      await run(SQLQuery.InsertRemoteSigner, [address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, active])
    },

    /**
     * Adds a new remote signer to the database, but doesn't set it as active.
     * Used when we get an old remote signer from the blockchain.
     */
    async addInactiveRemoteSigner({ balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      logger.log('✒️ Adding Remote Signer', { address: address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end })
      await run(SQLQuery.InsertRemoteSigner, [address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, false])
    },

    async deactivateAllRemoteSigners() {
      await run(SQLQuery.DeactivateRemoteSigners)
    },

    async updateBalance(newBalance: number, address: Address) {
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
  const { getAccounts, getBalance } = useNimiqNetwork()
  const { headTimestamp, height, client } = storeToRefs(useNimiqNetwork())
  const { getStatus, getRemoteSigner } = useRemoteSignerApi()
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { getActiveRemoteSigner, getAllRemoteSigners, setRemoteSigner, updateBalance, updateActiveWallet: _updateActiveWallet, deactivateAllRemoteSigners, addInactiveRemoteSigner } = useRemoteSignerDb()

  const remoteSigner = ref<RemoteSigner>()

  const forceRefresh = useInterval(5000)
  const status = computedAsync(async () => forceRefresh.value ? (await getStatus()).data : undefined)
  const remoteHeight = computed(() => status.value?.blockHeight || -1)
  const remotePublicKey = computed(() => status.value?.servicePublicKey || undefined)
  const remoteAddress = computed(() => remoteSigner.value?.address)
  const start = computed(() => remoteSigner.value?.start || 0)
  const end = computed(() => remoteSigner.value?.end || 0)
  const remoteBalance = ref(-1)
  const remoteProofSize = computed(() => remoteSigner.value?.proofSize || 0)

  // Checks if the remote is in the validity window, which means that the remote
  // wallet and the local wallet have currently an active HTLC.
  const isHtlcActive = ref(false)
  const hasHtlcExpired = computed(() => remoteAddress.value && end.value < headTimestamp.value)
  const isHtlcPending = computed(() => start.value > headTimestamp.value)

  const isRemoteOk = computed(() => status.value?.status === 'good' || false)

  async function addRemoteSigner(signer: RemoteSigner) {
    if (!remoteSigner.value)
      await updateRemoteSigner(signer)
    else
      await addInactiveRemoteSigner(signer)
  }

  async function updateRemoteSigner(signer: RemoteSigner | undefined) {
    logger.log('📡 Updating remote signer', { ...signer, address: signer?.address.toUserFriendlyAddress() })
    if (signer)
      await setRemoteSigner(signer)
    else
      await deactivateAllRemoteSigners()
    remoteSigner.value = signer
    // Set the balance even when it's not confirmed to avoid the user to see the skeleton for a long time
    remoteBalance.value = signer?.balance || -1
  }

  async function updateActiveWallet() {
    if (!remoteSigner.value)
      return
    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: remoteSigner.value.address })
    if (error || !remoteSignerApi)
      return

    let tx: PlainTransactionDetails | undefined
    try {
      logger.log('Getting transaction', remoteSignerApi.creatingTransactionHash)
      tx = await client.value!.getTransaction(remoteSignerApi.creatingTransactionHash)
    }
    catch {}

    if (!tx && remoteSigner.value !== undefined && remoteBalance.value > 0)
      return

    if (!tx)
      logger.log('CreatingTransactionHash not found, using validityStartHeight')

    const newRemoteSigner: RemoteSigner = {
      address: Nimiq.Address.fromString(remoteSignerApi.address),
      balance: remoteSignerApi.balance,
      publicKey: remoteSignerApi.servicePublicKey,
      proofSize: remoteSignerApi.serviceSignatureProofSize,
      start: tx?.timestamp || blockHeightToTimestamp(remoteSignerApi.validityStart),
      end: remoteSignerApi.validityEnd,
      active: true,
    }

    const areEqual = JSON.stringify(remoteSigner.value) === JSON.stringify(newRemoteSigner)
    if (areEqual)
      return

    const [oldRemoteBalance, newRemoteAccount] = await Promise.allSettled([getBalance(remoteSigner.value.address), client.value?.getAccount(newRemoteSigner.address)])
    // Don't replace remote signer if old balance is higher than 0 and new balance is 0
    if (oldRemoteBalance.status === 'fulfilled' && newRemoteAccount.status === 'fulfilled' && oldRemoteBalance.value.data > 0 && newRemoteAccount.value && newRemoteAccount.value.balance === 0)
      return

    remoteSigner.value = newRemoteSigner
    logger.log('newRemoteAccount', { remoteSigner: remoteSigner.value, newRemoteAccount })
    remoteBalance.value = newRemoteAccount.status === 'fulfilled' && newRemoteAccount.value?.type === 'htlc' ? newRemoteAccount.value.balance : remoteSignerApi.balance
    await _updateActiveWallet(remoteSigner.value)
  }

  async function updateRemoteFromApi() {
    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: localAddress })
    if (error || !remoteSignerApi) {
      logger.log('📡 No remote signer found in the database and no remote signer found in the API. Waiting for funds to be sent')
      remoteBalance.value = 0
      return
    }

    let tx: PlainTransactionDetails | undefined
    try {
      tx = await client.value!.getTransaction(remoteSignerApi.creatingTransactionHash)
    }
    catch {
      logger.log('CreatingTransactionHash not found, using validityStartHeight')
    }

    const newRemoteSigner = {
      address: Nimiq.Address.fromString(remoteSignerApi.address),
      balance: remoteSignerApi.balance,
      publicKey: remoteSignerApi.servicePublicKey,
      proofSize: remoteSignerApi.serviceSignatureProofSize,
      start: tx?.timestamp || blockHeightToTimestamp(remoteSignerApi.validityStart),
      end: remoteSignerApi.validityEnd,
      active: true,
    }
    logger.log({
      remoteSigner: { ...remoteSigner.value, address: remoteSigner.value?.address.toUserFriendlyAddress() },
      newRemoteSigner: { ...newRemoteSigner, address: newRemoteSigner.address.toUserFriendlyAddress() },
    })
    if (remoteSigner.value) {
      const [oldRemoteBalance, newRemoteBalance] = await Promise.allSettled([getBalance(remoteSigner.value.address), getBalance(newRemoteSigner.address)])
      // Don't replace remote signer if old balance is higher than 0 and new balance is 0
      logger.log({ oldRemoteBalance, newRemoteBalance })
      if (oldRemoteBalance.status === 'fulfilled' && newRemoteBalance.status === 'fulfilled' && oldRemoteBalance.value.data > 0 && newRemoteBalance.value.data === 0)
        return
    }

    const areEqual = JSON.stringify(remoteSigner.value) === JSON.stringify(newRemoteSigner)
    if (areEqual)
      return
    await updateRemoteSigner(newRemoteSigner)
  }

  /**
   * Fetches all the remote signers from the database and updates their balance from the blockchain
   */
  async function updateSignersTableBalance() {
    const remoteSigners = await getAllRemoteSigners()
    if (!remoteSigners)
      return
    // Don't check if validity end is more than 2.5 weeks in the past, because those wallets are already extended and not used anymore
    const oneWeekAgo = headTimestamp.value - 2.5 /* weeks */ * 7 /* days */ * 24 /* hours */ * 60 /* minutes */ * 60 /* seconds */ * 1e3 /* milliseconds */
    const remoteSignersToCheck = remoteSigners.filter(remoteSigner => remoteSigner.end > (headTimestamp.value - oneWeekAgo))

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
      const newBalance = account.type === 'htlc' ? account.balance : 0
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
    await until(client).not.toBeUndefined()
    await until(remotePublicKey).not.toBeUndefined()
    const transactions = await client.value!.getTransactionsByAddress(localAddress.value)

    logger.log('All Transactions from Blockchain', transactions)
    const htlcTransactions = transactions?.filter(tx => tx.recipientType === 'htlc')
    for (const tx of htlcTransactions) {
      const htlcData = tx.data
      await updateRemoteSigner({
        active: false,
        balance: 0,
        address: Nimiq.Address.fromString(tx.recipient),
        publicKey: remotePublicKey.value!,
        start: tx.timestamp || blockHeightToTimestamp(tx.validityStartHeight),
        end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
        proofSize: useRemoteSigner().remoteProofSize,
      })
    }
  }

  async function updateActiveRemoteBalance(newBalance: number) {
    remoteBalance.value = newBalance
    await updateBalance(newBalance, remoteSigner.value!.address)
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
    // await updateActiveWallet()

    await until(client).not.toBeUndefined()
    client.value!.addHeadChangedListener(async () => {
      // Check if there is a new remote wallet that we don't have in the database, only if the one we have has 0 balance
      // Mainly for the case when the user recovers the wallet from the words
      if ((remoteBalance.value === 0 || remoteBalance.value === -1) && height.value % 10 * Nimiq.Policy.BLOCKS_PER_BATCH === 0) {
        logger.log('📡👀 Searching for new remote wallets')
        await updateRemoteFromApi()
      }
    })
  }

  function blockHeightToTimestamp(blockHeight: number): number {
    return Math.floor((Date.now() - (height.value - blockHeight) * 1e3) / 1e3) * 1e3
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
    blockHeightToTimestamp,

    isHtlcActive,
    // blocksUntilHtlcActive,
    hasHtlcExpired,
    isHtlcPending,

    addRemoteSigner,
    updateActiveRemoteBalance,
    updateActiveWallet,
    updateRemoteSigner,
    updateSignersTableBalance,

    getAllRemoteSigners,

    init,
  }
})
