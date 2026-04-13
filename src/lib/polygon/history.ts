import type { Log } from 'ethers'
import type { RpcLikeError } from './types'

interface GetLogsFilter {
  address: string
  fromBlock: number
  toBlock: number
  topics: Array<string | null>
}

interface GetLogsProvider {
  getLogs: (filter: GetLogsFilter) => Promise<Log[]>
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const rpcError = error as Error & RpcLikeError
    return [error.message, rpcError.error?.message, rpcError.info?.error?.message]
      .filter(Boolean)
      .join(' ')
  }

  return typeof error === 'string' ? error : ''
}

function getErrorCode(error: unknown) {
  if (!(error instanceof Error))
    return undefined

  const rpcError = error as Error & RpcLikeError
  return rpcError.info?.error?.code ?? rpcError.error?.code ?? rpcError.code
}

function getLatestAvailableBlock(error: unknown) {
  if (!(error instanceof Error))
    return undefined

  const rpcError = error as Error & RpcLikeError
  const details = rpcError.info?.error?.data?.details ?? rpcError.error?.data?.details
  if (typeof details?.latestBlock === 'number')
    return details.latestBlock

  const message = getErrorMessage(error)
  const match = message.match(/latestBlock:\s*(\d+)/i)
  return match ? Number(match[1]) : undefined
}

export function isBlockRangeLimitError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('ranges over') && message.includes('blocks are not supported')
}

export function isTimedOutLogQueryError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  const code = getErrorCode(error)
  return code === -32002 || message.includes('request timed out')
}

export function isMissingRecentBlockLogQueryError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('block not found for eth_getlogs')
    || message.includes('remote endpoint does not have this data')
  )
}

export async function fetchLogsWithAvailableHeadFallback(
  provider: GetLogsProvider,
  filter: GetLogsFilter,
): Promise<Log[]> {
  try {
    return await provider.getLogs(filter)
  }
  catch (error) {
    if (!isMissingRecentBlockLogQueryError(error))
      throw error

    const latestBlock = getLatestAvailableBlock(error)
    if (latestBlock === undefined || latestBlock >= filter.toBlock)
      throw error
    if (latestBlock < filter.fromBlock)
      return []

    return provider.getLogs({
      ...filter,
      toBlock: latestBlock,
    })
  }
}

export async function fetchLogsWithAdaptiveRange(
  provider: GetLogsProvider,
  filter: GetLogsFilter,
): Promise<Log[]> {
  try {
    return await fetchLogsWithAvailableHeadFallback(provider, filter)
  }
  catch (error) {
    const shouldSplit = isBlockRangeLimitError(error) || isTimedOutLogQueryError(error)
    if (!shouldSplit || filter.fromBlock >= filter.toBlock)
      throw error

    const midpoint = Math.floor((filter.fromBlock + filter.toBlock) / 2)
    const [left, right] = await Promise.all([
      fetchLogsWithAdaptiveRange(provider, { ...filter, toBlock: midpoint }),
      fetchLogsWithAdaptiveRange(provider, { ...filter, fromBlock: midpoint + 1 }),
    ])

    return [...left, ...right]
  }
}
