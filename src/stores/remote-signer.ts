import type { Address, PlainTransactionDetails } from '@nimiq/core'
import type { RemoteSigner } from '@/lib/sql-queries'
import { until, useIntervalFn } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, ref, watch } from 'vue'
import { RemoteStatus, useRemoteSignerApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'

const logger = useLogger('remote-signer')
export type HomeBalanceState = 'loading' | 'resolved-empty' | 'resolved-remote'

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
  const { headTimestamp, height, client, consensus } = storeToRefs(useNimiqNetwork())
  const { getStatus, getRemoteSigner } = useRemoteSignerApi()
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { isProcessingRemote } = storeToRefs(useLocks())
  const { getActiveRemoteSigner, getAllRemoteSigners, setRemoteSigner, updateBalance, updateActiveWallet: _updateActiveWallet, deactivateAllRemoteSigners, addInactiveRemoteSigner } = useRemoteSignerDb()

  const remoteSigner = ref<RemoteSigner>()

  const status = ref<RemoteStatus>(RemoteStatus.Unknown)
  const remoteHeight = ref(-1)
  const remotePublicKey = ref<string | undefined>()
  const remoteAddress = computed(() => remoteSigner.value?.address)
  const start = computed(() => remoteSigner.value?.start || 0)
  const end = computed(() => remoteSigner.value?.end || 0)
  const remoteBalance = ref(0)
  const homeBalanceState = ref<HomeBalanceState>('loading')
  // const remoteProofSize = computed(() => remoteSigner.value?.proofSize || 98)
  const remoteProofSize = ref(98)

  // Checks if the remote is in the validity window, which means that the remote
  // wallet and the local wallet have currently an active HTLC.
  const isHtlcActive = ref(false)
  const hasHtlcExpired = computed(() => remoteAddress.value && end.value < headTimestamp.value)
  const isHtlcPending = computed(() => start.value > headTimestamp.value)
  const isHtlcRecreating = ref(false)
  watch([hasHtlcExpired, isHtlcPending, isProcessingRemote], ([expired, pending, processing]) => {
    if (expired)
      isHtlcRecreating.value = true
    else if (!pending && !processing)
      isHtlcRecreating.value = false
  })
  watch(remoteSigner, (newSigner) => {
    if (newSigner === undefined) {
      isHtlcActive.value = false
      homeBalanceState.value = 'loading'
    }
    else {
      homeBalanceState.value = 'resolved-remote'
    }
  })

  const isRemoteOk = computed(() => status.value === RemoteStatus.Good || false)

  useIntervalFn(async () => {
    const { data, error } = await getStatus()
    if (error || !data) {
      logger.error('Error getting cosigner status', error)
      status.value = RemoteStatus.Unknown
      return
    }
    status.value = data.status
    remoteHeight.value = data.blockHeight || -1
    remotePublicKey.value = data.servicePublicKey || undefined
  }, 5000, { immediate: true, immediateCallback: true })

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
    remoteBalance.value = signer?.balance ?? 0
    homeBalanceState.value = signer ? 'resolved-remote' : 'loading'
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
      start: tx?.timestamp || await blockHeightToTimestamp(remoteSignerApi.validityStart),
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
    homeBalanceState.value = 'resolved-remote'
    await _updateActiveWallet(remoteSigner.value)
  }

  async function updateRemoteFromApi() {
    // Check newer remote signer in db first, in case the cosigner server doesn't have it in the db
    const remoteSigners = (await getAllRemoteSigners()).sort((a, b) => b.start - a.start)
    // Get the last stored remote signer and check if it's the same as the one active
    const newerRemoteSigner = remoteSigners.length > 0 ? remoteSigners[0] : undefined
    if (newerRemoteSigner && newerRemoteSigner.address !== remoteSigner.value?.address) {
      logger.log('📡 Found a newer remote signer that is not the active one')
      // Tell the cosigner the new address, in case it's not known for whatever reason
      await getRemoteSigner({ address: newerRemoteSigner.address })
    }

    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: localAddress })
    if (error || !remoteSignerApi) {
      logger.log('📡 No remote signer found in the API. Waiting for funds to be sent')
      if (!remoteSigner.value || remoteSigner.value.balance === 0) {
        logger.log('📡 No remote signer found in the database or the API. Setting the balance to 0')
        remoteBalance.value = 0
      }
      if (consensus.value === 'established')
        await resolveHomeBalanceState()
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
      start: tx?.timestamp || await blockHeightToTimestamp(remoteSignerApi.validityStart),
      end: remoteSignerApi.validityEnd,
      active: true,
    }
    const remoteSignerPlain = { ...remoteSigner.value, address: remoteSigner.value?.address.toUserFriendlyAddress() }
    const newRemoteSignerPlain = { ...newRemoteSigner, address: newRemoteSigner.address.toUserFriendlyAddress() }
    logger.log({
      remoteSigner: remoteSignerPlain,
      newRemoteSigner: newRemoteSignerPlain,
    })
    if (remoteSigner.value) {
      const [oldRemoteBalance, newRemoteBalance] = await Promise.allSettled([getBalance(remoteSigner.value.address), getBalance(newRemoteSigner.address)])
      // Don't replace remote signer if old balance is higher than 0 and new balance is 0
      logger.log({ oldRemoteBalance, newRemoteBalance })
      if (oldRemoteBalance.status === 'fulfilled' && newRemoteBalance.status === 'fulfilled') {
        if (!oldRemoteBalance.value.error && !newRemoteBalance.value.error) {
          if (oldRemoteBalance.value.data > 0 && newRemoteBalance.value.data === 0)
            return
          if (oldRemoteBalance.value.data === 0 && newRemoteBalance.value.data === 0)
            return
        }
      }
    }

    const areEqual = JSON.stringify(remoteSignerPlain) === JSON.stringify(newRemoteSignerPlain)
    if (areEqual)
      return
    await updateRemoteSigner(newRemoteSigner)
  }

  async function resolveHomeBalanceState() {
    const setResolvedState = (state: HomeBalanceState) => {
      homeBalanceState.value = state
      if (state === 'resolved-empty') {
        remoteBalance.value = 0
        isProcessingRemote.value = false
      }
      return homeBalanceState.value
    }

    if (remoteSigner.value)
      return setResolvedState('resolved-remote')

    if (!hasLocalWallet.value || !localAddress.value || consensus.value !== 'established')
      return setResolvedState('loading')

    await until(client).not.toBeUndefined()

    const [{ data: localMainBalance, error }, transactions] = await Promise.all([
      getBalance(localAddress.value),
      client.value!.getTransactionsByAddress(localAddress.value),
    ])

    if (remoteSigner.value || transactions.some(tx => tx.recipientType === 'htlc'))
      return setResolvedState('resolved-remote')

    if (!error && localMainBalance === 0)
      return setResolvedState('resolved-empty')

    return setResolvedState('loading')
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
    await client.value!.waitForConsensusEstablished()
    const transactions = await client.value!.getTransactionsByAddress(localAddress.value)

    logger.log('All Transactions from Blockchain', transactions)
    const htlcTransactions = transactions?.filter(tx => tx.recipientType === 'htlc')
    // If no HTLC transactions, we don't need to wait for the remote public key because there is no remote signer until the user sends funds
    if (htlcTransactions.length) {
      try {
        await until(remotePublicKey).not.toBeUndefined({ timeout: 10000, throwOnTimeout: true })
      }
      catch {
        logger.error('Remote Public Key not found')
        return
      }
    }
    for (const tx of htlcTransactions) {
      const htlcData = tx.data
      await updateRemoteSigner({
        active: false,
        balance: 0,
        address: Nimiq.Address.fromString(tx.recipient),
        publicKey: remotePublicKey.value!,
        start: tx.timestamp || await blockHeightToTimestamp(tx.validityStartHeight),
        end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
        proofSize: useRemoteSigner().remoteProofSize,
      })
    }
    await updateRemoteFromApi()
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

    try {
      logger.log('📡 Initializing Remote Signer Store')
      const activeRemoteSigner = await getActiveRemoteSigner()
      remoteSigner.value = activeRemoteSigner
      if (activeRemoteSigner) {
        remoteBalance.value = activeRemoteSigner.balance
        homeBalanceState.value = 'resolved-remote'
      }
      logger.log('📡 Remote Signer from DB', remoteSigner.value ? { ...remoteSigner.value, address: remoteSigner.value.address.toUserFriendlyAddress() } : null)
      await updateSignersTableBalance()

      if (!remoteSigner.value) {
        logger.log('📡 We don\'t have a remote signer in the database. Getting it from the API')
        getRemoteSignersFromBlockchain()
      }

      updateRemoteFromApi()
      await until(client).not.toBeUndefined()
      client.value!.addHeadChangedListener(async () => {
        // Check if there is a new remote wallet that we don't have in the database, only if the one we have has 0 balance
        // Mainly for the case when the user recovers the wallet from the words
        if ((remoteBalance.value === 0 || homeBalanceState.value === 'loading') && height.value % (10 * Nimiq.Policy.BLOCKS_PER_BATCH) === 0) {
          logger.log('📡👀 Searching for new remote wallets')
          await updateRemoteFromApi()
        }
      })
    }
    catch (error) {
      logger.error('Error initializing Remote Signer Store', error)
    }
  }

  async function blockHeightToTimestamp(blockHeight: number): Promise<number> {
    let currentHeight = 0
    if (consensus.value === 'established') {
      currentHeight = height.value
    }
    else {
      await until(remoteHeight).not.toBe(-1)
      currentHeight = remoteHeight.value
    }
    return Math.floor((Date.now() - (currentHeight - blockHeight) * 1e3) / 1e3) * 1e3
  }

  return {
    isRemoteOk,
    remoteAddress,
    remoteSigner: readonly(remoteSigner),
    hasSigner: computed(() => !!remoteSigner.value),
    start,
    end,
    remoteBalance,
    homeBalanceState,
    remotePublicKey,
    remoteProofSize,
    remoteHeight,
    blockHeightToTimestamp,
    resolveHomeBalanceState,

    isHtlcActive,
    hasHtlcExpired,
    isHtlcPending,
    isHtlcRecreating,

    addRemoteSigner,
    updateActiveRemoteBalance,
    updateActiveWallet,
    updateRemoteSigner,
    updateSignersTableBalance,

    getAllRemoteSigners,

    init,
  }
})
