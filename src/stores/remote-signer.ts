import type { Address, Client, PlainAccount, PlainTransactionDetails } from '@nimiq/core'
import type { RemoteSigner } from '@/lib/sql-queries'
import { until, useIntervalFn } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, ref, watch } from 'vue'
import { RemoteStatus, useRemoteSignerApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { nimiqPayCosignerPublicKeys } from '@/lib'
import { HTLC_CHECK_HOLD_STARTED_KV_KEY, HTLC_EXTENSIONS_WALKED_KV_KEY, HTLC_HISTORY_CHECKED_KV_KEY, SQLQuery } from '@/lib/sql-queries'
import { promiseWithTimeout } from '@/lib/utils'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { NO_ACCOUNT_ERROR, useNimiqNetwork } from '@/stores/nimiq-network'
import { useSyncState } from '@/stores/sync/state'

const logger = useLogger('remote-signer')
export type HomeBalanceState = 'loading' | 'resolved-empty' | 'resolved-remote'
const REMOTE_SIGNER_BALANCE_BATCH_SIZE = 20
const HISTORY_PAGE_SIZE = 100
const DISCOVER_TIMEOUT_MS = 30_000
const COSIGNER_LISTING_RETRY_MS = 5 * 60 * 1000

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

export type ValidatedRemoteSigner = Extract<RemoteSignerValidationResult, { status: 'importable' | 'known' }>

export interface RemoteSignerDiscoveryResult {
  added: number
  alreadyKnown: number
  localComplete: boolean
  errors: string[]
  // Funding HTLCs seen in local history, even those whose cosigner metadata could not be resolved.
  createdHtlcs: string[]
  // Every local history page was read, so createdHtlcs lists all funding HTLCs.
  historyComplete: boolean
}

export interface LocalHtlcHistoryScan {
  context: WalletContext
  // Funding HTLC creations from local history, newest first.
  creations: PlainTransactionDetails[]
  historyComplete: boolean
  sawHtlcTransaction: boolean
  errors: string[]
}

interface LocalHistoryOptions {
  sinceHeight?: number
  startAt?: string
  limit?: number
}

export interface WalletContext {
  address: Address
  client: Client
  network: string
  owner: string
  generation: number
}

export function sameWalletContext(a: WalletContext, b: WalletContext) {
  return a.client === b.client
    && a.network === b.network
    && a.owner === b.owner
    && a.generation === b.generation
}

export interface AddressHistoryResult {
  transactions: PlainTransactionDetails[]
  complete: boolean
}

export interface AddressSpecificSignerMetadata {
  address: Address
  addressString: string
  publicKey: string
  proofSize: number
  cosignerRecipient: string
  creationTransactionHash: string
  creationState: PlainTransactionDetails['state']
  validityStartHeight: number
  start: number
  end: number
}

export type AddressSpecificSignerMetadataResult
  = | { status: 'valid', metadata: AddressSpecificSignerMetadata }
    | { status: 'rejected', reason: string }
    | { status: 'unavailable', reason: string }

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

function isSuccessfulHistoricalHtlcTransaction(
  transaction: Pick<PlainTransactionDetails, 'executionResult' | 'state'>,
) {
  return transaction.executionResult !== false
    && (transaction.state === 'included' || transaction.state === 'confirmed')
}

type StoredRemoteSigner = Omit<RemoteSigner, 'address' | 'active'> & { address: string, active: number }

function useRemoteSignerDb() {
  const { run, runSet, query } = useConn()
  let signerWriteQueue = Promise.resolve()
  let signerWriteRevision = 0

  // Serialize wallet changes so an obsolete write cannot finish after the current one.
  function enqueueSignerWrite<T>(write: () => Promise<T>) {
    const queuedWrite = signerWriteQueue.then(write)
    signerWriteQueue = queuedWrite.then(() => undefined, () => undefined)
    return queuedWrite
  }

  function restoreSigner({ address, balance, proofSize, publicKey, start, end, active }: StoredRemoteSigner) {
    return run(SQLQuery.InsertRemoteSigner, [address, balance, proofSize, publicKey, start, end, active])
  }

  return {
    getSignerWriteRevision() {
      return signerWriteRevision
    },

    async getAllRemoteSigners() {
      return parseAddress(await query<RemoteSigner[]>(SQLQuery.GetAllRemoteSigners))
    },

    async getActiveRemoteSigner() {
      await signerWriteQueue
      return parseAddress(await query<RemoteSigner | undefined>(SQLQuery.GetActiveRemoteSigner, [], { single: true }))
    },

    async setRemoteSigner(
      { active, balance, end, proofSize, start, publicKey, address }: RemoteSigner,
      isCurrent: () => boolean = () => true,
      expectedRevision?: number,
    ) {
      const writeRevision = ++signerWriteRevision
      const ownsRevision = () => expectedRevision === undefined
        || (writeRevision === expectedRevision + 1 && signerWriteRevision === writeRevision)
      const write = enqueueSignerWrite(async () => {
        if (!isCurrent() || !ownsRevision())
          return false

        const addressString = address.toUserFriendlyAddress()
        logger.log('✒️ Updating Remote Signer in db', { address: addressString, balance, proofSize, publicKey, start, end, active })
        await runSet([
          // Android requires values even when the statement has no parameters.
          { statement: SQLQuery.DeactivateRemoteSigners, values: [] },
          { statement: SQLQuery.InsertRemoteSigner, values: [addressString, balance, proofSize, publicKey, start, end, active] },
        ])
        // Later same-wallet writes are queued behind this commit, not evidence that it was stale.
        if (isCurrent())
          return true

        // Never persist an active signer from a wallet that changed during the native DB write.
        await run(SQLQuery.DeactivateRemoteSigners)
        return false
      })
      return write
    },

    /**
     * Adds a new remote signer to the database, but doesn't set it as active.
     * Used when we get an old remote signer from the blockchain.
     */
    async insertInactiveRemoteSigner(
      { balance, end, proofSize, start, publicKey, address }: RemoteSigner,
      isCurrent: () => boolean = () => true,
    ) {
      signerWriteRevision += 1
      const write = enqueueSignerWrite(async () => {
        if (!isCurrent())
          return false
        const addressString = address.toUserFriendlyAddress()
        logger.log('✒️ Adding Remote Signer', { address: addressString, balance, proofSize, publicKey, start, end })
        const result = await run(SQLQuery.InsertInactiveRemoteSigner, [addressString, balance, proofSize, publicKey, start, end, false])
        const inserted = (result.changes?.changes ?? 0) > 0
        if (!inserted || isCurrent())
          return inserted
        await run(SQLQuery.DeleteRemoteSigner, [addressString])
        return false
      })
      return write
    },

    async upsertTargetRemoteSigner(
      signer: RemoteSigner,
      isCurrent: () => boolean = () => true,
    ) {
      signerWriteRevision += 1
      const write = enqueueSignerWrite(async () => {
        if (!isCurrent())
          return false
        const address = signer.address.toUserFriendlyAddress()
        const previous = await query<StoredRemoteSigner | undefined>(SQLQuery.GetRemoteSignerByAddress, [address], { single: true })
        if (!isCurrent())
          return false
        await run(SQLQuery.UpsertTargetRemoteSigner, [
          address,
          signer.balance,
          signer.proofSize,
          signer.publicKey,
          signer.start,
          signer.end,
        ])
        if (isCurrent())
          return true
        if (previous) {
          await restoreSigner(previous)
        }
        else {
          await run(SQLQuery.DeleteRemoteSigner, [address])
        }
        return false
      })
      return write
    },

    async deactivateAllRemoteSigners() {
      signerWriteRevision += 1
      const write = enqueueSignerWrite(() => run(SQLQuery.DeactivateRemoteSigners))
      await write
    },

    async purgeRemoteSigners() {
      signerWriteRevision += 1
      // The check vouched for the purged signer set; the next one must be checked again.
      const write = enqueueSignerWrite(() => runSet([
        { statement: SQLQuery.PurgeRemoteSigners, values: [] },
        { statement: SQLQuery.DeleteKv, values: [HTLC_HISTORY_CHECKED_KV_KEY] },
        { statement: SQLQuery.DeleteKv, values: [HTLC_EXTENSIONS_WALKED_KV_KEY] },
        { statement: SQLQuery.DeleteKv, values: [HTLC_CHECK_HOLD_STARTED_KV_KEY] },
      ]))
      await write
      const syncState = useSyncState()
      syncState.htlcHistoryChecked = false
      syncState.htlcExtensionsWalked = false
      syncState.htlcCheckHoldStartedAt = undefined
    },

    async deactivateRemoteSignerInDb(
      address: Address,
      isCurrent: () => boolean = () => true,
      clearBalance = false,
    ) {
      signerWriteRevision += 1
      const write = enqueueSignerWrite(async () => {
        if (!isCurrent())
          return false
        const addressString = address.toUserFriendlyAddress()
        const previous = await query<StoredRemoteSigner | undefined>(SQLQuery.GetRemoteSignerByAddress, [addressString], { single: true })
        if (!isCurrent())
          return false
        if (clearBalance) {
          await runSet([
            { statement: SQLQuery.UpdateRemoteBalance, values: [0, addressString] },
            { statement: SQLQuery.DeactivateRemoteSigner, values: [addressString] },
          ])
        }
        else {
          await run(SQLQuery.DeactivateRemoteSigner, [addressString])
        }
        if (isCurrent())
          return true
        if (previous) {
          await restoreSigner(previous)
        }
        return false
      })
      return write
    },

    async updateBalance(
      newBalance: number,
      address: Address,
      isCurrent: () => boolean = () => true,
    ) {
      signerWriteRevision += 1
      const write = enqueueSignerWrite(async () => {
        if (!isCurrent())
          return false
        const addressString = address.toUserFriendlyAddress()
        const previous = await query<StoredRemoteSigner | undefined>(SQLQuery.GetRemoteSignerByAddress, [addressString], { single: true })
        if (!isCurrent())
          return false
        logger.log(`✒️ Updating balance of remote signer ${addressString} to ${newBalance}`)
        await run(SQLQuery.UpdateRemoteBalance, [newBalance, addressString])
        if (isCurrent())
          return true
        if (previous) {
          await restoreSigner(previous)
        }
        return false
      })
      return write
    },

    async updateActiveWallet({ balance, end, proofSize, start, publicKey, address }: RemoteSigner) {
      signerWriteRevision += 1
      const write = enqueueSignerWrite(async () => {
        logger.log(`✒️ Updating active wallet ${address.toUserFriendlyAddress()} to`, { start, end, proofSize, publicKey, balance })
        await run(SQLQuery.UpdateActiveWallet, [start, end, proofSize, publicKey, balance, address.toUserFriendlyAddress()])
      })
      await write
    },
  }
}

export const useRemoteSigner = defineStore('remote-signer', () => {
  const { createHistoryClient, getAccount, getBalance } = useNimiqNetwork()
  const { headTimestamp, height, client, consensus, networkName } = storeToRefs(useNimiqNetwork())
  const { getStatus, getRemoteSigner, getOwnerWallets } = useRemoteSignerApi()
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { isProcessingRemote } = storeToRefs(useLocks())
  const { getSignerWriteRevision, getActiveRemoteSigner, getAllRemoteSigners, setRemoteSigner, updateBalance, updateActiveWallet: _updateActiveWallet, deactivateAllRemoteSigners, deactivateRemoteSignerInDb, insertInactiveRemoteSigner, upsertTargetRemoteSigner, purgeRemoteSigners } = useRemoteSignerDb()

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
      generation: useSyncState().walletContextGeneration,
    }
  }

  function isWalletContextCurrent(context: WalletContext) {
    const current = getWalletContext()
    return current !== undefined && sameWalletContext(current, context)
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

  // Ticks fire without awaiting the callback. Keep one poll in flight, bounded to two intervals
  // (the default WS read timeout is 30s), so a slow or hung cosigner demotes the status instead of
  // keeping the last Good, and polls cannot pile up or settle out of order.
  let isPollingStatus = false
  useIntervalFn(async () => {
    if (isPollingStatus)
      return
    isPollingStatus = true
    const { data, error } = await getStatus(10_000).finally(() => {
      isPollingStatus = false
    })
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

  async function updateRemoteSigner(
    signer: RemoteSigner | undefined,
    expectedContext?: WalletContext,
    expectedSignerRevision?: number,
  ): Promise<boolean> {
    if (expectedContext && !isWalletContextCurrent(expectedContext))
      return false
    logger.log('📡 Updating remote signer', { ...signer, address: signer?.address.toUserFriendlyAddress() })
    if (signer) {
      const stored = await setRemoteSigner(
        signer,
        () => !expectedContext || isWalletContextCurrent(expectedContext),
        expectedSignerRevision,
      )
      if (!stored)
        return false
    }
    else {
      await deactivateAllRemoteSigners()
    }
    if (expectedContext && !isWalletContextCurrent(expectedContext))
      return false
    remoteSigner.value = signer
    remoteBalance.value = signer?.balance ?? 0
    homeBalanceState.value = signer ? 'resolved-remote' : 'loading'
    invalidateRemoteSignerAddressCache()
    return true
  }

  function clearRemoteSignerStateIfAddress(address: Address) {
    if (!remoteSigner.value?.address.equals(address))
      return
    remoteSigner.value = undefined
    remoteBalance.value = 0
    homeBalanceState.value = 'loading'
  }

  async function updateRemoteSignerBalance(
    newBalance: number,
    address: Address,
    expectedContext?: WalletContext,
  ): Promise<boolean> {
    if (expectedContext && !isWalletContextCurrent(expectedContext))
      return false
    return updateBalance(
      newBalance,
      address,
      () => !expectedContext || isWalletContextCurrent(expectedContext),
    )
  }

  async function deactivateRemoteSigner(
    address: Address,
    expectedContext?: WalletContext,
    clearBalance = false,
  ): Promise<boolean> {
    if (expectedContext && !isWalletContextCurrent(expectedContext))
      return false
    const stored = await deactivateRemoteSignerInDb(
      address,
      () => !expectedContext || isWalletContextCurrent(expectedContext),
      clearBalance,
    )
    if (!stored)
      return false
    clearRemoteSignerStateIfAddress(address)
    invalidateRemoteSignerAddressCache()
    return true
  }

  interface SignerMetadataOptions {
    // Creation already read from chain history; spares a lookup when the cosigner has no hash.
    knownCreation?: PlainTransactionDetails
    // Discovery of old HTLCs: ask the cosigner for retired wallets too, and build the metadata from
    // our own on-chain creation when the cosigner can't answer. Never for activating a signer.
    allowRetired?: boolean
  }

  async function resolveAddressSpecificSignerMetadata(
    address: Address,
    context: WalletContext,
    options: SignerMetadataOptions = {},
  ): Promise<AddressSpecificSignerMetadataResult> {
    if (!isWalletContextCurrent(context))
      return { status: 'unavailable', reason: 'Wallet or network changed while resolving signer metadata' }

    let response: Awaited<ReturnType<typeof getRemoteSigner>>
    try {
      response = await promiseWithTimeout(getRemoteSigner({ address, includeInactive: options.allowRetired }), DISCOVER_TIMEOUT_MS)
    }
    catch (error) {
      response = { data: undefined, hasError: true, status: 504, error: { message: error instanceof Error ? error.message : String(error), statusCode: 504, error: 'TIMEOUT' } }
    }
    if (!isWalletContextCurrent(context))
      return { status: 'unavailable', reason: 'Wallet or network changed while resolving signer metadata' }
    if (response.error || !response.data) {
      const reason = response.error?.message || 'Cosigner metadata unavailable'
      if (response.error?.statusCode === 404)
        return { status: 'rejected', reason }
      // Cosigners without includeInactive answer 409 for retired wallets.
      if (options.allowRetired && options.knownCreation) {
        logger.log('🔗 Cosigner metadata unavailable, using the chain', { address: address.toUserFriendlyAddress(), reason })
        return signerMetadataFromChain(address, context, options.knownCreation)
      }
      return { status: 'unavailable', reason }
    }

    const remoteSignerApi = response.data
    const addressString = address.toUserFriendlyAddress()
    let remoteSignerAddress: string
    try {
      remoteSignerAddress = Nimiq.Address.fromString(remoteSignerApi.address).toUserFriendlyAddress()
    }
    catch {
      return { status: 'rejected', reason: 'Cosigner returned an invalid HTLC address' }
    }
    if (remoteSignerAddress !== addressString)
      return { status: 'rejected', reason: 'Cosigner returned a different HTLC address' }

    let creationTransactionHash: string | null | undefined = remoteSignerApi.creatingTransactionHash
    if (creationTransactionHash != null && (typeof creationTransactionHash !== 'string' || !creationTransactionHash.trim()))
      return { status: 'rejected', reason: 'Cosigner returned an invalid creation transaction hash' }
    if (!Number.isSafeInteger(remoteSignerApi.serviceSignatureProofSize) || remoteSignerApi.serviceSignatureProofSize <= 0)
      return { status: 'rejected', reason: 'Cosigner returned an invalid proof size' }
    if (!Number.isSafeInteger(remoteSignerApi.validityStart) || remoteSignerApi.validityStart < 0)
      return { status: 'rejected', reason: 'Cosigner returned an invalid validity start' }
    if (!Number.isSafeInteger(remoteSignerApi.validityEnd) || remoteSignerApi.validityEnd <= 0)
      return { status: 'rejected', reason: 'Cosigner returned an invalid validity end' }
    if (typeof remoteSignerApi.servicePublicKey !== 'string' || !remoteSignerApi.servicePublicKey.trim())
      return { status: 'rejected', reason: 'Cosigner returned an invalid public key' }

    // A known creation answers both a missing hash and a matching one; a different hash is looked up and rejected below.
    let creationTransaction = options.knownCreation
      && (creationTransactionHash == null || creationTransactionHash === options.knownCreation.transactionHash)
      ? options.knownCreation
      : undefined
    if (creationTransaction) {
      creationTransactionHash = creationTransaction.transactionHash
    }
    else {
      try {
        if (creationTransactionHash == null) {
          // Block-based cosigner registration can omit the hash; recover it from chain history.
          const history = await getAllTransactionsForAddress(address)
          creationTransaction = history.transactions.find(transaction =>
            transaction.recipient === addressString
            && transaction.recipientType === 'htlc'
            && (transaction.flags & 0b1) === 0b1
            && isSuccessfulHistoricalHtlcTransaction(transaction),
          )
          creationTransactionHash = creationTransaction?.transactionHash
        }
        else {
          creationTransaction = await promiseWithTimeout(context.client.getTransaction(creationTransactionHash), DISCOVER_TIMEOUT_MS)
        }
      }
      catch (error) {
        return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
      }
      if (!isWalletContextCurrent(context))
        return { status: 'unavailable', reason: 'Wallet or network changed while resolving signer metadata' }
    }
    if (!creationTransaction || !creationTransactionHash)
      return { status: 'unavailable', reason: 'HTLC creation transaction unavailable' }
    if (creationTransaction.transactionHash !== creationTransactionHash)
      return { status: 'rejected', reason: 'HTLC creation transaction hash does not match cosigner metadata' }

    return buildSignerMetadata(address, context, creationTransaction, {
      publicKey: remoteSignerApi.servicePublicKey,
      proofSize: remoteSignerApi.serviceSignatureProofSize,
      end: remoteSignerApi.validityEnd,
    })
  }

  // The HTLC must be our own successful creation to a configured cosigner key, the same evidence discovery
  // scans for. Proof size is the one every current cosigner key uses.
  function signerMetadataFromChain(address: Address, context: WalletContext, creation: PlainTransactionDetails): AddressSpecificSignerMetadataResult {
    const data = creation.data
    if (data.type !== 'htlc')
      return { status: 'rejected', reason: 'HTLC creation details do not match cosigner metadata' }
    const keys = remotePublicKey.value ? [...nimiqPayCosignerPublicKeys, remotePublicKey.value] : nimiqPayCosignerPublicKeys
    const publicKey = keys.find((key) => {
      try {
        return Nimiq.PublicKey.fromHex(key).toAddress().toUserFriendlyAddress() === data.recipient
      }
      catch {
        return false
      }
    })
    if (!publicKey)
      return { status: 'rejected', reason: 'HTLC recipient is not a known cosigner' }
    return buildSignerMetadata(address, context, creation, { publicKey, proofSize: remoteProofSize.value, end: data.timeout })
  }

  function buildSignerMetadata(
    address: Address,
    context: WalletContext,
    creationTransaction: PlainTransactionDetails,
    cosigner: { publicKey: string, proofSize: number, end: number },
  ): AddressSpecificSignerMetadataResult {
    const addressString = address.toUserFriendlyAddress()
    if (!isSuccessfulHistoricalHtlcTransaction(creationTransaction))
      return { status: 'rejected', reason: 'HTLC creation transaction was not successful' }

    let cosignerRecipient: string
    try {
      cosignerRecipient = Nimiq.PublicKey.fromHex(cosigner.publicKey).toAddress().toUserFriendlyAddress()
    }
    catch {
      return { status: 'rejected', reason: 'Cosigner returned an invalid public key' }
    }
    let creationRecipient: string
    try {
      creationRecipient = Nimiq.Address.fromString(creationTransaction.recipient).toUserFriendlyAddress()
    }
    catch {
      return { status: 'rejected', reason: 'HTLC creation recipient is invalid' }
    }
    const data = creationTransaction.data
    const creationTimestamp = creationTransaction.timestamp
    if (creationRecipient !== addressString
      || typeof creationTimestamp !== 'number'
      || !Number.isSafeInteger(creationTimestamp)
      || creationTimestamp < 0
      || data.type !== 'htlc'
      || data.timeout !== cosigner.end
      || data.sender !== context.owner
      || data.recipient !== cosignerRecipient) {
      return { status: 'rejected', reason: 'HTLC creation details do not match cosigner metadata' }
    }

    return {
      status: 'valid',
      metadata: {
        address,
        addressString,
        publicKey: cosigner.publicKey,
        proofSize: cosigner.proofSize,
        cosignerRecipient,
        creationTransactionHash: creationTransaction.transactionHash,
        creationState: creationTransaction.state,
        // Cosigner validityStart is its spending gate, not the creation transaction height.
        validityStartHeight: creationTransaction.validityStartHeight,
        start: creationTimestamp,
        end: cosigner.end,
      },
    }
  }

  async function activateRemoteSignerFromTransaction(
    transaction: Pick<PlainTransactionDetails, 'data' | 'recipient' | 'timestamp' | 'transactionHash' | 'validityStartHeight' | 'value' | 'state' | 'executionResult'>,
    expectedContext?: WalletContext,
    expectedSignerRevision = getSignerWriteRevision(),
  ) {
    const context = expectedContext ?? getWalletContext()
    if (!context || !isWalletContextCurrent(context) || getSignerWriteRevision() !== expectedSignerRevision)
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')

    let address: Address
    try {
      address = Nimiq.Address.fromString(transaction.recipient)
    }
    catch {
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')
    }
    const result = await resolveAddressSpecificSignerMetadata(address, context)
    if (!isWalletContextCurrent(context) || getSignerWriteRevision() !== expectedSignerRevision)
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')

    const account = await promiseWithTimeout(
      context.client.getAccount(transaction.recipient),
      DISCOVER_TIMEOUT_MS,
    )
    if (!isWalletContextCurrent(context) || getSignerWriteRevision() !== expectedSignerRevision)
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')
    // Drained creations need no activation metadata, which may already be unavailable in the cosigner.
    // A drained HTLC that later receives NIM is a basic account nobody can spend from.
    if (transaction.state === 'confirmed' && transaction.executionResult !== false
      && (account.type !== 'htlc' || account.balance === 0)) {
      if (remoteAddress.value?.toUserFriendlyAddress() === transaction.recipient
        && !await deactivateRemoteSigner(address, context, true)) {
        throw new Error('Cannot resolve drained HTLC transaction')
      }
      return
    }
    if (result.status !== 'valid')
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')
    const { metadata } = result
    const data = transaction.data
    if (transaction.transactionHash !== metadata.creationTransactionHash
      || data.type !== 'htlc'
      || data.sender !== context.owner
      || data.recipient !== metadata.cosignerRecipient
      || data.timeout !== metadata.end
      || transaction.validityStartHeight !== metadata.validityStartHeight) {
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')
    }
    if (account.type !== 'htlc' || account.balance <= 0
      || !Number.isSafeInteger(account.balance) || account.timeout !== metadata.end
      || account.sender !== context.owner || account.recipient !== metadata.cosignerRecipient) {
      throw new Error('Accepted HTLC account is unavailable')
    }
    const stored = await updateRemoteSigner({
      active: true,
      balance: account.balance,
      publicKey: metadata.publicKey,
      start: metadata.start,
      address: metadata.address,
      end: metadata.end,
      proofSize: metadata.proofSize,
    }, context, expectedSignerRevision)
    if (!stored && isWalletContextCurrent(context))
      throw new Error('Cannot activate remote signer from invalid HTLC transaction')
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

    const [oldRemoteBalance, newRemoteAccount] = await Promise.allSettled([getBalance(remoteSigner.value.address, 'htlc'), client.value?.getAccount(newRemoteSigner.address)])
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
      tx = await promiseWithTimeout(context.client.getTransaction(remoteSignerApi.creatingTransactionHash), DISCOVER_TIMEOUT_MS)
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
      const [oldRemoteBalance, newRemoteBalance] = await Promise.allSettled([getBalance(remoteSigner.value.address, 'htlc'), getBalance(newRemoteSigner.address, 'htlc')])
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
  async function updateSignersTableBalance(expectedContext = getWalletContext()) {
    if (!expectedContext || consensus.value !== 'established')
      return
    const remoteSigners = await getAllRemoteSigners()
    if (!isWalletContextCurrent(expectedContext) || consensus.value !== 'established')
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
      let accounts: PlainAccount[]
      try {
        accounts = await promiseWithTimeout(expectedContext.client.getAccounts(addresses), DISCOVER_TIMEOUT_MS)
      }
      catch (error) {
        if (!isWalletContextCurrent(expectedContext) || consensus.value !== 'established')
          return
        logger.error('Error getting accounts for Remote Signers', error)
        continue
      }
      if (!isWalletContextCurrent(expectedContext) || consensus.value !== 'established')
        return

      // Assuming accounts are in the same order as addresses
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i]
        const remoteSigner = remoteSignerBatch[i]
        const newBalance = account.type === 'htlc' ? account.balance : 0
        if (remoteSigner.balance !== newBalance) {
          if (!isWalletContextCurrent(expectedContext) || consensus.value !== 'established')
            return
          logger.log(`✒️ Updating balance of remote signer ${remoteSigner.address.toUserFriendlyAddress()} to ${newBalance}`)
          if (!await updateRemoteSignerBalance(newBalance, remoteSigner.address, expectedContext))
            return
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
  let remoteSignerAddressLookup: {
    context: string | undefined
    generation: number
    promise: Promise<Set<string>>
  } | undefined

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
    if (remoteSignerAddressLookup?.context === context && remoteSignerAddressLookup?.generation === generation)
      return remoteSignerAddressLookup.promise

    const promise = getAllRemoteSigners().then((signers) => {
      if (getRemoteSignerCacheContext() !== context)
        throw new Error('Wallet changed during remote signer lookup')
      if (remoteSignerCacheGeneration !== generation)
        return getOurRemoteSignerAddresses()
      cachedRemoteSignerAddresses = new Set(signers.map(signer => signer.address.toUserFriendlyAddress()))
      cachedRemoteSignerContext = context
      logger.log(`🔄 ourRemoteSignerAddresses cache rebuilt: ${cachedRemoteSignerAddresses.size} signer(s)`, [...cachedRemoteSignerAddresses])
      return cachedRemoteSignerAddresses
    }).finally(() => {
      // An older lookup must not clear a replacement started after invalidation or a wallet switch.
      if (remoteSignerAddressLookup?.promise === promise)
        remoteSignerAddressLookup = undefined
    })
    remoteSignerAddressLookup = { context, generation, promise }
    return promise
  }

  async function isOurRemoteSigner(address: string): Promise<boolean> {
    return (await getOurRemoteSignerAddresses()).has(address)
  }

  async function upsertInactiveRemoteSigner(
    signer: RemoteSigner,
    expectedContext?: WalletContext,
  ): Promise<'added' | 'already-known'> {
    if (!await insertInactiveRemoteSigner(
      signer,
      () => !expectedContext || isWalletContextCurrent(expectedContext),
    )) {
      return 'already-known'
    }

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

    // Without consensus the account lookup fails and a funded HTLC reads as inactive.
    try {
      await promiseWithTimeout(context.client.waitForConsensusEstablished(), DISCOVER_TIMEOUT_MS)
    }
    catch {
      return invalid('Nimiq consensus unavailable')
    }
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')

    const { data: remoteStatus, error: statusError } = await getStatus()
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    if (
      statusError
      || remoteStatus?.status !== RemoteStatus.Good
      || remoteStatus.network.toLowerCase() !== context.network.toLowerCase()
    ) {
      return invalid('Cosigner unavailable or on a different network')
    }

    const { data: account, error: accountError } = await getAccount(address)
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    if (accountError || account?.type !== 'htlc')
      return invalid('Address is not an active HTLC')
    if (account.balance <= 0)
      return invalid('HTLC has no balance')
    if (account.sender !== context.owner)
      return invalid('HTLC belongs to another wallet')

    const metadataResult = await resolveAddressSpecificSignerMetadata(address, context)
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    if (metadataResult.status !== 'valid')
      return invalid(metadataResult.reason)
    const { metadata } = metadataResult
    if (account.recipient !== metadata.cosignerRecipient || account.timeout !== metadata.end)
      return invalid('HTLC account does not match cosigner metadata')

    const signer: RemoteSigner = {
      active: false,
      address: metadata.address,
      balance: account.balance,
      end: metadata.end,
      proofSize: metadata.proofSize,
      publicKey: metadata.publicKey,
      start: metadata.start,
    }
    const details: RemoteSignerValidationDetails = {
      address: normalizedAddress,
      balance: account.balance,
      timeout: metadata.end,
      expired: metadata.end < headTimestamp.value,
      owner: context.owner,
      cosignerRecipient: metadata.cosignerRecipient,
      creationTransactionHash: metadata.creationTransactionHash,
      creationState: metadata.creationState,
      signer,
    }

    const isKnown = await isOurRemoteSigner(normalizedAddress)
    if (!isWalletContextCurrent(context))
      return invalid('Wallet or network changed during validation')
    return isKnown
      ? { status: 'known', ...details }
      : { status: 'importable', ...details }
  }

  async function registerValidatedRemoteSigner(
    candidate: Pick<ValidatedRemoteSigner, 'address'>,
  ): Promise<RemoteSignerValidationDetails> {
    const context = getWalletContext()
    if (!context)
      throw new Error('Local wallet unavailable')

    const current = await validateRemoteSignerAddress(candidate.address)
    if (current.status === 'invalid')
      throw new Error(current.reason)
    if (!isWalletContextCurrent(context))
      throw new Error('Wallet or network changed during validation')

    const stored = await upsertTargetRemoteSigner(
      current.signer,
      () => isWalletContextCurrent(context),
    )
    if (!stored)
      throw new Error('Wallet or network changed during validation')

    clearRemoteSignerStateIfAddress(current.signer.address)
    invalidateRemoteSignerAddressCache()
    return current
  }

  // Remote wallets are HTLCs redeemable by a Nimiq Pay cosigner. Swap HTLCs (e.g. to Fastspot) share their shape but not this recipient.
  // The live cosigner key covers a rotation not yet shipped in the config list.
  function isCosignerAddress(address: string) {
    const keys = remotePublicKey.value ? [...nimiqPayCosignerPublicKeys, remotePublicKey.value] : nimiqPayCosignerPublicKeys
    return keys.some((key) => {
      try {
        return Nimiq.PublicKey.fromHex(key).toAddress().toUserFriendlyAddress() === address
      }
      catch {
        return false
      }
    })
  }

  // Refunded non-cosigner HTLCs found by `registerOwnHtlcIfMissing`; avoids a history lookup on every refresh.
  const foreignHtlcAddresses = new Set<string>()

  // Self-healing: when we observe a drain whose proof.creator is our local address (verified upstream),
  // register the HTLC as an inactive signer so future runs catch it via `isOurRemoteSigner` even
  // without re-reading the proof. Covers extension HTLCs that `discoverRemoteSignersFromBlockchain`
  // misses because it only walks first-hop HTLCs.
  async function registerOwnHtlcIfMissing(
    htlcAddress: string,
    expectedContext?: WalletContext,
  ): Promise<void> {
    const isCurrent = () => !expectedContext || isWalletContextCurrent(expectedContext)
    if (!isCurrent() || foreignHtlcAddresses.has(htlcAddress) || await isOurRemoteSigner(htlcAddress) || !isCurrent())
      return
    if (!remotePublicKey.value)
      return
    const address = Nimiq.Address.fromUserFriendlyAddress(htlcAddress)
    // Account may already be pruned if the HTLC has been fully drained — in that case we still
    // register with zero balance/timeout so the cached set short-circuits future drains from
    // this address instead of looping through getAccount on every periodic refresh.
    const { data: account } = await useNimiqNetwork().getAccount(address)
    if (!isCurrent())
      return

    // A refunded swap HTLC also drains to us with our address as creator, but its redeem address
    // is not a cosigner. Pruned accounts need the creation tx for that; without it, register anyway.
    let htlcRecipient = account?.type === 'htlc' ? account.recipient : undefined
    if (!htlcRecipient) {
      const history = await getAllTransactionsForAddress(address)
      if (!isCurrent())
        return
      const creationData = history.transactions.find(tx => tx.recipient === htlcAddress)?.data
      htlcRecipient = creationData?.type === 'htlc' ? creationData.recipient : undefined
    }
    if (htlcRecipient && !isCosignerAddress(htlcRecipient)) {
      foreignHtlcAddresses.add(htlcAddress)
      logger.log(`🚫 Skipped registering non-cosigner HTLC`, { address: htlcAddress, recipient: htlcRecipient })
      return
    }
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
    }, isCurrent)
    if (!isCurrent())
      return
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
  let scanRequest: { context: WalletContext, promise: Promise<LocalHtlcHistoryScan> } | undefined

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

  async function getAllTransactionsForAddress(address: Address): Promise<AddressHistoryResult> {
    const context = getWalletContext()
    const transactions: PlainTransactionDetails[] = []
    if (!context)
      return { transactions, complete: false }

    const seenTransactions = new Set<string>()
    const seenCursors = new Set<string>()
    let startAt: string | undefined
    while (true) {
      let page: PlainTransactionDetails[]
      try {
        page = await getTransactionsForAddress(address, { startAt, limit: HISTORY_PAGE_SIZE })
      }
      catch {
        return { transactions, complete: false }
      }
      if (!isWalletContextCurrent(context))
        return { transactions, complete: false }

      for (const transaction of page) {
        if (seenTransactions.has(transaction.transactionHash))
          continue
        seenTransactions.add(transaction.transactionHash)
        transactions.push(transaction)
      }
      if (page.length < HISTORY_PAGE_SIZE)
        return { transactions, complete: true }

      const nextCursor = page.at(-1)?.transactionHash
      if (!nextCursor || seenCursors.has(nextCursor))
        return { transactions, complete: false }
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

  // One cosigner DB query per wallet and network per session; a failure waits before asking again.
  let cosignerListing: { identity: WalletIdentity, request?: Promise<string[] | undefined>, retryAt?: number } | undefined

  /**
   * HTLC addresses the cosigner created for the local wallet, retired ones included. Unverified:
   * callers must confirm each one on chain before acting. Undefined when the cosigner can't answer.
   */
  async function listCosignerHtlcs(): Promise<string[] | undefined> {
    const identity = getWalletIdentity()
    const owner = localAddress.value
    if (!identity || !owner)
      return undefined
    if (!cosignerListing || !isWalletIdentityCurrent(cosignerListing.identity))
      cosignerListing = { identity }
    const listing = cosignerListing
    if (Date.now() < (listing.retryAt ?? 0))
      return undefined

    listing.request ??= (async () => {
      try {
        // The WS request times out on its own and returns a TIMEOUT error.
        const { data, error } = await getOwnerWallets({ owner })
        if (error || !data)
          throw new Error(error?.message ?? 'Invalid cosigner response')
        const addresses = data.flatMap((wallet) => {
          try {
            return [Nimiq.Address.fromString(wallet.address).toUserFriendlyAddress()]
          }
          catch {
            return []
          }
        })
        logger.log('📇 Cosigner listed HTLCs', { count: addresses.length })
        return addresses
      }
      catch (error) {
        logger.warn('📇 Cosigner HTLC listing unavailable', error instanceof Error ? error.message : String(error))
        listing.request = undefined
        listing.retryAt = Date.now() + COSIGNER_LISTING_RETRY_MS
        return undefined
      }
    })()
    return listing.request
  }

  async function discoverRemoteSignersFromBlockchain(): Promise<RemoteSignerDiscoveryResult> {
    const context = localAddress.value && client.value ? getWalletContext() : undefined
    if (!context)
      return { added: 0, alreadyKnown: 0, localComplete: false, errors: ['Local wallet or client unavailable'], createdHtlcs: [], historyComplete: false }
    if (discoverRequest && sameWalletContext(discoverRequest.context, context))
      return discoverRequest.promise

    const promise = runDiscoverRemoteSignersFromBlockchain(context).finally(() => {
      if (discoverRequest?.promise === promise)
        discoverRequest = undefined
    })
    discoverRequest = { context, promise }
    return promise
  }

  /**
   * Pages through all local history for HTLC creations without asking the cosigner, so callers can
   * act on funded HTLCs in seconds while the slow per-HTLC metadata validation runs afterwards.
   */
  async function scanLocalHtlcCreations(): Promise<LocalHtlcHistoryScan | undefined> {
    const context = getWalletContext()
    if (!context)
      return undefined
    // Startup discovery and DB verification both scan; share one pass over the whole history.
    if (scanRequest && sameWalletContext(scanRequest.context, context))
      return scanRequest.promise
    const promise = runScanLocalHtlcCreations(context).finally(() => {
      if (scanRequest?.promise === promise)
        scanRequest = undefined
    })
    scanRequest = { context, promise }
    return promise
  }

  async function runScanLocalHtlcCreations(context: WalletContext): Promise<LocalHtlcHistoryScan> {
    const scan: LocalHtlcHistoryScan = { context, creations: [], historyComplete: false, sawHtlcTransaction: false, errors: [] }
    try {
      await promiseWithTimeout(context.client.waitForConsensusEstablished(), DISCOVER_TIMEOUT_MS)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('discoverRemoteSignersFromBlockchain: consensus unavailable', message)
      return { ...scan, errors: [message] }
    }
    if (!isWalletContextCurrent(context))
      return { ...scan, errors: ['Wallet changed during discovery'] }

    const { owner } = context
    const seenTransactions = new Set<string>()
    const seenCursors = new Set<string>()
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
        scan.errors.push(`${errorName}: ${errorMessage}`)
        break
      }
      if (!isWalletContextCurrent(context))
        return { ...scan, errors: ['Wallet changed during discovery'] }

      scan.sawHtlcTransaction ||= transactions.some(transaction => transaction.recipientType === 'htlc')
      const pageCreations = transactions.filter((transaction) => {
        if (seenTransactions.has(transaction.transactionHash))
          return false
        seenTransactions.add(transaction.transactionHash)
        const data = transaction.data
        return isSuccessfulHistoricalHtlcTransaction(transaction)
          && transaction.sender === owner
          && transaction.senderType === 'basic'
          && transaction.recipientType === 'htlc'
          && (transaction.flags & 0b1) === 0b1
          && data.type === 'htlc'
          && data.sender === owner
          && isCosignerAddress(data.recipient)
      })
      scan.creations.push(...pageCreations)
      // Full pages are ~150 KB each; logging them filled the 5 MB log in a few sessions and rotated swaps out.
      logger.log('All Transactions from Blockchain', {
        count: transactions.length,
        startAt: startAt ?? null,
        first: transactions[0]?.transactionHash ?? null,
        last: transactions.at(-1)?.transactionHash ?? null,
        htlcCreations: pageCreations.map(transaction => transaction.transactionHash),
      })

      if (transactions.length < HISTORY_PAGE_SIZE) {
        scan.historyComplete = true
        break
      }

      const nextCursor = transactions.at(-1)?.transactionHash
      if (!nextCursor || seenCursors.has(nextCursor)) {
        scan.errors.push('Local history pagination made no progress')
        break
      }
      seenCursors.add(nextCursor)
      startAt = nextCursor
    }
    return scan
  }

  async function runDiscoverRemoteSignersFromBlockchain(context: WalletContext): Promise<RemoteSignerDiscoveryResult> {
    const localScan = await scanLocalHtlcCreations()
    const result: RemoteSignerDiscoveryResult = {
      added: 0,
      alreadyKnown: 0,
      localComplete: false,
      errors: [...localScan?.errors ?? ['Local wallet or client unavailable']],
      createdHtlcs: localScan?.creations.map(transaction => transaction.recipient) ?? [],
      historyComplete: localScan?.historyComplete ?? false,
    }
    if (!localScan || !isWalletContextCurrent(context))
      return result

    const { owner } = context
    const seenSignerAddresses = new Set<string>()
    let evidenceIncomplete = false

    for (const transaction of localScan.creations) {
      let address: Address
      try {
        address = Nimiq.Address.fromString(transaction.recipient)
      }
      catch {
        logger.warn('Ignoring HTLC creation with invalid recipient address', transaction.transactionHash)
        continue
      }
      const rootResult = await resolveAddressSpecificSignerMetadata(address, context, { knownCreation: transaction, allowRetired: true })
      if (!isWalletContextCurrent(context))
        return { ...result, errors: ['Wallet changed during discovery'] }
      if (rootResult.status === 'unavailable') {
        evidenceIncomplete = true
        result.errors.push(`HTLC metadata unavailable: ${transaction.recipient} (${rootResult.reason})`)
        continue
      }
      if (rootResult.status === 'rejected'
        || rootResult.metadata.creationTransactionHash !== transaction.transactionHash) {
        logger.warn('Ignoring HTLC creation with mismatched signer metadata', transaction.transactionHash)
        continue
      }

      const signersToScan = [rootResult.metadata]
      while (signersToScan.length > 0) {
        const metadata = signersToScan.shift()!
        if (seenSignerAddresses.has(metadata.addressString))
          continue
        seenSignerAddresses.add(metadata.addressString)

        const { data: account, error } = await getAccount(metadata.address)
        if (!isWalletContextCurrent(context))
          return { ...result, errors: ['Wallet changed during discovery'] }
        if (error && error !== NO_ACCOUNT_ERROR) {
          evidenceIncomplete = true
          result.errors.push(`HTLC account lookup failed: ${metadata.addressString}`)
        }
        else if (error === NO_ACCOUNT_ERROR
          || account?.type === 'basic'
          || (account?.type === 'htlc'
            && account.sender === owner
            && account.recipient === metadata.cosignerRecipient
            && account.timeout === metadata.end)) {
          // Keep validated, drained HTLCs so wallet restores can import their outgoing history.
          const insertResult = await upsertInactiveRemoteSigner({
            active: false,
            balance: account?.type === 'htlc' ? account.balance : 0,
            address: metadata.address,
            publicKey: metadata.publicKey,
            start: metadata.start,
            end: metadata.end,
            proofSize: metadata.proofSize,
          }, context)
          if (!isWalletContextCurrent(context))
            return { ...result, errors: ['Wallet changed during discovery'] }
          if (insertResult === 'added')
            result.added += 1
          else
            result.alreadyKnown += 1
        }

        const history = await getAllTransactionsForAddress(metadata.address)
        if (!isWalletContextCurrent(context))
          return { ...result, errors: ['Wallet changed during discovery'] }
        if (!history.complete) {
          evidenceIncomplete = true
          result.errors.push(`HTLC history lookup incomplete: ${metadata.addressString}`)
        }

        for (const extension of history.transactions) {
          const extensionData = extension.data
          if (!isSuccessfulHistoricalHtlcTransaction(extension)
            || extension.sender !== metadata.addressString
            || extension.senderType !== 'htlc'
            || extension.recipientType !== 'htlc'
            || (extension.flags & 0b1) !== 0b1
            || extensionData.type !== 'htlc'
            || extensionData.sender !== owner
            || !isCosignerAddress(extensionData.recipient)) {
            continue
          }

          let childAddress: Address
          try {
            childAddress = Nimiq.Address.fromString(extension.recipient)
          }
          catch {
            logger.warn('Ignoring HTLC extension with invalid recipient address', extension.transactionHash)
            continue
          }
          const childResult = await resolveAddressSpecificSignerMetadata(childAddress, context, { knownCreation: extension, allowRetired: true })
          if (!isWalletContextCurrent(context))
            return { ...result, errors: ['Wallet changed during discovery'] }
          if (childResult.status === 'unavailable') {
            evidenceIncomplete = true
            result.errors.push(`HTLC metadata unavailable: ${extension.recipient} (${childResult.reason})`)
            continue
          }
          if (childResult.status === 'rejected'
            || childResult.metadata.creationTransactionHash !== extension.transactionHash) {
            logger.warn('Ignoring HTLC extension with mismatched signer metadata', extension.transactionHash)
            continue
          }
          signersToScan.push(childResult.metadata)
        }
      }
    }

    result.localComplete = localScan.historyComplete && !evidenceIncomplete
    // Partial history must not decide which recovered signer becomes active.
    if (result.localComplete && isWalletContextCurrent(context))
      await updateRemoteFromApi(!localScan.sawHtlcTransaction, context)
    return result
  }

  async function updateActiveRemoteBalance(newBalance: number) {
    const address = remoteAddress.value
    const context = getWalletContext()
    if (!address || !context)
      return
    const stored = await updateBalance(newBalance, address, () => isWalletContextCurrent(context))
    if (stored && isWalletContextCurrent(context) && remoteAddress.value?.equals(address))
      remoteBalance.value = newBalance
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
      const signerRevision = getSignerWriteRevision()
      const activeRemoteSigner = await getActiveRemoteSigner()
      if (!isCurrentInit())
        return
      // Reconciliation may have activated another signer while SQLite returned this snapshot.
      if (signerRevision === getSignerWriteRevision()) {
        remoteSigner.value = activeRemoteSigner
        remoteBalance.value = activeRemoteSigner?.balance ?? 0
        homeBalanceState.value = activeRemoteSigner ? 'resolved-remote' : 'loading'
        // Reconciliation needs consensus. Until then, trust the stored validity window so a
        // cold start doesn't report a funded, valid HTLC as "Processing funds".
        if (consensus.value !== 'established') {
          isHtlcActive.value = !!activeRemoteSigner
            && remoteBalance.value > 0
            && activeRemoteSigner.start <= headTimestamp.value
            && activeRemoteSigner.end > headTimestamp.value
        }
      }
      logger.log('📡 Remote Signer from DB', remoteSigner.value ? { ...remoteSigner.value, address: remoteSigner.value.address.toUserFriendlyAddress() } : null)
      const context = getWalletContext()

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
          if (headListener === previous && context && sameWalletContext(previous.context, context))
            return
          if (!staleHeadListeners.includes(previous))
            staleHeadListeners.push(previous)
          if (headListener === previous)
            headListener = undefined
        }
        if (!isCurrentInit())
          return
      }

      if (!context || consensus.value !== 'established' || !isWalletContextCurrent(context))
        return

      await updateSignersTableBalance(context)
      if (!isCurrentInit() || consensus.value !== 'established' || !isWalletContextCurrent(context))
        return

      if (!remoteSigner.value) {
        logger.log('📡 We don\'t have a remote signer in the database. Getting it from the API')
        void discoverRemoteSignersFromBlockchain()
      }

      void updateRemoteFromApi()
      if (!isCurrentInit() || consensus.value !== 'established' || !isWalletContextCurrent(context))
        return
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
      await until(remoteHeight).not.toBe(-1, { timeout: DISCOVER_TIMEOUT_MS, throwOnTimeout: true })
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
    getWalletContext,
    isWalletContextCurrent,
    getLocalTransactions,
    getAllTransactionsForAddress,
    findTransactionInHistory,

    isHtlcActive,
    hasHtlcExpired,
    isHtlcPending,
    isHtlcRecreating,

    addRemoteSigner,
    updateActiveRemoteBalance,
    updateActiveWallet,
    updateRemoteSigner,
    updateRemoteSignerBalance,
    deactivateRemoteSigner,
    activateRemoteSignerFromTransaction,
    getSignerWriteRevision,
    resolveAddressSpecificSignerMetadata,
    updateSignersTableBalance,
    discoverRemoteSignersFromBlockchain,
    listCosignerHtlcs,
    scanLocalHtlcCreations,
    validateRemoteSignerAddress,
    registerValidatedRemoteSigner,
    isCosignerAddress,
    upsertInactiveRemoteSigner,
    purgeRemoteSigners,

    getAllRemoteSigners,
    isOurRemoteSigner,
    getOurRemoteSignerAddresses,
    registerOwnHtlcIfMissing,

    init,
  }
})
