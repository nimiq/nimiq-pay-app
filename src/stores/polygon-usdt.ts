import type { RelayRequest } from '@opengsn/common/dist/EIP712/RelayRequest'
import type { Log } from 'ethers'
import type { HDNodeWallet } from 'ethers/wallet'
import type { PolygonTransferFeeSnapshot, PolygonTransferQuote, RelayServerInfo } from '@/lib/polygon/types'
import type { AsyncResult } from '@/types'
import type { SwapHtlc } from '@/types/swapHtlcs'
import type { ExternalTransaction, MerchantTransaction, TransactionSentByUser, TransactionTitle, UserReceiptTransaction, UserTransaction } from '@/types/transactions'
import { Contract, getAddress, Interface, JsonRpcProvider, Signature, Transaction } from 'ethers'
import { defineStore, storeToRefs } from 'pinia'
import { computed, readonly, shallowRef, watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { trackSwapCompleted, trackSwapFailed } from '@/lib/analytics'
import { Asset, Chain } from '@/lib/assets'
import { addressesEqual, getRequiredContractEvent, toAddressTopic } from '@/lib/ethereum'
import { POLYGON_BRIDGED_TOKEN_ABI, POLYGON_HTLC_RECIPIENT_ABI, POLYGON_RELAY_HUB_ABI, POLYGON_TOKEN_APPROVAL_ABI, POLYGON_TRANSFER_RECIPIENT_ABI } from '@/lib/polygon/abis'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { fetchLogsWithAdaptiveRange } from '@/lib/polygon/history'
import { getBestRelay, getRelayAddr } from '@/lib/polygon/opengsn'
import { resolveTokenMetaTxDomain } from '@/lib/polygon/token-meta-tx'
import { getRegisteredPoolAddress, quoteWrappedNativePrice } from '@/lib/polygon/uniswap'
import { SQLQuery } from '@/lib/sql-queries'
import { sleep } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useLocalWallet } from '@/stores/local-wallet'
import { getSwapHtlcKey, useTransactions } from '@/stores/transactions'
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

type PolygonSendRequest = Pick<ExternalTransaction, 'recipient' | 'amount' | 'message' | 'merchantName' | 'merchantCategory' | 'rail' | 'paymentRef' | 'fee' | 'invoiced' | 'meta' | 'fiatAmount' | 'fiatFeeAmount' | 'fiatCurrency' | 'railMerchantId'> & {
  transfer: Transfer.UserPayment | Transfer.UserPaymentToMerchant | Transfer.UserPaymentToAtomicSwap
}

export type PolygonUsdtHomeBalanceState = 'loading' | 'resolved-empty' | 'resolved-balance'

const logger = useLogger('polygon-usdt')
const tokenInterface = new Interface(POLYGON_BRIDGED_TOKEN_ABI)
let clientPromise: Promise<PolygonUsdtClient> | null = null
let resolvedRpcUrl: string = polygonUsdtConfig.rpcUrl
let poolAddressPromise: Promise<string> | null = null
let requiredRelayGasPromise: Promise<bigint> | null = null
let acceptanceBudgetPromise: Promise<bigint> | null = null
let calldataGasCostPromise: Promise<bigint> | null = null
let cachedRelay: CachedRelayEntry | null = null
let requiredHtlcRelayGasPromise: Promise<bigint> | null = null
let htlcAcceptanceBudgetPromise: Promise<bigint> | null = null

export const POLYGON_TRANSFER_QUOTE_TTL_MS = 20_000
const CACHED_RELAY_TTL_MS = 5 * 60_000
const INITIAL_HISTORY_SCAN_MAX_RANGES_PER_PASS = 20

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
  const quote = input.providedQuote
    && matchesPolygonTransferQuote(input.providedQuote, input.request)
    && input.providedQuote.expiresAt > now
    ? input.providedQuote
    : await input.buildFreshQuote()

  assertQuoteBalance(quote.amount, BigInt(quote.fee), input.balance)
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

export function getPolygonHistoryTitle(recipient: string, withdrawalAddressesHistory: string[]): TransactionTitle {
  const normalizedRecipient = getAddress(recipient)
  const isSavedWithdrawal = withdrawalAddressesHistory.some(address => addressesEqual(address, normalizedRecipient))
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
    })
  }

  return poolAddressPromise
}

function getPolygonHistoryStateKey(address: string) {
  return `polygonUsdtHistoryState:${getAddress(address).toLowerCase()}`
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

async function getRequiredRelayGas(client: PolygonUsdtClient) {
  if (!requiredRelayGasPromise) {
    requiredRelayGasPromise = client.transferContract.getRequiredRelayGas(
      client.transferContract.interface.getFunction('transferWithApproval')!.selector,
    ).then(result => BigInt(result.toString()))
  }

  return requiredRelayGasPromise
}

async function getAcceptanceBudget(client: PolygonUsdtClient) {
  if (!acceptanceBudgetPromise) {
    acceptanceBudgetPromise = client.transferContract.getGasAndDataLimits().then((limits) => {
      return BigInt(((limits.acceptanceBudget ?? limits[0]) as bigint).toString())
    })
  }

  return acceptanceBudgetPromise
}

async function getCalldataGasCost(client: PolygonUsdtClient) {
  if (!calldataGasCostPromise) {
    const relayHub = new Contract(polygonUsdtConfig.openGsnRelayHubContract, POLYGON_RELAY_HUB_ABI, client.provider)
    calldataGasCostPromise = relayHub.calldataGasCost(1220).then((value: bigint) => BigInt(value.toString()))
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
    ).then(result => BigInt(result.toString()))
  }

  return requiredHtlcRelayGasPromise
}

async function getHtlcAcceptanceBudget(client: PolygonUsdtClient) {
  if (!htlcAcceptanceBudgetPromise) {
    htlcAcceptanceBudgetPromise = client.htlcContract.getGasAndDataLimits().then((limits) => {
      return BigInt(((limits.acceptanceBudget ?? limits[0]) as bigint).toString())
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

async function buildRelayExecution(wallet: HDNodeWallet, quote: PolygonTransferQuote): Promise<RelayExecutionInput & { fee: bigint }> {
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
    relayRequest,
    relayUrl: quote.relay.url,
    signature,
  }
}

async function relayTransaction({ relayRequest, relayUrl, signature }: RelayExecutionInput) {
  const client = await getClient()
  const [{ HttpClient, HttpWrapper }, relayMaxNonce] = await Promise.all([
    import('@opengsn/common'),
    client.provider.getTransactionCount(relayRequest.relayData.relayWorker),
  ])

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

  let txResponse = await broadcastPolygonRelayTransaction(client.provider, relayTx)
  const relayHash = Transaction.from(relayTx).hash
  if (!relayHash)
    throw new Error(i18n.t('Could not determine Polygon transaction hash'))

  const MAX_RELAY_RETRIES = 30
  for (let attempt = 0; !txResponse && attempt < MAX_RELAY_RETRIES; attempt++) {
    txResponse = await client.provider.getTransaction(relayHash)
    if (!txResponse)
      await sleep(1_000)
  }
  if (!txResponse)
    throw new Error(i18n.t('Polygon transaction not found after relay'))

  const receipt = await txResponse.wait(1)
  if (!receipt)
    throw new Error(i18n.t('Transaction was not mined on Polygon'))

  return receipt
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
  const blocks = await Promise.all(blockNumbers.map(async blockNumber => [blockNumber, await client.provider.getBlock(blockNumber)] as const))
  const blockTimestamps = new Map(blocks.map(([blockNumber, block]) => [blockNumber, block?.timestamp]))

  return groupedTransfers.map(group => ({
    ...group,
    timestamp: blockTimestamps.get(group.blockNumber),
  }))
}

async function getTransactionState(hash: string): Promise<{ status: 'pending' | 'mined' | 'confirmed' | 'failed', timestamp?: number }> {
  const client = await getClient()
  const [tx, receipt, latestBlock] = await Promise.all([
    client.provider.getTransaction(hash),
    fetchPolygonTransactionReceipt(client.provider, hash),
    client.provider.getBlockNumber(),
  ])

  if (!tx)
    return { status: 'failed' }
  if (!receipt)
    return { status: 'pending' }

  const block = receipt.blockNumber ? await client.provider.getBlock(receipt.blockNumber) : null
  if (!receipt.status)
    return { status: 'failed', timestamp: block?.timestamp }

  return {
    status: latestBlock - receipt.blockNumber >= 10 ? 'confirmed' : 'mined',
    timestamp: block?.timestamp,
  }
}

function buildOutgoingTransaction(
  request: PolygonSendRequest,
  title: TransactionTitle,
  sender: string,
  hash: string,
  timestamp: number | undefined,
  fee: number,
  status: 'mined' | 'confirmed',
): UserTransaction | MerchantTransaction {
  const base = {
    sender,
    recipient: request.recipient,
    amount: request.amount,
    fee,
    hash,
    status,
    timestamp,
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
      || request.rail === Rail.NakaCard
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
      case Rail.NakaCard:
        return {
          ...merchantBase,
          rail: Rail.NakaCard,
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

async function persistHistoryTransaction(group: TransferGroup, address: string) {
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
    if (title === 'Withdrawal')
      await transactionsStore.addWithdrawalTransaction(tx)
    else
      await transactionsStore.addPaymentTransaction(tx)
    return
  }

  await transactionsStore.addReceiptTransaction({
    ...base,
    transfer: Transfer.UserReceipt,
    sender: group.main.from,
    recipient: group.main.to,
    title: 'Top-Up',
    message: '',
  } satisfies UserReceiptTransaction)
}

function parseStoredTransaction(tx: ExternalTransaction | null) {
  if (!tx)
    return null

  tx.invoiced = tx.invoiced ? JSON.parse(tx.invoiced as unknown as string) as { amount: number, currency: string } : undefined
  tx.meta = tx.meta ? JSON.parse(tx.meta as unknown as string) as Record<string, any> : undefined
  return tx
}

export const usePolygonUsdt = defineStore('polygon-usdt', () => {
  const { polygonRpcUrl } = storeToRefs(useFeatureFlags())
  // Invalidate the cached client when the RPC URL changes from PostHog
  watch(polygonRpcUrl, (newUrl) => {
    if (newUrl !== resolvedRpcUrl) {
      resolvedRpcUrl = newUrl
      clientPromise = null
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

  async function init() {
    if (consensus.value === 'established')
      return

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

      const latestBlock = await client.provider.getBlockNumber()
      if (hasLoadedHistory.value && lastHistorySyncBlock.value > 0) {
        if (latestBlock <= lastHistorySyncBlock.value)
          return

        for (let fromBlock = lastHistorySyncBlock.value + 1; fromBlock <= latestBlock; fromBlock += polygonUsdtConfig.rpcMaxBlockRange) {
          const toBlock = Math.min(fromBlock + polygonUsdtConfig.rpcMaxBlockRange - 1, latestBlock)
          const groups = await fetchGroupedTransfers(address, fromBlock, toBlock, { knownHashes })
          for (const group of groups.sort((a, b) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex))) {
            if (!knownHashes.has(group.hash)) {
              await persistHistoryTransaction(group, address)
              knownHashes.add(group.hash)
            }
          }
        }

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
        const initialRemainingNonce = BigInt((await client.tokenContract.getNonce(address)).toString())
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
            await persistHistoryTransaction(group, address)
            knownHashes.add(group.hash)
          }
        },
      })

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

    const { status, timestamp } = await getTransactionState(hash)
    const transactionsStore = useTransactions()
    await transactionsStore.updateTransactionStatus({ hash, status, timestamp })

    const tx = parseStoredTransaction(await query<ExternalTransaction | null>(SQLQuery.GetTransactionByHash, [hash], { single: true }))
    if (!tx || tx.transfer !== Transfer.UserPaymentToAtomicSwap || tx.chain !== Chain.Polygon || tx.meta?.secret || !tx.paymentRef)
      return

    try {
      const { getSwap } = await import('@/composables/useFastspotV2').then(m => m.useFastspotApiV2())
      const swapResult = await getSwap(tx.paymentRef)
      if (!('preimage' in swapResult) || !swapResult.preimage)
        return

      await transactionsStore.replaceTransaction({
        ...tx,
        status: 'confirmed',
        timestamp: timestamp ?? tx.timestamp,
        meta: {
          ...tx.meta,
          secret: swapResult.preimage,
        },
      })
      await run(SQLQuery.DeleteSwapHtlc, [getSwapHtlcKey(tx)])
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

  async function sendPayment(
    request: PolygonSendRequest,
    title: TransactionTitle,
    options?: { quote?: PolygonTransferQuote },
  ): AsyncResult<{ tx: TransactionSentByUser, serialized: string }, string> {
    const { data: wallet, error } = useLocalWallet().getEthWallet()
    if (error || !wallet)
      return { data: undefined, error: error || i18n.t('No account has been found') }

    await init()
    if (consensus.value !== 'established')
      return { data: undefined, error: i18n.t('Polygon is not ready yet') }

    try {
      const quote = await resolvePolygonTransferQuote({
        request,
        balance: balance.value,
        providedQuote: options?.quote,
        buildFreshQuote: () => refreshTransferQuote(request, { previousQuote: options?.quote }),
      })
      const execution = await buildRelayExecution(wallet, quote)
      const receipt = await relayTransaction(execution)
      const state = await getTransactionState(receipt.hash)
      const tx = buildOutgoingTransaction(
        request,
        title,
        wallet.address,
        receipt.hash,
        state.timestamp,
        quote.fee,
        state.status === 'confirmed' ? 'confirmed' : 'mined',
      )

      if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
        await useTransactions().addPaymentToMerchantTransaction(tx as MerchantTransaction)
      else if (title === 'Withdrawal')
        await useTransactions().addWithdrawalTransaction(tx as UserTransaction)
      else
        await useTransactions().addPaymentTransaction(tx as UserTransaction)

      await updateBalance()
      return {
        data: {
          tx: tx as TransactionSentByUser,
          serialized: receipt.hash,
        },
        error: undefined,
      }
    }
    catch (error) {
      logger.error('Failed to send Polygon USDT transaction', error)
      return {
        data: undefined,
        error: error instanceof Error ? error.message : i18n.t('Polygon payment failed'),
      }
    }
  }

  const htlcFeeSnapshot = shallowRef<PolygonTransferFeeSnapshot | null>(null)
  let htlcFeeSnapshotPromise: Promise<PolygonTransferFeeSnapshot> | null = null

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
  ): AsyncResult<{ tx: TransactionSentByUser, serialized: string }, string> {
    const { data: wallet, error } = useLocalWallet().getEthWallet()
    if (error || !wallet)
      return { data: undefined, error: error || i18n.t('No account has been found') }

    await init()
    if (consensus.value !== 'established')
      return { data: undefined, error: i18n.t('Polygon is not ready yet') }

    const swapStartedAt = Date.now()

    try {
      // 1. Confirm swap with Fastspot
      const { useFastspotApiV1 } = await import('@/composables/useFastspotv1')
      const fastspotV1 = await useFastspotApiV1()

      let swap: import('@nimiq/fastspot-api-v1').Swap
      try {
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

      // 2. Verify swap hash against Lightning invoice
      const { parseBitcoinLightningInvoice } = await import('@/composables/useBitcoinLightning')
      const decoded = await parseBitcoinLightningInvoice(request.recipient)
      if (swap.hash !== decoded.payment_hash)
        return { data: undefined, error: i18n.t('Invalid swap hash') }

      // 3. Get USDT_MATIC contract from swap
      const usdtContract = swap.contracts[fastspotV1.SwapAsset.USDT_MATIC]
      if (!usdtContract)
        return { data: undefined, error: i18n.t('No USDT HTLC found in swap') }

      const htlcDetails = usdtContract.htlc as import('@nimiq/fastspot-api-v1').Erc20HtlcDetails

      // 4. Get HTLC fee
      const feeSnapshot = await primeHtlcFee()

      // 5. Build and execute HTLC relay transaction
      const execution = await buildHtlcRelayExecution(
        wallet,
        htlcDetails.address,
        BigInt(usdtContract.amount),
        usdtContract.redeemAddress,
        `0x${swap.hash}`,
        usdtContract.timeout,
        feeSnapshot,
      )
      const receipt = await relayTransaction(execution)

      // 6. Signal funding to Fastspot
      const { provideFundingProof, getSwap } = await import('@/composables/useFastspotV2').then(m => m.useFastspotApiV2())
      const patchedSwap = provideFundingProof(
        request.paymentRef!,
        usdtContract.id,
        receipt.hash,
      )

      // 7. Build and persist outgoing transaction
      const state = await getTransactionState(receipt.hash)
      const tx = buildOutgoingTransaction(
        request,
        title,
        wallet.address,
        receipt.hash,
        state.timestamp,
        feeSnapshot.fee,
        state.status === 'confirmed' ? 'confirmed' : 'mined',
      )
      await useTransactions().addPaymentToMerchantTransaction(tx as MerchantTransaction)

      // 8. Save swap HTLC to database for recovery.
      // Persist usdtContract.timeout in ms (Fastspot returns seconds-since-epoch) so the expiry
      // sweep — which compares against headTimestamp in ms — treats Polygon and NIM rows uniformly.
      // htlcDetails.address is the bytes32 on-chain HTLC ID needed to call refund(...) later.
      const swapHtlcKey = getSwapHtlcKey(tx)
      await run(
        SQLQuery.InsertSwapHtlc,
        [
          swapHtlcKey,
          usdtContract.amount,
          usdtContract.timeout * 1000,
          swap.id,
          swap.status,
          htlcDetails.address,
        ],
      )

      // 9. Poll for preimage (with timeout based on HTLC expiry)
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

      // 10. Update transaction with secret
      const confirmedTx = { ...tx, meta: { secret }, status: 'confirmed' as const }
      await useTransactions().replaceTransaction(confirmedTx as MerchantTransaction)

      trackSwapCompleted({
        swap_duration_ms: Date.now() - swapStartedAt,
        asset: Asset.USDT,
      })

      // 11. Cleanup
      await run(SQLQuery.DeleteSwapHtlc, [swapHtlcKey])
      await run(SQLQuery.DeleteSwapQuote, [request.paymentRef])

      await updateBalance()
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
      }
    }
  }

  // Reclaims a Polygon HTLC whose Lightning leg never produced a preimage. Reuses the same OpenGSN
  // relay envelope and signing wallet as the original funding tx, so the user spends no MATIC.
  // Caller (sync sweep) wraps this in try/catch and only deletes the swap_htlcs row on success.
  async function refundPolygonSwapHtlc(htlc: SwapHtlc): Promise<{ refunded: boolean, preimage?: string, hash?: string }> {
    if (!htlc.htlc_id)
      return { refunded: false }

    const { data: wallet, error: walletError } = useLocalWallet().getEthWallet()
    if (walletError || !wallet) {
      logger.error('Cannot refund Polygon HTLC: no wallet', { walletError })
      return { refunded: false }
    }

    // Late-resolution guard: if Fastspot has the preimage, the redeem path is still viable —
    // skip refund and let updateSingleTransaction finalize the tx. Run alongside the chain prep
    // because the timeout path (no preimage) is the dominant case and needs both.
    const { useFastspotApiV2 } = await import('@/composables/useFastspotV2')
    const { getSwap } = await useFastspotApiV2()
    const [swap, client, feeSnapshot] = await Promise.all([
      getSwap(htlc.swap_id).catch(() => null),
      getClient(),
      primeHtlcFee(),
    ])
    if (swap && 'preimage' in swap && swap.preimage)
      return { refunded: false, preimage: swap.preimage }

    const data = client.htlcContract.interface.encodeFunctionData('refund', [
      htlc.htlc_id,
      wallet.address,
      BigInt(feeSnapshot.fee),
    ])
    const execution = await buildHtlcRelayEnvelope(wallet, data, feeSnapshot)
    const receipt = await relayTransaction(execution)

    await useTransactions().setPolygonSwapHtlcRefunded(htlc.address)
    await run(SQLQuery.DeleteSwapHtlc, [htlc.address])
    return { refunded: true, hash: receipt.hash }
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

  return {
    balance,
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
