import type { Provider } from 'ethers'
import type {
  PoolQuoteResult,
  RegisteredPoolAddressOptions,
  WrappedNativeQuoteOptions,
} from './types'
import { Contract, getAddress } from 'ethers'
import { POLYGON_TRANSFER_RECIPIENT_ABI, POLYGON_UNISWAP_POOL_ABI, POLYGON_UNISWAP_QUOTER_ABI } from './abis'

const registeredPoolAddresses = new Map<string, string>()
const poolFees = new Map<string, bigint>()

function createPoolCacheKey(registryAddress: string, tokenAddress: string) {
  return `${getAddress(registryAddress)}:${getAddress(tokenAddress)}`
}

export function clearPolygonPoolCache() {
  registeredPoolAddresses.clear()
  poolFees.clear()
}

export async function getRegisteredPoolAddress({
  provider,
  registryAddress,
  tokenAddress,
}: RegisteredPoolAddressOptions) {
  const key = createPoolCacheKey(registryAddress, tokenAddress)
  const cached = registeredPoolAddresses.get(key)
  if (cached)
    return cached

  const registry = new Contract(registryAddress, POLYGON_TRANSFER_RECIPIENT_ABI, provider)
  const poolAddress = getAddress(await registry.registeredTokenPool(tokenAddress))
  registeredPoolAddresses.set(key, poolAddress)
  return poolAddress
}

export async function getPoolFee(provider: Provider, poolAddress: string) {
  const normalizedPoolAddress = getAddress(poolAddress)
  const cached = poolFees.get(normalizedPoolAddress)
  if (cached !== undefined)
    return cached

  const poolContract = new Contract(normalizedPoolAddress, POLYGON_UNISWAP_POOL_ABI, provider)
  const fee = BigInt((await poolContract.fee()).toString())
  poolFees.set(normalizedPoolAddress, fee)
  return fee
}

export async function quoteWrappedNativePrice({
  provider,
  registryAddress,
  tokenAddress,
  quoterAddress,
  wrappedNativeTokenAddress,
  amountIn = 1_000_000n,
}: WrappedNativeQuoteOptions): Promise<PoolQuoteResult> {
  const poolAddress = await getRegisteredPoolAddress({
    provider,
    registryAddress,
    tokenAddress,
  })
  const fee = await getPoolFee(provider, poolAddress)
  const quoter = new Contract(quoterAddress, POLYGON_UNISWAP_QUOTER_ABI, provider)
  const amountOut = BigInt((await quoter.quoteExactInputSingle.staticCall(
    getAddress(tokenAddress),
    getAddress(wrappedNativeTokenAddress),
    fee,
    amountIn,
    0,
  )).toString())

  return {
    amountIn,
    amountOut,
    fee,
    poolAddress,
  }
}
