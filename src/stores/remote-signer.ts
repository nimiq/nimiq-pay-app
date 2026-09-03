import type { Address, Client, PlainTransactionDetails } from '@nimiq/core'
import type { RemoteSigner } from '@/lib/sql-queries'
import { until, useIntervalFn } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, ref, watch } from 'vue'
import { RemoteStatus, useRemoteSignerApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { SQLQuery } from '@/lib/sql-queries'
import { promiseWithTimeout } from '@/lib/utils'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { NO_ACCOUNT_ERROR, useNimiqNetwork } from '@/stores/nimiq-network'

const logger = useLogger('remote-signer')
export type HomeBalanceState = 'loading' | 'resolved-empty' | 'resolved-remote'
const REMOTE_SIGNER_BALANCE_BATCH_SIZE = 20
const HISTORY_PAGE_SIZE = 100
const DISCOVER_TIMEOUT_MS = 30_000

export interface RemoteSignerValidationDetails {
  address: string
  balance: number
  timeout: number
  expired: boolean
  owner: string
  cosignerRecipient: string
  creationTransactionHash?: string
  creationState?: PlainTransactionDetails['state'] | 'unavailable'
  signer: RemoteSigner
}

export type RemoteSignerValidationResult
  = | ({ status: 'importable' } & RemoteSignerValidationDetails)
    | ({ status: 'known' } & RemoteSignerValidationDetails)
    | { status: 'invalid', address?: string, reason: string }

export type ImportableRemoteSigner = Extract<RemoteSignerValidationResult, { status: 'importable' }>

export interface RemoteSignerDiscoveryResult {
  added: number
  alreadyKnown: number
  localComplete: boolean
  errors: string[]
}

interface LocalHistoryOptions {
  sinceHeight?: number
  startAt?: string
  limit?: number
}

interface WalletContext {
  address: Address
  client: Client
  network: string
  owner: string
}

interface WalletIdentity {
  network: string
  owner: string
}

export function parseAddress<T extends RemoteSigner | RemoteSigner[] | undefined>(remoteSigners: T): T {
  if (!remoteSigners)
    return undefined as T
  if (Array.isArray(remoteSigners))
    return remoteSigners.map(parseAddress) as T
  return { ...remoteSigners, address: Nimiq.Address.fromUserFriendlyAddress(remoteSigners.address as unknown as string) }
}

function useRemoteSignerDb() {
  const { run, runSet, query } = useConn()
  let signerWriteQueue = Promise.resolve()
  return {
    async getAllRemoteSigners() {
      return parseAddress(await query<RemoteSigner[]>(SQLQuery.GetAllRemoteSigners))
    },

    async getActiveRemoteSigner() {
      await signerWriteQueue
      return parseAddress(await query<RemoteSigner | undefined>(SQLQuery.GetActiveRemoteSigner, [], { single: true }))
    },

    async setRemoteSigner({ active, balance, end, proofSize, start, publicKey, address }: RemoteSigner, isCurrent: () => boolean = () => true) {
      // Serialize wallet changes so an obsolete write cannot finish after the current one.
      const write = signerWriteQueue.then(async () => {
        if (!isCurrent())
          return false

        const addressString = address.toUserFriendlyAddress()
        logger.log('✒️ Updating Remote Signer in db', { address: addressString, balance, proofSize, publicKey, start, end, active })
        await runSet([
          { statement: SQLQuery.DeactivateRemoteSigners },
          { statement: SQLQuery.InsertRemoteSigner, values: [addressString, balance, proofSize, publicKey, start, end, active] },
        ])
        if (isCurrent())
          return true

        // Never persist an active signer from a wallet that changed during the native DB write.
        await run(SQLQuery.DeactivateRemoteSigners)
        return false
      })
      signerWriteQueue = write.then(() => undefined, () => undefined)
      return write
    },

    /**
     * Adds a new remote signer to the database, but doesn't set it as active.
     * Used when we get an old remote signer from the blockchain.
     */
    async insertInactiveRemoteSigner({ balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      logger.log('✒️ Adding Remote Signer', { address: address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end })
      const result = await run(SQLQuery.InsertInactiveRemoteSigner, [address.toUserFriendlyAddress(), balance, proofSize, publicKey, start, end, false])
      return (result.changes?.changes ?? 0) > 0
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
  const { createHistoryClient, getAccount, getAccounts, getBalance } = useNimiqNetwork()
  const { headTimestamp, height, client, consensus, networkName } = storeToRefs(useNimiqNetwork())
  const { getStatus, getRemoteSigner } = useRemoteSignerApi()
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { isProcessingRemote } = storeToRefs(useLocks())
  const { getActiveRemoteSigner, getAllRemoteSigners, setRemoteSigner, updateBalance, updateActiveWallet: _updateActiveWallet, deactivateAllRemoteSigners, insertInactiveRemoteSigner } = useRemoteSignerDb()

  function getWalletIdentity(): WalletIdentity | undefined {
    if (!localAddress.value)
      return undefined
    return {
      network: networkName.value,
      owner: localAddress.value.toUserFriendlyAddress(),
    }
  }

  function isWalletIdentityCurrent(identity: WalletIdentity) {
    const current = getWalletIdentity()
    return current?.network === identity.network && current.owner === identity.owner
  }

  function getWalletContext(): WalletContext | undefined {
    if (!localAddress.value || !client.value)
      return undefined
    return {
      address: localAddress.value,
      client: client.value,
      network: networkName.value,
      owner: localAddress.value.toUserFriendlyAddress(),
    }
  }

  function isWalletContextCurrent(context: WalletContext) {
    const current = getWalletContext()
    return current?.client === context.client && current.network === context.network && current.owner === context.owner
  }

  const remoteSigner = ref<RemoteSigner>()

  const status = ref<RemoteStatus>(RemoteStatus.Unknown)
  const remoteHeight = ref(-1)
  const remotePublicKey = ref<string | undefined>()
  const remoteAddress = computed(() => remoteSigner.value?.address)
  const start = computed(() => remoteSigner.value?.start || 0)
  const end = computed(() => remoteSigner.value?.end || 0)
  const remoteBalance = ref(0)
  // Last positive balance, in-memory only — cold start is covered by DB hydration in init().
  // Lets the home screen keep showing a number while the HTLC is drained/recreated.
  const lastKnownRemoteBalance = ref(0)
  watch(remoteBalance, (balance) => {
    if (balance > 0)
      lastKnownRemoteBalance.value = balance
  })
  const homeBalanceState = ref<HomeBalanceState>('loading')
  // const remoteProofSize = computed(() => remoteSigner.value?.proofSize || 98)
  const remoteProofSize = ref(98)

  // Checks if the remote is in the validity window, which means that the remote
  // wallet and the local wallet have currently an active HTLC.
  const isHtlcActive = ref(false)
  // An expired HTLC with no balance is inert: nothing to recover, so it must not drive the
  // recovery / "Updating connection" UI. Require funds, mirroring checkRemoteValidity's gate.
  const hasHtlcExpired = computed(() => remoteAddress.value && end.value < headTimestamp.value && remoteBalance.value > 0)
  const isHtlcPending = computed(() => start.value > headTimestamp.value)
  const isHtlcRecreating = ref(false)
  // immediate so the flag is correct when the app starts in an already-expired state.
  watch([hasHtlcExpired, isHtlcPending, isProcessingRemote], ([expired, pending, processing]) => {
    if (expired)
      isHtlcRecreating.value = true
    else if (!pending && !processing)
      isHtlcRecreating.value = false
  }, { immediate: true })
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
      await insertInactiveRemoteSigner(signer)
    invalidateRemoteSignerAddressCache()
  }

  async function updateRemoteSigner(signer: RemoteSigner | undefined, expectedContext?: WalletContext) {
    if (expectedContext && !isWalletContextCurrent(expectedContext))
      return
    logger.log('📡 Updating remote signer', { ...signer, address: signer?.address.toUserFriendlyAddress() })
    if (signer) {
      const stored = await setRemoteSigner(signer, () => !expectedContext || isWalletContextCurrent(expectedContext))
      if (!stored)
        return
    }
    else {
      await deactivateAllRemoteSigners()
    }
    if (expectedContext && !isWalletContextCurrent(expectedContext))
      return
    remoteSigner.value = signer
    remoteBalance.value = signer?.balance ?? 0
    homeBalanceState.value = signer ? 'resolved-remote' : 'loading'
    invalidateRemoteSignerAddressCache()
  }

  async function activateRemoteSignerFromTransaction(transaction: Pick<PlainTransactionDetails, 'data' | 'recipient' | 'timestamp' | 'validityStartHeight' | 'value'>) {
    const data = transaction.data
    const context = getWalletContext()
    const owner = context?.owner
    const publicKey = remotePublicKey.value
    let cosigner: string | undefined
    try {
      cosigner = publicKey && Nimiq.PublicKey.fromHex(publicKey).toAddress().toUserFriendlyAddress()
    }
    catch {}
    if (data.type !== 'htlc' || !publicKey || data.sender !== owner || data.recipient !== cosigner)
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')

    const start = transaction.timestamp || await blockHeightToTimestamp(transaction.validityStartHeight)
    if (!context || !isWalletContextCurrent(context) || remotePublicKey.value !== publicKey)
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')
    await updateRemoteSigner({
      active: true,
      balance: transaction.value,
      publicKey,
      start,
      address: Nimiq.Address.fromUserFriendlyAddress(transaction.recipient),
      end: data.timeout,
      proofSize: remoteProofSize.value,
    }, context)
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

  async function updateRemoteFromApi(historyProvesNoHtlc = false, expectedContext?: WalletContext) {
    const context = expectedContext || getWalletContext()
    if (!context)
      return
    // Check newer remote signer in db first, in case the cosigner server doesn't have it in the db
    const remoteSigners = (await getAllRemoteSigners()).sort((a, b) => b.start - a.start)
    if (!isWalletContextCurrent(context))
      return
    // Get the last stored remote signer and check if it's the same as the one active
    const newerRemoteSigner = remoteSigners.length > 0 ? remoteSigners[0] : undefined
    if (newerRemoteSigner && (!remoteSigner.value || !newerRemoteSigner.address.equals(remoteSigner.value.address))) {
      logger.log('📡 Found a newer remote signer that is not the active one')
      // Tell the cosigner the new address, in case it's not known for whatever reason
      await getRemoteSigner({ address: newerRemoteSigner.address })
      if (!isWalletContextCurrent(context))
        return
    }

    const { data: remoteSignerApi, error } = await getRemoteSigner({ address: context.address })
    if (!isWalletContextCurrent(context))
      return
    if (error || !remoteSignerApi) {
      logger.log('📡 No remote signer found in the API. Waiting for funds to be sent')
      if (!remoteSigner.value || remoteSigner.value.balance === 0) {
        logger.log('📡 No remote signer found in the database or the API. Setting the balance to 0')
        remoteBalance.value = 0
      }
      if (consensus.value === 'established')
        await resolveHomeBalanceState(historyProvesNoHtlc, context)
      return
    }

    let tx: PlainTransactionDetails | undefined
    try {
      tx = await context.client.getTransaction(remoteSignerApi.creatingTransactionHash)
    }
    catch {
      logger.log('CreatingTransactionHash not found, using validityStartHeight')
    }
    if (!isWalletContextCurrent(context))
      return

    const newRemoteSigner = {
      address: Nimiq.Address.fromString(remoteSignerApi.address),
      balance: remoteSignerApi.balance,
      publicKey: remoteSignerApi.servicePublicKey,
      proofSize: remoteSignerApi.serviceSignatureProofSize,
      start: tx?.timestamp || await blockHeightToTimestamp(remoteSignerApi.validityStart),
      end: remoteSignerApi.validityEnd,
      active: true,
    }
    if (!isWalletContextCurrent(context))
      return
    const remoteSignerPlain = { ...remoteSigner.value, address: remoteSigner.value?.address.toUserFriendlyAddress() }
    const newRemoteSignerPlain = { ...newRemoteSigner, address: newRemoteSigner.address.toUserFriendlyAddress() }
    logger.log({
      remoteSigner: remoteSignerPlain,
      newRemoteSigner: newRemoteSignerPlain,
    })
    // Cross-network mismatch detector: stored signer's cosigner publicKey differs from the API
    // response's. Likely cause: switched networks without purging remote_signers (or migration
    // bug). Surface as a warning so cross-network bugs aren't silent in logs.
    if (remoteSigner.value && remoteSigner.value.publicKey !== newRemoteSigner.publicKey) {
      logger.warn(`⚠️ remote signer publicKey mismatch — stored=${remoteSigner.value.publicKey} api=${newRemoteSigner.publicKey}. Likely stale cross-network state.`)
    }
    if (remoteSigner.value) {
      const [oldRemoteBalance, newRemoteBalance] = await Promise.allSettled([getBalance(remoteSigner.value.address), getBalance(newRemoteSigner.address)])
      if (!isWalletContextCurrent(context))
        return
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
    if (!isWalletContextCurrent(context))
      return
    await updateRemoteSigner(newRemoteSigner, context)
  }

  async function resolveHomeBalanceState(historyProvesNoHtlc = false, expectedContext?: WalletContext) {
    const identity = getWalletIdentity()
    let context = expectedContext || getWalletContext()
    const setResolvedState = (state: HomeBalanceState) => {
      if ((identity && !isWalletIdentityCurrent(identity)) || (context && !isWalletContextCurrent(context)))
        return homeBalanceState.value
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
    if (!identity || !isWalletIdentityCurrent(identity))
      return homeBalanceState.value
    context ||= getWalletContext()
    if (!context || !isWalletContextCurrent(context))
      return homeBalanceState.value

    try {
      const [{ data: localMainBalance, error }, transactions] = await Promise.all([
        getBalance(context.address),
        historyProvesNoHtlc ? Promise.resolve([]) : getLocalTransactions({ limit: HISTORY_PAGE_SIZE }),
      ])

      if (remoteSigner.value || transactions.some(tx => tx.recipientType === 'htlc'))
        return setResolvedState('resolved-remote')

      // A full page can hide older HTLCs, so only a final partial page proves empty history.
      if (!error && localMainBalance === 0 && (historyProvesNoHtlc || transactions.length < HISTORY_PAGE_SIZE))
        return setResolvedState('resolved-empty')
    }
    catch (error) {
      logger.error('resolveHomeBalanceState: getTransactionsByAddress failed', error)
    }

    return setResolvedState('loading')
  }

  /**
   * Fetches all the remote signers from the database and updates their balance from the blockchain
   */
  async function updateSignersTableBalance(expectedIdentity = getWalletIdentity()) {
    if (!expectedIdentity)
      return
    const remoteSigners = await getAllRemoteSigners()
    if (!isWalletIdentityCurrent(expectedIdentity))
      return
    if (!remoteSigners)
      return
    if (remoteSigners.length === 0)
      return

    // eslint-disable-next-line no-console
    console.log('📡 Updating remote signers table balance')
    for (let offset = 0; offset < remoteSigners.length; offset += REMOTE_SIGNER_BALANCE_BATCH_SIZE) {
      const remoteSignerBatch = remoteSigners.slice(offset, offset + REMOTE_SIGNER_BALANCE_BATCH_SIZE)
      const addresses = remoteSignerBatch.map(remoteSigner => remoteSigner.address)
      const { data: accounts, error } = await getAccounts(addresses)
      if (!isWalletIdentityCurrent(expectedIdentity))
        return
      if (error || !accounts) {
        logger.error('Error getting accounts for Remote Signers', error)
        continue
      }

      // Assuming accounts are in the same order as addresses
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i]
        const remoteSigner = remoteSignerBatch[i]
        const newBalance = account.type === 'htlc' ? account.balance : 0
        if (remoteSigner.balance !== newBalance) {
          if (!isWalletIdentityCurrent(expectedIdentity))
            return
          logger.log(`✒️ Updating balance of remote signer ${remoteSigner.address.toUserFriendlyAddress()} to ${newBalance}`)
          await updateBalance(newBalance, remoteSigner.address)
        }
      }
    }
  }

  /**
   * Fetches all the remote signers from the blockchain and saves them in the database as inactive
   * The updateRemoteFromApi will set the active one
   */
  // Cached set of our remote-signer addresses, invalidated whenever the remote_signers table is mutated.
  // Avoids hitting SQLite on every incoming tx / paginated read / 30s refresh.
  let cachedRemoteSignerAddresses: Set<string> | undefined
  let cachedRemoteSignerContext: string | undefined
  // Invalidations during an awaited DB read must prevent that stale snapshot from becoming the cache.
  let remoteSignerCacheGeneration = 0

  function getRemoteSignerCacheContext() {
    const identity = getWalletIdentity()
    return identity && `${identity.network}:${identity.owner}`
  }

  function invalidateRemoteSignerAddressCache() {
    remoteSignerCacheGeneration += 1
    cachedRemoteSignerAddresses = undefined
    cachedRemoteSignerContext = undefined
  }

  async function getOurRemoteSignerAddresses(): Promise<Set<string>> {
    const context = getRemoteSignerCacheContext()
    if (cachedRemoteSignerAddresses && cachedRemoteSignerContext === context)
      return cachedRemoteSignerAddresses
    const generation = remoteSignerCacheGeneration
    const signers = await getAllRemoteSigners()
    if (getRemoteSignerCacheContext() !== context)
      throw new Error('Wallet changed during remote signer lookup')
    if (remoteSignerCacheGeneration !== generation)
      return getOurRemoteSignerAddresses()
    cachedRemoteSignerAddresses = new Set(signers.map(signer => signer.address.toUserFriendlyAddress()))
    cachedRemoteSignerContext = context
    logger.log(`🔄 ourRemoteSignerAddresses cache rebuilt: ${cachedRemoteSignerAddresses.size} signer(s)`, [...cachedRemoteSignerAddresses])
    return cachedRemoteSignerAddresses
  }

  async function isOurRemoteSigner(address: string): Promise<boolean> {
    return (await getOurRemoteSignerAddresses()).has(address)
  }

  async function upsertInactiveRemoteSigner(signer: RemoteSigner): Promise<'added' | 'already-known'> {
    if (!await insertInactiveRemoteSigner(signer))
      return 'already-known'

    invalidateRemoteSignerAddressCache()
    return 'added'
  }

  async function validateRemoteSignerAddress(addressInput: string): Promise<RemoteSignerValidationResult> {
    let address: Address
    try {
      address = Nimiq.Address.fromString(addressInput.trim())
    }
    catch {
      return { status: 'invalid', reason: 'Invalid HTLC address' }
    }

    const normalizedAddress = address.toUserFriendlyAddress()
    function invalid(reason: string): RemoteSignerValidationResult {
      return { status: 'invalid', address: normalizedAddress, reason }
    }

    const context = getWalletContext()
    if (!context)
      return invalid('Local wallet unavailable')

    const { data: remoteStatus, error: statusError } = await getStatus()
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    if (
      statusError
      || remoteStatus?.status !== RemoteStatus.Good
      || !remoteStatus.servicePublicKey
      || remoteStatus.network.toLowerCase() !== networkName.value.toLowerCase()
    ) {
      return invalid('Cosigner unavailable or on a different network')
    }

    // Require both live chain ownership and the current cosigner's record before importing.
    const { data: account, error: accountError } = await getAccount(address)
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    if (accountError || account?.type !== 'htlc')
      return invalid('Address is not an active HTLC')
    if (account.balance <= 0)
      return invalid('HTLC has no balance')

    const owner = context.owner
    if (account.sender !== owner)
      return invalid('HTLC belongs to another wallet')

    let cosignerRecipient: string
    try {
      cosignerRecipient = Nimiq.PublicKey.fromHex(remoteStatus.servicePublicKey).toAddress().toUserFriendlyAddress()
    }
    catch {
      return invalid('Invalid cosigner public key')
    }
    if (account.recipient !== cosignerRecipient)
      return invalid('HTLC belongs to another cosigner')

    const { data: remoteSignerApi, error: remoteSignerError } = await getRemoteSigner({ address })
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    if (remoteSignerError || !remoteSignerApi)
      return invalid('Cosigner does not recognize this HTLC')

    let remoteSignerAddress: string
    try {
      remoteSignerAddress = Nimiq.Address.fromString(remoteSignerApi.address).toUserFriendlyAddress()
    }
    catch {
      return invalid('Cosigner returned an invalid HTLC address')
    }
    if (remoteSignerAddress !== normalizedAddress || remoteSignerApi.servicePublicKey !== remoteStatus.servicePublicKey)
      return invalid('Cosigner wallet details do not match')

    let creationTransaction: PlainTransactionDetails | undefined
    if (remoteSignerApi.creatingTransactionHash) {
      try {
        creationTransaction = await context.client.getTransaction(remoteSignerApi.creatingTransactionHash)
      }
      catch {
        // The live HTLC and cosigner record still prove ownership when history is unavailable.
      }
      if (creationTransaction?.executionResult === false)
        return invalid('HTLC creation transaction failed')
      if (!isWalletContextCurrent(context))
        return invalid('Wallet or network changed during validation')
    }

    const signer: RemoteSigner = {
      active: false,
      address,
      balance: account.balance,
      end: account.timeout,
      proofSize: remoteSignerApi.serviceSignatureProofSize,
      publicKey: remoteSignerApi.servicePublicKey,
      start: creationTransaction?.timestamp || await blockHeightToTimestamp(remoteSignerApi.validityStart),
    }
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    const details: RemoteSignerValidationDetails = {
      address: normalizedAddress,
      balance: account.balance,
      timeout: account.timeout,
      expired: account.timeout < headTimestamp.value,
      owner,
      cosignerRecipient,
      creationTransactionHash: remoteSignerApi.creatingTransactionHash,
      creationState: creationTransaction?.state || 'unavailable',
      signer,
    }

    const isKnown = await isOurRemoteSigner(normalizedAddress)
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    return isKnown
      ? { status: 'known', ...details }
      : { status: 'importable', ...details }
  }

  async function importValidatedRemoteSigner(result: ImportableRemoteSigner): Promise<'added' | 'already-known'> {
    // Confirmation can sit open indefinitely, so validate again against the current wallet and chain.
    const current = await validateRemoteSignerAddress(result.address)
    if (current.status === 'invalid')
      throw new Error(current.reason)
    if (current.status === 'known')
      return 'already-known'
    return upsertInactiveRemoteSigner(current.signer)
  }

  // Self-healing: when we observe a drain whose proof.creator is our local address (verified upstream),
  // register the HTLC as an inactive signer so future runs catch it via `isOurRemoteSigner` even
  // without re-reading the proof. Covers extension HTLCs that `discoverRemoteSignersFromBlockchain`
  // misses because it only walks first-hop HTLCs.
  async function registerOwnHtlcIfMissing(htlcAddress: string): Promise<void> {
    if (await isOurRemoteSigner(htlcAddress))
      return
    if (!remotePublicKey.value)
      return
    const address = Nimiq.Address.fromUserFriendlyAddress(htlcAddress)
    // Account may already be pruned if the HTLC has been fully drained — in that case we still
    // register with zero balance/timeout so the cached set short-circuits future drains from
    // this address instead of looping through getAccount on every periodic refresh.
    const { data: account } = await useNimiqNetwork().getAccount(address)
    const balance = account?.type === 'htlc' ? account.balance : 0
    const end = account?.type === 'htlc' ? account.timeout : 0
    await insertInactiveRemoteSigner({
      active: false,
      address,
      balance,
      end,
      start: 0,
      publicKey: remotePublicKey.value,
      proofSize: remoteProofSize.value,
    })
    invalidateRemoteSignerAddressCache()
    logger.log(`📝 Registered previously-unknown own HTLC`, { address: htlcAddress, end, balance, accountType: account?.type ?? 'pruned' })
  }

  interface LocalHistoryRequest {
    addressKey: string
    context: WalletContext
    options: LocalHistoryOptions
    promise: Promise<PlainTransactionDetails[]>
    resetPromise?: Promise<void>
  }

  interface DiscoveryRequest {
    context: WalletContext
    promise: Promise<RemoteSignerDiscoveryResult>
  }

  let inFlightLocalHistory: LocalHistoryRequest | undefined
  let replacementHistoryClient: { baseClient: Client, client: Client, network: string } | undefined
  let discoverRequest: DiscoveryRequest | undefined

  function sameWalletContext(a: WalletContext, b: WalletContext) {
    return a.client === b.client && a.network === b.network && a.owner === b.owner
  }

  async function resetLocalHistoryRequest(request: LocalHistoryRequest) {
    if (!request.resetPromise) {
      request.resetPromise = (async () => {
        let resetSucceeded = false
        try {
          const replacement = await createHistoryClient()
          const current = getWalletContext()
          if (replacement === request.context.client)
            throw new Error('History client replacement reused stalled client')
          if (current?.client === request.context.client && current.network === request.context.network) {
            const previous = replacementHistoryClient?.client
            replacementHistoryClient = { baseClient: current.client, client: replacement, network: current.network }
            if (previous && previous !== current.client)
              void previous.disconnectNetwork().catch(error => logger.error('Failed to disconnect replaced history client', error))
            resetSucceeded = true
          }
          else {
            void replacement.disconnectNetwork().catch(error => logger.error('Failed to disconnect unused history client', error))
          }
        }
        catch (error) {
          logger.error('Failed to replace client after local history stalled', error)
        }
        finally {
          request.resetPromise = undefined
          // A different client prevents the abandoned WASM promise from overlapping the retry.
          if ((resetSucceeded || client.value !== request.context.client) && inFlightLocalHistory === request)
            inFlightLocalHistory = undefined
        }
      })()
    }
    await request.resetPromise
  }

  async function waitForLocalHistory(request: LocalHistoryRequest) {
    try {
      const transactions = await promiseWithTimeout(request.promise, DISCOVER_TIMEOUT_MS)
      if (!isWalletContextCurrent(request.context))
        throw new Error('Wallet changed during history request')
      return transactions
    }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('Operation timed out') && inFlightLocalHistory === request && client.value === request.context.client)
        await resetLocalHistoryRequest(request)
      throw error
    }
  }

  async function getTransactionsForAddress(address: Address, options: LocalHistoryOptions = {}) {
    const context = getWalletContext()
    if (!context)
      throw new Error('Local wallet or client unavailable')
    const addressKey = address.toUserFriendlyAddress()

    // A stalled WASM history call blocks later calls on the same client, so reuse or serialize them.
    if (inFlightLocalHistory) {
      const active = inFlightLocalHistory
      if (!sameWalletContext(active.context, context)) {
        if (active.context.client === context.client) {
          await resetLocalHistoryRequest(active)
          if (inFlightLocalHistory === active)
            throw new Error('Local history request still active after failed reset')
        }
      }
      else if (active.addressKey === addressKey
        && active.options.sinceHeight === options.sinceHeight
        && active.options.startAt === options.startAt
        && active.options.limit === options.limit) {
        return waitForLocalHistory(active)
      }
      else {
        // One client cannot safely execute overlapping history scans.
        await waitForLocalHistory(active)
        return getTransactionsForAddress(address, options)
      }
    }

    // A replacement belongs only to the client and network whose history call stalled.
    if (replacementHistoryClient
      && (replacementHistoryClient.baseClient !== context.client || replacementHistoryClient.network !== context.network)) {
      void replacementHistoryClient.client.disconnectNetwork().catch(error => logger.error('Failed to disconnect stale history client', error))
      replacementHistoryClient = undefined
    }
    const requestClient = replacementHistoryClient?.client || context.client
    const promise = requestClient.getTransactionsByAddress(address, options.sinceHeight, undefined, options.startAt, options.limit)
    const request: LocalHistoryRequest = { addressKey, context, options, promise }
    inFlightLocalHistory = request
    void promise.finally(() => {
      if (inFlightLocalHistory === request)
        inFlightLocalHistory = undefined
    }).catch(() => undefined)
    return waitForLocalHistory(request)
  }

  async function getLocalTransactions(options: LocalHistoryOptions = {}) {
    const context = getWalletContext()
    if (!context)
      throw new Error('Local wallet or client unavailable')
    return getTransactionsForAddress(context.address, options)
  }

  async function getAllTransactionsForAddress(address: Address) {
    const transactions: PlainTransactionDetails[] = []
    const seenCursors = new Set<string>()
    let startAt: string | undefined
    while (true) {
      const page = await getTransactionsForAddress(address, { startAt, limit: HISTORY_PAGE_SIZE })
      transactions.push(...page)
      if (page.length < HISTORY_PAGE_SIZE)
        return transactions
      const nextCursor = page.at(-1)?.transactionHash
      if (!nextCursor || seenCursors.has(nextCursor))
        throw new Error(`History pagination made no progress for ${address.toUserFriendlyAddress()}`)
      seenCursors.add(nextCursor)
      startAt = nextCursor
    }
  }

  async function findTransactionInHistory(address: Address, hash: string) {
    const seenCursors = new Set<string>()
    let startAt: string | undefined
    while (true) {
      const page = await getTransactionsForAddress(address, { startAt, limit: HISTORY_PAGE_SIZE })
      const transaction = page.find(tx => tx.transactionHash === hash)
      if (transaction)
        return transaction
      if (page.length < HISTORY_PAGE_SIZE)
        return undefined
      const nextCursor = page.at(-1)?.transactionHash
      if (!nextCursor || seenCursors.has(nextCursor))
        throw new Error(`History pagination made no progress for ${address.toUserFriendlyAddress()}`)
      seenCursors.add(nextCursor)
      startAt = nextCursor
    }
  }

  async function discoverRemoteSignersFromBlockchain(): Promise<RemoteSignerDiscoveryResult> {
    if (!localAddress.value)
      return { added: 0, alreadyKnown: 0, localComplete: false, errors: ['Local wallet unavailable'] }

    await until(client).not.toBeUndefined()
    const context = getWalletContext()
    if (!context)
      return { added: 0, alreadyKnown: 0, localComplete: false, errors: ['Local wallet unavailable'] }
    if (discoverRequest && sameWalletContext(discoverRequest.context, context))
      return discoverRequest.promise

    const promise = runDiscoverRemoteSignersFromBlockchain(context).finally(() => {
      if (discoverRequest?.promise === promise)
        discoverRequest = undefined
    })
    discoverRequest = { context, promise }
    return promise
  }

  async function runDiscoverRemoteSignersFromBlockchain(context: WalletContext): Promise<RemoteSignerDiscoveryResult> {
    const result: RemoteSignerDiscoveryResult = { added: 0, alreadyKnown: 0, localComplete: false, errors: [] }
    await context.client.waitForConsensusEstablished()
    if (!isWalletContextCurrent(context))
      return { ...result, errors: ['Wallet changed during discovery'] }

    const { owner } = context
    const seenTransactions = new Set<string>()
    const seenSignerAddresses = new Set<string>()
    const seenCursors = new Set<string>()
    let sawHtlcTransaction = false
    let accountLookupFailed = false
    let startAt: string | undefined

    // Old funding HTLCs may be beyond the first page, so scan until history is exhausted.
    while (true) {
      let transactions: PlainTransactionDetails[]
      try {
        transactions = await getLocalTransactions({ startAt, limit: HISTORY_PAGE_SIZE })
      }
      catch (error) {
        const errorName = error instanceof Error ? error.name : typeof error
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('discoverRemoteSignersFromBlockchain: getTransactionsByAddress failed', errorName, errorMessage)
        result.errors.push(`${errorName}: ${errorMessage}`)
        break
      }

      logger.log('All Transactions from Blockchain', transactions)
      sawHtlcTransaction ||= transactions.some(transaction => transaction.recipientType === 'htlc')
      // Only successful first-hop deposits owned by this wallet can be its remote signers.
      const candidates = transactions.filter((transaction) => {
        if (seenTransactions.has(transaction.transactionHash))
          return false
        seenTransactions.add(transaction.transactionHash)
        const data = transaction.data
        return transaction.executionResult === true
          && transaction.sender === owner
          && transaction.senderType === 'basic'
          && transaction.recipientType === 'htlc'
          && (transaction.flags & 0b1) === 0b1
          && data.type === 'htlc'
          && data.sender === owner
      })

      if (candidates.length > 0 && !remotePublicKey.value) {
        try {
          await until(remotePublicKey).not.toBeUndefined({ timeout: 10_000, throwOnTimeout: true })
        }
        catch {
          result.errors.push('Remote public key unavailable')
          break
        }
        if (!isWalletContextCurrent(context))
          return { ...result, errors: ['Wallet changed during discovery'] }
      }

      let cosignerAddress: string | undefined
      if (remotePublicKey.value) {
        try {
          cosignerAddress = Nimiq.PublicKey.fromHex(remotePublicKey.value).toAddress().toUserFriendlyAddress()
        }
        catch {
          result.errors.push('Invalid remote public key')
          break
        }
      }

      for (const transaction of candidates) {
        const data = transaction.data
        if (data.type !== 'htlc' || data.recipient !== cosignerAddress)
          continue

        // Each extension spends one HTLC into another; walk that chain from the first deposit.
        const creations = [transaction]
        const addressesToScan = [transaction.recipient]
        const scannedAddresses = new Set<string>()
        while (addressesToScan.length > 0) {
          const signerAddress = addressesToScan.shift()!
          if (scannedAddresses.has(signerAddress))
            continue
          scannedAddresses.add(signerAddress)

          let outgoing: PlainTransactionDetails[]
          try {
            outgoing = await getAllTransactionsForAddress(Nimiq.Address.fromString(signerAddress))
          }
          catch (error) {
            accountLookupFailed = true
            result.errors.push(`HTLC history lookup failed: ${signerAddress}`)
            logger.error('discoverRemoteSignersFromBlockchain: HTLC history failed', error)
            continue
          }
          if (!isWalletContextCurrent(context))
            return { ...result, errors: ['Wallet changed during discovery'] }

          // Only follow successful Nimiq Pay extensions from the exact parent HTLC.
          for (const extension of outgoing) {
            const extensionData = extension.data
            if (extension.executionResult !== true
              || extension.sender !== signerAddress
              || extension.senderType !== 'htlc'
              || extension.recipientType !== 'htlc'
              || (extension.flags & 0b1) !== 0b1
              || extensionData.type !== 'htlc'
              || extensionData.sender !== owner
              || extensionData.recipient !== cosignerAddress) {
              continue
            }
            creations.push(extension)
            addressesToScan.push(extension.recipient)
          }
        }

        for (const creation of creations) {
          if (seenSignerAddresses.has(creation.recipient))
            continue
          seenSignerAddresses.add(creation.recipient)
          const address = Nimiq.Address.fromString(creation.recipient)
          const { data: account, error } = await getAccount(address)
          if (!isWalletContextCurrent(context))
            return { ...result, errors: ['Wallet changed during discovery'] }
          if (error) {
            if (error !== NO_ACCOUNT_ERROR) {
              accountLookupFailed = true
              result.errors.push(`HTLC account lookup failed: ${creation.recipient}`)
            }
            continue
          }
          if (
            account?.type !== 'htlc'
            || account.balance <= 0
            || account.sender !== owner
            || account.recipient !== cosignerAddress
          ) {
            continue
          }

          const start = creation.timestamp || await blockHeightToTimestamp(creation.validityStartHeight)
          if (!isWalletContextCurrent(context))
            return { ...result, errors: ['Wallet changed during discovery'] }
          const insertResult = await upsertInactiveRemoteSigner({
            active: false,
            balance: account.balance,
            address,
            publicKey: remotePublicKey.value!,
            start,
            end: account.timeout,
            proofSize: remoteProofSize.value,
          })
          if (insertResult === 'added')
            result.added += 1
          else
            result.alreadyKnown += 1
        }
      }

      if (transactions.length < HISTORY_PAGE_SIZE) {
        result.localComplete = !accountLookupFailed
        break
      }

      const nextCursor = transactions.at(-1)?.transactionHash
      if (!nextCursor || seenCursors.has(nextCursor)) {
        result.errors.push('Local history pagination made no progress')
        break
      }
      seenCursors.add(nextCursor)
      startAt = nextCursor
    }

    // Partial history must not decide which recovered signer becomes active.
    if (result.localComplete && isWalletContextCurrent(context))
      await updateRemoteFromApi(!sawHtlcTransaction, context)
    return result
  }

  async function updateActiveRemoteBalance(newBalance: number) {
    remoteBalance.value = newBalance
    await updateBalance(newBalance, remoteSigner.value!.address)
  }

  interface HeadListener {
    client: Client
    context: WalletContext
    id: number
  }

  let headListener: HeadListener | undefined
  let staleHeadListeners: HeadListener[] = []
  let initGeneration = 0

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
    const generation = ++initGeneration
    const identity = getWalletIdentity()
    if (!hasLocalWallet.value || !identity)
      return
    const isCurrentInit = () => generation === initGeneration && isWalletIdentityCurrent(identity)

    try {
      logger.log('📡 Initializing Remote Signer Store')
      const activeRemoteSigner = await getActiveRemoteSigner()
      if (!isCurrentInit())
        return
      remoteSigner.value = activeRemoteSigner
      remoteBalance.value = activeRemoteSigner?.balance ?? 0
      homeBalanceState.value = activeRemoteSigner ? 'resolved-remote' : 'loading'
      logger.log('📡 Remote Signer from DB', remoteSigner.value ? { ...remoteSigner.value, address: remoteSigner.value.address.toUserFriendlyAddress() } : null)
      await updateSignersTableBalance(identity)
      if (!isCurrentInit())
        return

      if (!remoteSigner.value) {
        logger.log('📡 We don\'t have a remote signer in the database. Getting it from the API')
        void discoverRemoteSignersFromBlockchain()
      }

      void updateRemoteFromApi()
      await until(client).not.toBeUndefined()
      const context = getWalletContext()
      if (!isCurrentInit() || !context || context.owner !== identity.owner || context.network !== identity.network)
        return

      // Failed removals keep their handles so later initialization can retry cleanup.
      const stillStale: HeadListener[] = []
      for (const staleListener of staleHeadListeners) {
        try {
          await staleListener.client.removeListener(staleListener.id)
        }
        catch {
          stillStale.push(staleListener)
        }
      }
      staleHeadListeners = stillStale
      if (!isCurrentInit())
        return

      if (headListener) {
        const previous = headListener
        try {
          await previous.client.removeListener(previous.id)
          if (headListener === previous)
            headListener = undefined
        }
        catch (error) {
          logger.error('Failed to remove previous remote signer head listener', error)
          if (headListener === previous && sameWalletContext(previous.context, context))
            return
          if (!staleHeadListeners.includes(previous))
            staleHeadListeners.push(previous)
          if (headListener === previous)
            headListener = undefined
        }
        if (!isCurrentInit())
          return
      }
      const listenerId = await context.client.addHeadChangedListener(async () => {
        if (!isWalletContextCurrent(context))
          return
        // Check if there is a new remote wallet that we don't have in the database, only if the one we have has 0 balance
        // Mainly for the case when the user recovers the wallet from the words
        if ((remoteBalance.value === 0 || homeBalanceState.value === 'loading') && height.value % (10 * Nimiq.Policy.BLOCKS_PER_BATCH) === 0) {
          logger.log('📡👀 Searching for new remote wallets')
          await updateRemoteFromApi(false, context)
        }
      })
      if (!isCurrentInit() || !isWalletContextCurrent(context)) {
        const supersededListener = { client: context.client, context, id: listenerId }
        try {
          await context.client.removeListener(listenerId)
        }
        catch (error) {
          logger.error('Failed to remove superseded remote signer head listener', error)
          // Retain the handle so a later initialization can retry cleanup.
          staleHeadListeners.push(supersededListener)
        }
        return
      }
      headListener = { client: context.client, context, id: listenerId }
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
    lastKnownRemoteBalance,
    homeBalanceState,
    remotePublicKey,
    remoteProofSize,
    remoteHeight,
    blockHeightToTimestamp,
    resolveHomeBalanceState,
    getLocalTransactions,
    findTransactionInHistory,

    isHtlcActive,
    hasHtlcExpired,
    isHtlcPending,
    isHtlcRecreating,

    addRemoteSigner,
    updateActiveRemoteBalance,
    updateActiveWallet,
    updateRemoteSigner,
    activateRemoteSignerFromTransaction,
    updateSignersTableBalance,
    discoverRemoteSignersFromBlockchain,
    validateRemoteSignerAddress,
    importValidatedRemoteSigner,
    upsertInactiveRemoteSigner,

    getAllRemoteSigners,
    isOurRemoteSigner,
    getOurRemoteSignerAddresses,
    registerOwnHtlcIfMissing,

    init,
  }
})
