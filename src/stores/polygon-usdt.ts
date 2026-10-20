import type { RelayRequest } from '@opengsn/common/dist/EIP712/RelayRequest'
import type { Log, TransactionReceipt } from 'ethers'
import type { HDNodeWallet } from 'ethers/wallet'
import type { PolygonTransferFeeSnapshot, PolygonTransferQuote, RelayServerInfo } from '@/lib/polygon/types'
import type { SavedAddress } from '@/stores/app'
import type { Result } from '@/types'
import type { SwapHtlc } from '@/types/swapHtlcs'
import type { ExternalTransaction, MerchantTransaction, TransactionSentByUser, TransactionTitle, UserReceiptTransaction, UserTransaction } from '@/types/transactions'
import { Contract, getAddress, Interface, isError, JsonRpcProvider, Signature, Transaction } from 'ethers'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, shallowRef, watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { toSeconds } from '@/composables/useTime'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { trackSwapCompleted, trackSwapFailed, trackTopUpReceived } from '@/lib/analytics'
import { Asset, Chain } from '@/lib/assets'
import { addressesEqual, getRequiredContractEvent, toAddressTopic } from '@/lib/ethereum'
import { isMockEnabled } from '@/lib/mock-mode'
import { POLYGON_BRIDGED_TOKEN_ABI, POLYGON_HTLC_RECIPIENT_ABI, POLYGON_RELAY_HUB_ABI, POLYGON_TOKEN_APPROVAL_ABI, POLYGON_TRANSFER_RECIPIENT_ABI } from '@/lib/polygon/abis'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { fetchLogsWithAdaptiveRange } from '@/lib/polygon/history'
import { getBestRelay, getRelayAddr } from '@/lib/polygon/opengsn'
import { resolveTokenMetaTxDomain } from '@/lib/polygon/token-meta-tx'
import { getRegisteredPoolAddress, quoteWrappedNativePrice } from '@/lib/polygon/uniswap'
import { SQLQuery } from '@/lib/sql-queries'
import { parseStoredTransaction, sleep } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useLocalWallet } from '@/stores/local-wallet'
import { useTransactions } from '@/stores/transactions'
import { getSwapHtlcTxHash } from '@/types/swapHtlcs'
import { MerchantCategory, PaymentMethod, Rail, Transfer } from '@/types/transactions'

interface PolygonUsdtClient {
  provider: JsonRpcProvider
  tokenContract: Contract
  transferContract: Contract
  htlcContract: Contract
}

interface CachedRelayEntry {
  relay: RelayServerInfo
  expiresAt: number
}

interface ParsedTransferLog {
  hash: string
  blockNumber: number
  logIndex: number
  from: string
  to: string
  value: bigint
}

interface TransferGroup {
  hash: string
  blockNumber: number
  logIndex: number
  main: ParsedTransferLog | null
  incomingTotal: bigint
  outgoingTotal: bigint
  fee: bigint
  timestamp?: number
}

interface InitialHistoryScanState {
  headBlock: number
  nextToBlock: number
  remainingBalance: bigint
  remainingNonce: bigint
}

interface InitialHistoryScanSession {
  canStopEarly: boolean
  state: InitialHistoryScanState
}

interface PersistedInitialHistoryScanState {
  headBlock: number
  nextToBlock: number
  remainingBalance: string
  remainingNonce: string
}

type PersistedPolygonHistoryState
  = | {
    version: 1
    mode: 'initial'
    session: {
      canStopEarly: boolean
      state: PersistedInitialHistoryScanState
    }
  }
  | {
    version: 1
    mode: 'ready'
    lastHistorySyncBlock: number
  }

interface RelayExecutionInput {
  relayRequest: RelayRequest
  relayUrl: string
  signature: string
}

interface PolygonRelayCallbacks {
  beforeRelay?: () => Promise<void>
  beforeBroadcast?: (hash: string) => Promise<void>
  onReplaced?: (oldHash: string, newHash: string) => Promise<void>
  validateReceipt?: (receipt: TransactionReceipt) => boolean
}

interface PolygonPaymentAttempt {
  network: string
  sender: string
  request_json: string
  title: string
  relay_request_json: string
  relay_url: string
  signature: string
  fee: number
  start_block: number
  created_at: number
  relay_hash: string | null
}

export interface PolygonRelayOutcome {
  hash: string
  status: 'mined' | 'pending' | 'rejected'
}

export type PolygonPaymentSendResult
  = | { outcome: 'submitted', data: { tx: TransactionSentByUser, serialized: string }, error: undefined }
    | { outcome: 'rejected', data: undefined, error: string }
    | { outcome: 'unknown', data: undefined, error: string }
    | { outcome: 'previous-resolved', data: undefined, error: string }

export class PolygonRelayRejectedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PolygonRelayRejectedError'
  }
}

type PolygonSendRequest = Pick<ExternalTransaction, 'recipient' | 'amount' | 'message' | 'merchantName' | 'merchantCategory' | 'rail' | 'paymentRef' | 'fee' | 'invoiced' | 'meta' | 'fiatAmount' | 'fiatFeeAmount' | 'fiatCurrency' | 'railMerchantId'> & {
  transfer: Transfer.UserPayment | Transfer.UserPaymentToMerchant | Transfer.UserPaymentToAtomicSwap
}

export type PolygonUsdtHomeBalanceState = 'loading' | 'resolved-empty' | 'resolved-balance'

const logger = useLogger('polygon-usdt')
const tokenInterface = new Interface(POLYGON_BRIDGED_TOKEN_ABI)
const relayHubInterface = new Interface(POLYGON_RELAY_HUB_ABI)
const htlcInterface = new Interface(POLYGON_HTLC_RECIPIENT_ABI)
const htlcRefundTopicHash = getRequiredContractEvent(htlcInterface, 'Refund').topicHash
let clientPromise: Promise<PolygonUsdtClient> | null = null
let resolvedRpcUrl: string = polygonUsdtConfig.rpcUrl
let poolAddressPromise: Promise<string> | null = null
let requiredRelayGasPromise: Promise<bigint> | null = null
let acceptanceBudgetPromise: Promise<bigint> | null = null
let calldataGasCostPromise: Promise<bigint> | null = null
let cachedRelay: CachedRelayEntry | null = null
let requiredHtlcRelayGasPromise: Promise<bigint> | null = null
let htlcAcceptanceBudgetPromise: Promise<bigint> | null = null
const activePolygonPaymentSends = new Set<string>()

export const POLYGON_TRANSFER_QUOTE_TTL_MS = 20_000
const CACHED_RELAY_TTL_MS = 5 * 60_000
const INITIAL_HISTORY_SCAN_MAX_RANGES_PER_PASS = 20
const CONCURRENT_RANGE_FETCHES = 4
const BLOCK_TS_CACHE_MAX = 5_000
const POLYGON_RELAY_AMBIGUITY_GRACE_MS = 5 * 60_000
const POLYGON_PAYMENT_FINALITY_BLOCKS = 10

export function shouldRetryMissingPolygonRelay(submittedAt: number | null | undefined, now = Date.now()) {
  return !submittedAt || now - submittedAt >= POLYGON_RELAY_AMBIGUITY_GRACE_MS
}

function getPolygonPaymentNetwork() {
  return `${isTestnet ? 'testnet' : 'mainnet'}:${polygonUsdtConfig.networkId}:${polygonUsdtConfig.tokenContract.toLowerCase()}:${polygonUsdtConfig.transferContract.toLowerCase()}`
}

function normalizeRelayRequest(relayRequest: RelayRequest) {
  return {
    request: {
      from: getAddress(relayRequest.request.from).toLowerCase(),
      to: getAddress(relayRequest.request.to).toLowerCase(),
      value: BigInt(relayRequest.request.value).toString(),
      gas: BigInt(relayRequest.request.gas).toString(),
      nonce: BigInt(relayRequest.request.nonce).toString(),
      data: relayRequest.request.data.toLowerCase(),
      validUntil: BigInt(relayRequest.request.validUntil).toString(),
    },
    relayData: {
      gasPrice: BigInt(relayRequest.relayData.gasPrice).toString(),
      pctRelayFee: BigInt(relayRequest.relayData.pctRelayFee).toString(),
      baseRelayFee: BigInt(relayRequest.relayData.baseRelayFee).toString(),
      relayWorker: getAddress(relayRequest.relayData.relayWorker).toLowerCase(),
      paymaster: getAddress(relayRequest.relayData.paymaster).toLowerCase(),
      forwarder: getAddress(relayRequest.relayData.forwarder).toLowerCase(),
      paymasterData: relayRequest.relayData.paymasterData.toLowerCase(),
      clientId: BigInt(relayRequest.relayData.clientId).toString(),
    },
  }
}

function decodeRelayCall(data: string): { relayRequest: RelayRequest, signature: string } | null {
  try {
    const parsed = relayHubInterface.parseTransaction({ data })
    if (!parsed || parsed.name !== 'relayCall')
      return null

    const encodedRequest = parsed.args.relayRequest ?? parsed.args[1]
    const request = encodedRequest.request ?? encodedRequest[0]
    const relayData = encodedRequest.relayData ?? encodedRequest[1]
    return {
      relayRequest: {
        request: {
          from: String(request.from ?? request[0]),
          to: String(request.to ?? request[1]),
          value: String(request.value ?? request[2]),
          gas: String(request.gas ?? request[3]),
          nonce: String(request.nonce ?? request[4]),
          data: String(request.data ?? request[5]),
          validUntil: String(request.validUntil ?? request[6]),
        },
        relayData: {
          gasPrice: String(relayData.gasPrice ?? relayData[0]),
          pctRelayFee: String(relayData.pctRelayFee ?? relayData[1]),
          baseRelayFee: String(relayData.baseRelayFee ?? relayData[2]),
          relayWorker: String(relayData.relayWorker ?? relayData[3]),
          paymaster: String(relayData.paymaster ?? relayData[4]),
          forwarder: String(relayData.forwarder ?? relayData[5]),
          paymasterData: String(relayData.paymasterData ?? relayData[6]),
          clientId: String(relayData.clientId ?? relayData[7]),
        },
      },
      signature: String(parsed.args.signature ?? parsed.args[2]),
    }
  }
  catch {
    return null
  }
}

export function isMatchingRelayCall(
  tx: { to?: string | null, data: string },
  relayRequest: RelayRequest,
  signature: string,
) {
  if (!tx.to || !addressesEqual(tx.to, polygonUsdtConfig.openGsnRelayHubContract))
    return false
  const decoded = decodeRelayCall(tx.data)
  return !!decoded
    && decoded.signature.toLowerCase() === signature.toLowerCase()
    && JSON.stringify(normalizeRelayRequest(decoded.relayRequest)) === JSON.stringify(normalizeRelayRequest(relayRequest))
}

export function shouldValidateOpenGsnTransaction(
  receipt: Pick<TransactionReceipt, 'to'>,
) {
  return !!receipt.to && addressesEqual(receipt.to, polygonUsdtConfig.openGsnRelayHubContract)
}

export function isSuccessfulOpenGsnReceipt(
  receipt: Pick<TransactionReceipt, 'logs'>,
  relayRequest?: RelayRequest,
) {
  for (const log of receipt.logs) {
    if (!addressesEqual(log.address, polygonUsdtConfig.openGsnRelayHubContract))
      continue

    try {
      const parsed = relayHubInterface.parseLog(log)
      if (!parsed || parsed.name !== 'TransactionRelayed')
        continue
      if (relayRequest && (!addressesEqual(String(parsed.args.from), relayRequest.request.from)
        || !addressesEqual(String(parsed.args.to), relayRequest.request.to)
        || String(parsed.args.selector).toLowerCase() !== relayRequest.request.data.slice(0, 10).toLowerCase())) {
        continue
      }
      return BigInt(parsed.args.status) === 0n
    }
    catch {
      // Ignore unrelated RelayHub logs.
    }
  }
  return false
}

// Accept stale-by-a-few-seconds timestamps on deep reorgs in exchange for skipping
// redundant eth_getBlockByNumber across listener + history loops.
const blockTimestampCache = new Map<number, number>()

async function getBlockTimestampCached(provider: JsonRpcProvider, blockNumber: number): Promise<number | undefined> {
  const cached = blockTimestampCache.get(blockNumber)
  if (cached !== undefined) {
    // Refresh insertion order so frequently-accessed blocks survive FIFO eviction.
    blockTimestampCache.delete(blockNumber)
    blockTimestampCache.set(blockNumber, cached)
    return cached
  }
  const block = await provider.getBlock(blockNumber)
  const ts = block?.timestamp
  if (typeof ts === 'number') {
    if (blockTimestampCache.size >= BLOCK_TS_CACHE_MAX) {
      const oldest = blockTimestampCache.keys().next().value
      if (oldest !== undefined)
        blockTimestampCache.delete(oldest)
    }
    blockTimestampCache.set(blockNumber, ts)
  }
  return ts
}

const INSUFFICIENT_USDT_POLYGON_FEE_ERROR = 'You don\'t have enough USDT to cover this payment plus Polygon fees.'

export type PolygonTransferQuoteRequest = Pick<PolygonSendRequest, 'amount' | 'recipient' | 'transfer'>

interface BuildPolygonTransferQuoteInput extends PolygonTransferQuoteRequest {
  fee: bigint
  balance: number
  expiresAt?: number
  gasLimit: bigint
  gasPrice: bigint
  relay: RelayServerInfo
  now?: number
}

interface BuildPolygonTransferFeeSnapshotInput {
  fee: bigint
  gasLimit: bigint
  gasPrice: bigint
  relay: RelayServerInfo
  now?: number
}

interface BuildPolygonTransferQuoteFromSnapshotInput {
  snapshot: PolygonTransferFeeSnapshot
  request: PolygonTransferQuoteRequest
  balance: number
  now?: number
}

interface RefreshPolygonTransferQuoteOptions {
  previousQuote?: PolygonTransferQuote
}

interface ResolvePolygonTransferQuoteInput {
  request: PolygonTransferQuoteRequest
  balance: number
  providedQuote?: PolygonTransferQuote
  buildFreshQuote: () => Promise<PolygonTransferQuote>
  now?: number
}

interface InitialHistoryScanOptions {
  latestBlock: number
  earliestBlock: number
  rpcMaxBlockRange: number
  currentBalance: bigint
  currentTokenNonce: bigint
  resumeState?: InitialHistoryScanState
  canStopEarly?: boolean
  maxRanges?: number
  fetchGroups: (fromBlock: number, toBlock: number) => Promise<TransferGroup[]>
  visitGroup: (group: TransferGroup) => Promise<void> | void
}

interface InitialHistoryScanResult {
  completed: boolean
  nextState: InitialHistoryScanState | null
}

interface FetchGroupedTransfersOptions {
  knownHashes?: Set<string>
}

function toSafeNumber(value: bigint, label: string) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(`Polygon ${label} exceeds the supported range`)

  return Number(value)
}

function matchesPolygonTransferQuote(quote: PolygonTransferQuote, request: PolygonTransferQuoteRequest) {
  return quote.amount === request.amount
    && quote.transfer === request.transfer
    && quote.recipient === getAddress(request.recipient)
}

function assertQuoteBalance(amount: number, fee: bigint, balance: number) {
  const transferAmount = BigInt(amount)
  const maxSendable = BigInt(balance) - fee

  if (transferAmount <= 0n)
    throw new Error(i18n.t('Invalid amount'))

  if (maxSendable <= 0n || transferAmount > maxSendable)
    throw new Error(i18n.t(INSUFFICIENT_USDT_POLYGON_FEE_ERROR))

  return {
    totalDebit: transferAmount + fee,
    maxSendable,
  }
}

export function buildPolygonTransferQuote(input: BuildPolygonTransferQuoteInput): PolygonTransferQuote {
  const transferAmount = BigInt(input.amount)
  if (transferAmount <= 0n)
    throw new Error(i18n.t('Invalid amount'))

  const totalDebit = transferAmount + input.fee
  const maxSendable = BigInt(input.balance) > input.fee
    ? BigInt(input.balance) - input.fee
    : 0n
  const now = input.now ?? Date.now()
  const expiresAt = input.expiresAt ?? (now + POLYGON_TRANSFER_QUOTE_TTL_MS)

  return {
    amount: input.amount,
    recipient: getAddress(input.recipient),
    transfer: input.transfer,
    fee: toSafeNumber(input.fee, 'fee'),
    totalDebit: toSafeNumber(totalDebit, 'total debit'),
    maxSendable: toSafeNumber(maxSendable, 'max sendable amount'),
    expiresAt,
    gasLimit: input.gasLimit.toString(),
    gasPrice: input.gasPrice.toString(),
    relay: {
      url: input.relay.url,
      baseRelayFee: input.relay.baseRelayFee.toString(),
      pctRelayFee: input.relay.pctRelayFee.toString(),
      relayManagerAddress: input.relay.relayManagerAddress,
      relayWorkerAddress: input.relay.relayWorkerAddress,
      minGasPrice: input.relay.minGasPrice.toString(),
    },
  }
}

export function buildPolygonTransferFeeSnapshot(input: BuildPolygonTransferFeeSnapshotInput): PolygonTransferFeeSnapshot {
  const now = input.now ?? Date.now()

  return {
    fee: toSafeNumber(input.fee, 'fee'),
    expiresAt: now + POLYGON_TRANSFER_QUOTE_TTL_MS,
    gasLimit: input.gasLimit.toString(),
    gasPrice: input.gasPrice.toString(),
    relay: {
      url: input.relay.url,
      baseRelayFee: input.relay.baseRelayFee.toString(),
      pctRelayFee: input.relay.pctRelayFee.toString(),
      relayManagerAddress: input.relay.relayManagerAddress,
      relayWorkerAddress: input.relay.relayWorkerAddress,
      minGasPrice: input.relay.minGasPrice.toString(),
    },
  }
}

function quoteRelayToRelayServerInfo(relay: PolygonTransferFeeSnapshot['relay'] | PolygonTransferQuote['relay']): RelayServerInfo {
  return {
    url: relay.url,
    baseRelayFee: BigInt(relay.baseRelayFee),
    pctRelayFee: BigInt(relay.pctRelayFee),
    relayManagerAddress: relay.relayManagerAddress,
    relayWorkerAddress: relay.relayWorkerAddress,
    minGasPrice: BigInt(relay.minGasPrice),
  }
}

export function fetchNetworkGasPrice(provider: Pick<JsonRpcProvider, 'send'>) {
  return provider.send('eth_gasPrice', []).then(value => BigInt(value))
}

export async function broadcastPolygonRelayTransaction(
  provider: Pick<JsonRpcProvider, 'broadcastTransaction'>,
  relayTx: string,
) {
  return provider.broadcastTransaction(relayTx).catch((error) => {
    logger.error('Failed to broadcast relayed Polygon transaction', error)
    return null
  })
}

export async function fetchPolygonTransactionReceipt(
  provider: Pick<JsonRpcProvider, 'getTransactionReceipt'>,
  hash: string,
) {
  return provider.getTransactionReceipt(hash).catch((error) => {
    logger.error('Failed to fetch Polygon transaction receipt', error, { hash })
    return null
  })
}

export async function completePolygonRelayTransaction(
  provider: Pick<JsonRpcProvider, 'broadcastTransaction' | 'getTransaction'>,
  relayTx: string,
  relayHash: string,
  callbacks: Omit<PolygonRelayCallbacks, 'beforeRelay'> = {},
): Promise<PolygonRelayOutcome> {
  try {
    await callbacks.beforeBroadcast?.(relayHash)
    let txResponse = await broadcastPolygonRelayTransaction(provider, relayTx)
    const MAX_RELAY_RETRIES = 30
    for (let attempt = 0; !txResponse && attempt < MAX_RELAY_RETRIES; attempt++) {
      txResponse = await provider.getTransaction(relayHash)
      if (!txResponse)
        await sleep(1_000)
    }

    if (!txResponse)
      throw new Error(i18n.t('Polygon transaction not found after relay'))

    const receipt = await txResponse.wait(1)
    if (!receipt)
      throw new Error(i18n.t('Transaction was not mined on Polygon'))
    if (receipt.status === 0 || (callbacks.validateReceipt && !callbacks.validateReceipt(receipt)))
      return { hash: relayHash, status: 'rejected' }
    return { hash: relayHash, status: 'mined' }
  }
  catch (error) {
    if (isError(error, 'TRANSACTION_REPLACED')) {
      if (error.cancelled || error.reason !== 'repriced' || error.receipt.status === 0
        || (callbacks.validateReceipt && !callbacks.validateReceipt(error.receipt))) {
        return { hash: relayHash, status: 'rejected' }
      }

      try {
        await callbacks.onReplaced?.(relayHash, error.replacement.hash)
      }
      catch (persistenceError) {
        // The replacement already executed; bookkeeping failure cannot make it safe to pay again.
        logger.error('Failed to persist mined Polygon replacement', persistenceError, { oldHash: relayHash, newHash: error.replacement.hash })
      }
      return { hash: error.replacement.hash, status: 'mined' }
    }
    if (typeof error === 'object' && error && 'receipt' in error
      && typeof error.receipt === 'object' && error.receipt && 'status' in error.receipt
      && error.receipt.status === 0) {
      logger.error('Polygon relay transaction reverted', error, { hash: relayHash })
      return { hash: relayHash, status: 'rejected' }
    }
    logger.error('Polygon relay submitted; confirmation lookup failed', error, { hash: relayHash })
    return { hash: relayHash, status: 'pending' }
  }
}

export async function submitPolygonRelayTransaction(
  provider: Pick<JsonRpcProvider, 'broadcastTransaction' | 'getTransaction'>,
  requestRelay: () => Promise<{ relayTx: string, relayHash: string }>,
  callbacks: PolygonRelayCallbacks = {},
) {
  await callbacks.beforeRelay?.()

  let relay: { relayTx: string, relayHash: string }
  try {
    relay = await requestRelay()
  }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('Got error response from relay:'))
      throw new PolygonRelayRejectedError(error.message, { cause: error })
    throw error
  }

  return completePolygonRelayTransaction(
    provider,
    relay.relayTx,
    relay.relayHash,
    callbacks,
  )
}

export function getReusableRelaySource(input: {
  previousQuote?: PolygonTransferQuote
  cachedRelay?: { relay: RelayServerInfo, expiresAt: number } | null
  now?: number
}) {
  if (input.previousQuote)
    return quoteRelayToRelayServerInfo(input.previousQuote.relay)

  if (input.cachedRelay && input.cachedRelay.expiresAt > (input.now ?? Date.now()))
    return { ...input.cachedRelay.relay }

  return null
}

export function buildPolygonTransferQuoteFromSnapshot(input: BuildPolygonTransferQuoteFromSnapshotInput): PolygonTransferQuote {
  return buildPolygonTransferQuote({
    ...input.request,
    balance: input.balance,
    fee: BigInt(input.snapshot.fee),
    gasLimit: BigInt(input.snapshot.gasLimit),
    gasPrice: BigInt(input.snapshot.gasPrice),
    relay: quoteRelayToRelayServerInfo(input.snapshot.relay),
    expiresAt: input.snapshot.expiresAt,
    now: input.now,
  })
}

export async function resolvePolygonTransferQuote(input: ResolvePolygonTransferQuoteInput): Promise<PolygonTransferQuote> {
  const now = input.now ?? Date.now()
  const approvedQuote = input.providedQuote && matchesPolygonTransferQuote(input.providedQuote, input.request)
    ? input.providedQuote
    : undefined
  const quote = approvedQuote && approvedQuote.expiresAt > now
    ? approvedQuote
    : await input.buildFreshQuote()

  assertQuoteBalance(quote.amount, BigInt(quote.fee), input.balance)
  // The user confirmed the approved quote's total; never sign a higher fee they did not see.
  if (approvedQuote && quote.fee > approvedQuote.fee)
    throw new Error(i18n.t('Polygon fee changed; review the payment again'))
  return quote
}

export async function scanInitialPolygonHistory({
  latestBlock,
  earliestBlock,
  rpcMaxBlockRange,
  currentBalance,
  currentTokenNonce,
  resumeState,
  canStopEarly = currentBalance !== 0n || currentTokenNonce !== 0n,
  maxRanges,
  fetchGroups,
  visitGroup,
}: InitialHistoryScanOptions): Promise<InitialHistoryScanResult> {
  let remainingBalance = resumeState?.remainingBalance ?? currentBalance
  let remainingNonce = resumeState?.remainingNonce ?? currentTokenNonce
  let toBlock = resumeState?.nextToBlock ?? latestBlock
  const headBlock = resumeState?.headBlock ?? latestBlock
  let scannedRanges = 0

  while (toBlock >= earliestBlock) {
    if (canStopEarly && remainingBalance <= 0n && remainingNonce <= 0n) {
      return {
        completed: true,
        nextState: null,
      }
    }

    if (maxRanges && scannedRanges >= maxRanges) {
      return {
        completed: false,
        nextState: {
          headBlock,
          nextToBlock: toBlock,
          remainingBalance,
          remainingNonce,
        },
      }
    }

    const fromBlock = Math.max(toBlock - rpcMaxBlockRange + 1, earliestBlock)
    const groups = await fetchGroups(fromBlock, toBlock)

    for (const group of groups.sort((a, b) => (b.blockNumber - a.blockNumber) || (b.logIndex - a.logIndex))) {
      if (group.outgoingTotal > 0n) {
        remainingBalance += group.outgoingTotal
        if (remainingNonce > 0n)
          remainingNonce -= 1n
      }
      if (group.incomingTotal > 0n) {
        remainingBalance = remainingBalance > group.incomingTotal
          ? remainingBalance - group.incomingTotal
          : 0n
      }

      await visitGroup(group)
    }

    toBlock = fromBlock - 1
    scannedRanges += 1
  }

  return {
    completed: true,
    nextState: null,
  }
}

const transferTopicHash = getRequiredContractEvent(tokenInterface, 'Transfer').topicHash

export function getPolygonHistoryTitle(recipient: string, withdrawalAddressesHistory: SavedAddress[]): TransactionTitle {
  const normalizedRecipient = getAddress(recipient)
  const isSavedWithdrawal = withdrawalAddressesHistory.some(entry => addressesEqual(entry.address, normalizedRecipient))
  return isSavedWithdrawal ? 'Withdrawal' : 'Payment'
}

function parseTransferLog(log: Pick<Log, 'transactionHash' | 'blockNumber' | 'index' | 'topics' | 'data'> & { logIndex?: number | null }): ParsedTransferLog | null {
  const parsed = tokenInterface.parseLog(log)
  if (!parsed || parsed.name !== 'Transfer')
    return null

  return {
    hash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.index ?? log.logIndex ?? 0,
    from: getAddress(String(parsed.args[0])),
    to: getAddress(String(parsed.args[1])),
    value: BigInt(parsed.args[2].toString()),
  }
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const provider = new JsonRpcProvider(
        resolvedRpcUrl,
        polygonUsdtConfig.networkId,
        { staticNetwork: true },
      )
      await provider.getBlockNumber()

      return {
        provider,
        tokenContract: new Contract(polygonUsdtConfig.tokenContract, POLYGON_BRIDGED_TOKEN_ABI, provider),
        transferContract: new Contract(polygonUsdtConfig.transferContract, POLYGON_TRANSFER_RECIPIENT_ABI, provider),
        htlcContract: new Contract(polygonUsdtConfig.htlcContract, POLYGON_HTLC_RECIPIENT_ABI, provider),
      } satisfies PolygonUsdtClient
    })().catch((error) => {
      clientPromise = null
      throw error
    })
  }

  return clientPromise
}

async function getPoolAddress(client: PolygonUsdtClient) {
  if (!poolAddressPromise) {
    poolAddressPromise = getRegisteredPoolAddress({
      provider: client.provider,
      registryAddress: polygonUsdtConfig.transferContract,
      tokenAddress: polygonUsdtConfig.tokenContract,
    }).catch((error) => {
      poolAddressPromise = null
      throw error
    })
  }

  return poolAddressPromise
}

function getPolygonHistoryStateKey(address: string) {
  return `polygonUsdtHistoryState:${getAddress(address).toLowerCase()}`
}

function getUsdtBalanceCacheKey(address: string) {
  return `usdtBalanceCache:${getAddress(address).toLowerCase()}`
}

function serializeInitialHistoryScanState(state: InitialHistoryScanState): PersistedInitialHistoryScanState {
  return {
    headBlock: state.headBlock,
    nextToBlock: state.nextToBlock,
    remainingBalance: state.remainingBalance.toString(),
    remainingNonce: state.remainingNonce.toString(),
  }
}

function deserializeInitialHistoryScanState(state: PersistedInitialHistoryScanState): InitialHistoryScanState | null {
  if (!Number.isInteger(state.headBlock) || !Number.isInteger(state.nextToBlock))
    return null

  try {
    return {
      headBlock: state.headBlock,
      nextToBlock: state.nextToBlock,
      remainingBalance: BigInt(state.remainingBalance),
      remainingNonce: BigInt(state.remainingNonce),
    }
  }
  catch {
    return null
  }
}

function deserializePolygonHistoryState(value?: string | null): PersistedPolygonHistoryState | null {
  if (!value)
    return null

  try {
    const parsed = JSON.parse(value) as Partial<PersistedPolygonHistoryState>
    if (parsed.version !== 1)
      return null

    if (parsed.mode === 'ready' && Number.isInteger(parsed.lastHistorySyncBlock))
      return parsed as PersistedPolygonHistoryState

    if (parsed.mode === 'initial' && parsed.session?.state) {
      const state = deserializeInitialHistoryScanState(parsed.session.state)
      if (!state || typeof parsed.session.canStopEarly !== 'boolean')
        return null

      return {
        version: 1,
        mode: 'initial',
        session: {
          canStopEarly: parsed.session.canStopEarly,
          state: serializeInitialHistoryScanState(state),
        },
      }
    }
  }
  catch {
    return null
  }

  return null
}

async function getTokenQuotePerBaseUnit(client: PolygonUsdtClient) {
  const quote = await quoteWrappedNativePrice({
    provider: client.provider,
    registryAddress: polygonUsdtConfig.transferContract,
    tokenAddress: polygonUsdtConfig.tokenContract,
    quoterAddress: polygonUsdtConfig.uniswapQuoterContract,
    wrappedNativeTokenAddress: polygonUsdtConfig.wrappedNativeTokenContract,
  })

  const tokenQuotePerBaseUnit = quote.amountOut / quote.amountIn
  if (tokenQuotePerBaseUnit <= 0n)
    throw new Error('Failed to quote Polygon relay fee')

  return tokenQuotePerBaseUnit
}

export async function getRequiredRelayGas(client: PolygonUsdtClient) {
  if (!requiredRelayGasPromise) {
    requiredRelayGasPromise = client.transferContract.getRequiredRelayGas(
      client.transferContract.interface.getFunction('transferWithApproval')!.selector,
    ).then(result => BigInt(result.toString())).catch((error) => {
      requiredRelayGasPromise = null
      throw error
    })
  }

  return requiredRelayGasPromise
}

async function getAcceptanceBudget(client: PolygonUsdtClient) {
  if (!acceptanceBudgetPromise) {
    acceptanceBudgetPromise = client.transferContract.getGasAndDataLimits().then((limits) => {
      return BigInt(((limits.acceptanceBudget ?? limits[0]) as bigint).toString())
    }).catch((error) => {
      acceptanceBudgetPromise = null
      throw error
    })
  }

  return acceptanceBudgetPromise
}

async function getCalldataGasCost(client: PolygonUsdtClient) {
  if (!calldataGasCostPromise) {
    const relayHub = new Contract(polygonUsdtConfig.openGsnRelayHubContract, POLYGON_RELAY_HUB_ABI, client.provider)
    calldataGasCostPromise = relayHub.calldataGasCost(1220).then((value: bigint) => BigInt(value.toString())).catch((error: unknown) => {
      calldataGasCostPromise = null
      throw error
    })
  }

  return calldataGasCostPromise
}

function calculateBufferedGasPrice(networkGasPrice: bigint, minGasPrice: bigint) {
  return (networkGasPrice > minGasPrice ? networkGasPrice : minGasPrice) * 110n / 100n
}

async function resolveReusableRelay(previousQuote?: PolygonTransferQuote): Promise<RelayServerInfo | null> {
  const reusableRelay = getReusableRelaySource({
    previousQuote,
    cachedRelay,
  })
  if (!reusableRelay)
    return null

  const relayAddr = await getRelayAddr(reusableRelay.url).catch((error) => {
    logger.error('Failed to validate reusable Polygon relay', error, { relayUrl: reusableRelay.url })
    return null
  })
  if (!relayAddr?.ready) {
    if (cachedRelay?.relay.url === reusableRelay.url)
      cachedRelay = null
    return null
  }
  if (relayAddr.networkId !== String(polygonUsdtConfig.networkId)) {
    if (cachedRelay?.relay.url === reusableRelay.url)
      cachedRelay = null
    return null
  }

  const resolvedRelay = {
    ...reusableRelay,
    minGasPrice: BigInt(relayAddr.minGasPrice),
    relayWorkerAddress: getAddress(relayAddr.relayWorkerAddress),
    relayManagerAddress: getAddress(relayAddr.relayManagerAddress),
  }

  cachedRelay = {
    relay: resolvedRelay,
    expiresAt: Date.now() + CACHED_RELAY_TTL_MS,
  }

  return resolvedRelay
}

async function calculateRelayFee(
  client: PolygonUsdtClient,
  getGasLimit: (c: PolygonUsdtClient) => Promise<bigint>,
  getAcceptance: (c: PolygonUsdtClient) => Promise<bigint>,
  options: RefreshPolygonTransferQuoteOptions = {},
) {
  const [networkGasPrice, gasLimit, tokenQuotePerBaseUnit, reusableRelay] = await Promise.all([
    fetchNetworkGasPrice(client.provider),
    getGasLimit(client),
    getTokenQuotePerBaseUnit(client),
    resolveReusableRelay(options.previousQuote),
  ])

  const calculateChainTokenFee = ({ baseRelayFee, pctRelayFee, minGasPrice }: RelayServerInfo) => {
    const gasPrice = calculateBufferedGasPrice(networkGasPrice, minGasPrice)
    const chainTokenFee = gasPrice * gasLimit * (pctRelayFee + 100n) / 100n + baseRelayFee
    return { gasPrice, chainTokenFee }
  }

  let relay: RelayServerInfo
  if (reusableRelay) {
    relay = reusableRelay
  }
  else {
    relay = await Promise.all([
      getAcceptance(client),
      getCalldataGasCost(client),
    ]).then(async ([acceptanceBudget, dataGasCost]) => getBestRelay({
      provider: client.provider,
      config: {
        relayHubAddress: polygonUsdtConfig.openGsnRelayHubContract,
        networkId: polygonUsdtConfig.networkId,
        rpcMaxBlockRange: polygonUsdtConfig.rpcMaxBlockRange,
        relayVersionPrefix: polygonUsdtConfig.relayVersionPrefix,
        preferredRelaySuffixes: [...polygonUsdtConfig.preferredRelaySuffixes],
        maxRelayCandidates: polygonUsdtConfig.maxRelayCandidates,
      },
      requiredMaxAcceptanceBudget: acceptanceBudget + dataGasCost,
      calculateFee: ({ baseRelayFee, pctRelayFee, minGasPrice }) => {
        const { chainTokenFee } = calculateChainTokenFee({ baseRelayFee, pctRelayFee, minGasPrice } as RelayServerInfo)
        return { chainTokenFee }
      },
    }))
  }

  cachedRelay = {
    relay,
    expiresAt: Date.now() + CACHED_RELAY_TTL_MS,
  }

  const { gasPrice, chainTokenFee } = calculateChainTokenFee(relay)
  const fee = (chainTokenFee / tokenQuotePerBaseUnit) * 110n / 100n

  return {
    fee: fee > 0n ? fee : 1n,
    gasLimit,
    gasPrice,
    relay,
  }
}

function calculateTransferRelayFee(client: PolygonUsdtClient, options?: RefreshPolygonTransferQuoteOptions) {
  return calculateRelayFee(client, getRequiredRelayGas, getAcceptanceBudget, options)
}

async function fetchPolygonTransferFeeSnapshot(options: RefreshPolygonTransferQuoteOptions = {}) {
  const client = await getClient()
  const { fee, gasLimit, gasPrice, relay } = await calculateTransferRelayFee(client, options)

  return buildPolygonTransferFeeSnapshot({ fee, gasLimit, gasPrice, relay })
}

async function getRequiredHtlcRelayGas(client: PolygonUsdtClient) {
  if (!requiredHtlcRelayGasPromise) {
    requiredHtlcRelayGasPromise = client.htlcContract.getRequiredRelayGas(
      client.htlcContract.interface.getFunction('openWithApproval')!.selector,
    ).then(result => BigInt(result.toString())).catch((error) => {
      requiredHtlcRelayGasPromise = null
      throw error
    })
  }

  return requiredHtlcRelayGasPromise
}

async function getHtlcAcceptanceBudget(client: PolygonUsdtClient) {
  if (!htlcAcceptanceBudgetPromise) {
    htlcAcceptanceBudgetPromise = client.htlcContract.getGasAndDataLimits().then((limits) => {
      return BigInt(((limits.acceptanceBudget ?? limits[0]) as bigint).toString())
    }).catch((error) => {
      htlcAcceptanceBudgetPromise = null
      throw error
    })
  }

  return htlcAcceptanceBudgetPromise
}

function calculateHtlcRelayFee(client: PolygonUsdtClient, options?: RefreshPolygonTransferQuoteOptions) {
  return calculateRelayFee(client, getRequiredHtlcRelayGas, getHtlcAcceptanceBudget, options)
}

async function fetchPolygonHtlcFeeSnapshot(options: RefreshPolygonTransferQuoteOptions = {}) {
  const client = await getClient()
  const { fee, gasLimit, gasPrice, relay } = await calculateHtlcRelayFee(client, options)

  return buildPolygonTransferFeeSnapshot({ fee, gasLimit, gasPrice, relay })
}

async function signTokenApproval(client: PolygonUsdtClient, wallet: HDNodeWallet, approvalAmount: bigint, tokenNonce: bigint, spenderContract: string = polygonUsdtConfig.transferContract) {
  const tokenApprovalContract = new Contract(polygonUsdtConfig.tokenContract, POLYGON_TOKEN_APPROVAL_ABI)
  const functionSignature = tokenApprovalContract.interface.encodeFunctionData('approve', [
    spenderContract,
    approvalAmount,
  ])
  const domain = await resolveTokenMetaTxDomain(client.tokenContract as {
    name?: () => Promise<string>
    DOMAIN_SEPARATOR?: () => Promise<string>
  }, {
    networkId: polygonUsdtConfig.networkId,
    verifyingContract: polygonUsdtConfig.tokenContract,
  })

  const signature = await wallet.signTypedData(
    domain,
    {
      MetaTransaction: [
        { name: 'nonce', type: 'uint256' },
        { name: 'from', type: 'address' },
        { name: 'functionSignature', type: 'bytes' },
      ],
    },
    {
      nonce: tokenNonce,
      from: wallet.address,
      functionSignature,
    },
  )

  const parsedSignature = Signature.from(signature)
  return {
    sigR: parsedSignature.r,
    sigS: parsedSignature.s,
    sigV: parsedSignature.v,
  }
}

async function buildRelayExecution(wallet: HDNodeWallet, quote: PolygonTransferQuote): Promise<RelayExecutionInput & { fee: bigint, startBlock: number }> {
  const client = await getClient()
  const [tokenNonceRaw, forwarderNonceRaw, blockNumber] = await Promise.all([
    client.tokenContract.getNonce(wallet.address),
    client.transferContract.getNonce(wallet.address),
    client.provider.getBlockNumber(),
  ])
  const tokenNonce = BigInt(tokenNonceRaw.toString())
  const forwarderNonce = BigInt(forwarderNonceRaw.toString())
  const transferAmount = BigInt(quote.amount)
  const fee = BigInt(quote.fee)
  const relay = {
    ...quote.relay,
    baseRelayFee: BigInt(quote.relay.baseRelayFee),
    pctRelayFee: BigInt(quote.relay.pctRelayFee),
    minGasPrice: BigInt(quote.relay.minGasPrice),
  }
  const { sigR, sigS, sigV } = await signTokenApproval(client, wallet, fee + transferAmount, tokenNonce)
  const data = client.transferContract.interface.encodeFunctionData('transferWithApproval', [
    polygonUsdtConfig.tokenContract,
    transferAmount,
    getAddress(quote.recipient),
    fee,
    fee + transferAmount,
    sigR,
    sigS,
    sigV,
  ])

  const relayRequest: RelayRequest = {
    request: {
      from: wallet.address,
      to: polygonUsdtConfig.transferContract,
      data,
      value: '0',
      nonce: forwarderNonce.toString(),
      gas: quote.gasLimit,
      validUntil: String(blockNumber + 2 * 60 * 30),
    },
    relayData: {
      gasPrice: quote.gasPrice,
      pctRelayFee: relay.pctRelayFee.toString(),
      baseRelayFee: relay.baseRelayFee.toString(),
      relayWorker: relay.relayWorkerAddress,
      paymaster: polygonUsdtConfig.transferContract,
      paymasterData: '0x',
      clientId: String(Math.floor(Math.random() * 1e6)),
      forwarder: polygonUsdtConfig.transferContract,
    },
  }

  const { TypedRequestData } = await import('@opengsn/common/dist/EIP712/TypedRequestData')
  const typedData = new TypedRequestData(
    polygonUsdtConfig.networkId,
    polygonUsdtConfig.transferContract,
    {
      request: relayRequest.request,
      relayData: relayRequest.relayData,
    },
  )
  const { EIP712Domain, ...cleanedTypes } = typedData.types
  const signature = await wallet.signTypedData(typedData.domain, cleanedTypes as any, typedData.message)

  return {
    fee,
    startBlock: blockNumber,
    relayRequest,
    relayUrl: quote.relay.url,
    signature,
  }
}

async function relayTransaction(
  { relayRequest, relayUrl, signature }: RelayExecutionInput,
  callbacks: Omit<PolygonRelayCallbacks, 'validateReceipt'> = {},
) {
  const client = await getClient()
  const [{ HttpClient, HttpWrapper }, relayMaxNonce] = await Promise.all([
    import('@opengsn/common'),
    client.provider.getTransactionCount(relayRequest.relayData.relayWorker),
  ])

  return submitPolygonRelayTransaction(
    client.provider,
    async () => {
      const httpClient = new HttpClient(new HttpWrapper(), console)
      const relayTx = await httpClient.relayTransaction(relayUrl, {
        relayRequest,
        metadata: {
          approvalData: '0x',
          relayHubAddress: polygonUsdtConfig.openGsnRelayHubContract,
          relayMaxNonce: relayMaxNonce + 3,
          signature,
        },
      })

      const relayHash = Transaction.from(relayTx).hash
      if (!relayHash)
        throw new Error(i18n.t('Could not determine Polygon transaction hash'))
      return { relayTx, relayHash }
    },
    {
      ...callbacks,
      validateReceipt: receipt => isSuccessfulOpenGsnReceipt(receipt, relayRequest),
    },
  )
}

async function buildHtlcRelayEnvelope(
  wallet: HDNodeWallet,
  data: string,
  feeSnapshot: PolygonTransferFeeSnapshot,
): Promise<RelayExecutionInput & { fee: bigint }> {
  const client = await getClient()
  const [forwarderNonceRaw, blockNumber] = await Promise.all([
    client.htlcContract.getNonce(wallet.address),
    client.provider.getBlockNumber(),
  ])
  const fee = BigInt(feeSnapshot.fee)
  const relay = feeSnapshot.relay

  const relayRequest: RelayRequest = {
    request: {
      from: wallet.address,
      to: polygonUsdtConfig.htlcContract,
      data,
      value: '0',
      nonce: BigInt(forwarderNonceRaw.toString()).toString(),
      gas: feeSnapshot.gasLimit,
      validUntil: String(blockNumber + 2 * 60 * 30),
    },
    relayData: {
      gasPrice: feeSnapshot.gasPrice,
      pctRelayFee: relay.pctRelayFee,
      baseRelayFee: relay.baseRelayFee,
      relayWorker: relay.relayWorkerAddress,
      paymaster: polygonUsdtConfig.htlcContract,
      paymasterData: '0x',
      clientId: String(Math.floor(Math.random() * 1e6)),
      forwarder: polygonUsdtConfig.htlcContract,
    },
  }

  const { TypedRequestData } = await import('@opengsn/common/dist/EIP712/TypedRequestData')
  const typedData = new TypedRequestData(
    polygonUsdtConfig.networkId,
    polygonUsdtConfig.htlcContract,
    {
      request: relayRequest.request,
      relayData: relayRequest.relayData,
    },
  )
  const { EIP712Domain, ...cleanedTypes } = typedData.types
  const signature = await wallet.signTypedData(typedData.domain, cleanedTypes as any, typedData.message)

  return {
    fee,
    relayRequest,
    relayUrl: relay.url,
    signature,
  }
}

async function buildHtlcRelayExecution(
  wallet: HDNodeWallet,
  htlcId: string,
  amount: bigint,
  recipientAddress: string,
  hash: string,
  timeout: number,
  feeSnapshot: PolygonTransferFeeSnapshot,
): Promise<RelayExecutionInput & { fee: bigint }> {
  const client = await getClient()
  const tokenNonceRaw = await client.tokenContract.getNonce(wallet.address)
  const tokenNonce = BigInt(tokenNonceRaw.toString())
  const fee = BigInt(feeSnapshot.fee)
  const approval = amount + fee
  const { sigR, sigS, sigV } = await signTokenApproval(client, wallet, approval, tokenNonce, polygonUsdtConfig.htlcContract)
  const data = client.htlcContract.interface.encodeFunctionData('openWithApproval', [
    htlcId,
    polygonUsdtConfig.tokenContract,
    amount,
    wallet.address,
    getAddress(recipientAddress),
    hash,
    timeout,
    fee,
    approval,
    sigR,
    sigS,
    sigV,
  ])
  return buildHtlcRelayEnvelope(wallet, data, feeSnapshot)
}

async function fetchGroupedTransfers(address: string, fromBlock: number, toBlock: number, options: FetchGroupedTransfersOptions = {}) {
  const client = await getClient()
  const poolAddress = await getPoolAddress(client)
  const [incomingLogs, outgoingLogs] = await Promise.all([
    fetchLogsWithAdaptiveRange(client.provider, {
      address: polygonUsdtConfig.tokenContract,
      fromBlock,
      toBlock,
      topics: [transferTopicHash, null, toAddressTopic(address)],
    }),
    fetchLogsWithAdaptiveRange(client.provider, {
      address: polygonUsdtConfig.tokenContract,
      fromBlock,
      toBlock,
      topics: [transferTopicHash, toAddressTopic(address)],
    }),
  ])

  const normalizedAddress = getAddress(address)
  const groups = new Map<string, TransferGroup>()
  for (const rawLog of [...incomingLogs, ...outgoingLogs]) {
    const parsed = parseTransferLog(rawLog)
    if (!parsed || parsed.value === 0n)
      continue

    const group = groups.get(parsed.hash) || {
      hash: parsed.hash,
      blockNumber: parsed.blockNumber,
      logIndex: parsed.logIndex,
      main: null,
      incomingTotal: 0n,
      outgoingTotal: 0n,
      fee: 0n,
    } satisfies TransferGroup

    group.blockNumber = parsed.blockNumber
    group.logIndex = Math.max(group.logIndex, parsed.logIndex)

    if (parsed.from === normalizedAddress)
      group.outgoingTotal += parsed.value
    if (parsed.to === normalizedAddress)
      group.incomingTotal += parsed.value

    if (parsed.to === poolAddress) {
      group.fee += parsed.value
    }
    else if (!group.main) {
      group.main = parsed
    }

    groups.set(parsed.hash, group)
  }

  const groupedTransfers = [...groups.values()]
  const blockNumbers = [...new Set(groupedTransfers
    .filter(group => !options.knownHashes?.has(group.hash))
    .map(group => group.blockNumber))]
  const blockTimestamps = new Map(await Promise.all(
    blockNumbers.map(async blockNumber => [blockNumber, await getBlockTimestampCached(client.provider, blockNumber)] as const),
  ))

  return groupedTransfers.map(group => ({
    ...group,
    timestamp: blockTimestamps.get(group.blockNumber),
  }))
}

export async function fetchPolygonTransactionState(
  provider: Pick<JsonRpcProvider, 'getTransactionReceipt' | 'getBlockNumber' | 'getBlock'>,
  hash: string,
  validateReceipt?: (receipt: TransactionReceipt) => boolean,
): Promise<{ status: 'pending' | 'mined' | 'confirmed' | 'failed', timestamp?: number, lookupFailed?: boolean }> {
  let receipt
  try {
    receipt = await provider.getTransactionReceipt(hash)
  }
  catch (error) {
    logger.error('Failed to fetch Polygon transaction receipt', error, { hash })
    return { status: 'pending', lookupFailed: true }
  }
  if (!receipt)
    return { status: 'pending' }

  const [latestBlock, block] = await Promise.allSettled([
    provider.getBlockNumber(),
    receipt.blockNumber ? provider.getBlock(receipt.blockNumber) : null,
  ])
  if (!receipt.status || (validateReceipt && !validateReceipt(receipt)))
    return { status: 'failed', timestamp: block.status === 'fulfilled' ? block.value?.timestamp : undefined }

  return {
    status: latestBlock.status === 'fulfilled' && latestBlock.value - receipt.blockNumber >= 10 ? 'confirmed' : 'mined',
    timestamp: block.status === 'fulfilled' ? block.value?.timestamp : undefined,
  }
}

async function getTransactionState(hash: string, validateOpenGsn = false) {
  const client = await getClient()
  return fetchPolygonTransactionState(
    client.provider,
    hash,
    receipt => !(validateOpenGsn || shouldValidateOpenGsnTransaction(receipt)) || isSuccessfulOpenGsnReceipt(receipt),
  )
}

type PolygonPaymentAttemptReconciliation
  = | { status: 'mined', hash: string, receipt: TransactionReceipt }
    | { status: 'rejected', hash?: string }
    | { status: 'unknown' }

function parsePaymentAttemptExecution(attempt: PolygonPaymentAttempt): RelayExecutionInput | null {
  try {
    const relayRequest = JSON.parse(attempt.relay_request_json) as RelayRequest
    normalizeRelayRequest(relayRequest)
    return {
      relayRequest,
      relayUrl: attempt.relay_url,
      signature: attempt.signature,
    }
  }
  catch (error) {
    logger.error('Failed to parse persisted Polygon payment attempt', error, { sender: attempt.sender })
    return null
  }
}

async function reconcilePolygonPaymentAttempt(
  client: PolygonUsdtClient,
  attempt: PolygonPaymentAttempt,
): Promise<PolygonPaymentAttemptReconciliation> {
  const execution = parsePaymentAttemptExecution(attempt)
  if (!execution)
    return { status: 'unknown' }

  const inspectHash = async (hash: string): Promise<PolygonPaymentAttemptReconciliation> => {
    try {
      const [tx, receipt] = await Promise.all([
        client.provider.getTransaction(hash),
        client.provider.getTransactionReceipt(hash),
      ])
      if (!receipt)
        return { status: 'unknown' }
      if (!tx || !isMatchingRelayCall(tx, execution.relayRequest, execution.signature))
        return { status: 'unknown' }
      if (receipt.status === 0 || !isSuccessfulOpenGsnReceipt(receipt, execution.relayRequest))
        return { status: 'rejected', hash }
      return { status: 'mined', hash, receipt }
    }
    catch (error) {
      logger.error('Failed to inspect persisted Polygon payment attempt', error, { hash })
      return { status: 'unknown' }
    }
  }

  if (attempt.relay_hash) {
    const result = await inspectHash(attempt.relay_hash)
    if (result.status !== 'unknown')
      return result
  }

  let safeHead: number
  try {
    safeHead = (await client.provider.getBlockNumber()) - POLYGON_PAYMENT_FINALITY_BLOCKS
  }
  catch (error) {
    logger.error('Failed to get confirmed Polygon head for payment recovery', error)
    return { status: 'unknown' }
  }

  if (safeHead < attempt.start_block)
    return { status: 'unknown' }

  let request: PolygonSendRequest
  let logs: Log[]
  try {
    request = JSON.parse(attempt.request_json) as PolygonSendRequest
    logs = await fetchLogsWithAdaptiveRange(client.provider, {
      address: polygonUsdtConfig.tokenContract,
      fromBlock: attempt.start_block,
      toBlock: safeHead,
      topics: [transferTopicHash, toAddressTopic(attempt.sender), toAddressTopic(request.recipient)],
    }, { requireCompleteRange: true })
  }
  catch (error) {
    logger.error('Failed to scan Polygon payment attempt', error, { sender: attempt.sender })
    return { status: 'unknown' }
  }

  for (const log of logs) {
    const transfer = parseTransferLog(log)
    if (!transfer || transfer.value !== BigInt(request.amount))
      continue
    let tx
    try {
      tx = await client.provider.getTransaction(transfer.hash)
    }
    catch (error) {
      logger.error('Failed to inspect Polygon payment recovery candidate', error, { hash: transfer.hash })
      return { status: 'unknown' }
    }
    if (!tx)
      return { status: 'unknown' }
    if (!isMatchingRelayCall(tx, execution.relayRequest, execution.signature))
      continue
    return inspectHash(transfer.hash)
  }

  return safeHead > Number(execution.relayRequest.request.validUntil)
    ? { status: 'rejected' }
    : { status: 'unknown' }
}

export async function hasPolygonHtlcRefundEvent(
  provider: Pick<JsonRpcProvider, 'getBlockNumber' | 'getLogs'>,
  htlcId: string,
  fromBlock?: number | null,
) {
  const toBlock = await provider.getBlockNumber()
  const logs = await fetchLogsWithAdaptiveRange(provider, {
    address: polygonUsdtConfig.htlcContract,
    fromBlock: fromBlock ?? polygonUsdtConfig.earliestHistoryScanHeight,
    toBlock,
    topics: [htlcRefundTopicHash, htlcId],
  })
  return logs.length > 0
}

export function buildOutgoingTransaction(
  request: PolygonSendRequest,
  title: TransactionTitle,
  sender: string,
  hash: string,
  timestamp: number | undefined,
  fee: number,
  status: 'pending' | 'mined' | 'confirmed',
): UserTransaction | MerchantTransaction {
  const base = {
    sender,
    recipient: request.recipient,
    amount: request.amount,
    fee,
    hash,
    status,
    timestamp: timestamp === undefined ? undefined : toSeconds(timestamp),
    title,
    proofSize: 0,
    message: request.message,
    asset: Asset.USDT,
    chain: Chain.Polygon,
  }

  if (request.transfer === Transfer.UserPaymentToMerchant || request.transfer === Transfer.UserPaymentToAtomicSwap) {
    const rail = request.rail === Rail.CryptoPaymentLink
      || request.rail === Rail.GoCrypto
      || request.rail === Rail.BitcoinLightning
      || request.rail === Rail.NimiqWallet
      || request.rail === Rail.Unknown
      ? request.rail
      : Rail.Unknown

    const merchantBase = {
      ...base,
      transfer: request.transfer,
      rail,
      merchantName: request.merchantName || '',
      merchantCategory: request.merchantCategory || MerchantCategory.Shop,
      paymentMethod: PaymentMethod.USDT,
      paymentRef: request.paymentRef || '',
      fiatAmount: request.fiatAmount || 0,
      fiatFeeAmount: request.fiatFeeAmount || 0,
      fiatCurrency: request.fiatCurrency || '',
      isCashbackClaimed: true,
      invoiced: request.invoiced,
      meta: request.meta,
    }

    switch (rail) {
      case Rail.GoCrypto:
        return {
          ...merchantBase,
          rail: Rail.GoCrypto,
          railMerchantId: request.railMerchantId || '',
        }
      case Rail.BitcoinLightning:
        return {
          ...merchantBase,
          rail: Rail.BitcoinLightning,
          railMerchantId: request.railMerchantId || '',
        }
      case Rail.CryptoPaymentLink:
        return {
          ...merchantBase,
          rail: Rail.CryptoPaymentLink,
        }
      case Rail.NimiqWallet:
        return {
          ...merchantBase,
          rail: Rail.NimiqWallet,
        }
      case Rail.Unknown:
      default:
        return {
          ...merchantBase,
          rail: Rail.Unknown,
        }
    }
  }

  return {
    ...base,
    transfer: request.transfer,
    rail: request.rail === Rail.MiniApp || request.rail === Rail.Unknown ? request.rail : undefined,
    invoiced: request.invoiced,
    meta: request.meta,
  }
}

interface PersistHistoryOptions {
  onIncomingPersisted?: (tx: UserReceiptTransaction) => void | Promise<void>
}

export async function persistHistoryTransaction(group: TransferGroup, address: string, options?: PersistHistoryOptions) {
  if (!group.main)
    return

  const transactionsStore = useTransactions()
  const { withdrawalAddressesHistory } = useApp()
  const isOutgoing = group.main.from === getAddress(address)
  const base = {
    amount: Number(group.main.value),
    fee: Number(group.fee),
    hash: group.hash,
    status: 'confirmed' as const,
    timestamp: group.timestamp,
    asset: Asset.USDT,
    chain: Chain.Polygon,
    proofSize: 0,
  }

  if (isOutgoing) {
    const title = getPolygonHistoryTitle(group.main.to, withdrawalAddressesHistory)
    const tx = {
      ...base,
      transfer: Transfer.UserPayment,
      sender: group.main.from,
      recipient: group.main.to,
      title,
      message: '',
      rail: Rail.Unknown,
    } satisfies UserTransaction
    await transactionsStore.addPolygonHistoryTransaction(tx)
    return
  }

  const receipt = {
    ...base,
    transfer: Transfer.UserReceipt,
    sender: group.main.from,
    recipient: group.main.to,
    title: 'Top-Up',
    message: '',
  } satisfies UserReceiptTransaction

  await transactionsStore.addReceiptTransactions([receipt])
  await options?.onIncomingPersisted?.(receipt)
}

// Dynamic import to avoid a circular dep between useNotifications and this store.
async function notifyFreshIncoming(txs: UserReceiptTransaction[], currentBalance: number, previousMaxTimestamp = 0) {
  const fresh = txs.filter(tx => typeof tx.timestamp === 'number' && tx.timestamp > previousMaxTimestamp)
  if (fresh.length === 0)
    return
  // Track each as a Top-Up, except own swap-HTLC refunds — those come from the HTLC contract
  // and aren't real deposits.
  const htlcContract = getAddress(polygonUsdtConfig.htlcContract)
  for (const tx of fresh) {
    if (getAddress(tx.sender) !== htlcContract)
      trackTopUpReceived(tx, currentBalance)
  }
  const { scheduleIncomingPaymentNotification } = (await import('@/composables/useNotifications')).useNotifications()
  await Promise.all(fresh.map(tx => scheduleIncomingPaymentNotification(tx)))
}

// Fetch a contiguous block range as rpcMaxBlockRange-sized chunks, CONCURRENT_RANGE_FETCHES
// at a time. Returns the union of all groups across chunks, unsorted.
async function fetchRangesParallel(
  address: string,
  fromBlock: number,
  toBlock: number,
  knownHashes: Set<string>,
): Promise<Awaited<ReturnType<typeof fetchGroupedTransfers>>> {
  const ranges: Array<{ from: number, to: number }> = []
  for (let from = fromBlock; from <= toBlock; from += polygonUsdtConfig.rpcMaxBlockRange) {
    const to = Math.min(from + polygonUsdtConfig.rpcMaxBlockRange - 1, toBlock)
    ranges.push({ from, to })
  }

  const all: Awaited<ReturnType<typeof fetchGroupedTransfers>> = []
  for (let i = 0; i < ranges.length; i += CONCURRENT_RANGE_FETCHES) {
    const chunk = ranges.slice(i, i + CONCURRENT_RANGE_FETCHES)
    const results = await Promise.all(chunk.map(r => fetchGroupedTransfers(address, r.from, r.to, { knownHashes })))
    for (const groups of results)
      all.push(...groups)
  }
  return all
}

export const usePolygonUsdt = defineStore('polygon-usdt', () => {
  const { polygonRpcUrl, isUsdtMaintenanceActive, usdtMaintenanceNotice } = storeToRefs(useFeatureFlags())
  // Invalidate the cached client and its lookups when the RPC URL changes from PostHog;
  // a lookup still pending on the old provider must not block quotes on the new one
  watch(polygonRpcUrl, (newUrl) => {
    if (newUrl !== resolvedRpcUrl) {
      resolvedRpcUrl = newUrl
      clientPromise = null
      poolAddressPromise = null
      requiredRelayGasPromise = null
      acceptanceBudgetPromise = null
      calldataGasCostPromise = null
      requiredHtlcRelayGasPromise = null
      htlcAcceptanceBudgetPromise = null
    }
  }, { immediate: true })

  const { query, run } = useConn()
  const balance = shallowRef(0)
  const consensus = shallowRef<'connecting' | 'syncing' | 'established'>('connecting')
  const lastHistorySyncBlock = shallowRef(0)
  const hasLoadedHistory = shallowRef(false)
  const transferFeeSnapshot = shallowRef<PolygonTransferFeeSnapshot | null>(null)
  const initialHistoryScanSession = shallowRef<InitialHistoryScanSession | null>(null)
  const hydratedHistoryAddress = shallowRef<string | null>(null)
  let historySyncPromise: Promise<void> | null = null
  let transferFeeSnapshotPromise: Promise<PolygonTransferFeeSnapshot> | null = null

  const homeBalanceState = computed<PolygonUsdtHomeBalanceState>(() => {
    if (consensus.value !== 'established')
      return 'loading'

    return balance.value > 0 ? 'resolved-balance' : 'resolved-empty'
  })

  let hasHydratedCachedBalance = false
  let persistedBalance: number | null = null

  // Display-only fallback so the home screen can show the last known balance while the RPC
  // connects. Kept separate from `balance` (strictly RPC truth) so spend/quote paths never
  // see a cached value. Mainnet-only: the kv table survives the dev network switch, and mock
  // mode seeds balance itself.
  const lastKnownBalance = shallowRef(0)

  async function hydrateCachedBalance() {
    if (hasHydratedCachedBalance || isTestnet || isMockEnabled)
      return
    const { data: address, error } = useLocalWallet().getEthAddress()
    if (error || !address)
      return
    hasHydratedCachedBalance = true
    const cached = Number((await query<{ value: string }>(SQLQuery.SelectKv, [getUsdtBalanceCacheKey(address)], { single: true }))?.value)
    if (Number.isFinite(cached) && cached > 0) {
      persistedBalance = cached
      lastKnownBalance.value = cached
    }
  }

  async function init() {
    if (consensus.value === 'established')
      return

    // Fire-and-forget: nothing here depends on it, and awaiting would delay the RPC connect.
    hydrateCachedBalance().catch(error => logger.error('Failed to hydrate cached USDT balance', error))
    consensus.value = 'syncing'
    try {
      await getClient()
      consensus.value = 'established'
    }
    catch (error) {
      consensus.value = 'connecting'
      logger.error('Failed to initialize Polygon USDT client', error)
    }
  }

  async function updateBalance() {
    const { data: address, error } = useLocalWallet().getEthAddress()
    if (error || !address) {
      balance.value = 0
      return
    }

    await init()
    if (consensus.value !== 'established')
      return

    try {
      const client = await getClient()
      const newBalance = Number(await client.tokenContract.balanceOf(address))
      if (newBalance !== balance.value)
        balance.value = newBalance
      // Persist once per changed value (not per poll); also converges a stale cache back to 0.
      if (persistedBalance !== newBalance) {
        persistedBalance = newBalance
        await run(SQLQuery.UpsertKv, [getUsdtBalanceCacheKey(address), String(newBalance)])
      }
    }
    catch (error) {
      logger.error('Failed to fetch Polygon USDT balance', error)
    }
  }

  async function hydrateHistoryState(address: string) {
    const normalizedAddress = getAddress(address)
    if (hydratedHistoryAddress.value === normalizedAddress)
      return

    const persistedState = deserializePolygonHistoryState(
      (await query<{ value: string }>(SQLQuery.SelectKv, [getPolygonHistoryStateKey(normalizedAddress)], { single: true }))?.value,
    )

    if (persistedState?.mode === 'ready') {
      hasLoadedHistory.value = true
      lastHistorySyncBlock.value = persistedState.lastHistorySyncBlock
      initialHistoryScanSession.value = null
    }
    else if (persistedState?.mode === 'initial') {
      const state = deserializeInitialHistoryScanState(persistedState.session.state)
      hasLoadedHistory.value = false
      lastHistorySyncBlock.value = 0
      initialHistoryScanSession.value = state
        ? {
            canStopEarly: persistedState.session.canStopEarly,
            state,
          }
        : null
    }
    else {
      hasLoadedHistory.value = false
      lastHistorySyncBlock.value = 0
      initialHistoryScanSession.value = null
    }

    hydratedHistoryAddress.value = normalizedAddress
  }

  async function persistHistoryState(address: string, state: PersistedPolygonHistoryState | null) {
    const key = getPolygonHistoryStateKey(address)
    if (!state) {
      await run(SQLQuery.DeleteKv, [key])
      return
    }

    await run(SQLQuery.UpsertKv, [key, JSON.stringify(state)])
  }

  async function syncTransactionHistory() {
    logger.log('Starting Polygon USDT transaction history sync', { lastHistorySyncBlock: lastHistorySyncBlock.value, hasLoadedHistory: hasLoadedHistory.value, historySyncPromiseExists: !!historySyncPromise })
    if (historySyncPromise)
      return historySyncPromise

    historySyncPromise = (async () => {
      const { data: address, error } = useLocalWallet().getEthAddress()
      if (error || !address)
        return

      await init()
      if (consensus.value !== 'established')
        return

      await hydrateHistoryState(address)

      const client = await getClient()
      const dbTransactions = await query<ExternalTransaction[]>(SQLQuery.SelectTransactionsByAsset, [Asset.USDT])
      const knownHashes = new Set(dbTransactions.map(tx => tx.hash))
      // Rows arrive ORDER BY timestamp DESC NULLS FIRST; first row with a real
      // timestamp is the max. Used to suppress notifications for out-of-order
      // or late-finality incoming txs.
      const previousMaxTimestamp = dbTransactions.find(tx => typeof tx.timestamp === 'number')?.timestamp ?? 0

      // Fire the initial-scan nonce in parallel only when we know we'll enter that branch;
      // ethers v6 batches concurrent JSON-RPC calls so this folds into one HTTP round-trip.
      const willEnterInitialScan = !(hasLoadedHistory.value && lastHistorySyncBlock.value > 0)
      const needsInitialNonce = willEnterInitialScan && !initialHistoryScanSession.value
      const [latestBlock, prefetchedInitialNonce] = await Promise.all([
        client.provider.getBlockNumber(),
        needsInitialNonce ? client.tokenContract.getNonce(address) : Promise.resolve(null),
      ])

      if (hasLoadedHistory.value && lastHistorySyncBlock.value > 0) {
        if (latestBlock <= lastHistorySyncBlock.value)
          return

        const allGroups = await fetchRangesParallel(address, lastHistorySyncBlock.value + 1, latestBlock, knownHashes)
        allGroups.sort((a, b) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex))

        const newIncoming: UserReceiptTransaction[] = []
        for (const group of allGroups) {
          if (!knownHashes.has(group.hash)) {
            await persistHistoryTransaction(group, address, {
              onIncomingPersisted: (tx) => { newIncoming.push(tx) },
            })
            knownHashes.add(group.hash)
          }
        }

        await notifyFreshIncoming(newIncoming, balance.value, previousMaxTimestamp)

        lastHistorySyncBlock.value = latestBlock
        await persistHistoryState(address, {
          version: 1,
          mode: 'ready',
          lastHistorySyncBlock: latestBlock,
        })
        return
      }

      let session = initialHistoryScanSession.value
      if (!session) {
        const nonceRaw = prefetchedInitialNonce ?? await client.tokenContract.getNonce(address)
        const initialRemainingNonce = BigInt(nonceRaw.toString())
        session = {
          canStopEarly: balance.value > 0 || initialRemainingNonce > 0n,
          state: {
            headBlock: latestBlock,
            nextToBlock: latestBlock,
            remainingBalance: BigInt(balance.value),
            remainingNonce: initialRemainingNonce,
          },
        }
      }

      // Catch new blocks while the backward scan is still in flight, so new txs aren't
      // gated on Contract.on listener health (HMR, dropped events, ethers polling stalls).
      if (session.state.headBlock < latestBlock) {
        const fwdFrom = session.state.headBlock + 1
        const forwardGroups = await fetchRangesParallel(address, fwdFrom, latestBlock, knownHashes)
        forwardGroups.sort((a, b) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex))

        const forwardIncoming: UserReceiptTransaction[] = []
        for (const group of forwardGroups) {
          if (!knownHashes.has(group.hash)) {
            await persistHistoryTransaction(group, address, {
              onIncomingPersisted: (tx) => { forwardIncoming.push(tx) },
            })
            knownHashes.add(group.hash)
          }
        }

        // Always notify — these are post-headBlock txs, genuinely new even on cold install.
        await notifyFreshIncoming(forwardIncoming, balance.value, previousMaxTimestamp)

        session.state.headBlock = latestBlock
        await persistHistoryState(address, {
          version: 1,
          mode: 'initial',
          session: {
            canStopEarly: session.canStopEarly,
            state: serializeInitialHistoryScanState(session.state),
          },
        })
        if (forwardIncoming.length > 0)
          logger.log('🏃 Polygon forward catch-up', { from: fwdFrom, to: latestBlock, newTxs: forwardIncoming.length })
      }

      // Only notify during the BACKWARD scan if the user already had history (resume case).
      // True cold start (empty DB) is a backfill of historical txs — surfacing each as a
      // "Payment received" would be misleading. Mirrors NIM's real-time-only rule.
      const notifyDuringInitialScan = dbTransactions.length > 0
      const initialScanIncoming: UserReceiptTransaction[] = []

      const scanResult = await scanInitialPolygonHistory({
        latestBlock: session.state.headBlock,
        earliestBlock: polygonUsdtConfig.earliestHistoryScanHeight,
        rpcMaxBlockRange: polygonUsdtConfig.rpcMaxBlockRange,
        currentBalance: BigInt(balance.value),
        currentTokenNonce: session.state.remainingNonce,
        resumeState: session.state,
        canStopEarly: session.canStopEarly,
        maxRanges: INITIAL_HISTORY_SCAN_MAX_RANGES_PER_PASS,
        fetchGroups: (fromBlock, toBlock) => fetchGroupedTransfers(address, fromBlock, toBlock, { knownHashes }),
        visitGroup: async (group) => {
          if (!knownHashes.has(group.hash)) {
            await persistHistoryTransaction(group, address, notifyDuringInitialScan
              ? { onIncomingPersisted: (tx) => { initialScanIncoming.push(tx) } }
              : undefined)
            knownHashes.add(group.hash)
          }
        },
      })

      if (notifyDuringInitialScan)
        await notifyFreshIncoming(initialScanIncoming, balance.value, previousMaxTimestamp)

      if (scanResult.completed) {
        hasLoadedHistory.value = true
        lastHistorySyncBlock.value = session.state.headBlock
        initialHistoryScanSession.value = null
        await persistHistoryState(address, {
          version: 1,
          mode: 'ready',
          lastHistorySyncBlock: session.state.headBlock,
        })
        return
      }

      hasLoadedHistory.value = false
      initialHistoryScanSession.value = {
        canStopEarly: session.canStopEarly,
        state: scanResult.nextState!,
      }
      await persistHistoryState(address, {
        version: 1,
        mode: 'initial',
        session: {
          canStopEarly: session.canStopEarly,
          state: serializeInitialHistoryScanState(scanResult.nextState!),
        },
      })
    })().finally(() => {
      historySyncPromise = null
    })

    return historySyncPromise
  }

  async function updateSingleTransaction(hash: string) {
    await init()
    if (consensus.value !== 'established')
      return

    const tx = parseStoredTransaction(await query<ExternalTransaction | null>(SQLQuery.GetTransactionByHash, [hash], { single: true }))
    const { status, timestamp, lookupFailed } = await getTransactionState(hash)
    const transactionsStore = useTransactions()
    // An RPC failure provides no chain evidence to replace the persisted status.
    if (!lookupFailed)
      await transactionsStore.updateTransactionStatus({ hash, status, timestamp })

    if (!tx || tx.transfer !== Transfer.UserPaymentToAtomicSwap || tx.chain !== Chain.Polygon || tx.meta?.secret || !tx.paymentRef)
      return

    try {
      const { getSwap } = await import('@/composables/useFastspotV2').then(m => m.useFastspotApiV2())
      const swapResult = await getSwap(tx.paymentRef)
      if (!('preimage' in swapResult) || !swapResult.preimage)
        return

      const updatedTx = await transactionsStore.setSwapPreimage(hash, swapResult.preimage)
      // A relay replacement may have renamed this hash while Fastspot was answering.
      if (!updatedTx)
        return
      await run(SQLQuery.DeleteSwapHtlcByTxHash, [hash, hash])
    }
    catch (error) {
      logger.error('Failed to reconcile Polygon swap transaction', error, { hash })
    }
  }

  function getCachedTransferQuote(request: PolygonTransferQuoteRequest) {
    if (!transferFeeSnapshot.value)
      return null

    return buildPolygonTransferQuoteFromSnapshot({
      snapshot: transferFeeSnapshot.value,
      request,
      balance: balance.value,
    })
  }

  async function primeTransferFee(options: RefreshPolygonTransferQuoteOptions = {}) {
    await init()
    if (consensus.value !== 'established')
      throw new Error(i18n.t('Polygon is not ready yet'))

    if (transferFeeSnapshot.value && transferFeeSnapshot.value.expiresAt > Date.now())
      return transferFeeSnapshot.value

    if (!transferFeeSnapshotPromise) {
      transferFeeSnapshotPromise = fetchPolygonTransferFeeSnapshot(options)
        .then((snapshot) => {
          transferFeeSnapshot.value = snapshot
          return snapshot
        })
        .finally(() => {
          transferFeeSnapshotPromise = null
        })
    }

    return transferFeeSnapshotPromise
  }

  async function refreshTransferQuote(request: PolygonTransferQuoteRequest, options: RefreshPolygonTransferQuoteOptions = {}) {
    const snapshot = await primeTransferFee(options)
    return buildPolygonTransferQuoteFromSnapshot({
      snapshot,
      request,
      balance: balance.value,
    })
  }

  async function enrichPersistedTransaction<T extends UserTransaction | MerchantTransaction>(
    tx: T,
    hash: string,
    description = 'transaction',
  ): Promise<T> {
    let enrichedTx = tx
    try {
      const storedTx = parseStoredTransaction(await query<ExternalTransaction | null>(SQLQuery.GetTransactionByHash, [hash], { single: true }))
      if (storedTx)
        enrichedTx = storedTx as T
      const state = await getTransactionState(hash, true)
      // Receipt lookup is best-effort; an absent receipt must not erase already-mined state.
      if (!state.lookupFailed && state.status !== 'pending') {
        await useTransactions().updateTransactionStatus({ hash, status: state.status, timestamp: state.timestamp })
        enrichedTx = {
          ...enrichedTx,
          status: state.status,
          timestamp: state.timestamp ?? enrichedTx.timestamp,
        }
      }
    }
    catch (error) {
      logger.error(`Failed to enrich persisted Polygon ${description}`, error, { hash })
    }
    return enrichedTx
  }

  async function persistOutgoingTransaction(tx: UserTransaction | MerchantTransaction) {
    if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
      await useTransactions().addPaymentToMerchantTransaction(tx as MerchantTransaction)
    else if (tx.title === 'Withdrawal')
      await useTransactions().addWithdrawalTransaction(tx as UserTransaction)
    else
      await useTransactions().addPaymentTransaction(tx as UserTransaction)
  }

  async function finalizePolygonPaymentAttempt(
    attempt: PolygonPaymentAttempt,
    hash: string,
    receipt: TransactionReceipt,
  ) {
    const request = JSON.parse(attempt.request_json) as PolygonSendRequest
    const [block, latestBlock] = await Promise.allSettled([
      receipt.blockNumber ? (await getClient()).provider.getBlock(receipt.blockNumber) : null,
      (await getClient()).provider.getBlockNumber(),
    ])
    const timestamp = block.status === 'fulfilled' ? block.value?.timestamp : undefined
    const status = latestBlock.status === 'fulfilled' && latestBlock.value - receipt.blockNumber >= POLYGON_PAYMENT_FINALITY_BLOCKS
      ? 'confirmed'
      : 'mined'
    const tx = buildOutgoingTransaction(
      request,
      attempt.title as TransactionTitle,
      attempt.sender,
      hash,
      timestamp === undefined ? undefined : timestamp * 1000,
      attempt.fee,
      status,
    )
    // Keep the original hash recoverable until its pending row has been merged.
    if (attempt.relay_hash && attempt.relay_hash !== hash)
      await useTransactions().replacePolygonTransactionHash(attempt.relay_hash, hash)
    await run(SQLQuery.SetPolygonPaymentAttemptRelayHash, [hash, attempt.network, attempt.sender])
    await persistOutgoingTransaction(tx)
    await run(SQLQuery.DeletePolygonPaymentAttempt, [attempt.network, attempt.sender])
    return tx
  }

  async function sendPayment(
    request: PolygonSendRequest,
    title: TransactionTitle,
    options?: { quote?: PolygonTransferQuote },
  ): Promise<PolygonPaymentSendResult> {
    const { data: wallet, error } = useLocalWallet().getEthWallet()
    if (error || !wallet)
      return { outcome: 'rejected', data: undefined, error: error || i18n.t('No account has been found') }

    await init()
    if (consensus.value !== 'established')
      return { outcome: 'rejected', data: undefined, error: i18n.t('Polygon is not ready yet') }

    const network = getPolygonPaymentNetwork()
    const sender = getAddress(wallet.address)
    const requestJson = JSON.stringify(request)
    const activeSendKey = `${network}:${sender.toLowerCase()}`
    if (activePolygonPaymentSends.has(activeSendKey)) {
      return {
        outcome: 'rejected',
        data: undefined,
        error: i18n.t('A transaction is already in progress'),
      }
    }
    activePolygonPaymentSends.add(activeSendKey)
    try {
      const existingAttempt = await query<PolygonPaymentAttempt | null>(
        SQLQuery.GetPolygonPaymentAttempt,
        [network, sender],
        { single: true },
      )
      if (existingAttempt) {
        const reconciliation = await reconcilePolygonPaymentAttempt(await getClient(), existingAttempt)
        if (reconciliation.status === 'unknown') {
          return {
            outcome: 'unknown',
            data: undefined,
            error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
          }
        }
        if (reconciliation.status === 'mined') {
          try {
            await finalizePolygonPaymentAttempt(existingAttempt, reconciliation.hash, reconciliation.receipt)
          }
          catch (persistenceError) {
            logger.error('Failed to finalize recovered Polygon payment', persistenceError, { hash: reconciliation.hash })
            return {
              outcome: 'unknown',
              data: undefined,
              error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
            }
          }
          await updateBalance().catch(balanceError => logger.error('Failed to refresh Polygon balance after recovery', balanceError))
          return {
            outcome: 'previous-resolved',
            data: undefined,
            error: i18n.t('A previous transaction was confirmed. No new payment was sent.'),
          }
        }

        if (existingAttempt.relay_hash) {
          try {
            await useTransactions().updateTransactionStatus({
              hash: existingAttempt.relay_hash,
              status: 'failed',
              timestamp: undefined,
            })
          }
          catch (persistenceError) {
            logger.error('Failed to persist rejected Polygon payment recovery', persistenceError, { hash: existingAttempt.relay_hash })
            return {
              outcome: 'unknown',
              data: undefined,
              error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
            }
          }
        }
        await run(SQLQuery.DeletePolygonPaymentAttempt, [network, sender])
        return {
          outcome: 'rejected',
          data: undefined,
          error: i18n.t('Polygon transaction failed'),
        }
      }

      if (isUsdtMaintenanceActive.value)
        return { outcome: 'rejected', data: undefined, error: usdtMaintenanceNotice.value }

      const quote = await resolvePolygonTransferQuote({
        request,
        balance: balance.value,
        providedQuote: options?.quote,
        buildFreshQuote: () => refreshTransferQuote(request, { previousQuote: options?.quote }),
      })
      const execution = await buildRelayExecution(wallet, quote)
      let tx: UserTransaction | MerchantTransaction | undefined
      let attemptPersisted = false
      let outcome: PolygonRelayOutcome
      try {
        outcome = await relayTransaction(execution, {
          beforeRelay: async () => {
            if (isUsdtMaintenanceActive.value)
              throw new PolygonRelayRejectedError(usdtMaintenanceNotice.value)
            await run(SQLQuery.InsertPolygonPaymentAttempt, [
              network,
              sender,
              requestJson,
              title,
              JSON.stringify(execution.relayRequest),
              execution.relayUrl,
              execution.signature,
              Number(execution.fee),
              execution.startBlock,
              Date.now(),
              null,
            ])
            attemptPersisted = true
          },
          beforeBroadcast: async (relayHash) => {
            await run(SQLQuery.SetPolygonPaymentAttemptRelayHash, [relayHash, network, sender])
            tx = buildOutgoingTransaction(
              request,
              title,
              sender,
              relayHash,
              Date.now(),
              quote.fee,
              'pending',
            )
            await persistOutgoingTransaction(tx)
          },
          onReplaced: async (oldHash, newHash) => {
            await useTransactions().replacePolygonTransactionHash(oldHash, newHash)
            await run(SQLQuery.SetPolygonPaymentAttemptRelayHash, [newHash, network, sender])
            if (tx?.hash === oldHash)
              tx = { ...tx, hash: newHash }
          },
        })
      }
      catch (relayError) {
        if (relayError instanceof PolygonRelayRejectedError) {
          if (attemptPersisted) {
            try {
              await run(SQLQuery.DeletePolygonPaymentAttempt, [network, sender])
            }
            catch (persistenceError) {
              logger.error('Failed to clear rejected Polygon payment attempt', persistenceError)
              return {
                outcome: 'unknown',
                data: undefined,
                error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
              }
            }
          }
          return { outcome: 'rejected', data: undefined, error: relayError.message }
        }
        if (attemptPersisted) {
          logger.error('Polygon relay outcome is unknown', relayError)
          return {
            outcome: 'unknown',
            data: undefined,
            error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
          }
        }
        throw relayError
      }

      if (outcome.status === 'pending' || !tx) {
        return {
          outcome: 'unknown',
          data: undefined,
          error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
        }
      }

      if (tx.hash !== outcome.hash) {
        const oldHash = tx.hash
        try {
          await useTransactions().replacePolygonTransactionHash(oldHash, outcome.hash)
          await run(SQLQuery.SetPolygonPaymentAttemptRelayHash, [outcome.hash, network, sender])
        }
        catch (persistenceError) {
          logger.error('Failed to retry Polygon replacement persistence', persistenceError, { oldHash, newHash: outcome.hash })
          return {
            outcome: 'unknown',
            data: undefined,
            error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
          }
        }
      }
      tx = { ...tx, hash: outcome.hash }

      if (outcome.status === 'rejected') {
        tx = { ...tx, status: 'failed' }
        try {
          await useTransactions().replaceTransaction(tx)
          await run(SQLQuery.DeletePolygonPaymentAttempt, [network, sender])
        }
        catch (persistenceError) {
          logger.error('Failed to persist rejected Polygon payment', persistenceError, { hash: outcome.hash })
          return {
            outcome: 'unknown',
            data: undefined,
            error: i18n.t('The transaction may have been sent and is still pending. Do not retry.'),
          }
        }
        return { outcome: 'rejected', data: undefined, error: i18n.t('Polygon transaction failed') }
      }

      tx = await enrichPersistedTransaction(tx, outcome.hash)
      if (tx.status === 'failed') {
        await run(SQLQuery.DeletePolygonPaymentAttempt, [network, sender])
        return { outcome: 'rejected', data: undefined, error: i18n.t('Polygon transaction failed') }
      }

      await run(SQLQuery.DeletePolygonPaymentAttempt, [network, sender]).catch(deleteError => logger.error('Failed to clear completed Polygon payment attempt', deleteError, { hash: outcome.hash }))

      await updateBalance().catch(error => logger.error('Failed to refresh Polygon balance after payment', error))
      return {
        outcome: 'submitted',
        data: {
          tx: tx as TransactionSentByUser,
          serialized: outcome.hash,
        },
        error: undefined,
      }
    }
    catch (error) {
      logger.error('Failed to send Polygon USDT transaction', error)
      return {
        outcome: 'rejected',
        data: undefined,
        error: error instanceof Error ? error.message : i18n.t('Polygon payment failed'),
      }
    }
    finally {
      activePolygonPaymentSends.delete(activeSendKey)
    }
  }

  const htlcFeeSnapshot = shallowRef<PolygonTransferFeeSnapshot | null>(null)
  let htlcFeeSnapshotPromise: Promise<PolygonTransferFeeSnapshot> | null = null
  const activeSwapPayments = new Set<string>()

  async function primeHtlcFee(options: RefreshPolygonTransferQuoteOptions = {}) {
    await init()
    if (consensus.value !== 'established')
      throw new Error(i18n.t('Polygon is not ready yet'))

    if (htlcFeeSnapshot.value && htlcFeeSnapshot.value.expiresAt > Date.now())
      return htlcFeeSnapshot.value

    if (!htlcFeeSnapshotPromise) {
      htlcFeeSnapshotPromise = fetchPolygonHtlcFeeSnapshot(options)
        .then((snapshot) => {
          htlcFeeSnapshot.value = snapshot
          return snapshot
        })
        .finally(() => {
          htlcFeeSnapshotPromise = null
        })
    }

    return htlcFeeSnapshotPromise
  }

  async function sendSwapPayment(
    request: PolygonSendRequest,
    title: TransactionTitle,
    options: { onSubmitted?: (hash: string) => Promise<void>, onFundingUncertain?: (hash: string) => Promise<void>, expectedSender?: string, maxFee?: number } = {},
  ): Promise<Result<{ tx: TransactionSentByUser, serialized: string }, string> & { rejected?: boolean }> {
    if (isUsdtMaintenanceActive.value)
      return { data: undefined, error: usdtMaintenanceNotice.value, rejected: true }

    const swapKey = request.paymentRef!
    if (activeSwapPayments.has(swapKey))
      return { data: undefined, error: i18n.t('A transaction is already in progress') }

    const { data: wallet, error } = useLocalWallet().getEthWallet()
    if (error || !wallet)
      return { data: undefined, error: error || i18n.t('No account has been found'), rejected: true }
    if (options.expectedSender && getAddress(wallet.address) !== getAddress(options.expectedSender))
      return { data: undefined, error: i18n.t('Wallet changed before sending'), rejected: true }

    await init()
    if (consensus.value !== 'established')
      return { data: undefined, error: i18n.t('Polygon is not ready yet'), rejected: !activeSwapPayments.has(swapKey) }

    if (activeSwapPayments.has(swapKey))
      return { data: undefined, error: i18n.t('A transaction is already in progress') }
    activeSwapPayments.add(swapKey)

    const swapStartedAt = Date.now()
    let fundingPossible = false
    let fundingRejected = false
    const ensureApprovedSender = () => {
      if (options.expectedSender && useLocalWallet().getEthAddress().data !== options.expectedSender)
        throw new Error(i18n.t('Wallet changed before sending'))
    }

    try {
      // Confirm swap with Fastspot
      const { useFastspotApiV1 } = await import('@/composables/useFastspotv1')
      const fastspotV1 = await useFastspotApiV1()

      let swap: import('@nimiq/fastspot-api-v1').Swap
      try {
        if (isUsdtMaintenanceActive.value)
          throw new PolygonRelayRejectedError(usdtMaintenanceNotice.value)
        swap = await fastspotV1.confirmSwap(
          { id: request.paymentRef! } as import('@nimiq/fastspot-api-v1').PreSwap,
          { asset: fastspotV1.SwapAsset.BTC_LN },
          { asset: fastspotV1.SwapAsset.USDT_MATIC, address: wallet.address },
          wallet.address,
        )
      }
      catch (err) {
        if (err instanceof Error && err.message === 'The swap was already confirmed before.')
          swap = await fastspotV1.getSwap(request.paymentRef!) as import('@nimiq/fastspot-api-v1').Swap
        else throw err
      }

      // Verify swap hash against Lightning invoice
      const { parseBitcoinLightningInvoice } = await import('@/composables/useBitcoinLightning')
      const decoded = await parseBitcoinLightningInvoice(request.recipient)
      if (swap.hash !== decoded.payment_hash)
        return { data: undefined, error: i18n.t('Invalid swap hash'), rejected: true }

      // Get USDT_MATIC contract from swap
      const usdtContract = swap.contracts[fastspotV1.SwapAsset.USDT_MATIC]
      if (!usdtContract)
        return { data: undefined, error: i18n.t('No USDT HTLC found in swap'), rejected: true }

      const htlcDetails = usdtContract.htlc as import('@nimiq/fastspot-api-v1').Erc20HtlcDetails

      const feeSnapshot = await primeHtlcFee()
      if (options.maxFee !== undefined && feeSnapshot.fee > options.maxFee)
        throw new Error(i18n.t('Polygon fee changed; review the payment again'))
      ensureApprovedSender()

      // Build and execute HTLC relay transaction
      const execution = await buildHtlcRelayExecution(
        wallet,
        htlcDetails.address,
        BigInt(usdtContract.amount),
        usdtContract.redeemAddress,
        `0x${swap.hash}`,
        usdtContract.timeout,
        feeSnapshot,
      )
      ensureApprovedSender()

      const provisionalSwapHtlcKey = htlcDetails.address
      let createdProvisionalRow = false
      let tx: MerchantTransaction | undefined
      let receipt: PolygonRelayOutcome
      try {
        receipt = await relayTransaction(execution, {
          beforeRelay: async () => {
            if (isUsdtMaintenanceActive.value)
              throw new PolygonRelayRejectedError(usdtMaintenanceNotice.value)
            const existingRow = await query<SwapHtlc | null>(
              SQLQuery.GetSwapHtlcByAddress,
              [provisionalSwapHtlcKey, provisionalSwapHtlcKey],
              { single: true },
            )
            if (existingRow?.tx_hash) {
              fundingPossible = true
              throw new Error(i18n.t('Polygon swap transaction is already pending'))
            }
            if (existingRow) {
              fundingPossible = true
              ensureApprovedSender()
              return
            }

            await run(
              SQLQuery.InsertSwapHtlcProvisional,
              [
                provisionalSwapHtlcKey,
                usdtContract.amount,
                usdtContract.timeout * 1000,
                swap.id,
                swap.status,
                htlcDetails.address,
              ],
            )
            createdProvisionalRow = true
            try {
              ensureApprovedSender()
            }
            catch (error) {
              await run(SQLQuery.DeleteSwapHtlc, [provisionalSwapHtlcKey])
              createdProvisionalRow = false
              throw error
            }
            fundingPossible = true
          },
          beforeBroadcast: async (relayHash) => {
            tx = buildOutgoingTransaction(
              request,
              title,
              wallet.address,
              relayHash,
              Date.now(),
              feeSnapshot.fee,
              'pending',
            ) as MerchantTransaction
            await useTransactions().addPolygonSwapTransactionWithRecovery(tx, provisionalSwapHtlcKey)
          },
          onReplaced: async (oldHash, newHash) => {
            await useTransactions().replacePolygonTransactionHash(oldHash, newHash, provisionalSwapHtlcKey)
            if (tx?.hash === oldHash)
              tx = { ...tx, hash: newHash }
          },
        })
      }
      catch (error) {
        if (error instanceof PolygonRelayRejectedError && createdProvisionalRow)
          await run(SQLQuery.DeleteSwapHtlc, [provisionalSwapHtlcKey])
        throw error
      }

      if (!tx)
        throw new Error(i18n.t('Could not persist Polygon swap transaction'))

      let replacementPersisted = true
      if (tx.hash !== receipt.hash) {
        try {
          await useTransactions().replacePolygonTransactionHash(tx.hash, receipt.hash, provisionalSwapHtlcKey)
        }
        catch (error) {
          replacementPersisted = false
          logger.error('Failed to retry Polygon swap replacement persistence', error, { oldHash: tx.hash, newHash: receipt.hash })
        }
      }
      tx = { ...tx, hash: receipt.hash }

      if (receipt.status === 'rejected') {
        fundingRejected = true
        await useTransactions().replaceTransaction({ ...tx, status: 'failed' })
        if (createdProvisionalRow)
          await run(SQLQuery.DeleteSwapHtlc, [provisionalSwapHtlcKey])
        else
          await run(SQLQuery.ClearSwapHtlcTxHash, [provisionalSwapHtlcKey])
        throw new Error(i18n.t('Polygon swap transaction failed'))
      }

      if (receipt.status === 'pending') {
        try {
          await options.onFundingUncertain?.(receipt.hash)
        }
        catch (error) {
          logger.error('Failed to report uncertain Polygon swap funding', error, { hash: receipt.hash })
        }
      }

      // Signal funding to Fastspot
      const { provideFundingProof, getSwap } = await import('@/composables/useFastspotV2').then(m => m.useFastspotApiV2())
      const patchedSwap = provideFundingProof(
        request.paymentRef!,
        usdtContract.id,
        receipt.hash,
      )
      void patchedSwap.catch(() => undefined)

      // State enrichment is best-effort after the relay hash and recovery data exist.
      tx = await enrichPersistedTransaction(tx, receipt.hash, 'swap transaction')
      if (tx.status === 'failed') {
        fundingRejected = true
        throw new Error(i18n.t('Polygon swap transaction failed'))
      }

      if (receipt.status === 'mined')
        await options.onSubmitted?.(receipt.hash)

      // Poll for preimage until the HTLC expires
      const maxPollMs = Math.max((usdtContract.timeout * 1000) - Date.now(), 60_000)
      const secret = (await patchedSwap.catch(() => undefined))?.preimage || await new Promise<string>((resolve, reject) => {
        let pollId: number
        const deadlineId = window.setTimeout(() => {
          window.clearTimeout(pollId)
          reject(new Error(i18n.t('Swap timed out waiting for Lightning payment confirmation')))
        }, maxPollMs)
        async function checkSecret() {
          try {
            const swapResult = await getSwap(request.paymentRef!)
            if ('preimage' in swapResult && swapResult.preimage) {
              window.clearTimeout(deadlineId)
              resolve(swapResult.preimage)
            }
            else {
              pollId = window.setTimeout(checkSecret, 1e3)
            }
          }
          catch {
            // Retry on transient errors; deadline timer will eventually reject
            pollId = window.setTimeout(checkSecret, 1e3)
          }
        }
        checkSecret()
      })

      // Update transaction with secret
      const persistedTx = await useTransactions().setSwapPreimage(tx.hash, secret).catch(error => logger.error('Failed to persist completed Polygon swap', error, { hash: receipt.hash }))
      const confirmedTx = persistedTx ?? { ...tx, meta: { ...tx.meta, secret }, status: 'confirmed' as const }

      trackSwapCompleted({
        swap_duration_ms: Date.now() - swapStartedAt,
        asset: Asset.USDT,
      })

      // Keep recovery until the completed payment and its replacement hash are durable.
      if (replacementPersisted && persistedTx) {
        await run(SQLQuery.DeleteSwapHtlc, [provisionalSwapHtlcKey])
          .catch(error => logger.error('Failed to clean completed Polygon swap recovery', error))
        await run(SQLQuery.DeleteSwapQuote, [request.paymentRef])
          .catch(error => logger.error('Failed to clean completed Polygon swap quote', error))
      }

      await updateBalance().catch(error => logger.error('Failed to refresh Polygon balance after swap', error))
      return {
        data: {
          tx: confirmedTx as TransactionSentByUser,
          serialized: receipt.hash,
        },
        error: undefined,
      }
    }
    catch (error) {
      logger.error('Failed to send Polygon USDT swap transaction', error)
      trackSwapFailed({
        error_reason: error instanceof Error ? error.message : 'Polygon swap payment failed',
        asset: Asset.USDT,
      })
      return {
        data: undefined,
        error: error instanceof Error ? error.message : i18n.t('Polygon swap payment failed'),
        rejected: !fundingPossible || fundingRejected || error instanceof PolygonRelayRejectedError,
      }
    }
    finally {
      activeSwapPayments.delete(swapKey)
    }
  }

  // Reclaims a Polygon HTLC whose Lightning leg never produced a preimage. Reuses the same OpenGSN
  // relay envelope and signing wallet as the original funding tx, so the user spends no MATIC.
  // Caller (sync sweep) wraps this in try/catch and only deletes the swap_htlcs row on success.
  async function refundPolygonSwapHtlc(htlc: SwapHtlc): Promise<{ refunded: boolean, preimage?: string, hash?: string }> {
    if (!htlc.htlc_id)
      return { refunded: false }

    const htlcId = htlc.htlc_id
    const txHash = getSwapHtlcTxHash(htlc)
    const { useFastspotApiV2 } = await import('@/composables/useFastspotV2')
    const { getSwap } = await useFastspotApiV2()
    const swap = await getSwap(htlc.swap_id).catch(() => null)
    if (swap && 'preimage' in swap && swap.preimage)
      return { refunded: false, preimage: swap.preimage }

    async function finishRefund(hash?: string) {
      if (txHash)
        await useTransactions().setPolygonSwapHtlcRefunded(txHash)
      await run(SQLQuery.DeleteSwapHtlc, [htlc.address])
      return { refunded: true, hash }
    }

    async function finishRefundFromEvent(hash?: string, fromBlock = htlc.refund_block) {
      if (fromBlock == null || !await hasPolygonHtlcRefundEvent((await getClient()).provider, htlcId, fromBlock))
        return null
      return finishRefund(hash)
    }

    if (htlc.refund_hash) {
      const state = await getTransactionState(htlc.refund_hash, true)
      if (state.status === 'pending' && (state.lookupFailed || !shouldRetryMissingPolygonRelay(htlc.refund_timestamp)))
        return { refunded: false, hash: htlc.refund_hash }
      if (state.status === 'mined' || state.status === 'confirmed')
        return finishRefund(htlc.refund_hash)
    }

    const recoveredRefund = await finishRefundFromEvent(htlc.refund_hash || undefined)
    if (recoveredRefund)
      return recoveredRefund
    // A lost relay response can leave an attempt without a hash even after broadcast.
    if (!htlc.refund_hash && !shouldRetryMissingPolygonRelay(htlc.refund_timestamp))
      return { refunded: false }
    if (htlc.refund_hash)
      await run(SQLQuery.ClearSwapHtlcRefundHash, [htlc.address])

    const { data: wallet, error: walletError } = useLocalWallet().getEthWallet()
    if (walletError || !wallet) {
      logger.error('Cannot refund Polygon HTLC: no wallet', { walletError })
      return { refunded: false }
    }

    const [client, feeSnapshot] = await Promise.all([
      getClient(),
      primeHtlcFee(),
    ])

    const data = client.htlcContract.interface.encodeFunctionData('refund', [
      htlcId,
      wallet.address,
      BigInt(feeSnapshot.fee),
    ])
    const execution = await buildHtlcRelayEnvelope(wallet, data, feeSnapshot)
    // Retain the earliest scan boundary until a Refund event or a successful receipt proves completion.
    const refundBlock = htlc.refund_block ?? await client.provider.getBlockNumber()
    async function persistRefundHash(refundHash: string) {
      await run(SQLQuery.SetSwapHtlcRefundHash, [refundHash, Date.now(), refundBlock, htlc.address])
    }
    const receipt = await relayTransaction(execution, {
      beforeRelay: async () => {
        await run(SQLQuery.SetSwapHtlcRefundAttempt, [Date.now(), refundBlock, htlc.address])
      },
      beforeBroadcast: persistRefundHash,
      onReplaced: async (_oldHash, newHash) => persistRefundHash(newHash),
    })

    if (receipt.status === 'pending')
      return { refunded: false, hash: receipt.hash }
    if (receipt.status === 'rejected') {
      const recoveredRefund = await finishRefundFromEvent(receipt.hash, refundBlock)
      if (recoveredRefund)
        return recoveredRefund
      await run(SQLQuery.ClearSwapHtlcRefundHash, [htlc.address])
      return { refunded: false, hash: receipt.hash }
    }

    return finishRefund(receipt.hash)
  }

  async function resetHistoryState() {
    const { data: address } = useLocalWallet().getEthAddress()
    if (address) {
      const key = getPolygonHistoryStateKey(address)
      await run(SQLQuery.DeleteKv, [key])
    }
    hasLoadedHistory.value = false
    lastHistorySyncBlock.value = 0
    initialHistoryScanSession.value = null
    hydratedHistoryAddress.value = null
    historySyncPromise = null
  }

  // Real-time Transfer listener — fires per incoming USDT event so notifications
  // don't depend on the poll interval (10s/30s) or the active-asset gate in
  // usePolygonSync. The poll still runs for backfill on cold start / missed events.
  let transferListenerAddress: string | null = null
  let transferListener: ((...args: any[]) => void) | null = null

  async function attachTransferListener(address: string) {
    const normalized = getAddress(address)
    if (transferListenerAddress === normalized)
      return
    await detachTransferListener()

    const client = await getClient()
    const filter = client.tokenContract.filters.Transfer(null, normalized)

    const listener = async (...args: any[]) => {
      try {
        // ethers v6 passes (from, to, value, payload) with the ContractEventPayload last.
        // Read everything from the payload to stay resilient to signature drift.
        const payload = args[args.length - 1]
        const log: Log | undefined = payload?.log
        const eventArgs = payload?.args
        const from: string | undefined = eventArgs?.[0]
        const value: bigint | undefined = eventArgs?.[2] !== undefined ? BigInt(eventArgs[2]) : undefined

        logger.log('📬 Polygon Transfer listener fired', {
          from,
          value: value?.toString(),
          hash: log?.transactionHash,
          blockNumber: log?.blockNumber,
        })

        if (value === undefined || value === 0n)
          return // ignore address-poisoning zero-value transfers and malformed payloads

        const hash = log?.transactionHash
        if (!hash || !log || !from)
          return

        // DB-presence dedup — the poll path will see this hash too and skip.
        const existing = await query<{ asset: string }>(
          SQLQuery.GetTransactionAssetByHash,
          [hash],
          { single: true },
        )
        if (existing) {
          logger.log('📬 Polygon Transfer listener skipped already-known hash', { hash })
          return
        }

        const timestamp = await getBlockTimestampCached(client.provider, log.blockNumber)
        const parsed: ParsedTransferLog = {
          hash,
          blockNumber: log.blockNumber,
          logIndex: log.index,
          from: getAddress(from),
          to: normalized,
          value,
        }
        const group: TransferGroup = {
          hash,
          blockNumber: log.blockNumber,
          logIndex: log.index,
          main: parsed,
          incomingTotal: value,
          outgoingTotal: 0n,
          fee: 0n,
          timestamp,
        }

        await persistHistoryTransaction(group, normalized, {
          onIncomingPersisted: tx => notifyFreshIncoming([tx], balance.value),
        })
        logger.log('📬 Polygon Transfer listener persisted incoming tx', { hash })
      }
      catch (err) {
        logger.error('📬 Polygon Transfer listener error', err)
      }
    }

    await client.tokenContract.on(filter, listener)
    transferListenerAddress = normalized
    transferListener = listener
    logger.log('📬 Polygon Transfer listener attached', { address: normalized })
  }

  async function detachTransferListener() {
    if (!transferListenerAddress || !transferListener)
      return
    try {
      const client = await getClient()
      const filter = client.tokenContract.filters.Transfer(null, transferListenerAddress)
      await client.tokenContract.off(filter, transferListener)
      logger.log('📬 Polygon Transfer listener detached', { address: transferListenerAddress })
    }
    catch (err) {
      logger.error('📬 Failed to detach Polygon Transfer listener', err)
    }
    transferListenerAddress = null
    transferListener = null
  }

  // Re-attach on address change. getEthAddress() reads ethWallet.value internally,
  // so wrapping in computed makes the watch reactive without changing the store API.
  const ethAddress = computed(() => useLocalWallet().getEthAddress().data)
  watch(ethAddress, async (addr) => {
    try {
      if (isTestnet)
        return
      if (!addr) {
        await detachTransferListener()
        return
      }
      await init()
      if (consensus.value !== 'established')
        return
      await attachTransferListener(addr)
    }
    catch (err) {
      logger.error('📬 Polygon Transfer listener (re)attach failed', err)
    }
  }, { immediate: true })

  return {
    balance,
    lastKnownBalance: readonly(lastKnownBalance),
    consensus,
    hasLoadedHistory: readonly(hasLoadedHistory),
    homeBalanceState: readonly(homeBalanceState),
    init,
    updateBalance,
    syncTransactionHistory,
    updateSingleTransaction,
    resetHistoryState,
    transferFeeSnapshot: readonly(transferFeeSnapshot),
    getCachedTransferQuote,
    primeTransferFee,
    primeHtlcFee,
    refreshTransferQuote,
    sendPayment,
    sendSwapPayment,
    refundPolygonSwapHtlc,
  }
})
