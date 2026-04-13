import type { Provider } from 'ethers'

export interface RpcLikeError extends Error {
  code?: number | string
  error?: {
    code?: number | string
    message?: string
    data?: {
      code?: number | string
      details?: {
        latestBlock?: number
        finalizedBlock?: number
      }
    }
  }
  info?: {
    error?: {
      code?: number | string
      message?: string
      data?: {
        code?: number | string
        details?: {
          latestBlock?: number
          finalizedBlock?: number
        }
      }
    }
    responseBody?: string
    responseStatus?: string | number
  }
}

export interface RelayServerInfo {
  baseRelayFee: bigint
  pctRelayFee: bigint
  url: string
  relayManagerAddress: string
  relayWorkerAddress: string
  minGasPrice: bigint
}

export interface PolygonTransferQuoteRelay {
  baseRelayFee: string
  pctRelayFee: string
  url: string
  relayManagerAddress: string
  relayWorkerAddress: string
  minGasPrice: string
}

export interface PolygonTransferQuote {
  amount: number
  recipient: string
  transfer: string
  fee: number
  totalDebit: number
  maxSendable: number
  expiresAt: number
  gasLimit: string
  gasPrice: string
  relay: PolygonTransferQuoteRelay
}

export interface PolygonTransferFeeSnapshot {
  fee: number
  expiresAt: number
  gasLimit: string
  gasPrice: string
  relay: PolygonTransferQuoteRelay
}

export interface RelayAddressInfo {
  chainId: string
  maxAcceptanceBudget: string
  minGasPrice: string
  networkId: string
  ownerAddress: string
  ready: boolean
  relayHubAddress: string
  relayManagerAddress: string
  relayWorkerAddress: string
  version: string
}

export interface RelayRegistration {
  relayManagerAddress: string
  baseRelayFee: bigint
  pctRelayFee: bigint
  url: string
  blockNumber: number
}

export interface RelayFeeEstimate {
  chainTokenFee: bigint
}

export interface RelayFeeInput {
  baseRelayFee: bigint
  pctRelayFee: bigint
  minGasPrice: bigint
}

export interface PolygonOpenGsnConfig {
  relayHubAddress: string
  networkId: number
  rpcMaxBlockRange?: number
  relayPingTimeoutMs?: number
  relayVersionPrefix?: string
  preferredRelaySuffixes?: readonly string[]
  maxLookbackBlocks?: number
  batchSizeBlocks?: number
  maxRelayCandidates?: number
  recentActivityLookbackHours?: number
  skipRecentActivityForSuffixes?: readonly string[]
}

export interface RelaySelectionOptions {
  provider: Provider
  config: PolygonOpenGsnConfig
  requiredMaxAcceptanceBudget: bigint
  calculateFee: (input: RelayFeeInput) => RelayFeeEstimate
}

export interface RelayServerCandidate extends RelayServerInfo {
  isPreferred: boolean
  pingMs: number
  hasRecentActivity: boolean
}

export interface PoolQuoteResult {
  amountIn: bigint
  amountOut: bigint
  fee: bigint
  poolAddress: string
}

export interface PolygonUniswapConfig {
  quoterAddress: string
  wrappedNativeTokenAddress: string
}

export interface RegisteredPoolAddressOptions {
  provider: Provider
  registryAddress: string
  tokenAddress: string
}

export interface WrappedNativeQuoteOptions extends RegisteredPoolAddressOptions {
  quoterAddress: string
  wrappedNativeTokenAddress: string
  amountIn?: bigint
}
