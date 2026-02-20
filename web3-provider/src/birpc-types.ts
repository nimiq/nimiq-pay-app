/** Parameters for a Web3 request (no id - birpc manages IDs internally) */
export interface RequestParams {
  network: string
  name: string
  params?: unknown
  object?: unknown
}

/** Functions the native app exposes (called by webview) */
export interface NativeFunctions {
  handleRequest: (params: RequestParams) => Promise<unknown>
  onChainChanged: (chainId: string) => void // fire-and-forget event
}

/** Functions the webview exposes (called by native) - extensible for future use */
export interface WebviewFunctions {}
