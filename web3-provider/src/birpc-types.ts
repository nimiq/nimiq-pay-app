/** Parameters for a Web3 request (no id - birpc manages IDs internally). */
export interface RequestParams {
  /** 'nimiq' | 'ethereum' | 'host'; left as string for upstream-provider compatibility. */
  network: string
  name: string
  params?: unknown
  object?: unknown
}

export interface ChainApprovalRequest {
  action: 'switch' | 'add'
  chainId: string
  chainName?: string
  rpcUrl?: string
}

/** Functions the native app exposes (called by webview) */
export interface NativeFunctions {
  handleRequest: (params: RequestParams) => Promise<unknown>
  requestChainApproval: (request: ChainApprovalRequest) => Promise<boolean>
  onChainChanged: (chainId: string) => void // fire-and-forget event
  onChainAdded: (chainId: string, rpcUrl: string) => void // fire-and-forget event
  onUnsupportedChain: (chainId: string) => void // fire-and-forget event
}

/** Functions the webview exposes (called by native) */
export interface WebviewFunctions {
  updateRpcUrl: (rpcUrl: string) => void
  /** Replaces the Nimiq accounts the user already approved, without a new prompt. */
  nimiqAccountsChanged: (accounts: string[]) => void
  fullscreenChanged: (enabled: boolean) => void
}

/**
 * How long the provider waits for the host to answer one Mini App request.
 * It covers the host's worst case for a confirmed EVM transaction: the sheet
 * deadline (MINI_APP_REQUEST_TIMEOUT_MS, 120s) plus the broadcast RPC timeout
 * (MiniAppHost.RPC_TIMEOUT_MS, 30s) plus 5s margin. Any shorter, and the Mini
 * App can get a timeout for a transaction the host still sends.
 */
export const MINI_APP_PROVIDER_TIMEOUT_MS = 155_000
