import type { ChainApprovalRequest, RequestParams } from './birpc-types'
import {
  USER_REJECTED_REQUEST_CODE,
  USER_REJECTED_REQUEST_MESSAGE,
} from './provider-errors'

interface ProviderChainDependencies {
  requestChainApproval: (request: ChainApprovalRequest) => Promise<boolean>
  isChainAvailable: (chainId: number) => boolean
  addDynamicChain: (chainId: number) => void
  setChainId: (chainId: string) => void
  setRpcUrl: (rpcUrl: string) => void
  emitChainAdded: (chainId: string, rpcUrl: string) => void
  emitChainChanged: (chainId: string) => void
  emitUnsupportedChain: (chainId: string) => void
  sendResponse: (id: number | undefined, result: null) => void
  sendError: (id: number | undefined, error: { code: number, message: string }) => void
}

export function normalizeChainId(chainId: unknown): number | null {
  if (chainId === undefined || chainId === null)
    return null

  if (typeof chainId === 'number' && Number.isInteger(chainId) && chainId > 0)
    return chainId

  if (typeof chainId === 'string') {
    const trimmed = chainId.trim()
    if (trimmed.length === 0)
      return null
    const parsed = trimmed.startsWith('0x') ? Number.parseInt(trimmed, 16) : Number.parseInt(trimmed, 10)
    if (Number.isInteger(parsed) && parsed > 0)
      return parsed
  }

  return null
}

function rejectChainRequest(
  id: number | undefined,
  deps: Pick<ProviderChainDependencies, 'sendError'>,
  message = USER_REJECTED_REQUEST_MESSAGE,
) {
  deps.sendError(id, { code: USER_REJECTED_REQUEST_CODE, message })
}

export async function handleSwitchEthereumChain(
  params: Pick<RequestParams, 'object'> & { id?: number },
  deps: ProviderChainDependencies,
): Promise<void> {
  const object = params.object
  if (typeof object !== 'object' || object === null || !('chainId' in object)) {
    deps.sendError(params.id, { code: -32602, message: 'Missing chainId' })
    return
  }

  const normalized = normalizeChainId((object as { chainId?: unknown }).chainId)
  if (!normalized) {
    deps.sendError(params.id, { code: -32602, message: 'Invalid chainId' })
    return
  }
  if (!deps.isChainAvailable(normalized)) {
    deps.emitUnsupportedChain(String((object as { chainId?: unknown }).chainId))
    deps.sendError(params.id, { code: 4902, message: 'Unsupported chain' })
    return
  }

  const normalizedHex = `0x${normalized.toString(16)}`
  const approved = await deps.requestChainApproval({
    action: 'switch',
    chainId: normalizedHex,
  })

  if (!approved) {
    rejectChainRequest(params.id, deps)
    return
  }

  deps.setChainId(normalizedHex)
  deps.emitChainChanged(normalizedHex)
  deps.sendResponse(params.id, null)
}

export async function handleAddEthereumChain(
  params: Pick<RequestParams, 'object'> & { id?: number },
  deps: ProviderChainDependencies,
): Promise<void> {
  const object = params.object
  if (typeof object !== 'object' || object === null || !('chainId' in object)) {
    deps.sendError(params.id, { code: -32602, message: 'Missing chainId' })
    return
  }

  const addChainParams = object as { chainId?: unknown, chainName?: string, rpcUrls?: string[] }
  const normalized = normalizeChainId(addChainParams.chainId)
  if (!normalized) {
    deps.sendError(params.id, { code: -32602, message: 'Invalid chainId' })
    return
  }

  const normalizedHex = `0x${normalized.toString(16)}`
  const chainKnown = deps.isChainAvailable(normalized)
  const rpcUrl = addChainParams.rpcUrls?.[0]

  if (!chainKnown && !rpcUrl) {
    deps.sendError(params.id, { code: -32602, message: 'Missing rpcUrls' })
    return
  }

  const approved = await deps.requestChainApproval({
    action: 'add',
    chainId: normalizedHex,
    chainName: addChainParams.chainName,
    rpcUrl,
  })

  if (!approved) {
    rejectChainRequest(params.id, deps)
    return
  }

  if (!chainKnown && rpcUrl) {
    deps.addDynamicChain(normalized)
    deps.emitChainAdded(normalizedHex, rpcUrl)
  }

  deps.setChainId(normalizedHex)
  if (rpcUrl)
    deps.setRpcUrl(rpcUrl)
  deps.emitChainChanged(normalizedHex)
  deps.sendResponse(params.id, null)
}
