import type { PluginListenerHandle } from '@capacitor/core'
import type { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import type { Address } from '@nimiq/core'
import type { BirpcReturn } from 'birpc'
import type { ChainApprovalRequest, NativeFunctions, RequestParams, WebviewFunctions } from '../../web3-provider/src/birpc-types'
import type { Web3RequestType } from '@/lib/analytics'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { PartialSendTxArgs, PartialStakingTxArgs, PartialUserTxArgs, StakingData } from '@/types/transactions'
import { Toast } from '@capacitor/toast'
import { createBirpc } from 'birpc'
import { getAddress, Interface } from 'ethers'
import { ref, watch } from 'vue'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { trackChainSwitched, trackWeb3Request } from '@/lib/analytics'
import { Asset, formatUsdtAmount } from '@/lib/assets'
import { deriveAppScopedId } from '@/lib/device-identifier'
import { hexToBytes } from '@/lib/ethereum/hex-utils'
import { addressesEqual, isValidEthAddress, parseChainId } from '@/lib/ethereum/validation'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { SQLQuery } from '@/lib/sql-queries'
import { sleep } from '@/lib/utils'
import { useConn } from '@/stores/conn'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useLocalWallet } from '@/stores/local-wallet'
import { useMiniApps } from '@/stores/mini-apps'
import { STAKING_CONTRACT_ADDRESS, useNimiqNetwork } from '@/stores/nimiq-network'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import { Rail, Transfer } from '@/types/transactions'
import { ALLOWED_EVM_CHAIN_IDS, EVM_CHAIN_NAMES } from '../../web3-provider/src/allowedChains'
import {
  TRANSACTION_OUTCOME_UNKNOWN_CODE,
  TRANSACTION_OUTCOME_UNKNOWN_MESSAGE,
  USER_REJECTED_REQUEST_CODE,
  USER_REJECTED_REQUEST_MESSAGE,
} from '../../web3-provider/src/provider-errors'
import { generateUUID } from '../../web3-provider/src/utils'
import { parseBitcoinLightningInvoice } from './useBitcoinLightning'
import { useFastspotApiV1 } from './useFastspotv1'
import { useFastspotApiV2 } from './useFastspotV2'
import { useLogger } from './useLogger'

const logger = useLogger('MiniAppHost')
// Sent to the webview on `from`/`address` mismatch. Must not include the wallet
// address: the caller may not have been granted eth_requestAccounts.
const ETH_ADDRESS_MISMATCH_MESSAGE = 'Requested address does not match the wallet address'
const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
])

/**
 * Snapshot of an active MiniAppHost session.
 * Used to persist state across app reloads (e.g., PIN lock after background).
 */
export interface MiniAppSessionState {
  url: string
  title: string
  chainId: string
  evmRpcUrls?: Record<string, string>
}

/** Module-level reference to the active session state (set by constructor, cleared by destroy) */
let _activeMiniAppSession: MiniAppSessionState | null = null

/**
 * Reactive flag mirroring whether a MiniAppHost session is currently active.
 * Updated in lock-step with `_activeMiniAppSession`. Used to gate UI signals
 * such as the local-notification visibility check in `useLocks().isHomeVisible`.
 */
export const isMiniAppActive = ref(false)

/**
 * Returns a snapshot of the active MiniAppHost session, or null if none is active.
 * Used by App.vue to decide whether to hide (rather than close) the webview on background timeout.
 */
export function getActiveMiniAppSession(): MiniAppSessionState | null {
  return _activeMiniAppSession ? { ..._activeMiniAppSession } : null
}

export interface SignatureResult {
  publicKey: string
  signature: string
}

export interface LightningPaymentResult {
  hash: string
  swapId: string
}

interface MiniAppLightningAttempt {
  origin: string
  owner: string
  swap_id: string
  tx_hash: string | null
}

interface DecodedAssetTransfer {
  assetSymbol: 'USDT'
  network: 'Polygon'
  recipient: string
  amount: string
  tokenAddress: string
}

interface EthAccountsPermission {
  caveats: Array<{
    type: 'restrictReturnedAccounts'
    value: string[]
  }>
  date: number
  id: string
  invoker: string
  parentCapability: 'eth_accounts'
}

/** Type for Nimiq message signing params */
interface NimiqSignParams {
  message?: string
  isHex?: boolean
}

/** Type for Nimiq transaction params */
interface NimiqTransactionParams {
  recipient?: string
  value?: number | string
  fee?: number | string
  data?: string
}

interface MiniAppBase {
  url: string
  name?: string
}

type Network = 'ethereum' | 'nimiq'

// Matches the birpc timeout of Mini App requests in web3-provider/src/provider.ts.
// A sheet still open after it would approve a request the Mini App gave up on.
export const MINI_APP_REQUEST_TIMEOUT_MS = 120_000

export type UserConfirmationRequest
  = | (MiniAppBase & { type: 'accounts', network: Network })
    | (MiniAppBase & {
      type: 'transaction'
      network: Network
      data: Omit<PaymentRequestData, 'transfer'>
      stakingData?: StakingData
    })
    | (MiniAppBase & {
      type: 'lightning-access'
      network: 'nimiq'
      description?: string
    })
    | (MiniAppBase & {
      type: 'lightning-payment'
      network: 'nimiq'
      data: {
        description?: string
        btcAmount: number
        asset: Asset
        amount: number
        usdtFeeAllowance: number
        fees: NonNullable<PaymentRequestData['swap']>['fees']
      }
    })
    | (MiniAppBase & {
      type: 'eth-transaction'
      network: Network
      data: {
        to: string
        from: string
        value: string // wei as hex
        data?: string // calldata
        gas: string // gas limit as hex
        maxFeePerGas?: string
        maxPriorityFeePerGas?: string
        gasPrice?: string // legacy transactions
        nonce?: number
        chainId?: string
        chainName?: string
        decodedAssetTransfer?: DecodedAssetTransfer
      }
    })
    | (MiniAppBase & {
      type: 'message'
      network: Network
      data: {
        message: string
        isHex: boolean
      }
    })
    | (MiniAppBase & {
      type: 'chain'
      network: Network
      data: ChainApprovalRequest & {
        chainName?: string
      }
    })
    | (MiniAppBase & {
      type: 'deviceIdentifier'
      /** Mini-app supplied human-readable explanation. Shown verbatim in the prompt. */
      reason: string
    })

/**
 * Configuration for the MiniAppHost
 */
export interface MiniAppHostConfig {
  url: string
  title: string
  /**
   * Map of hex chain IDs to their JSON-RPC endpoints.
   * Used for nonce fetching, gas estimation, and transaction broadcasting.
   */
  evmRpcUrls?: Record<string, string>

  /**
   * Callback to request user confirmation for sensitive operations
   * @param request - Confirmation request to show to the user
   * @returns Promise that resolves to true if user confirms, false otherwise
   */
  /** `deadline` (ms timestamp) closes the dialog as a rejection; defaults to the Mini App request timeout. */
  requestUserConfirmation?: (request: UserConfirmationRequest, deadline?: number) => Promise<boolean>
  selectLightningAsset?: (app: { url: string, name: string, description?: string }, deadline?: number) => Promise<Asset | undefined>
}

/**
 * MiniAppHost - SDK for the host native app that runs mini apps in InAppBrowser
 * Provides typed communication with mini apps and handles permissions, signing, transactions
 */
export class MiniAppHost {
  private inAppBrowser: typeof InAppBrowser | null
  private config: MiniAppHostConfig
  private destroyed = false
  private birpc: BirpcReturn<WebviewFunctions, NativeFunctions> | null = null
  private messageFromWebviewListener: PluginListenerHandle | null = null
  private fullscreenChangeListener: PluginListenerHandle | null = null
  /** Current chain ID as set by the webview provider (hex string, e.g., '0x1') */
  private currentChainId: string = '0x1' // Default to Ethereum mainnet
  private ethAccountsPermission: EthAccountsPermission | null = null
  /** Chains the user approved in this session; onChainChanged frames for other chains are ignored. */
  private readonly approvedChainIds = new Set<string>()
  /** Stops the remote-signer watcher registered in the constructor. */
  private stopRemoteAddressWatcher: (() => void) | null = null
  /** The session object this host registered; destroy() only clears module state it still owns. */
  private readonly sessionState: MiniAppSessionState
  /** Own copy: approved custom chains are added here, and the launcher's defaults are shared by every session. */
  private readonly evmRpcUrls: Record<string, string>
  /** Lower-cased origin of `config.url`; used as the consent + ID scope. */
  private readonly origin: string
  private readonly pendingLightningInvoices = new Set<string>()
  private lightningAccessScope: string | null = null
  private lightningAccessRequest: { scope: string, promise: Promise<boolean> } | null = null

  /** Resolve the RPC URL for the given chain (or current chain if not specified) */
  private getRpcUrlForChain(chainId?: string): string | undefined {
    const chain = chainId || this.currentChainId
    return this.evmRpcUrls[chain]
  }

  constructor(inAppBrowser: typeof InAppBrowser, config: MiniAppHostConfig) {
    this.inAppBrowser = inAppBrowser
    this.config = config
    this.evmRpcUrls = { ...config.evmRpcUrls }
    this.origin = new URL(config.url).origin.toLowerCase()
    this.setupBirpc()

    // Track the active session at module level
    _activeMiniAppSession = {
      url: config.url,
      title: config.title,
      chainId: this.currentChainId,
      evmRpcUrls: this.evmRpcUrls,
    }
    this.sessionState = _activeMiniAppSession
    isMiniAppActive.value = true

    // When the remote signer address changes (added/refreshed mid-session), the
    // previously-cached Nimiq accounts list is stale. Clear the webview cache so
    // the dApp re-prompts and receives the up-to-date account set.
    // Watch the address string: signer reloads create new Address objects for
    // the same address, which would clear the cache without a real change.
    this.stopRemoteAddressWatcher = watch(
      () => useRemoteSigner().remoteAddress?.toUserFriendlyAddress(),
      () => {
        logger.log('[MiniAppHost] remoteAddress changed; clearing webview Nimiq account cache')
        this.birpc?.clearAccountCache('nimiq')
      },
    )
  }

  /**
   * Factory method to reconnect to an existing hidden webview after app reload.
   * Re-registers listeners without opening a new webview.
   */
  static reconnect(
    inAppBrowser: typeof InAppBrowser,
    config: MiniAppHostConfig,
    restoredChainId: string,
  ): MiniAppHost {
    const host = new MiniAppHost(inAppBrowser, config)
    host.currentChainId = restoredChainId
    host.sessionState.chainId = restoredChainId
    return host
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    this.stopRemoteAddressWatcher?.()
    this.stopRemoteAddressWatcher = null
    // A late destroy of an old host must not clobber the session a newer host
    // registered, nor remove listeners it doesn't own (destroy only removes its
    // own messageFromWebview listener; removeAllListeners would wipe a concurrent
    // launch's closeEvent/browserPageLoaded listeners too).
    if (_activeMiniAppSession === this.sessionState) {
      _activeMiniAppSession = null
      isMiniAppActive.value = false
    }
    const cleanupResults = await Promise.allSettled([
      this.inAppBrowser?.clearAllCookies(),
      this.messageFromWebviewListener?.remove(),
      this.fullscreenChangeListener?.remove(),
    ])
    for (const result of cleanupResults) {
      if (result.status === 'rejected')
        logger.error('Could not clean up Mini App host', result.reason)
    }
    this.messageFromWebviewListener = null
    this.fullscreenChangeListener = null
    this.birpc?.$close()
    this.birpc = null
    this.inAppBrowser = null
  }

  private setupBirpc(): void {
    if (!this.inAppBrowser) {
      return
    }

    const browser = this.inAppBrowser

    this.birpc = createBirpc<WebviewFunctions, NativeFunctions>({
      handleRequest: async (params: RequestParams): Promise<unknown> => {
        if (this.destroyed)
          throw new InternalError('Host is destroyed')

        logger.log('[MiniAppHost] handleRequest:', params)

        try {
          switch (params.network) {
            case 'nimiq':
              return await this._handleNimiqMessage(params)
            case 'ethereum':
              return await this._handleEthereumMessage(params)
            case 'host':
              return await this._handleHostMessage(params)
            default:
              throw new UnknownRequestError(`Unknown network: ${params.network}`)
          }
        }
        catch (error) {
          const isFullscreenRequest = params.network === 'host' && (params.name === 'setFullscreen' || params.name === 'getFullscreen')
          if (error instanceof MiniAppError) {
            // Show toast for user-actionable errors (skip permission denied - user already knows)
            if (!isFullscreenRequest && !(error instanceof PermissionDeniedError) && !(error instanceof UnknownRequestError)) {
              this.showErrorToast(error.message)
            }
            // Add the Nimiq type while preserving RPC fields used by older SDKs.
            throw this.createRpcError(this.errorCode(error), error.message, params.network === 'nimiq' ? error.type : undefined, params.network === 'nimiq' ? error.data : undefined)
          }
          const message = `An unknown error occurred: ${(error as Error).message}`
          if (!isFullscreenRequest)
            this.showErrorToast(message)
          throw this.createRpcError(-32603, message, params.network === 'nimiq' ? 'INTERNAL_ERROR' : undefined)
        }
      },
      requestChainApproval: async (request: ChainApprovalRequest): Promise<boolean> => {
        if (!this.config.requestUserConfirmation) {
          throw new InternalError('Confirmation handler not provided')
        }

        const numericChainId = parseChainId(request.chainId)
        const chainName = request.chainName || (numericChainId ? EVM_CHAIN_NAMES[numericChainId] : undefined)
        // Allowlisted chains always use the host's RPC, so don't show the dApp's.
        const customRpcUrl = numericChainId && this.isAllowedChain(numericChainId) ? undefined : request.rpcUrl
        const confirmed = await this.config.requestUserConfirmation({
          url: this.config.url,
          name: this.config.title,
          type: 'chain',
          data: {
            ...request,
            chainName,
            rpcUrl: customRpcUrl,
          },
          network: 'ethereum',
        })

        if (!confirmed) {
          trackWeb3Request({
            requestType: request.action === 'add' ? 'add_chain' : 'switch_chain',
            blockchain: 'ethereum',
            dappUrl: this.config.url,
            dappName: this.config.title,
            approved: false,
            success: false,
            chainId: request.chainId,
          })
        }
        else if (numericChainId) {
          // The webview reports the switch via onChainChanged, a frame the page itself can
          // post. Record what the user approved so the host only follows approved chains.
          const chainId = `0x${numericChainId.toString(16)}`
          this.approvedChainIds.add(chainId)
          if (request.action === 'add' && customRpcUrl) {
            logger.log('[MiniAppHost] Chain added:', chainId, 'RPC:', customRpcUrl)
            // Same object as sessionState.evmRpcUrls, so the session needs no separate write.
            this.evmRpcUrls[chainId] = customRpcUrl
            trackWeb3Request({ requestType: 'add_chain', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true, chainId })
          }
        }

        return confirmed
      },
      onUnsupportedChain: (chainId: string): void => {
        logger.log('[MiniAppHost] Unsupported chain requested:', chainId)
        this.showErrorToast(i18n.t('This network is not supported by Nimiq Pay'))
        trackWeb3Request({ requestType: 'switch_chain', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false, chainId })
      },
      // The RPC of an approved custom chain is stored in requestChainApproval.
      onChainAdded: (): void => {},
      onChainChanged: (chainId: string): void => {
        if (this.destroyed || !this.approvedChainIds.has(chainId)) {
          logger.warn('[MiniAppHost] Ignoring unapproved chain change:', chainId)
          return
        }
        const previousChainId = this.currentChainId
        this.currentChainId = chainId
        // Own session only: a closing host must not write into a newer host's session.
        this.sessionState.chainId = chainId
        logger.log('[MiniAppHost] Chain changed to:', chainId)
        trackChainSwitched(this.config.url, previousChainId, chainId)
        trackWeb3Request({ requestType: 'switch_chain', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true, chainId })

        // Update the webview's RPC URL to match the new chain
        const newRpcUrl = this.getRpcUrlForChain(chainId)
        if (newRpcUrl) {
          this.birpc?.updateRpcUrl(newRpcUrl)
        }

        const numericChainId = Number(chainId)
        Toast.show({
          text: i18n.t('Switched to {chain}', { chain: EVM_CHAIN_NAMES[numericChainId] ?? `Chain ${numericChainId}` }),
          duration: 'short',
          position: 'bottom',
        })
      },
    }, {
      post: (data) => {
        if (this.destroyed || !browser)
          return
        logger.log('[MiniAppHost] birpc post:', data)
        browser.postMessage({ detail: data })
      },
      on: (fn) => {
        // @ts-expect-error - TS cannot detect the correct overload
        browser.addListener('messageFromWebview', (event: { detail: unknown }) => {
          if (event.detail)
            fn(event.detail)
        }).then((handle: PluginListenerHandle) => {
          if (this.destroyed)
            void handle.remove()
          else
            this.messageFromWebviewListener = handle
        })
      },
      // Fire-and-forget host→webview methods. Without this birpc treats them as
      // request/response and the discarded promises would reject with a 120s
      // timeout if the webview disappears mid-flight (unhandledrejection).
      eventNames: ['updateRpcUrl', 'clearAccountCache', 'fullscreenChanged'],
      timeout: 120_000,
    })

    void browser.addListener('fullscreenChange', ({ enabled }) => {
      if (!this.destroyed && _activeMiniAppSession === this.sessionState)
        this.birpc?.fullscreenChanged.asEvent(enabled)
    }).then((handle) => {
      if (this.destroyed)
        void handle.remove()
      else
        this.fullscreenChangeListener = handle
    }).catch(error => logger.error('Could not observe Mini App fullscreen changes', error))
  }

  private showErrorToast(message: string): void {
    // Truncate long messages for toast display (native toasts have limited space)
    const displayMessage = message.length > 100
      ? `${message.slice(0, 97)}...`
      : message

    Toast.show({
      text: displayMessage,
      duration: 'long', // 3500ms - gives user time to read error
      position: 'top', // Note: Android 12+ always shows at bottom
    })
  }

  private errorCode(error: MiniAppError): number {
    if (error instanceof PermissionDeniedError)
      return USER_REJECTED_REQUEST_CODE
    if (error instanceof UnknownRequestError)
      return 4200
    if (error instanceof InvalidRequestError)
      return -32602
    if (error instanceof InvalidTransactionError || error instanceof DuplicateLightningPaymentError)
      return -32602
    if (error instanceof TransactionOutcomeUnknownError)
      return TRANSACTION_OUTCOME_UNKNOWN_CODE
    if (error instanceof NetworkError)
      return -32000
    return -32603 // InternalError / default
  }

  // Plain object — Error objects don't serialize correctly over birpc
  private createRpcError(code: number, message: string, type?: string, data?: unknown): { code: number, message: string, type?: string, data?: unknown } {
    return { code, message, ...(type ? { type } : {}), ...(data !== undefined ? { data } : {}) }
  }

  private getEthPermissions(): EthAccountsPermission[] {
    return this.ethAccountsPermission ? [this.ethAccountsPermission] : []
  }

  private ensureEthAccountsPermission(address: string): EthAccountsPermission {
    if (this.ethAccountsPermission) {
      return this.ethAccountsPermission
    }

    const permission: EthAccountsPermission = {
      caveats: [
        {
          type: 'restrictReturnedAccounts',
          value: [address],
        },
      ],
      date: Date.now(),
      id: generateUUID(),
      invoker: this.config.url,
      parentCapability: 'eth_accounts',
    }

    this.ethAccountsPermission = permission
    return permission
  }

  private validateWalletRequestPermissions(params: unknown): void {
    if (!Array.isArray(params) || params.length !== 1) {
      throw new InvalidTransactionError('Invalid wallet_requestPermissions parameters')
    }

    const [request] = params
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      throw new InvalidTransactionError('Invalid wallet_requestPermissions parameters')
    }

    const entries = Object.entries(request as Record<string, unknown>)
    if (entries.length !== 1) {
      throw new InvalidTransactionError('Invalid wallet_requestPermissions parameters')
    }

    const [capability, capabilityParams] = entries[0]
    if (capability !== 'eth_accounts') {
      throw new UnknownRequestError(`Unsupported permission capability: ${capability}`)
    }

    if (
      typeof capabilityParams !== 'object'
      || capabilityParams === null
      || Array.isArray(capabilityParams)
    ) {
      throw new InvalidTransactionError('Invalid wallet_requestPermissions parameters')
    }
  }

  private async requestWalletPermissions(params: unknown): Promise<EthAccountsPermission[]> {
    this.validateWalletRequestPermissions(params)

    if (this.ethAccountsPermission) {
      return this.getEthPermissions()
    }

    await this.listEthAccounts()
    return this.getEthPermissions()
  }

  private async _handleEthereumMessage(message: RequestParams) {
    logger.log('[MiniAppHost] Handling Ethereum message:', message)
    const params = message.params ?? message.object

    switch (message.name) {
      case 'requestAccounts':
        return this.listEthAccounts()
      case 'wallet_requestPermissions':
        return this.requestWalletPermissions(params)
      case 'wallet_getPermissions':
        return this.getEthPermissions()
      case 'signMessage':
      case 'signPersonalMessage':
        return this.signPersonalMessage(params)
      case 'signTypedMessage':
        return this.signTypedMessage(params)
      case 'signTransaction':
        return this.signEthTransaction(params)
      // case 'rpcCall':
      //   return this.rpcCall(params)
      default:
        throw new UnknownRequestError(`Unknown Ethereum method: ${message.name}`)
    }
  }

  private isAllowedChain(chainId: number): boolean {
    return ALLOWED_EVM_CHAIN_IDS.has(chainId)
  }

  private decodeKnownPolygonUsdtTransfer({
    to,
    data,
    chainId,
  }: {
    to: string
    data?: string
    chainId?: number
  }): DecodedAssetTransfer | null {
    if (!data || data === '0x')
      return null

    const transferSelector = erc20TransferInterface.getFunction('transfer')?.selector
    if (!transferSelector || !data.startsWith(transferSelector))
      return null

    if (chainId !== polygonUsdtConfig.networkId || !addressesEqual(to, polygonUsdtConfig.tokenContract))
      return null

    let parsed: ReturnType<Interface['parseTransaction']>
    try {
      parsed = erc20TransferInterface.parseTransaction({ data })
    }
    catch {
      throw new InvalidTransactionError('Invalid Polygon USDT transfer calldata')
    }

    if (!parsed || parsed.name !== 'transfer')
      throw new InvalidTransactionError('Invalid Polygon USDT transfer calldata')

    return {
      assetSymbol: 'USDT',
      network: 'Polygon',
      recipient: getAddress(String(parsed.args[0])),
      amount: formatUsdtAmount(Number(parsed.args[1]), 'en-US'),
      tokenAddress: polygonUsdtConfig.tokenContract,
    }
  }

  /** Default timeout for RPC calls in milliseconds */
  private static readonly RPC_TIMEOUT_MS = 30000

  private async rpcCall(params: unknown): Promise<unknown> {
    if (typeof params !== 'object' || params === null) {
      throw new InternalError('Invalid parameters for rpcCall')
    }

    const { rpcUrl, payload } = params as { rpcUrl?: string, payload?: unknown }

    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new InternalError('Missing or invalid rpcUrl parameter')
    }

    if (!payload || typeof payload !== 'object') {
      throw new InternalError('Missing or invalid payload parameter')
    }

    logger.log('[MiniAppHost] rpcCall fetching:', rpcUrl, 'with payload:', payload)

    let response: Response
    try {
      response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(MiniAppHost.RPC_TIMEOUT_MS),
      })
    }
    catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new NetworkError(`RPC request timed out after ${MiniAppHost.RPC_TIMEOUT_MS}ms`)
      }
      throw new NetworkError(`RPC request failed: ${(error as Error).message}`)
    }

    // Validate HTTP status before parsing JSON
    if (!response.ok) {
      throw new NetworkError(`RPC request failed with status ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    logger.log('[MiniAppHost] rpcCall response:', JSON.stringify(data))
    return data
  }

  private async listEthAccounts(): Promise<string[]> {
    // If a prior wallet_requestPermissions already granted eth_accounts in this
    // session, reuse that approval instead of re-prompting.
    if (this.ethAccountsPermission) {
      const cachedAddress = this.ethAccountsPermission.caveats
        .find(c => c.type === 'restrictReturnedAccounts')
        ?.value[0]
      if (cachedAddress) {
        trackWeb3Request({ requestType: 'request_accounts', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true })
        return [cachedAddress]
      }
    }

    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'accounts',
      network: 'ethereum',
    })
    if (!confirmed) {
      trackWeb3Request({ requestType: 'request_accounts', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    // Get Ethereum address from local wallet
    const { data: ethAddress, error } = useLocalWallet().getEthAddress()
    if (error) {
      throw new InternalError(`Failed to get Ethereum address: ${error}`)
    }
    if (!ethAddress) {
      throw new InternalError('Failed to get Ethereum address: wallet address not available')
    }

    this.ensureEthAccountsPermission(ethAddress)
    trackWeb3Request({ requestType: 'request_accounts', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true })
    return [ethAddress]
  }

  private async signPersonalMessage(params: unknown): Promise<string> {
    // Parse params - expect { data: string, address: string }
    if (typeof params !== 'object' || params === null) {
      logger.error('[MiniAppHost] Invalid parameters for signPersonalMessage:', params)
      throw new InternalError('Invalid parameters for signPersonalMessage')
    }

    const { data, address } = params as { data?: string, address?: string }

    if (!data) {
      logger.error('[MiniAppHost] Missing data parameter for signPersonalMessage')
      throw new InternalError('Missing data parameter for signPersonalMessage')
    }
    if (!address) {
      logger.error('[MiniAppHost] Missing address parameter for signPersonalMessage')
      throw new InternalError('Missing address parameter for signPersonalMessage')
    }
    if (!isValidEthAddress(address)) {
      logger.error('[MiniAppHost] Invalid Ethereum address for signPersonalMessage:', address)
      throw new InternalError('Invalid Ethereum address format')
    }

    // Decode hex message to display to user
    const isHex = data.startsWith('0x')
    const messageToDisplay = isHex
      ? new TextDecoder().decode(hexToBytes(data))
      : data

    // Request user confirmation
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }

    logger.log('[MiniAppHost] Requesting user confirmation for message signing:', messageToDisplay)
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'message',
      data: { message: messageToDisplay, isHex: false },
      network: 'ethereum',
    })
    if (!confirmed) {
      trackWeb3Request({ requestType: 'sign_message', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    // Get Ethereum wallet and verify address
    const { data: ethWallet, error } = useLocalWallet().getEthWallet()
    if (error || !ethWallet) {
      throw new InternalError(`Failed to get Ethereum wallet: ${error || 'wallet not available'}`)
    }
    if (!addressesEqual(ethWallet.address, address)) {
      logger.warn('[MiniAppHost] Address mismatch', { requested: address, wallet: ethWallet.address })
      throw new InvalidRequestError(ETH_ADDRESS_MISMATCH_MESSAGE)
    }

    // Sign the message - for hex data, pass raw bytes; ethers.js handles personal_sign prefix
    const messageToSign = isHex ? hexToBytes(data) : data
    const signature = await ethWallet.signMessage(messageToSign)
    trackWeb3Request({ requestType: 'sign_message', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true })
    return signature
  }

  private async signTypedMessage(params: unknown): Promise<string> {
    // Parse params - expect { raw: string, address: string, version?: string }
    if (typeof params !== 'object' || params === null) {
      throw new InternalError('Invalid parameters for signTypedMessage')
    }

    const { raw, address } = params as { raw?: string, address?: string }

    if (!raw) {
      throw new InternalError('Missing raw parameter for signTypedMessage')
    }
    if (!address) {
      throw new InternalError('Missing address parameter for signTypedMessage')
    }
    if (!isValidEthAddress(address)) {
      throw new InternalError('Invalid Ethereum address format')
    }

    // Parse the EIP-712 typed data
    let typedData: {
      types: Record<string, Array<{ name: string, type: string }>>
      domain: Record<string, unknown>
      primaryType: string
      message: Record<string, unknown>
    }
    try {
      typedData = JSON.parse(raw)
    }
    catch {
      throw new InternalError('Failed to parse typed data JSON')
    }

    // Validate required EIP-712 fields
    if (!typedData.types || !typedData.domain || !typedData.primaryType || !typedData.message) {
      throw new InternalError('Invalid typed data: missing required EIP-712 fields (types, domain, primaryType, message)')
    }

    // Validate chainId in typed data matches current chain
    const typedChainId = parseChainId((typedData.domain as { chainId?: unknown })?.chainId)
    const currentChainNumber = parseChainId(this.currentChainId)
    if (typedChainId) {
      if (!this.isAllowedChain(typedChainId)) {
        throw new InvalidTransactionError(`Unsupported chainId in typed data: ${typedChainId}`)
      }
      if (currentChainNumber && typedChainId !== currentChainNumber) {
        throw new InvalidTransactionError(
          `Typed data chainId (${typedChainId}) doesn't match current chain (${currentChainNumber})`,
        )
      }
    }

    // Format typed data for display
    const displayMessage = `Domain: ${typedData.domain.name || 'Unknown'}\n`
      + `Chain: ${typedData.domain.chainId}\n`
      + `Type: ${typedData.primaryType}\n\n`
      + `Message:\n${JSON.stringify(typedData.message, null, 2)}`

    // Request user confirmation
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'message',
      data: { message: displayMessage, isHex: false },
      network: 'ethereum',
    })
    if (!confirmed) {
      trackWeb3Request({ requestType: 'sign_typed_data', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    // Get Ethereum wallet and verify address
    const { data: ethWallet, error } = useLocalWallet().getEthWallet()
    if (error || !ethWallet) {
      throw new InternalError(`Failed to get Ethereum wallet: ${error || 'wallet not available'}`)
    }
    if (!addressesEqual(ethWallet.address, address)) {
      logger.warn('[MiniAppHost] Address mismatch', { requested: address, wallet: ethWallet.address })
      throw new InvalidRequestError(ETH_ADDRESS_MISMATCH_MESSAGE)
    }

    // Remove EIP712Domain from types (ethers.js handles it automatically)
    const { EIP712Domain, ...types } = typedData.types

    // Sign using ethers.js signTypedData (EIP-712)
    const signature = await ethWallet.signTypedData(typedData.domain, types, typedData.message)
    trackWeb3Request({ requestType: 'sign_typed_data', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true })
    return signature
  }

  private async signEthTransaction(params: unknown): Promise<string> {
    logger.log('[ETH_TX] Step 1 - Raw params received:', JSON.stringify(params))

    // Validate params format: [{ to, from, value, gas, ... }] or { to, from, value, gas, ... }
    // Some dApps send params as array, others as object directly
    let txParams: {
      to: string
      from: string
      value?: string
      data?: string
      gas?: string
      gasLimit?: string
      maxFeePerGas?: string
      maxPriorityFeePerGas?: string
      gasPrice?: string
      nonce?: string | number
      chainId?: string
    }

    if (Array.isArray(params) && params.length > 0) {
      txParams = params[0] as typeof txParams
    }
    else if (params && typeof params === 'object' && 'from' in params) {
      txParams = params as typeof txParams
    }
    else {
      throw new InternalError('Invalid parameters for signTransaction')
    }

    logger.log('[ETH_TX] Step 2 - Parsed txParams:', {
      to: txParams.to,
      from: txParams.from,
      value: txParams.value,
      data: txParams.data ? `${txParams.data.slice(0, 10)}...` : undefined,
      gas: txParams.gas,
      gasLimit: txParams.gasLimit,
      maxFeePerGas: txParams.maxFeePerGas,
      maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
      gasPrice: txParams.gasPrice,
      nonce: txParams.nonce,
      nonceType: typeof txParams.nonce,
      chainId: txParams.chainId,
    })

    // Validate required fields
    if (!txParams.to || !txParams.from) {
      throw new InternalError('Transaction must include "to" and "from" addresses')
    }

    // Validate Ethereum addresses using EIP-55
    if (!isValidEthAddress(txParams.to)) {
      throw new InternalError('Invalid "to" address format')
    }
    if (!isValidEthAddress(txParams.from)) {
      throw new InternalError('Invalid "from" address format')
    }

    const gasLimit = txParams.gas || txParams.gasLimit

    const currentChainNumber = parseChainId(this.currentChainId)
    let validatedChainIdNumber: number | undefined
    if (txParams.chainId) {
      const txChainIdNumber = parseChainId(txParams.chainId)
      if (!txChainIdNumber) {
        throw new InvalidTransactionError('Invalid chainId for Ethereum transaction')
      }
      if (currentChainNumber && txChainIdNumber !== currentChainNumber) {
        throw new InvalidTransactionError(
          `Transaction chainId (${txChainIdNumber}) doesn't match current chain (${currentChainNumber})`,
        )
      }
      validatedChainIdNumber = txChainIdNumber
    }
    else if (currentChainNumber) {
      validatedChainIdNumber = currentChainNumber
    }
    // Also covers the omitted-chainId fallback: currentChainId may be a user-added custom chain.
    if (validatedChainIdNumber && !this.isAllowedChain(validatedChainIdNumber)) {
      throw new InvalidTransactionError(`Unsupported chainId for Ethereum transaction: ${validatedChainIdNumber}`)
    }

    const decodedAssetTransfer = this.decodeKnownPolygonUsdtTransfer({
      to: txParams.to,
      data: txParams.data,
      chainId: validatedChainIdNumber,
    })
    const nativeValue = BigInt(txParams.value || '0x0')
    if (decodedAssetTransfer && nativeValue > 0n)
      throw new InvalidTransactionError('Polygon USDT transfers must not include a native token value')

    const chainName = validatedChainIdNumber ? EVM_CHAIN_NAMES[validatedChainIdNumber] : undefined

    // --- Resolve all missing tx fields from RPC before showing confirmation ---
    // Host RPC only, keyed by the chain being signed. A Mini App chosen RPC would supply the
    // nonce and fees the user signs, and receive the signed transaction.
    const rpcUrl = this.getRpcUrlForChain(validatedChainIdNumber ? `0x${validatedChainIdNumber.toString(16)}` : undefined)

    // Nonce resolution: fetch from broadcast RPC if not provided by dApp
    logger.log('[ETH_TX] Step 3 - Nonce analysis:', {
      nonceProvided: txParams.nonce !== undefined,
      nonceRawValue: txParams.nonce,
      nonceParsed: typeof txParams.nonce === 'string'
        ? Number.parseInt(txParams.nonce, 16)
        : txParams.nonce,
    })

    let resolvedNonce: number | undefined
    if (rpcUrl) {
      try {
        const nonceResponse = await this.rpcCall({
          rpcUrl,
          payload: {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'eth_getTransactionCount',
            params: [txParams.from, 'pending'],
          },
        })
        const onChainNonce = (nonceResponse as { result?: string }).result
        const onChainNonceDec = onChainNonce ? Number.parseInt(onChainNonce, 16) : undefined
        logger.log('[ETH_TX] Step 3b - On-chain nonce (pending):', {
          onChainNonce,
          onChainNonceDec,
          txNonce: txParams.nonce,
          match: txParams.nonce !== undefined && onChainNonceDec !== undefined
            ? onChainNonceDec === (typeof txParams.nonce === 'string'
              ? Number.parseInt(txParams.nonce, 16)
              : txParams.nonce)
            : 'nonce not provided by dApp',
        })

        if (txParams.nonce === undefined && onChainNonceDec !== undefined) {
          resolvedNonce = onChainNonceDec
          logger.log('[ETH_TX] Step 3c - Auto-resolved nonce from RPC:', resolvedNonce)
        }
      }
      catch (e) {
        logger.warn('[ETH_TX] Step 3b - Failed to fetch on-chain nonce:', (e as Error).message)
      }
    }

    // Gas price resolution: fetch from RPC if not provided by dApp
    let resolvedMaxFeePerGas: bigint | undefined
    let resolvedMaxPriorityFeePerGas: bigint | undefined
    let resolvedGasPrice: bigint | undefined

    if (!txParams.maxFeePerGas && !txParams.maxPriorityFeePerGas && !txParams.gasPrice) {
      if (rpcUrl) {
        logger.log('[ETH_TX] Step 3d - No gas pricing provided, fetching from RPC')
        try {
          const [gasPriceResponse, maxPriorityFeeResponse] = await Promise.all([
            this.rpcCall({ rpcUrl, payload: { jsonrpc: '2.0', id: Date.now(), method: 'eth_gasPrice', params: [] } }),
            this.rpcCall({ rpcUrl, payload: { jsonrpc: '2.0', id: Date.now() + 1, method: 'eth_maxPriorityFeePerGas', params: [] } }).catch(() => null),
          ])

          const gasPriceHex = (gasPriceResponse as { result?: string }).result
          const maxPriorityFeeHex = (maxPriorityFeeResponse as { result?: string } | null)?.result

          if (maxPriorityFeeHex && gasPriceHex) {
            // EIP-1559: use 2x gasPrice as maxFeePerGas buffer for base fee fluctuations
            resolvedMaxPriorityFeePerGas = BigInt(maxPriorityFeeHex)
            resolvedMaxFeePerGas = BigInt(gasPriceHex) * 2n
            logger.log('[ETH_TX] Step 3e - Resolved EIP-1559 gas:', {
              maxFeePerGas: resolvedMaxFeePerGas.toString(),
              maxPriorityFeePerGas: resolvedMaxPriorityFeePerGas.toString(),
            })
          }
          else if (gasPriceHex) {
            // Legacy fallback
            resolvedGasPrice = BigInt(gasPriceHex)
            logger.log('[ETH_TX] Step 3e - Resolved legacy gasPrice:', resolvedGasPrice.toString())
          }
        }
        catch (e) {
          logger.warn('[ETH_TX] Step 3e - Failed to fetch gas prices:', (e as Error).message)
        }
      }
      else {
        logger.warn('[ETH_TX] No RPC URL available to fetch gas prices')
      }
    }

    // Gas limit resolution: estimate from RPC if not provided by dApp
    let resolvedGasLimit: string | undefined = gasLimit
    if (!resolvedGasLimit && rpcUrl) {
      logger.log('[ETH_TX] Step 3f - No gas limit provided, estimating from RPC')
      try {
        const estimateResponse = await this.rpcCall({
          rpcUrl,
          payload: {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'eth_estimateGas',
            params: [{
              from: txParams.from,
              to: txParams.to,
              value: txParams.value || '0x0',
              data: txParams.data,
            }],
          },
        })
        const estimatedGas = (estimateResponse as { result?: string }).result
        if (estimatedGas) {
          // Add 20% buffer to gas estimate
          const estimated = BigInt(estimatedGas)
          const buffered = estimated + (estimated * 20n / 100n)
          resolvedGasLimit = `0x${buffered.toString(16)}`
          logger.log('[ETH_TX] Step 3g - Estimated gas:', { estimated: estimated.toString(), buffered: buffered.toString() })
        }
      }
      catch (e) {
        logger.warn('[ETH_TX] Step 3g - Failed to estimate gas:', (e as Error).message)
      }
    }

    if (!resolvedGasLimit) {
      throw new InternalError('Transaction must include "gas" or "gasLimit", and estimation failed')
    }

    // Compute final gas price hex strings for the confirmation dialog
    const finalMaxFeePerGas = txParams.maxFeePerGas || (resolvedMaxFeePerGas ? `0x${resolvedMaxFeePerGas.toString(16)}` : undefined)
    const finalMaxPriorityFeePerGas = txParams.maxPriorityFeePerGas || (resolvedMaxPriorityFeePerGas ? `0x${resolvedMaxPriorityFeePerGas.toString(16)}` : undefined)
    const finalGasPrice = txParams.gasPrice || (resolvedGasPrice && !finalMaxFeePerGas ? `0x${resolvedGasPrice.toString(16)}` : undefined)
    const finalNonce = txParams.nonce !== undefined
      ? (typeof txParams.nonce === 'string' ? Number.parseInt(txParams.nonce, 16) : txParams.nonce)
      : resolvedNonce

    // --- Request user confirmation with all resolved values ---
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }

    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'eth-transaction',
      data: {
        to: txParams.to,
        from: txParams.from,
        value: txParams.value || '0x0',
        data: txParams.data,
        gas: resolvedGasLimit,
        maxFeePerGas: finalMaxFeePerGas,
        maxPriorityFeePerGas: finalMaxPriorityFeePerGas,
        gasPrice: finalGasPrice,
        nonce: finalNonce,
        chainId: txParams.chainId,
        chainName,
        decodedAssetTransfer: decodedAssetTransfer || undefined,
      },
      network: 'ethereum',
    })

    if (!confirmed) {
      trackWeb3Request({ requestType: 'sign_transaction', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false, chainId: this.currentChainId })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    // Compared only after confirmation, like the message signers, so an
    // unapproved caller cannot probe the wallet address.
    const { data: ethWallet, error } = useLocalWallet().getEthWallet()
    if (error || !ethWallet) {
      throw new InternalError(`Failed to get Ethereum wallet: ${error || 'wallet not available'}`)
    }
    if (!addressesEqual(ethWallet.address, txParams.from)) {
      logger.warn('[ETH_TX] Address mismatch', { requested: txParams.from, wallet: ethWallet.address })
      throw new InvalidRequestError(ETH_ADDRESS_MISMATCH_MESSAGE)
    }

    // Build transaction object for ethers.js
    const tx: {
      to: string
      value?: bigint
      data?: string
      gasLimit: bigint
      maxFeePerGas?: bigint
      maxPriorityFeePerGas?: bigint
      gasPrice?: bigint
      nonce?: number
      chainId?: bigint
    } = {
      to: txParams.to,
      gasLimit: BigInt(resolvedGasLimit),
    }

    // Set value (convert from hex wei)
    if (txParams.value)
      tx.value = nativeValue

    // Set data (calldata for contract interactions)
    if (txParams.data && txParams.data !== '0x') {
      tx.data = txParams.data
    }

    // Set gas parameters (EIP-1559 or legacy) - use dApp values if provided, otherwise use resolved
    if (txParams.maxFeePerGas) {
      tx.maxFeePerGas = BigInt(txParams.maxFeePerGas)
    }
    else if (resolvedMaxFeePerGas) {
      tx.maxFeePerGas = resolvedMaxFeePerGas
    }
    if (txParams.maxPriorityFeePerGas) {
      tx.maxPriorityFeePerGas = BigInt(txParams.maxPriorityFeePerGas)
    }
    else if (resolvedMaxPriorityFeePerGas) {
      tx.maxPriorityFeePerGas = resolvedMaxPriorityFeePerGas
    }
    if (txParams.gasPrice) {
      tx.gasPrice = BigInt(txParams.gasPrice)
    }
    else if (resolvedGasPrice && !tx.maxFeePerGas) {
      // Only use legacy gasPrice if EIP-1559 params aren't set
      tx.gasPrice = resolvedGasPrice
    }

    // Set nonce: use dApp-provided nonce, or fall back to on-chain nonce from broadcast RPC
    if (txParams.nonce !== undefined) {
      tx.nonce = typeof txParams.nonce === 'string' ? Number.parseInt(txParams.nonce, 16) : txParams.nonce
    }
    else if (resolvedNonce !== undefined) {
      tx.nonce = resolvedNonce
    }

    if (validatedChainIdNumber)
      tx.chainId = BigInt(validatedChainIdNumber)

    logger.log('[ETH_TX] Step 4 - Built tx object:', {
      to: tx.to,
      value: tx.value?.toString(),
      gasLimit: tx.gasLimit?.toString(),
      maxFeePerGas: tx.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
      gasPrice: tx.gasPrice?.toString(),
      nonce: tx.nonce,
      chainId: tx.chainId?.toString(),
      hasData: !!tx.data,
    })

    // Sign the transaction
    const signedTx = await ethWallet.signTransaction(tx)

    logger.log('[ETH_TX] Step 5 - Transaction signed:', {
      signedTxLength: signedTx.length,
      signedTxPreview: `${signedTx.slice(0, 22)}...${signedTx.slice(-20)}`,
    })

    if (!rpcUrl) {
      throw new NetworkError('Missing Ethereum RPC URL to broadcast transaction')
    }

    logger.log('[ETH_TX] Step 6 - Broadcasting via RPC:', { rpcUrl, method: 'eth_sendRawTransaction' })

    const rpcResponse = await this.rpcCall({
      rpcUrl,
      payload: {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'eth_sendRawTransaction',
        params: [signedTx],
      },
    })

    logger.log('[ETH_TX] Step 7 - RPC response:', JSON.stringify(rpcResponse))

    if (!rpcResponse || typeof rpcResponse !== 'object') {
      throw new NetworkError('Invalid RPC response while broadcasting transaction')
    }

    if ('error' in rpcResponse && (rpcResponse as { error?: { message?: string } }).error) {
      const rpcError = (rpcResponse as { error?: { message?: string, code?: number, data?: unknown } }).error
      logger.error('[ETH_TX] Step 7 - RPC error details:', {
        message: rpcError?.message,
        code: rpcError?.code,
        data: rpcError?.data,
      })
      throw new NetworkError(rpcError?.message || 'RPC error while broadcasting transaction')
    }

    const txHash = (rpcResponse as { result?: string }).result
    if (!txHash || typeof txHash !== 'string') {
      throw new NetworkError('RPC response missing transaction hash')
    }

    logger.log('[ETH_TX] Step 8 - Transaction broadcast success:', { txHash })

    const effectiveChainId = tx.chainId ? Number(tx.chainId) : validatedChainIdNumber
    this.refreshPolygonUsdtStateAfterBroadcast({
      txHash,
      rpcUrl,
      chainId: effectiveChainId,
    })

    trackWeb3Request({ requestType: 'sign_transaction', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true, chainId: this.currentChainId })
    return txHash
  }

  private refreshPolygonUsdtStateAfterBroadcast({
    txHash,
    rpcUrl,
    chainId,
  }: {
    txHash: string
    rpcUrl: string
    chainId?: number
  }): void {
    if (chainId !== polygonUsdtConfig.networkId) {
      return
    }

    void (async () => {
      for (let attempt = 0; attempt < 15; attempt++) {
        const receiptResponse = await this.rpcCall({
          rpcUrl,
          payload: {
            jsonrpc: '2.0',
            id: Date.now() + attempt,
            method: 'eth_getTransactionReceipt',
            params: [txHash],
          },
        })
        const receipt = (receiptResponse as { result?: unknown }).result

        if (receipt) {
          const polygonStore = usePolygonUsdt()
          await polygonStore.updateBalance()
          await polygonStore.syncTransactionHistory()
          return
        }

        await sleep(2_000)
      }

      logger.warn('[ETH_TX] Timed out waiting for Polygon receipt, skipping automatic USDT refresh', { txHash })
    })().catch((error) => {
      logger.warn('[ETH_TX] Failed to refresh Polygon USDT state after dApp transaction', {
        txHash,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  private async _handleHostMessage(message: RequestParams) {
    logger.log('[MiniAppHost] Handling host message:', message)
    switch (message.name) {
      case 'setFullscreen': {
        const enabled = (message.params as { enabled?: unknown } | null | undefined)?.enabled
        if (typeof enabled !== 'boolean')
          throw new InvalidRequestError('enabled must be a boolean')
        await this.inAppBrowser!.setFullscreen({ enabled })
        return
      }
      case 'getFullscreen':
        return (await this.inAppBrowser!.getFullscreen()).enabled
      case 'requestDeviceIdentifier':
        return this.requestDeviceIdentifier(message.params)
      default:
        throw new UnknownRequestError(`Unknown host message name: ${message.name}`)
    }
  }

  private async requestDeviceIdentifier(params: unknown): Promise<string> {
    const rawReason = (params as { reason?: unknown } | null | undefined)?.reason
    const reason = typeof rawReason === 'string' ? rawReason.trim() : ''
    if (!reason)
      throw new InternalError('reason is required for requestDeviceIdentifier')

    const trackResult = (approved: boolean, success: boolean) => trackWeb3Request({
      requestType: 'request_device_identifier',
      blockchain: 'host',
      dappUrl: this.config.url,
      dappName: this.config.title,
      approved,
      success,
    })

    const miniApps = useMiniApps()
    if (!miniApps.hasDeviceIdConsent(this.origin)) {
      if (!this.config.requestUserConfirmation)
        throw new InternalError('Confirmation handler not provided')

      const confirmed = await this.config.requestUserConfirmation({
        url: this.config.url,
        name: this.config.title,
        type: 'deviceIdentifier',
        reason,
      })
      if (!confirmed) {
        trackResult(false, false)
        throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
      }
      miniApps.grantDeviceIdConsent(this.origin)
    }

    const id = await deriveAppScopedId(this.origin)
    trackResult(true, true)
    return id
  }

  private async _handleNimiqMessage(message: RequestParams) {
    logger.log('[MiniAppHost] Handling Nimiq message:', message)

    switch (message.name) {
      case 'listAccounts': return this.listAccounts()
      case 'sign': return this.sign(message.params)
      case 'isConsensusEstablished': return this.isConsensusEstablished()
      case 'getBlockNumber': return this.getBlockNumber()
      case 'getBalance': return this.getBalance(message.params)
      case 'sendBasicTransaction': return this.sendBasicTransaction(message.params)
      case 'sendBasicTransactionWithData': return this.sendBasicTransactionWithData(message.params)
      case 'payLightningInvoice': return this.payLightningInvoice(message.params)
      case 'sendNewStakerTransaction': return this.sendNewStakerTransaction(message.params)
      case 'sendStakeTransaction': return this.sendAddStakeTransaction(message.params)
      case 'sendSetActiveStakeTransaction': return this.sendSetActiveStakeTransaction(message.params)
      case 'sendUpdateStakerTransaction': return this.sendUpdateStakerTransaction(message.params)
      case 'sendRetireStakeTransaction': return this.sendRetireStakeTransaction(message.params)
      case 'sendRemoveStakeTransaction': return this.sendRemoveStakeTransaction(message.params)
      default:
        logger.log('[MiniAppHost] Unknown message name:', message.name)
        throw new UnknownRequestError(`Unknown message name: ${message.name}`)
    }
  }

  private isConsensusEstablished() {
    return useNimiqNetwork().consensus === 'established'
  }

  private getBlockNumber() {
    return Math.max(useNimiqNetwork().height, useRemoteSigner().remoteHeight)
  }

  private async getBalance(params: unknown): Promise<number> {
    const rawAddress = (params as { address?: unknown } | null | undefined)?.address
    if (typeof rawAddress !== 'string')
      throw new InvalidRequestError('A valid Nimiq address is required')

    let address: Address
    try {
      address = Nimiq.Address.fromString(rawAddress)
    }
    catch {
      throw new InvalidRequestError('A valid Nimiq address is required')
    }

    const network = useNimiqNetwork()
    if (!network.client || network.consensus !== 'established')
      throw new NetworkError('Nimiq network is not ready')

    const { data, error } = await network.getBalance(address)
    if (error)
      throw new NetworkError(error)
    return data
  }

  private async listAccounts() {
    // Ask user for permission to list accounts
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'accounts',
      network: 'nimiq',
    })
    if (!confirmed) {
      trackWeb3Request({ requestType: 'nimiq_list_accounts', blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    const accounts = [
      useLocalWallet().localAddress.toUserFriendlyAddress(),
      useRemoteSigner().remoteAddress?.toUserFriendlyAddress(),
    ].filter(Boolean)
    trackWeb3Request({ requestType: 'nimiq_list_accounts', blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true })
    return accounts
  }

  private async sign(params: unknown): Promise<SignatureResult> {
    // Parse params
    let message: string
    let isHex = false
    if (Array.isArray(params) && params.length > 0) {
      message = String(params[0])
      // Check if params[1] exists before accessing .isHex
      if (params.length >= 2 && params[1] && typeof params[1] === 'object') {
        isHex = Boolean((params[1] as { isHex?: boolean }).isHex)
      }
    }
    else if (typeof params === 'object' && params !== null) {
      const signParams = params as NimiqSignParams
      message = String(signParams.message ?? '')
      isHex = Boolean(signParams.isHex)
    }
    else {
      throw new InternalError('Invalid parameters for sign method')
    }

    // Ask user for permission to sign the message
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'message',
      data: {
        message,
        isHex,
      },
      network: 'nimiq',
    })
    if (!confirmed) {
      trackWeb3Request({ requestType: 'nimiq_sign', blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    let messageBuffer: Uint8Array
    if (isHex) {
      // Remove 0x prefix if present
      const hex = message.startsWith('0x') ? message.slice(2) : message
      messageBuffer = Nimiq.BufferUtils.fromHex(hex)
    }
    else {
      messageBuffer = new TextEncoder().encode(message)
    }

    const localWallet = useLocalWallet().localWallet
    const prefix = `\x16Nimiq Signed Message:\n${messageBuffer.length}`

    const payload = new Nimiq.SerialBuffer(prefix.length + messageBuffer.length)
    payload.write(Nimiq.BufferUtils.fromUtf8(prefix))
    payload.write(messageBuffer)

    const hash = Nimiq.Hash.computeSha256(payload)
    const signature = localWallet.sign(hash)

    trackWeb3Request({ requestType: 'nimiq_sign', blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true })
    return {
      publicKey: localWallet.publicKey.toHex(),
      signature: signature.toHex(),
    }
  }

  private sendBasicTransaction(params: unknown): Promise<string> {
    // Parse params
    let recipient: string
    let value: number
    let _fee = 0

    if (Array.isArray(params) && params.length >= 2) {
      recipient = String(params[0])
      value = Number(params[1])
      if (params.length >= 3) {
        _fee = Number(params[2])
      }
    }
    else if (typeof params === 'object' && params !== null) {
      const txParams = params as NimiqTransactionParams
      recipient = String(txParams.recipient ?? '')
      value = Number(txParams.value ?? 0)
      if (txParams.fee !== undefined) {
        _fee = Number(txParams.fee)
      }
    }
    else {
      throw new InternalError('Invalid parameters for createBasicTransaction method')
    }

    return this.sendPayment({
      recipient,
      value,
      fee: _fee,
      transfer: Transfer.UserPayment,
      analyticsRequestType: 'nimiq_send_transaction',
    })
  }

  private sendBasicTransactionWithData(params: unknown): Promise<string> {
    // Parse params
    let recipient: string
    let value: number
    let _fee = 0
    let message = ''

    if (Array.isArray(params) && params.length >= 4) {
      recipient = String(params[0])
      value = Number(params[1])
      if (params.length >= 3) {
        _fee = Number(params[2])
      }
      if (params.length >= 4) {
        message = String(params[3])
      }
    }
    else if (typeof params === 'object' && params !== null) {
      const txParams = params as NimiqTransactionParams
      recipient = String(txParams.recipient ?? '')
      value = Number(txParams.value ?? 0)
      if (txParams.fee !== undefined) {
        _fee = Number(txParams.fee)
      }
      message = String(txParams.data ?? '')
    }
    else {
      throw new InternalError('Invalid parameters for createBasicTransaction method')
    }

    return this.sendPayment({
      recipient,
      value,
      fee: _fee,
      transfer: Transfer.UserPayment,
      message,
      analyticsRequestType: 'nimiq_send_transaction',
    })
  }

  private sendNewStakerTransaction(params: unknown): Promise<string> {
    // Parse params
    let delegation: string
    let value: number

    if (Array.isArray(params) && params.length >= 2) {
      delegation = String(params[0])
      value = Number(params[1])
    }
    else if (typeof params === 'object' && params !== null) {
      delegation = String((params as any).delegation)
      value = Number((params as any).value)
    }
    else {
      throw new InternalError('Invalid parameters for createNewStakerTransaction method')
    }

    return this.sendPayment({
      transfer: Transfer.Staking,
      stakingData: { type: 'create-staker', delegation },
      stakingTitle: 'Create Staker',
      value,
      analyticsRequestType: 'nimiq_staking_create_staker',
    })
  }

  private sendAddStakeTransaction(params: unknown): Promise<string> {
    // Parse params
    let value: number

    if (Array.isArray(params) && params.length >= 1) {
      value = Number(params[0])
    }
    else if (typeof params === 'object' && params !== null) {
      value = Number((params as any).value)
    }
    else {
      throw new InternalError('Invalid parameters for createStakeTransaction method')
    }

    return this.sendPayment({
      transfer: Transfer.Staking,
      stakingData: { type: 'add-stake' },
      stakingTitle: 'Add Stake',
      value,
      analyticsRequestType: 'nimiq_staking_add_stake',
    })
  }

  private async sendSetActiveStakeTransaction(params: unknown): Promise<string> {
    // Parse params
    let newActiveBalance: number

    if (Array.isArray(params) && params.length >= 1) {
      newActiveBalance = Number(params[0])
    }
    else if (typeof params === 'object' && params !== null) {
      newActiveBalance = Number((params as any).newActiveBalance)
    }
    else {
      throw new InternalError('Invalid parameters for sendSetActiveStakeTransaction method')
    }

    return this.sendPayment({
      transfer: Transfer.Staking,
      stakingData: { type: 'set-active-stake', newActiveBalance },
      stakingTitle: 'Set Active Stake',
      value: 0,
      analyticsRequestType: 'nimiq_staking_set_active',
    })
  }

  private async sendUpdateStakerTransaction(params: unknown): Promise<string> {
    // Parse params
    let newDelegation: string
    let reactivateAllStake: boolean

    if (Array.isArray(params) && params.length >= 2) {
      newDelegation = String(params[0])
      reactivateAllStake = Boolean(params[1])
    }
    else if (typeof params === 'object' && params !== null) {
      newDelegation = String((params as any).newDelegation)
      reactivateAllStake = Boolean((params as any).reactivateAllStake)
    }
    else {
      throw new InternalError('Invalid parameters for sendUpdateStakerTransaction method')
    }

    return this.sendPayment({
      transfer: Transfer.Staking,
      stakingData: { type: 'update-staker', newDelegation, reactivateAllStake },
      stakingTitle: 'Update Staker',
      value: 0,
      analyticsRequestType: 'nimiq_staking_update',
    })
  }

  private async sendRetireStakeTransaction(params: unknown): Promise<string> {
    // Parse params
    let retireStake: number

    if (Array.isArray(params) && params.length >= 1) {
      retireStake = Number(params[0])
    }
    else if (typeof params === 'object' && params !== null) {
      retireStake = Number((params as any).retireStake)
    }
    else {
      throw new InternalError('Invalid parameters for sendRetireStakeTransaction method')
    }

    return this.sendPayment({
      transfer: Transfer.Staking,
      stakingData: { type: 'retire-stake', retireStake },
      stakingTitle: 'Retire Stake',
      value: 0,
      analyticsRequestType: 'nimiq_staking_retire',
    })
  }

  private async sendRemoveStakeTransaction(params: unknown): Promise<string> {
    // Parse params
    let value: number

    if (Array.isArray(params) && params.length >= 1) {
      value = Number(params[0])
    }
    else if (typeof params === 'object' && params !== null) {
      value = Number((params as any).value)
    }
    else {
      throw new InternalError('Invalid parameters for sendRemoveStakeTransaction method')
    }
    return this.sendPayment({
      transfer: Transfer.Staking,
      stakingData: { type: 'remove-stake' },
      stakingTitle: 'Remove Stake',
      value,
      analyticsRequestType: 'nimiq_staking_remove',
    })
  }

  private async payLightningInvoice(params: unknown): Promise<LightningPaymentResult> {
    // One Mini App request shows up to three sheets; all close when the request times out.
    const deadline = Date.now() + MINI_APP_REQUEST_TIMEOUT_MS
    const invoice = (params as { invoice?: unknown } | null)?.invoice
    if (typeof invoice !== 'string' || !invoice.trim())
      throw new InvalidRequestError('A Bitcoin Lightning invoice is required')
    const requestConfirmation = this.config.requestUserConfirmation
    const selectAsset = this.config.selectLightningAsset
    if (!requestConfirmation || !selectAsset)
      throw new InternalError('Confirmation handler not provided')

    let decoded: Awaited<ReturnType<typeof parseBitcoinLightningInvoice>>
    try {
      decoded = await parseBitcoinLightningInvoice(invoice.trim().replace(/^lightning:/i, ''))
    }
    catch {
      throw new InvalidRequestError('Invalid Bitcoin Lightning invoice')
    }
    const paymentHash = decoded.sections.find(section => section.name === 'payment_hash')?.value
    const timestamp = decoded.sections.find(section => section.name === 'timestamp')?.value
    if (typeof paymentHash !== 'string' || typeof timestamp !== 'number')
      throw new InvalidRequestError('Invalid Bitcoin Lightning invoice')
    const invoiceExpiresAt = timestamp + (decoded.sections.find(section => section.name === 'expiry')?.value ?? 3600)

    const network = isTestnet ? 'testnet' : 'mainnet'
    const owner = useLocalWallet().localAddress.toUserFriendlyAddress()
    const accessScope = `${network}:${owner}`
    // Consent precedes the ledger lookup so invoice probes cannot reveal this wallet's payment history.
    if (this.lightningAccessScope !== accessScope) {
      if (this.lightningAccessRequest?.scope !== accessScope) {
        this.lightningAccessRequest = {
          scope: accessScope,
          promise: requestConfirmation({
            url: this.config.url,
            name: this.config.title,
            type: 'lightning-access',
            network: 'nimiq',
            description: decoded.description || undefined,
          }, deadline),
        }
      }
      let allowed: boolean
      try {
        allowed = await this.lightningAccessRequest.promise
      }
      finally {
        if (this.lightningAccessRequest?.scope === accessScope)
          this.lightningAccessRequest = null
      }
      if (!allowed)
        throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
      if (useLocalWallet().localAddress.toUserFriendlyAddress() !== owner)
        throw new NetworkError('Wallet changed before Lightning payment approval')
      this.lightningAccessScope = accessScope
    }

    const invoiceKey = `${network}:${paymentHash}`
    if (this.pendingLightningInvoices.has(invoiceKey))
      throw new DuplicateLightningPaymentError('This Lightning invoice is already being paid')
    this.pendingLightningInvoices.add(invoiceKey)

    try {
      const { query, run } = useConn()
      const duplicatePaymentError = (attempt: MiniAppLightningAttempt) => new DuplicateLightningPaymentError(
        'This Lightning invoice was already submitted or may still be pending',
        attempt.origin === this.origin && attempt.owner === owner ? { hash: attempt.tx_hash || undefined, swapId: attempt.swap_id } : undefined,
      )
      const existing = await query<MiniAppLightningAttempt | undefined>(
        SQLQuery.GetMiniAppLightningPayment,
        [network, paymentHash],
        { single: true },
      )
      if (useLocalWallet().localAddress.toUserFriendlyAddress() !== owner)
        throw new NetworkError('Wallet changed before Lightning payment approval')
      if (existing)
        throw duplicatePaymentError(existing)
      if (invoiceExpiresAt <= Date.now() / 1e3 + 20)
        throw new InvalidTransactionError('Bitcoin Lightning invoice expired')

      const asset = await selectAsset({ url: this.config.url, name: this.config.title, description: decoded.description || undefined }, deadline)
      if (!asset)
        throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
      if (asset !== Asset.NIM && asset !== Asset.USDT)
        throw new InvalidRequestError('Unsupported payment asset')
      if (useLocalWallet().localAddress.toUserFriendlyAddress() !== owner)
        throw new NetworkError('Wallet changed before Lightning payment approval')

      const { useStringParser } = await import('./useStringParser')
      const { data: payment, error } = await useStringParser().getPaymentRequestData(decoded.paymentRequest, asset)
      if (error || !payment || payment.transfer !== Transfer.UserPaymentToAtomicSwap || payment.asset !== asset || !payment.paymentRef || payment.invoiced?.currency !== 'BTC')
        throw new InvalidTransactionError(error || `Could not prepare a ${asset} to Bitcoin Lightning swap`)
      const description = decoded.description || payment.message

      const { getSwap } = await useFastspotApiV2()
      const quote = await getSwap(payment.paymentRef)
      if (quote.status !== 'PENDING_CONFIRMATION' || quote.expiry <= Date.now() / 1e3 + 20 || quote.sell.amount !== payment.amount)
        throw new InvalidTransactionError('The Lightning swap quote expired; request a new invoice')

      if (useLocalWallet().localAddress.toUserFriendlyAddress() !== owner)
        throw new NetworkError('Wallet changed before Lightning payment approval')
      const signer = asset === Asset.NIM ? useRemoteSigner() : undefined
      const context = signer?.getWalletContext()
      const polygon = asset === Asset.USDT ? usePolygonUsdt() : undefined
      const ethAddress = asset === Asset.USDT ? useLocalWallet().getEthAddress().data : undefined
      if (polygon)
        await polygon.updateBalance()
      if (asset === Asset.NIM && (!context || !signer?.remoteAddress || !signer.isHtlcActive || !signer.isRemoteOk))
        throw new NetworkError('NIM wallet is not ready')
      if (asset === Asset.NIM && signer!.remoteBalance < payment.amount)
        throw new InvalidTransactionError('Insufficient NIM balance')
      if (asset === Asset.USDT && (!ethAddress || polygon?.consensus !== 'established'))
        throw new NetworkError('USDT wallet is not ready')
      if (asset === Asset.USDT && useFeatureFlags().isUsdtMaintenanceActive)
        throw new NetworkError(useFeatureFlags().usdtMaintenanceNotice)
      let usdtFeeAllowance = 0
      if (polygon) {
        const feeSnapshot = await polygon.primeHtlcFee()
        const quotedFee = payment.swap?.fees.filter(fee => !fee.included && fee.asset === Asset.USDT).reduce((sum, fee) => sum + fee.amount, 0) ?? 0
        usdtFeeAllowance = Math.max(feeSnapshot.fee, quotedFee)
        if (polygon.balance < payment.amount + usdtFeeAllowance)
          throw new InvalidTransactionError('Insufficient USDT balance for payment and fee')
      }

      const { getLimits, SwapAsset } = await useFastspotApiV1()
      const localAddress = useLocalWallet().localAddress
      const limits = asset === Asset.USDT
        ? await getLimits(SwapAsset.USDT_MATIC, ethAddress!, ethAddress!)
        : await getLimits(SwapAsset.NIM, localAddress.toUserFriendlyAddress(), localAddress.toHex())
      if (payment.amount > Math.floor(limits.current * 0.99))
        throw new InvalidTransactionError('Lightning swap exceeds the current limit')

      const confirmed = await requestConfirmation({
        url: this.config.url,
        name: this.config.title,
        type: 'lightning-payment',
        network: 'nimiq',
        data: {
          description,
          btcAmount: payment.invoiced.amount,
          asset,
          amount: payment.amount,
          usdtFeeAllowance,
          fees: payment.swap?.fees || [],
        },
      }, deadline)
      if (!confirmed)
        throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)

      if (asset === Asset.NIM && !signer!.isWalletContextCurrent(context!))
        throw new NetworkError('Wallet or network changed before sending')
      if (asset === Asset.USDT && useLocalWallet().getEthAddress().data !== ethAddress)
        throw new NetworkError('Wallet changed before sending')
      if (invoiceExpiresAt <= Date.now() / 1e3 + 20)
        throw new InvalidTransactionError('Bitcoin Lightning invoice expired')
      const currentQuote = await getSwap(payment.paymentRef)
      if (currentQuote.status !== 'PENDING_CONFIRMATION' || currentQuote.expiry <= Date.now() / 1e3 + 20 || currentQuote.sell.amount !== payment.amount)
        throw new InvalidTransactionError('The Lightning swap quote expired; request a new invoice')
      if (asset === Asset.NIM && signer!.remoteBalance < payment.amount)
        throw new InvalidTransactionError('Insufficient NIM balance')
      if (asset === Asset.USDT && polygon!.balance < payment.amount + usdtFeeAllowance)
        throw new InvalidTransactionError('Insufficient USDT balance for payment and fee')
      if (asset === Asset.NIM && !signer!.isWalletContextCurrent(context!))
        throw new NetworkError('Wallet or network changed before sending')
      if (asset === Asset.USDT && useLocalWallet().getEthAddress().data !== ethAddress)
        throw new NetworkError('Wallet changed before sending')

      try {
        await run(SQLQuery.InsertMiniAppLightningPayment, [network, paymentHash, this.origin, owner, payment.paymentRef])
      }
      catch {
        const duplicate = await query<MiniAppLightningAttempt | undefined>(
          SQLQuery.GetMiniAppLightningPayment,
          [network, paymentHash],
          { single: true },
        )
        if (duplicate)
          throw duplicatePaymentError(duplicate)
        throw new InternalError('Could not save Lightning payment attempt')
      }
      if (asset === Asset.USDT && useLocalWallet().getEthAddress().data !== ethAddress) {
        await run(SQLQuery.DeleteMiniAppLightningPayment, [network, paymentHash])
        await run(SQLQuery.DeleteSwapQuote, [payment.paymentRef]).catch(error => logger.error('Could not clear abandoned Mini App Lightning quote', error))
        throw new NetworkError('Wallet changed before sending')
      }

      const swapId = payment.paymentRef
      return await new Promise<LightningPaymentResult>((resolve, reject) => {
        let settled = false
        const finish = (result: LightningPaymentResult | MiniAppError) => {
          if (settled)
            return
          settled = true
          if (result instanceof MiniAppError)
            reject(result)
          else
            resolve(result)
        }
        const markSubmitted = async (hash: string) => {
          try {
            await run(SQLQuery.SetMiniAppLightningPaymentStatus, [hash, 'submitted', network, paymentHash])
            finish({ hash, swapId })
          }
          catch (error) {
            logger.error('Could not save submitted Mini App Lightning payment', error)
            finish(new TransactionOutcomeUnknownError(`${asset} was submitted, but its payment record could not be updated. Do not retry this invoice.`, { hash, swapId }))
          }
        }
        const markFundingUncertain = async (hash: string) => {
          try {
            await run(SQLQuery.SetMiniAppLightningPaymentStatus, [hash, 'unknown', network, paymentHash])
          }
          catch (error) {
            logger.error('Could not save uncertain Mini App Lightning payment', error)
          }
          finish(new TransactionOutcomeUnknownError('Lightning payment outcome is unknown. Do not retry this invoice.', { hash, swapId }))
        }
        const outgoingPayment = {
          ...payment,
          transfer: Transfer.UserPaymentToAtomicSwap as const,
          message: description,
          merchantName: this.config.title,
          railMerchantId: this.config.url,
        }
        if (asset === Asset.USDT) {
          void polygon!.sendSwapPayment(outgoingPayment, 'Payment', { onSubmitted: markSubmitted, onFundingUncertain: markFundingUncertain, expectedSender: ethAddress, maxFee: usdtFeeAllowance }).then(async ({ data, error, rejected }) => {
            if (settled)
              return
            if (error || !data) {
              if (rejected) {
                try {
                  await run(SQLQuery.DeleteMiniAppLightningPayment, [network, paymentHash])
                  await run(SQLQuery.DeleteSwapQuote, [swapId])
                }
                catch (cleanupError) {
                  logger.error('Could not clear rejected Mini App Lightning payment', cleanupError)
                }
                finish(new InvalidTransactionError(error || 'Polygon Lightning payment rejected'))
              }
              else {
                finish(new TransactionOutcomeUnknownError(error || 'Lightning payment outcome is unknown. Do not retry this invoice.', { swapId }))
              }
              return
            }
            await markSubmitted(data.tx.hash)
          }).catch((error) => {
            logger.error('Mini App USDT Lightning payment send failed unexpectedly', error)
            finish(new TransactionOutcomeUnknownError('Lightning payment outcome is unknown. Do not retry this invoice.', { swapId }))
          })
          return
        }
        void useTransactions().sendTx({ ...outgoingPayment, title: 'Payment' } as PartialSendTxArgs, context, markSubmitted).then(async (result) => {
          if (settled)
            return
          if (result.outcome === 'rejected') {
            try {
              await run(SQLQuery.DeleteSwapQuote, [swapId])
              await run(SQLQuery.DeleteMiniAppLightningPayment, [network, paymentHash])
            }
            catch (error) {
              logger.error('Could not clear rejected Mini App Lightning payment', error)
            }
            finish(new InvalidTransactionError(result.error))
          }
          else if (result.outcome === 'unknown') {
            await run(SQLQuery.SetMiniAppLightningPaymentStatus, [result.stagedHash, 'unknown', network, paymentHash]).catch(error => logger.error('Could not save uncertain Mini App Lightning payment', error))
            finish(new TransactionOutcomeUnknownError(result.error, { hash: result.stagedHash, swapId }))
          }
          else {
            await markSubmitted(result.tx.hash)
          }
        }).catch((error) => {
          logger.error('Mini App Lightning payment send failed unexpectedly', error)
          finish(new TransactionOutcomeUnknownError('Lightning payment outcome is unknown. Do not retry this invoice.', { swapId }))
        })
      })
    }
    finally {
      this.pendingLightningInvoices.delete(invoiceKey)
    }
  }

  private async sendPayment(txData: {
    value: number
    fee?: number
    message?: string
    analyticsRequestType: Web3RequestType
  } & ({
    transfer: Transfer.UserPayment
    recipient: string
  } | {
    transfer: Transfer.Staking
    stakingTitle: PartialStakingTxArgs['title']
    stakingData: StakingData
  })): Promise<string> {
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    // Everything but remove-stake spends from the HTLC; fail before prompting instead of after the user confirms
    const spendsFromRemote = !(txData.transfer === Transfer.Staking && txData.stakingData.type === 'remove-stake')
    const remoteSigner = useRemoteSigner()
    if (spendsFromRemote && !remoteSigner.remoteAddress) {
      // A synced, never-funded wallet has no HTLC yet; only a wallet still syncing is a sync problem.
      // Local funds mean the first HTLC is being created, so that stays a sync error.
      if (remoteSigner.homeBalanceState === 'resolved-empty' && useLocalWallet().localBalance === 0)
        throw new InvalidTransactionError(i18n.t('Insufficient funds'))
      throw new NetworkError(i18n.t('Something went wrong syncing your account'))
    }

    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'transaction',
      data: {
        recipient: txData.transfer === Transfer.Staking
          ? txData.stakingData.type === 'remove-stake'
            // For remove-stake, the recipient is the user's own address
            ? useLocalWallet().localAddress.toUserFriendlyAddress()
            : STAKING_CONTRACT_ADDRESS
          : txData.recipient,
        recipientType: txData.transfer === Transfer.Staking
          ? txData.stakingData.type === 'remove-stake'
            // For remove-stake transactions, the recipient is the user's local address, which is a basic account
            ? Nimiq.AccountType.Basic
            : Nimiq.AccountType.Staking
          : Nimiq.AccountType.Basic,
        amount: txData.value,
        fee: txData.fee ?? 0,
        message: txData.message,
        rail: Rail.MiniApp,
        railMerchantId: this.config.url,
        merchantName: this.config.title,
      },
      stakingData: 'stakingData' in txData ? txData.stakingData : undefined,
      network: 'nimiq',
    })
    if (!confirmed) {
      trackWeb3Request({ requestType: txData.analyticsRequestType, blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    let partialTx: PartialSendTxArgs
    if (txData.transfer === Transfer.UserPayment) {
      partialTx = {
        recipient: txData.recipient,
        amount: txData.value,
        title: 'Payment',
        transfer: txData.transfer,
        fee: txData.fee ?? 0,
        message: txData.message,
        rail: Rail.MiniApp,
        railMerchantId: this.config.url,
        merchantName: this.config.title,
      } satisfies PartialUserTxArgs
    }
    else if (txData.transfer === Transfer.Staking) {
      partialTx = {
        amount: txData.value,
        title: txData.stakingTitle,
        transfer: txData.transfer,
        rail: Rail.MiniApp,
        railMerchantId: this.config.url,
        merchantName: this.config.title,
        stakingData: txData.stakingData!,
      } satisfies PartialStakingTxArgs
    }
    else {
      throw new InternalError('Invalid transfer type')
    }

    const result = await useTransactions().sendTx(partialTx)
    trackWeb3Request({ requestType: txData.analyticsRequestType, blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: result.outcome === 'submitted' })
    if (result.outcome === 'rejected')
      throw new InternalError(`Failed to send payment transaction: ${result.error}`)
    if (result.outcome === 'unknown') {
      logger.log('[MiniAppHost] Transaction outcome unknown', { stagedHash: result.stagedHash })
      throw new TransactionOutcomeUnknownError(TRANSACTION_OUTCOME_UNKNOWN_MESSAGE, { hash: result.stagedHash })
    }
    return result.tx.hash
  }

  // private async signTransaction(txData: RequestType['signTransaction']): Promise<ResponseType['signTransaction']> {
  //   let tx: Transaction;
  //   try {
  //     tx = typeof txData === 'string' ? Nimiq.Transaction.fromAny(txData) : parseTransactionData(txData);
  //   } catch (error) {
  //     throw new InvalidTransactionError(`Failed to parse transaction: ${(error as Error).message}`);
  //   }

  //   if (!this.config.requestUserConfirmation) {
  //     throw new InternalError('Confirmation handler not provided');
  //   }

  //   const confirmed = await this.config.requestUserConfirmation({
  //     type: 'transaction',
  //     plain: tx.toPlain(),
  //   });
  //   if (!confirmed) {
  //     throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE);
  //   }

  //   // Handle claiming transactions
  //   if (tx.recipient.equals(useLocalWallet().localAddress)) {
  //     tx.sign(Nimiq.KeyPair.derive(useLocalWallet().localWallet.privateKey))
  //     return {
  //       serialized: tx.toHex(),
  //       plain: tx.toPlain(),
  //     };
  //   }

  //   // Handle sending transactions
  //   const remoteAddress = useRemoteSigner().remoteAddress;
  //   if (remoteAddress && tx.sender.equals(remoteAddress)) {
  //     tx.proof = createResolveProof({ tx,  mode: 'early' });
  //     const res = await getSignedTxByRemote(tx)
  //     if (res.error) {
  //       throw new InternalError(`Failed to sign transaction by cosigner: ${res.error}`);
  //     }
  //     const signedTx = res.data!.newTx;
  //     return {
  //       serialized: signedTx.toHex(),
  //       plain: signedTx.toPlain(),
  //     };
  //   }

  //   throw new PermissionDeniedError('Neither the sender nor recipient match any available account');
  // }
}

/** Base class for MiniApp errors with typed error codes */
abstract class MiniAppError extends Error {
  abstract readonly type: string
  readonly data?: { hash?: string, swapId?: string }
}

class UnknownRequestError extends MiniAppError {
  readonly type = 'UNKNOWN_REQUEST'
}

class InternalError extends MiniAppError {
  readonly type = 'INTERNAL_ERROR'
}

class InvalidRequestError extends MiniAppError {
  readonly type = 'INVALID_REQUEST'
}

export class PermissionDeniedError extends MiniAppError {
  readonly type = 'PERMISSION_DENIED'
}

class TransactionOutcomeUnknownError extends MiniAppError {
  readonly type = 'TRANSACTION_OUTCOME_UNKNOWN'

  constructor(message: string, readonly data?: { hash?: string, swapId?: string }) {
    super(message)
  }
}

class DuplicateLightningPaymentError extends MiniAppError {
  readonly type = 'DUPLICATE_PAYMENT'

  constructor(message: string, readonly data?: { hash?: string, swapId?: string }) {
    super(message)
  }
}

export class NetworkError extends MiniAppError {
  readonly type = 'NETWORK_ERROR'
}

export class InvalidTransactionError extends MiniAppError {
  readonly type = 'INVALID_TRANSACTION'
}

// function parseTransactionData(txData: TransactionData): Transaction {
//   const { height, networkId } = storeToRefs(useNimiqNetwork())

//   if (txData.direction === 'send' && txData.recipient === useLocalWallet().localAddress.toUserFriendlyAddress()) {
//     throw new Error('Cannot send transaction to own local address');
//   }
//   if (txData.direction === 'claim' && txData.sender === useRemoteSigner().remoteAddress!.toUserFriendlyAddress()) {
//     throw new Error('Cannot claim transaction from own sender address');
//   }

//   return Nimiq.Transaction.fromPlain(txData.direction === 'send' ? {
//     sender: useRemoteSigner().remoteAddress!.toUserFriendlyAddress(),
//     senderType: 'htlc',
//     recipient: txData.recipient,
//     recipientType: txData.recipientType || 'basic',
//     value: txData.value,
//     fee: txData.fee || 0,
//     validityStartHeight: height.value,
//     network: networkId.value === 24 ? 'main-albatross' : networkId.value === 5 ? 'test-albatross' : 'invalid',
//     flags: txData.flags || 0,
//     data: txData.data || { type: 'raw', raw: '' },

//     // Required fields without effect in `fromPlain()`
//     transactionHash: '',
//     format: "basic",
//     feePerByte: 0,
//     proof: { type: 'raw', raw: '' },
//     size: 0,
//     valid: true,
//   } : {
//     sender: txData.sender,
//     senderType: txData.senderType,
//     recipient: useLocalWallet().localAddress.toUserFriendlyAddress(),
//     recipientType: 'basic',
//     value: txData.value,
//     fee: txData.fee || 0,
//     validityStartHeight: height.value,
//     network: networkId.value === 24 ? 'main-albatross' : networkId.value === 5 ? 'test-albatross' : 'invalid',
//     flags: 0,
//     ...(txData.senderData ? { senderData: txData.senderData as PlainTransactionSenderData} : {}),
//     data: txData.data || { type: 'raw', raw: '' },

//     // Required fields without effect in `fromPlain()`
//     transactionHash: '',
//     format: "basic",
//     feePerByte: 0,
//     proof: { type: 'raw', raw: '' },
//     size: 0,
//     valid: true,
//   });
// }
