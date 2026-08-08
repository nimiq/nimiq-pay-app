import type { PluginListenerHandle } from '@capacitor/core'
import type { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import type { Address, SignatureProof } from '@nimiq/core'
import type { BirpcReturn } from 'birpc'
import type { ChainApprovalRequest, NativeFunctions, RequestParams, WebviewFunctions } from '../../web3-provider/src/birpc-types'
import type { Web3RequestType } from '@/lib/analytics'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { HtlcData, PartialHtlcTxArgs, PartialSendTxArgs, PartialStakingTxArgs, PartialUserTxArgs, StakingData } from '@/types/transactions'
import { Toast } from '@capacitor/toast'
import { createBirpc } from 'birpc'
import { getAddress, Interface } from 'ethers'
import { ref, watch } from 'vue'
import { i18n } from '@/i18n/i18n-setup'
import { trackChainSwitched, trackWeb3Request } from '@/lib/analytics'
import { formatUsdtAmount } from '@/lib/assets'
import { deriveAppScopedId } from '@/lib/device-identifier'
import { hexToBytes } from '@/lib/ethereum/hex-utils'
import { addressesEqual, isValidEthAddress, parseChainId } from '@/lib/ethereum/validation'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { sleep } from '@/lib/utils'
import { useLocalWallet } from '@/stores/local-wallet'
import { useMiniApps } from '@/stores/mini-apps'
import { STAKING_CONTRACT_ADDRESS, useNimiqNetwork } from '@/stores/nimiq-network'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import { isOwnRemoteHtlcShape, Rail, Transfer } from '@/types/transactions'
import { ALLOWED_EVM_CHAIN_IDS, EVM_CHAIN_NAMES } from '../../web3-provider/src/allowedChains'
import {
  TRANSACTION_OUTCOME_UNKNOWN_CODE,
  TRANSACTION_OUTCOME_UNKNOWN_MESSAGE,
  USER_REJECTED_REQUEST_CODE,
  USER_REJECTED_REQUEST_MESSAGE,
} from '../../web3-provider/src/provider-errors'
import { generateUUID } from '../../web3-provider/src/utils'
import { useLogger } from './useLogger'

const logger = useLogger('MiniAppHost')
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

export type UserConfirmationRequest
  = | (MiniAppBase & { type: 'accounts', network: Network })
    | (MiniAppBase & {
      type: 'transaction'
      network: Network
      data: Omit<PaymentRequestData, 'transfer'>
      stakingData?: StakingData
      htlcData?: HtlcData
      /** Source contract of an HTLC redeem — the account the funds leave, which `data.recipient` never names. */
      htlcContractAddress?: string
      /** Only meaningful for `sign-early`, whose signature is bound to this exact height. */
      htlcValidityStartHeight?: number
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
      /** Mini App supplied human-readable explanation. Shown verbatim in the prompt. */
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
   * If not provided, the RPC URL can be passed per-transaction via txParams.rpcUrl.
   */
  evmRpcUrls?: Record<string, string>

  /**
   * Callback to request user confirmation for sensitive operations
   * @param request - Confirmation request to show to the user
   * @returns Promise that resolves to true if user confirms, false otherwise
   */
  requestUserConfirmation?: (request: UserConfirmationRequest) => Promise<boolean>
}

/** Wire id and hash-root length of every hash algorithm the HTLC methods accept. */
const HTLC_HASH_ALGORITHMS: Record<string, { id: number, rootLength: number }> = {
  blake2b: { id: 1, rootLength: 32 },
  sha256: { id: 3, rootLength: 32 },
  sha512: { id: 4, rootLength: 64 },
}

/**
 * Resolves the hash algorithm's wire id and validates what the fixed-layout HTLC buffers in
 * `lib/tx.ts` cannot defend themselves against. Those buffers are written field by field, so a
 * hash root of the wrong length does not fail — it shifts `hashCount` and `timeout` and still
 * deserialises, creating a contract whose timeout is nothing like the one the sheet showed. A
 * `hashCount` outside 1-255 is silently truncated mod 256 by `writeUint8` for the same reason.
 *
 * `preImage` is only passed on a redeem. In Nimiq's `PreImage` encoding its length byte *is* the
 * type discriminant, so the only valid lengths are the algorithm's own root length; anything past
 * 255 bytes would additionally truncate that byte and leave the proof misdescribing itself.
 */
function parseHtlcHashAlgorithm(algorithm: unknown, hashRoot: Uint8Array, hashCount: number, preImage?: Uint8Array): number {
  // `hasOwn`, not a bare index: 'constructor' and 'toString' would otherwise resolve to inherited
  // members and be reported as a root-length problem instead of an invalid algorithm.
  const algo = typeof algorithm === 'string' && Object.hasOwn(HTLC_HASH_ALGORITHMS, algorithm)
    ? HTLC_HASH_ALGORITHMS[algorithm]
    : undefined
  if (!algo)
    throw new InvalidTransactionError('Invalid hash algorithm')
  if (hashRoot.length !== algo.rootLength)
    throw new InvalidTransactionError(`Invalid hash root: ${algorithm} requires a ${algo.rootLength}-byte root, got ${hashRoot.length} bytes`)
  if (!Number.isInteger(hashCount) || hashCount < 1 || hashCount > 255)
    throw new InvalidTransactionError(`Invalid hash count: must be an integer between 1 and 255, got ${hashCount}`)
  if (preImage && preImage.length !== algo.rootLength)
    throw new InvalidTransactionError(`Invalid pre-image: ${algorithm} requires a ${algo.rootLength}-byte pre-image, got ${preImage.length} bytes`)
  return algo.id
}

/**
 * MiniAppHost - SDK for the host native app that runs Mini Apps in InAppBrowser
 * Provides typed communication with Mini Apps and handles permissions, signing, transactions
 */
export class MiniAppHost {
  private inAppBrowser: typeof InAppBrowser | null
  private config: MiniAppHostConfig
  private destroyed = false
  private birpc: BirpcReturn<WebviewFunctions, NativeFunctions> | null = null
  private messageFromWebviewListener: PluginListenerHandle | null = null
  /** Current chain ID as set by the webview provider (hex string, e.g., '0x1') */
  private currentChainId: string = '0x1' // Default to Ethereum mainnet
  private ethAccountsPermission: EthAccountsPermission | null = null
  /** Stops the remote-signer watcher registered in the constructor. */
  private stopRemoteAddressWatcher: (() => void) | null = null
  /** The session object this host registered; destroy() only clears module state it still owns. */
  private sessionState: MiniAppSessionState | null = null
  /** Lower-cased origin of `config.url`; used as the consent + ID scope. */
  private readonly origin: string

  /** Resolve the RPC URL for the given chain (or current chain if not specified) */
  private getRpcUrlForChain(chainId?: string): string | undefined {
    const chain = chainId || this.currentChainId
    return this.config.evmRpcUrls?.[chain]
  }

  constructor(inAppBrowser: typeof InAppBrowser, config: MiniAppHostConfig) {
    this.inAppBrowser = inAppBrowser
    this.config = config
    this.origin = new URL(config.url).origin.toLowerCase()
    this.setupBirpc()

    // Track the active session at module level
    _activeMiniAppSession = {
      url: config.url,
      title: config.title,
      chainId: this.currentChainId,
      evmRpcUrls: config.evmRpcUrls,
    }
    this.sessionState = _activeMiniAppSession
    isMiniAppActive.value = true

    // When the remote signer address changes (added/refreshed mid-session), the
    // previously-cached Nimiq accounts list is stale. Clear the webview cache so
    // the dApp re-prompts and receives the up-to-date account set.
    this.stopRemoteAddressWatcher = watch(
      () => useRemoteSigner().remoteAddress,
      (newAddress, oldAddress) => {
        if (newAddress === oldAddress)
          return
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
    if (_activeMiniAppSession) {
      _activeMiniAppSession.chainId = restoredChainId
    }
    return host
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) {
      return
    }
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
    await this.inAppBrowser?.clearAllCookies()
    await this.messageFromWebviewListener?.remove()
    this.messageFromWebviewListener = null
    this.birpc?.$close()
    this.birpc = null
    this.inAppBrowser = null
    this.destroyed = true
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
          if (error instanceof MiniAppError) {
            // Show toast for user-actionable errors (skip permission denied - user already knows)
            if (!(error instanceof PermissionDeniedError) && !(error instanceof UnknownRequestError)) {
              this.showErrorToast(error.message)
            }
            // Add the Nimiq type while preserving RPC fields used by older SDKs.
            throw this.createRpcError(this.errorCode(error), error.message, params.network === 'nimiq' ? error.type : undefined)
          }
          const message = `An unknown error occurred: ${(error as Error).message}`
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
        const confirmed = await this.config.requestUserConfirmation({
          url: this.config.url,
          name: this.config.title,
          type: 'chain',
          data: {
            ...request,
            chainName,
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

        return confirmed
      },
      onUnsupportedChain: (chainId: string): void => {
        logger.log('[MiniAppHost] Unsupported chain requested:', chainId)
        this.showErrorToast(i18n.t('This network is not supported by Nimiq Pay'))
        trackWeb3Request({ requestType: 'switch_chain', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false, chainId })
      },
      onChainAdded: (chainId: string, rpcUrl: string): void => {
        logger.log('[MiniAppHost] Chain added:', chainId, 'RPC:', rpcUrl)
        if (!this.config.evmRpcUrls) {
          this.config.evmRpcUrls = {}
        }
        this.config.evmRpcUrls[chainId] = rpcUrl
        if (_activeMiniAppSession) {
          if (!_activeMiniAppSession.evmRpcUrls) {
            _activeMiniAppSession.evmRpcUrls = {}
          }
          _activeMiniAppSession.evmRpcUrls[chainId] = rpcUrl
        }
        trackWeb3Request({ requestType: 'add_chain', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true, chainId })
      },
      onChainChanged: (chainId: string): void => {
        const previousChainId = this.currentChainId
        this.currentChainId = chainId
        if (_activeMiniAppSession) {
          _activeMiniAppSession.chainId = this.currentChainId
        }
        logger.log('[MiniAppHost] Chain changed to:', this.currentChainId)
        trackChainSwitched(this.config.url, previousChainId, chainId)
        trackWeb3Request({ requestType: 'switch_chain', blockchain: 'ethereum', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true, chainId })

        // Update the webview's RPC URL to match the new chain
        const newRpcUrl = this.getRpcUrlForChain(chainId)
        if (newRpcUrl) {
          this.birpc?.updateRpcUrl(newRpcUrl)
        }

        const numericChainId = parseChainId(chainId)
        const chainName = numericChainId ? EVM_CHAIN_NAMES[numericChainId] : `Chain ${numericChainId}`
        Toast.show({
          text: i18n.t('Switched to {chain}', { chain: chainName }),
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
          this.messageFromWebviewListener = handle
        })
      },
      // Fire-and-forget host→webview methods. Without this birpc treats them as
      // request/response and the discarded promises would reject with a 120s
      // timeout if the webview disappears mid-flight (unhandledrejection).
      eventNames: ['updateRpcUrl', 'clearAccountCache'],
      timeout: 120_000,
    })
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
    if (error instanceof InvalidTransactionError)
      return -32602
    if (error instanceof TransactionOutcomeUnknownError)
      return TRANSACTION_OUTCOME_UNKNOWN_CODE
    if (error instanceof NetworkError)
      return -32000
    return -32603 // InternalError / default
  }

  // Plain object — Error objects don't serialize correctly over birpc
  private createRpcError(code: number, message: string, type?: string): { code: number, message: string, type?: string } {
    return { code, message, ...(type ? { type } : {}) }
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
      throw new PermissionDeniedError(`Address mismatch: requested ${address}, but wallet address is ${ethWallet.address}`)
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
      throw new PermissionDeniedError(`Address mismatch: requested ${address}, but wallet address is ${ethWallet.address}`)
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
      rpcUrl?: string
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
      rpcUrl: txParams.rpcUrl,
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

    // Get Ethereum wallet to verify address
    const { data: ethWallet, error } = useLocalWallet().getEthWallet()
    if (error || !ethWallet) {
      throw new InternalError(`Failed to get Ethereum wallet: ${error || 'wallet not available'}`)
    }

    // Verify the from address matches the wallet using EIP-55 safe comparison
    if (!addressesEqual(ethWallet.address, txParams.from)) {
      throw new PermissionDeniedError(
        `Address mismatch: requested ${txParams.from}, but wallet address is ${ethWallet.address}`,
      )
    }

    const currentChainNumber = parseChainId(this.currentChainId)
    let validatedChainIdNumber: number | undefined
    if (txParams.chainId) {
      const txChainIdNumber = parseChainId(txParams.chainId)
      if (!txChainIdNumber) {
        throw new InvalidTransactionError('Invalid chainId for Ethereum transaction')
      }
      if (!this.isAllowedChain(txChainIdNumber)) {
        throw new InvalidTransactionError(`Unsupported chainId for Ethereum transaction: ${txChainIdNumber}`)
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
    const rpcUrl = txParams.rpcUrl || this.getRpcUrlForChain()

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
      case 'sendBasicTransaction': return this.sendBasicTransaction(message.params)
      case 'sendBasicTransactionWithData': return this.sendBasicTransactionWithData(message.params)
      case 'sendNewStakerTransaction': return this.sendNewStakerTransaction(message.params)
      case 'sendStakeTransaction': return this.sendAddStakeTransaction(message.params)
      case 'sendSetActiveStakeTransaction': return this.sendSetActiveStakeTransaction(message.params)
      case 'sendUpdateStakerTransaction': return this.sendUpdateStakerTransaction(message.params)
      case 'sendRetireStakeTransaction': return this.sendRetireStakeTransaction(message.params)
      case 'sendRemoveStakeTransaction': return this.sendRemoveStakeTransaction(message.params)
      case 'sendNewHtlcTransaction': return this.sendNewHtlcTransaction(message.params)
      case 'sendRedeemRegularHtlcTransaction': return this.sendRedeemRegularHtlcTransaction(message.params)
      case 'sendRedeemTimeoutHtlcTransaction': return this.sendRedeemTimeoutHtlcTransaction(message.params)
      case 'sendRedeemEarlyHtlcTransaction': return this.sendRedeemEarlyHtlcTransaction(message.params)
      case 'signRedeemEarlyHtlcTransaction': return this.signRedeemEarlyHtlcTransaction(message.params)
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

  /**
   * A Mini App must never be able to spend one of *our own* custody HTLCs. Our local wallet is
   * their HTLC-sender, so once the 14-day timeout has passed a timeout-resolve needs nothing but
   * our own signature — and `listAccounts` hands the contract address straight to the Mini App.
   *
   * Both checks are needed: the `remote_signers` table can be incomplete (that is why
   * `registerOwnHtlcIfMissing` exists), and the on-chain shape catches contracts it has not learnt
   * about yet. A shape we cannot read is refused as *unverifiable*, never waved through as
   * foreign — the same distinction `registerOwnHtlcIfMissing` draws between 'unknown' and
   * 'foreign', and for the same reason: a light client whose history is not ready yet answers a
   * shape query with nothing at all, which would otherwise be a bypass.
   *
   * Only a contract established as ours is a `PermissionDeniedError`; that genuinely is a refusal
   * and shares code 4001 with the user tapping Reject. Unverifiable is a `NetworkError`, so the
   * Mini App cannot mistake it for a cancellation and the user gets a toast saying why.
   */
  private async assertNotOwnHtlc(contractAddress: Address): Promise<void> {
    const address = contractAddress.toUserFriendlyAddress()
    const ownContract = `Refusing to spend ${address}: it is one of your own Nimiq Pay contracts`
    const unverifiable = `Cannot verify the owner of ${address}. Try again once Nimiq Pay is in sync.`

    if (await useRemoteSigner().isOurRemoteSigner(address))
      throw new PermissionDeniedError(ownContract)

    const remotePublicKey = useRemoteSigner().remotePublicKey
    if (!remotePublicKey)
      throw new NetworkError(unverifiable)
    let cosignerAddress: string
    try {
      // A key we cannot parse is as unverifiable as the missing one handled just above, so it takes
      // the same exit. Letting `fromHex` throw would surface as -32603 instead, which a Mini App
      // cannot tell apart from the host crashing.
      cosignerAddress = Nimiq.PublicKey.fromHex(remotePublicKey).toAddress().toUserFriendlyAddress()
    }
    catch (error) {
      logger.error('⚠️ Cosigner public key is not valid hex — refusing the redeem as unverifiable', { address, publicKeyLength: remotePublicKey.length, error })
      throw new NetworkError(unverifiable)
    }

    const { data: account } = await useNimiqNetwork().getAccount(contractAddress)
    if (!account)
      throw new NetworkError(unverifiable)

    // A live contract is readable as an account; a fully drained one is pruned and survives only
    // as its creation transaction.
    let shape: Parameters<typeof isOwnRemoteHtlcShape>[0] | undefined
    if (account.type === 'htlc') {
      shape = account
    }
    else {
      try {
        shape = await useNimiqNetwork().getHtlcCreationData(contractAddress)
      }
      catch (error) {
        logger.error('Could not read HTLC contract shape — refusing the redeem', { address, error })
        throw new NetworkError(unverifiable)
      }
    }
    if (!shape) {
      logger.error('HTLC contract shape came back empty — refusing the redeem', { address, accountType: account.type })
      throw new NetworkError(unverifiable)
    }

    if (isOwnRemoteHtlcShape(shape, { localAddress: useLocalWallet().localAddress.toUserFriendlyAddress(), cosignerAddress }))
      throw new PermissionDeniedError(ownContract)
  }

  private async sendNewHtlcTransaction(params: unknown): Promise<string> {
    // Parse params
    let htlcSender: Address
    let htlcRecipient: Address
    let hashRoot: Uint8Array
    let hashCount: number
    let hashAlgorithm: number
    let timeout: number
    let value: number

    if (Array.isArray(params) && params.length >= 7) {
      htlcSender = params[0] ? Nimiq.Address.fromString(params[0]) : useLocalWallet().localAddress
      htlcRecipient = Nimiq.Address.fromString(params[1])
      hashRoot = Nimiq.BufferUtils.fromHex(params[2])
      hashCount = Number(params[3])
      hashAlgorithm = parseHtlcHashAlgorithm(params[4], hashRoot, hashCount)
      timeout = Number(params[5])
      value = Number(params[6])
    }
    else if (typeof params === 'object' && params !== null) {
      htlcSender = 'htlcSender' in params ? Nimiq.Address.fromString((params as any).htlcSender) : useLocalWallet().localAddress
      htlcRecipient = Nimiq.Address.fromString((params as any).htlcRecipient)
      hashRoot = Nimiq.BufferUtils.fromHex((params as any).hashRoot)
      hashCount = Number((params as any).hashCount)
      hashAlgorithm = parseHtlcHashAlgorithm((params as any).hashAlgorithm, hashRoot, hashCount)
      timeout = Number((params as any).timeout)
      value = Number((params as any).value)
    }
    else {
      throw new InternalError('Invalid parameters for sendNewHtlcTransaction method')
    }
    return this.sendPayment({
      transfer: Transfer.HTLC,
      sender: useRemoteSigner().remoteAddress!.toUserFriendlyAddress(),
      recipient: Nimiq.Address.NULL.toUserFriendlyAddress(),
      htlcData: {
        type: 'new-htlc',
        sender: htlcSender,
        recipient: htlcRecipient,
        hashRoot,
        hashCount,
        hashAlgorithm,
        timeout,
      },
      htlcTitle: 'New HTLC',
      value,
      analyticsRequestType: 'nimiq_htlc_new',
    })
  }

  private async sendRedeemRegularHtlcTransaction(params: unknown): Promise<string> {
    // Parse params
    let contractAddress: Address
    let recipient: Address
    let preImage: Uint8Array
    let hashRoot: Uint8Array
    let hashCount: number
    let hashAlgorithm: number
    let value: number

    if (Array.isArray(params) && params.length >= 7) {
      contractAddress = Nimiq.Address.fromString(params[0])
      recipient = params[1] ? Nimiq.Address.fromString(params[1]) : useLocalWallet().localAddress
      preImage = Nimiq.BufferUtils.fromHex(params[2])
      hashRoot = Nimiq.BufferUtils.fromHex(params[3])
      hashCount = Number(params[4])
      hashAlgorithm = parseHtlcHashAlgorithm(params[5], hashRoot, hashCount, preImage)
      value = Number(params[6])
    }
    else if (typeof params === 'object' && params !== null) {
      contractAddress = Nimiq.Address.fromString((params as any).contractAddress)
      recipient = 'recipient' in params ? Nimiq.Address.fromString((params as any).recipient) : useLocalWallet().localAddress
      preImage = Nimiq.BufferUtils.fromHex((params as any).preImage)
      hashRoot = Nimiq.BufferUtils.fromHex((params as any).hashRoot)
      hashCount = Number((params as any).hashCount)
      hashAlgorithm = parseHtlcHashAlgorithm((params as any).hashAlgorithm, hashRoot, hashCount, preImage)
      value = Number((params as any).value)
    }
    else {
      throw new InternalError('Invalid parameters for sendRedeemRegularHtlcTransaction method')
    }
    await this.assertNotOwnHtlc(contractAddress)
    return this.sendPayment({
      transfer: Transfer.HTLC,
      sender: contractAddress.toUserFriendlyAddress(),
      recipient: recipient.toUserFriendlyAddress(),
      htlcData: {
        type: 'redeem-regular',
        preImage,
        hashRoot,
        hashCount,
        hashAlgorithm,
      },
      htlcTitle: 'Redeem HTLC (regular)',
      value,
      analyticsRequestType: 'nimiq_htlc_redeem_regular',
    })
  }

  private async sendRedeemTimeoutHtlcTransaction(params: unknown): Promise<string> {
    // Parse params
    let contractAddress: Address
    let recipient: Address
    let value: number

    if (Array.isArray(params) && params.length >= 3) {
      contractAddress = Nimiq.Address.fromString(params[0])
      recipient = params[1] ? Nimiq.Address.fromString(params[1]) : useLocalWallet().localAddress
      value = Number(params[2])
    }
    else if (typeof params === 'object' && params !== null) {
      contractAddress = Nimiq.Address.fromString((params as any).contractAddress)
      recipient = 'recipient' in params ? Nimiq.Address.fromString((params as any).recipient) : useLocalWallet().localAddress
      value = Number((params as any).value)
    }
    else {
      throw new InternalError('Invalid parameters for sendRedeemTimeoutHtlcTransaction method')
    }
    await this.assertNotOwnHtlc(contractAddress)
    return this.sendPayment({
      transfer: Transfer.HTLC,
      sender: contractAddress.toUserFriendlyAddress(),
      recipient: recipient.toUserFriendlyAddress(),
      htlcData: {
        type: 'redeem-timeout',
      },
      htlcTitle: 'Redeem HTLC (timeout)',
      value,
      analyticsRequestType: 'nimiq_htlc_redeem_timeout',
    })
  }

  private async sendRedeemEarlyHtlcTransaction(params: unknown): Promise<string> {
    // Parse params
    let contractAddress: Address
    let recipient: Address
    let htlcSenderSignature: SignatureProof
    let htlcRecipientSignature: SignatureProof
    let value: number
    // let fee: number | undefined
    let validityStartHeight: number

    if (Array.isArray(params) && params.length >= 7) {
      contractAddress = Nimiq.Address.fromString(params[0])
      recipient = params[1] ? Nimiq.Address.fromString(params[1]) : useLocalWallet().localAddress
      htlcSenderSignature = Nimiq.SignatureProof.deserialize(Nimiq.BufferUtils.fromHex(params[2]))
      htlcRecipientSignature = Nimiq.SignatureProof.deserialize(Nimiq.BufferUtils.fromHex(params[3]))
      value = Number(params[4])
      // fee = params[5] !== undefined ? Number(params[5]) : undefined
      validityStartHeight = Number(params[6])
    }
    else if (typeof params === 'object' && params !== null) {
      contractAddress = Nimiq.Address.fromString((params as any).contractAddress)
      recipient = 'recipient' in params ? Nimiq.Address.fromString((params as any).recipient) : useLocalWallet().localAddress
      htlcSenderSignature = Nimiq.SignatureProof.deserialize(Nimiq.BufferUtils.fromHex((params as any).htlcSenderSignature))
      htlcRecipientSignature = Nimiq.SignatureProof.deserialize(Nimiq.BufferUtils.fromHex((params as any).htlcRecipientSignature))
      value = Number((params as any).value)
      // fee = (params as any).fee !== undefined ? Number((params as any).fee) : undefined
      validityStartHeight = Number((params as any).validityStartHeight)
    }
    else {
      throw new InternalError('Invalid parameters for sendRedeemEarlyHtlcTransaction method')
    }
    await this.assertNotOwnHtlc(contractAddress)

    const partialTx = {
      sender: contractAddress.toUserFriendlyAddress(),
      recipient: recipient.toUserFriendlyAddress(),
      amount: value,
      title: 'Redeem HTLC (early)',
      transfer: Transfer.HTLC,
      rail: Rail.MiniApp,
      railMerchantId: this.config.url,
      merchantName: this.config.title,
      htlcData: {
        type: 'redeem-early',
        senderSignatureProof: htlcSenderSignature,
        recipientSignatureProof: htlcRecipientSignature,
      },
      validityStartHeight,
    } satisfies PartialHtlcTxArgs

    // Early redeem doesn't require the user's consent, as the two required signatures are already passed in the params.
    // So we shortcut `sendPayment` with its user confirmation and go straight to sending.
    const analyticsRequestType = 'nimiq_htlc_redeem_early'
    const result = await useTransactions().sendTx(partialTx)
    trackWeb3Request({ requestType: analyticsRequestType, blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: result.outcome === 'submitted' })
    if (result.outcome === 'rejected')
      throw new InternalError(`Failed to send payment transaction: ${result.error}`)
    if (result.outcome === 'unknown') {
      logger.log('[MiniAppHost] Transaction outcome unknown', { stagedHash: result.stagedHash })
      throw new TransactionOutcomeUnknownError(TRANSACTION_OUTCOME_UNKNOWN_MESSAGE)
    }
    return result.tx.hash
  }

  private async signRedeemEarlyHtlcTransaction(params: unknown): Promise<string> {
    // Parse params
    let contractAddress: Address
    let recipient: Address
    let value: number
    // let fee: number | undefined
    let validityStartHeight: number

    if (Array.isArray(params) && params.length >= 5) {
      contractAddress = Nimiq.Address.fromString(params[0])
      recipient = params[1] ? Nimiq.Address.fromString(params[1]) : useLocalWallet().localAddress
      value = Number(params[2])
      // fee = params[3] !== undefined ? Number(params[3]) : undefined
      validityStartHeight = Number(params[4])
    }
    else if (typeof params === 'object' && params !== null) {
      contractAddress = Nimiq.Address.fromString((params as any).contractAddress)
      recipient = 'recipient' in params ? Nimiq.Address.fromString((params as any).recipient) : useLocalWallet().localAddress
      value = Number((params as any).value)
      // fee = (params as any).fee !== undefined ? Number((params as any).fee) : undefined
      validityStartHeight = Number((params as any).validityStartHeight)
    }
    else {
      throw new InternalError('Invalid parameters for signRedeemEarlyHtlcTransaction method')
    }
    await this.assertNotOwnHtlc(contractAddress)

    const analyticsRequestType = 'nimiq_htlc_sign_early'

    // Because this request generates and replies with a signature, it should not go through the create/send transaction
    // flow, as that would be semantically wrong.
    // Thus we ask for confirmation and generate the signature directly here.
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'transaction',
      data: {
        recipient: recipient.toUserFriendlyAddress(),
        recipientType: Nimiq.AccountType.Basic,
        amount: value,
        fee: 0,
        rail: Rail.MiniApp,
        railMerchantId: this.config.url,
        merchantName: this.config.title,
      },
      htlcData: {
        type: 'sign-early',
      },
      htlcContractAddress: contractAddress.toUserFriendlyAddress(),
      htlcValidityStartHeight: validityStartHeight,
      network: 'nimiq',
    })
    if (!confirmed) {
      trackWeb3Request({ requestType: analyticsRequestType, blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: false, success: false })
      throw new PermissionDeniedError(USER_REJECTED_REQUEST_MESSAGE)
    }

    const tx = new Nimiq.Transaction(
      /* sender */ contractAddress,
      /* senderType */ Nimiq.AccountType.HTLC,
      /* senderData */ new Uint8Array(0),
      /* recipient */ recipient,
      /* recipientType */ Nimiq.AccountType.Basic,
      /* recipientData */ new Uint8Array(0),
      /* value */ BigInt(value),
      /* fee */ 0n,
      /* flags */ 0,
      /* validityStartHeight */ validityStartHeight,
      /* networkId */ useNimiqNetwork().networkId,
    )

    const { privateKey, publicKey } = useLocalWallet().localWallet
    const sig = Nimiq.Signature.create(privateKey, publicKey, tx.serializeContent())
    const sigProof = Nimiq.SignatureProof.singleSig(publicKey, sig)
    trackWeb3Request({ requestType: analyticsRequestType, blockchain: 'nimiq', dappUrl: this.config.url, dappName: this.config.title, approved: true, success: true })
    return Nimiq.BufferUtils.toHex(sigProof.serialize())
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
  } | {
    transfer: Transfer.HTLC
    htlcTitle: PartialStakingTxArgs['title']
    htlcData: HtlcData
    sender: string
    recipient: string
    validityStartHeight?: number
  })): Promise<string> {
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    // Everything but remove-stake spends from the HTLC; fail before prompting instead of after the user confirms
    const spendsFromRemote = !(txData.transfer === Transfer.Staking && txData.stakingData.type === 'remove-stake')
    if (spendsFromRemote && !useRemoteSigner().remoteAddress)
      throw new NetworkError(i18n.t('Something went wrong syncing your account'))

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
          : txData.transfer === Transfer.HTLC
            ? txData.htlcData.type === 'new-htlc'
              ? 'New contract'
              : (txData.recipient || useLocalWallet().localAddress.toUserFriendlyAddress())
            : txData.recipient,
        recipientType: txData.transfer === Transfer.Staking
          ? txData.stakingData.type === 'remove-stake'
            // For remove-stake transactions, the recipient is the user's local address, which is a basic account
            ? Nimiq.AccountType.Basic
            : Nimiq.AccountType.Staking
          : txData.transfer === Transfer.HTLC
            ? txData.htlcData.type === 'new-htlc'
              ? Nimiq.AccountType.HTLC
              : Nimiq.AccountType.Basic
            : Nimiq.AccountType.Basic,
        amount: txData.value,
        fee: txData.fee ?? 0,
        message: txData.message,
        rail: Rail.MiniApp,
        railMerchantId: this.config.url,
        merchantName: this.config.title,
      },
      stakingData: 'stakingData' in txData ? txData.stakingData : undefined,
      htlcData: 'htlcData' in txData ? txData.htlcData : undefined,
      // On a redeem `txData.sender` is the contract being drained; on `new-htlc` it is just our own
      // funding account, which the sheet already covers with its HTLC Sender/Recipient rows.
      htlcContractAddress: txData.transfer === Transfer.HTLC && txData.htlcData.type !== 'new-htlc' ? txData.sender : undefined,
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
    else if (txData.transfer === Transfer.HTLC) {
      partialTx = {
        sender: txData.sender,
        recipient: txData.recipient,
        amount: txData.value,
        title: txData.htlcTitle,
        transfer: txData.transfer,
        rail: Rail.MiniApp,
        railMerchantId: this.config.url,
        merchantName: this.config.title,
        htlcData: txData.htlcData!,
        validityStartHeight: txData.validityStartHeight,
      } satisfies PartialHtlcTxArgs
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
      throw new TransactionOutcomeUnknownError(TRANSACTION_OUTCOME_UNKNOWN_MESSAGE)
    }
    return result.tx.hash
  }
}

/** Base class for MiniApp errors with typed error codes */
abstract class MiniAppError extends Error {
  abstract readonly type: string
}

class UnknownRequestError extends MiniAppError {
  readonly type = 'UNKNOWN_REQUEST'
}

class InternalError extends MiniAppError {
  readonly type = 'INTERNAL_ERROR'
}

export class PermissionDeniedError extends MiniAppError {
  readonly type = 'PERMISSION_DENIED'
}

class TransactionOutcomeUnknownError extends MiniAppError {
  readonly type = 'TRANSACTION_OUTCOME_UNKNOWN'
}

export class NetworkError extends MiniAppError {
  readonly type = 'NETWORK_ERROR'
}

export class InvalidTransactionError extends MiniAppError {
  readonly type = 'INVALID_TRANSACTION'
}
