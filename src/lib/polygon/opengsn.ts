import type { Provider } from 'ethers'
import type {
  PolygonOpenGsnConfig,
  RelayAddressInfo,
  RelayRegistration,
  RelaySelectionOptions,
  RelayServerCandidate,
  RelayServerInfo,
} from './types'
import { Contract, getAddress, Interface } from 'ethers'
import { useLogger } from '@/composables/useLogger'
import { getRequiredContractEvent, toAddressTopic } from '@/lib/ethereum'
import { POLYGON_RELAY_HUB_ABI } from './abis'
import { fetchLogsWithAvailableHeadFallback } from './history'

const logger = useLogger('OpenGSN')

export const POLYGON_BLOCKS_PER_MINUTE = 30
export const DEFAULT_MAX_PCT_RELAY_FEE = 70n
export const DEFAULT_MAX_BASE_RELAY_FEE = 0n

const relayHubInterface = new Interface(POLYGON_RELAY_HUB_ABI)

export function getRelayHub(provider: Provider, relayHubAddress: string) {
  return new Contract(relayHubAddress, POLYGON_RELAY_HUB_ABI, provider)
}

export function buildRelayAddressUrl(relayUrl: string) {
  const normalizedUrl = relayUrl.endsWith('/') ? relayUrl.slice(0, -1) : relayUrl
  return `${normalizedUrl}/getaddr`
}

export function createOpenGsnConfig(config: PolygonOpenGsnConfig): Required<PolygonOpenGsnConfig> {
  return {
    relayHubAddress: config.relayHubAddress,
    networkId: config.networkId,
    rpcMaxBlockRange: config.rpcMaxBlockRange ?? 3_000,
    relayPingTimeoutMs: config.relayPingTimeoutMs ?? 10_000,
    relayVersionPrefix: config.relayVersionPrefix ?? '2.',
    preferredRelaySuffixes: config.preferredRelaySuffixes ?? [],
    maxLookbackBlocks: config.maxLookbackBlocks ?? 60 * POLYGON_BLOCKS_PER_MINUTE,
    batchSizeBlocks: config.batchSizeBlocks ?? 10 * POLYGON_BLOCKS_PER_MINUTE,
    maxRelayCandidates: config.maxRelayCandidates ?? 10,
    recentActivityLookbackHours: config.recentActivityLookbackHours ?? 48,
    skipRecentActivityForSuffixes: config.skipRecentActivityForSuffixes ?? ['.fastspot.io'],
  }
}

export function buildDescendingBlockRanges(height: number, untilBlock: number, batchSize: number) {
  const ranges: Array<{ fromBlock: number, toBlock: number }> = []
  let toBlock = height
  let fromBlock = Math.max(toBlock - batchSize, untilBlock)

  while (toBlock > untilBlock) {
    ranges.push({ fromBlock, toBlock })
    toBlock = fromBlock - 1
    fromBlock = Math.max(toBlock - batchSize, untilBlock)
  }

  return ranges
}

export async function getRelayAddr(relayUrl: string, signal?: AbortSignal) {
  const response = await fetch(buildRelayAddressUrl(relayUrl), { signal }).catch(() => null)
  if (!response?.ok)
    return null

  return response.json() as Promise<RelayAddressInfo>
}

export async function fetchRelayRegistrations(
  provider: Provider,
  relayHubAddress: string,
  fromBlock: number,
  toBlock: number,
) {
  const event = getRequiredContractEvent(relayHubInterface, 'RelayServerRegistered')
  const logs = await fetchLogsWithAvailableHeadFallback(provider, {
    address: relayHubAddress,
    fromBlock,
    toBlock,
    topics: [event.topicHash],
  })

  const registrations = new Map<string, RelayRegistration>()

  for (const log of logs) {
    const parsed = relayHubInterface.parseLog(log)
    if (!parsed)
      continue

    const relayManagerAddress = getAddress(String(parsed.args[0]))
    const baseRelayFee = BigInt(parsed.args[1].toString())
    const pctRelayFee = BigInt(parsed.args[2].toString())
    const url = String(parsed.args[3])

    try {
      const normalizedUrl = new URL(url).toString().replace(/\/$/, '')
      registrations.set(normalizedUrl, {
        relayManagerAddress,
        baseRelayFee,
        pctRelayFee,
        url: normalizedUrl,
        blockNumber: log.blockNumber,
      })
    }
    catch {
      continue
    }
  }

  return [...registrations.values()]
}

async function withTimeout<T>(promiseFactory: (signal: AbortSignal) => Promise<T>, timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', onExternalAbort)

  try {
    return await promiseFactory(controller.signal)
  }
  finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

function matchesUrlSuffix(url: string, suffixes: readonly string[]) {
  return suffixes.some(suffix => url.endsWith(suffix))
}

function sortRelayCandidates(relays: RelayServerCandidate[]) {
  return [...relays].sort((a, b) => {
    if (a.isPreferred !== b.isPreferred)
      return a.isPreferred ? -1 : 1
    if (a.baseRelayFee !== b.baseRelayFee)
      return a.baseRelayFee < b.baseRelayFee ? -1 : 1
    if (a.pctRelayFee !== b.pctRelayFee)
      return a.pctRelayFee < b.pctRelayFee ? -1 : 1
    if (a.pingMs !== b.pingMs)
      return a.pingMs - b.pingMs
    return a.url.localeCompare(b.url)
  })
}

async function relayHasRecentActivity(
  provider: Provider,
  relayHubAddress: string,
  relayManagerAddress: string,
  relayWorkerAddress: string,
  latestBlock: number,
  config: Required<PolygonOpenGsnConfig>,
) {
  const event = getRequiredContractEvent(relayHubInterface, 'TransactionRelayed')
  const earliestBlock = Math.max(
    latestBlock - (config.recentActivityLookbackHours * 60 * POLYGON_BLOCKS_PER_MINUTE),
    0,
  )

  let toBlock = latestBlock
  while (toBlock > earliestBlock) {
    const fromBlock = Math.max(toBlock - config.rpcMaxBlockRange, earliestBlock)
    const logs = await fetchLogsWithAvailableHeadFallback(provider, {
      address: relayHubAddress,
      fromBlock,
      toBlock,
      topics: [
        event.topicHash,
        toAddressTopic(relayManagerAddress),
        toAddressTopic(relayWorkerAddress),
      ],
    })

    if (logs.length > 0)
      return true

    toBlock = fromBlock - 1
  }

  return false
}

async function mapRelayRegistrationToCandidate(
  provider: Provider,
  registration: RelayRegistration,
  latestBlock: number,
  options: RelaySelectionOptions,
  config: Required<PolygonOpenGsnConfig>,
  signal?: AbortSignal,
) {
  const pingStartedAt = Date.now()
  const relayAddr = await withTimeout(
    s => getRelayAddr(registration.url, s),
    config.relayPingTimeoutMs,
    signal,
  )
  if (!relayAddr?.ready) {
    logger.log('Skipping relay: not ready', registration.url)
    return null
  }
  if (!relayAddr.version.startsWith(config.relayVersionPrefix)) {
    logger.log('Skipping relay: wrong version:', relayAddr.version, registration.url)
    return null
  }
  if (relayAddr.networkId !== String(config.networkId)) {
    logger.log('Skipping relay: wrong networkId:', relayAddr.networkId, registration.url)
    return null
  }

  const maxAcceptanceBudget = BigInt(relayAddr.maxAcceptanceBudget)
  if (maxAcceptanceBudget < options.requiredMaxAcceptanceBudget) {
    logger.log('Skipping relay: too small acceptance budget:', relayAddr.maxAcceptanceBudget, ', required:', options.requiredMaxAcceptanceBudget.toString(), registration.url)
    return null
  }

  const minGasPrice = BigInt(relayAddr.minGasPrice)
  const relay: RelayServerCandidate = {
    baseRelayFee: registration.baseRelayFee,
    pctRelayFee: registration.pctRelayFee,
    url: registration.url,
    relayManagerAddress: getAddress(relayAddr.relayManagerAddress),
    relayWorkerAddress: getAddress(relayAddr.relayWorkerAddress),
    minGasPrice,
    isPreferred: matchesUrlSuffix(registration.url, config.preferredRelaySuffixes),
    pingMs: Date.now() - pingStartedAt,
    hasRecentActivity: false,
  }

  const { chainTokenFee } = options.calculateFee({
    baseRelayFee: relay.baseRelayFee,
    pctRelayFee: relay.pctRelayFee,
    minGasPrice: relay.minGasPrice,
  })
  const relayBalance = await provider.getBalance(relay.relayWorkerAddress)
  if (relayBalance < chainTokenFee * 2n) {
    logger.log('Skipping relay: not enough balance:', relayBalance.toString(), ', required:', (chainTokenFee * 2n).toString(), registration.url)
    return null
  }

  if (matchesUrlSuffix(relay.url, config.skipRecentActivityForSuffixes)) {
    relay.hasRecentActivity = true
    return relay
  }

  relay.hasRecentActivity = await relayHasRecentActivity(
    provider,
    config.relayHubAddress,
    relay.relayManagerAddress,
    relay.relayWorkerAddress,
    latestBlock,
    config,
  )

  if (!relay.hasRecentActivity)
    logger.log('Skipping relay: no recent activity', registration.url)

  return relay.hasRecentActivity ? relay : null
}

export async function getBestRelay(options: RelaySelectionOptions): Promise<RelayServerInfo> {
  logger.log('Finding best relay')
  const config = createOpenGsnConfig(options.config)
  const latestBlock = await options.provider.getBlockNumber()
  const ranges = buildDescendingBlockRanges(
    latestBlock,
    Math.max(latestBlock - config.maxLookbackBlocks, 0),
    config.batchSizeBlocks,
  )

  const acceptedRelays: RelayServerCandidate[] = []

  for (const range of ranges) {
    const registrations = await fetchRelayRegistrations(
      options.provider,
      config.relayHubAddress,
      range.fromBlock,
      range.toBlock,
    )

    if (registrations.length === 0)
      continue

    // Shared abort: cancel remaining pings once we have a validated relay
    const abortController = new AbortController()
    const abortCheckInterval = setInterval(() => {
      if (acceptedRelays.length >= 1)
        abortController.abort()
    }, 2_000)
    const abortTimeout = setTimeout(() => abortController.abort(), config.relayPingTimeoutMs)

    const nextRelays = await Promise.all(
      registrations.map(registration =>
        mapRelayRegistrationToCandidate(options.provider, registration, latestBlock, options, config, abortController.signal),
      ),
    )

    clearInterval(abortCheckInterval)
    clearTimeout(abortTimeout)

    for (const relay of nextRelays) {
      if (!relay)
        continue

      // Early exit: if fees are within acceptable thresholds, return immediately
      if (relay.pctRelayFee <= DEFAULT_MAX_PCT_RELAY_FEE && relay.baseRelayFee <= DEFAULT_MAX_BASE_RELAY_FEE)
        return relay

      acceptedRelays.push(relay)
    }

    if (acceptedRelays.length >= config.maxRelayCandidates)
      break
  }

  const [bestRelay] = sortRelayCandidates(acceptedRelays)
  if (!bestRelay)
    throw new Error('No relay found')

  return bestRelay
}
