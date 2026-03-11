/** Parameters for a Web3 request (no id - birpc manages IDs internally) */
export interface RequestParams {
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
}
