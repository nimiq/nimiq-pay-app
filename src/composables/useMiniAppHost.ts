import type { PluginListenerHandle } from '@capacitor/core'
import type { InAppBrowser } from '@capgo/inappbrowser'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { Toast } from '@capacitor/toast'
import { hexToBytes } from '@/lib/ethereum/hex-utils'
import { addressesEqual, isValidEthAddress, parseChainId } from '@/lib/ethereum/validation'
import { useLocalWallet } from '@/stores/local-wallet'
// import {
//     ErrorData,
//     ErrorMessage,
//     Handler,
//     RequestMessage,
//     RequestType,
//     ResponseData,
//     ResponseMessage,
//     ResponseType,
//     SubscriptionMessage,
//     SubscriptionType,
// } from './../../mini-app-sdk/types'
// import { mapError, Result, unwrap } from "./../../mini-app-sdk/Result";
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'
import { ALLOWED_EVM_CHAIN_IDS } from '../../web3-provider/src/allowedChains'
import { useLogger } from './useLogger'

const logger = useLogger('MiniAppHost')

export interface InAppBrowserMessageEvent {
  detail: {
    message?: string
    [key: string]: any
  }
}

export interface Request {
  id: number
  network: string
  name: string // The method being called
  params?: object | unknown[]
  object?: object | unknown[]
}

export interface SignatureResult {
  publicKey: string
  signature: string
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

export type UserConfirmationRequest = {
  url: string
  name?: string
} & ({
  type: 'accounts'
} | {
  type: 'transaction'
  data: Omit<PaymentRequestData, 'transfer'>
} | {
  type: 'eth-transaction'
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
  }
} | {
  type: 'message'
  data: {
    message: string
    isHex: boolean
  }
})

/**
 * Configuration for the MiniAppHost
 */
export interface MiniAppHostConfig {
  url: string
  title: string
  /**
   * Optional Ethereum JSON-RPC endpoint used to broadcast signed transactions.
   * If not provided, the RPC URL can be passed per-transaction via txParams.rpcUrl.
   */
  ethereumRpcUrl?: string

  /**
   * Callback to request user confirmation for sensitive operations
   * @param message - Message to show to the user
   * @returns Promise that resolves to true if user confirms, false otherwise
   */
  requestUserConfirmation?: (request: UserConfirmationRequest) => Promise<boolean>
}

/**
 * MiniAppHost - SDK for the host native app that runs mini apps in InAppBrowser
 * Provides typed communication with mini apps and handles permissions, signing, transactions
 */
export class MiniAppHost {
  private inAppBrowser: typeof InAppBrowser | null
  private config: MiniAppHostConfig
  private destroyed = false
  private messageFromWebviewListener: PluginListenerHandle | null = null
  /** Current chain ID as set by the webview provider (hex string, e.g., '0x1') */
  private currentChainId: string = '0x1' // Default to Ethereum mainnet

  constructor(inAppBrowser: typeof InAppBrowser, config: MiniAppHostConfig) {
    this.inAppBrowser = inAppBrowser
    this.config = config
    this.setupMessageListener()
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) {
      return
    }
    await this.inAppBrowser?.clearAllCookies()
    await this.messageFromWebviewListener?.remove()
    this.messageFromWebviewListener = null
    await this.inAppBrowser?.removeAllListeners()
    this.inAppBrowser = null
    this.destroyed = true
  }

  /**
   * Setup listener for messages from the mini app
   */
  private async setupMessageListener(): Promise<void> {
    if (!this.inAppBrowser) {
      return
    }
    this.messageFromWebviewListener = await this.inAppBrowser.addListener('messageFromWebview', this.messageListener.bind(this))
  }

  private async messageListener(event: InAppBrowserMessageEvent) {
    if (this.destroyed)
      return
    if (!event.detail)
      return

    logger.log('[MiniAppHost] Received message from webview:', event.detail)

    // Handle chain change notifications from the webview provider
    if (event.detail.type === 'chainChanged' && typeof event.detail.chainId === 'string') {
      this.currentChainId = event.detail.chainId
      logger.log('[MiniAppHost] Chain changed to:', this.currentChainId)
      return
    }

    // Ensure message structure for RPC requests
    if (typeof event.detail.id !== 'number') {
      logger.log('[MiniAppHost] Message has no id property, skipping')
      this.sendError(Number.NaN, 'INVALID_MESSAGE', 'Message has no id property')
      return
    }

    if (typeof event.detail.network !== 'string') {
      logger.log('[MiniAppHost] Message has no network property, skipping')
      this.sendError(event.detail.id, 'INVALID_MESSAGE', 'Message has no network property')
      return
    }

    if (typeof event.detail.name !== 'string') {
      logger.log('[MiniAppHost] Message has no name property, skipping')
      this.sendError(event.detail.id, 'INVALID_MESSAGE', 'Message has no name property')
      return
    }

    const message = event.detail as Request

    switch (message.network) {
      case 'nimiq':
        await this.handleNimiqMessage(message)
        break
      case 'ethereum':
        await this.handleEthereumMessage(message)
        break
      default: {
        logger.log('[MiniAppHost] Unknown network in message:', event.detail.network)
        this.sendError(message.id, 'INVALID_NETWORK', `Unknown network: ${message.network}`)
      }
    }
  }

  private async handleNimiqMessage(message: Request): Promise<void> {
    try {
      const response = await this._handleNimiqMessage(message)
      this.send(message.id, response)
    }
    catch (error) {
      this.handleMessageError(message.id, error)
    }
  }

  private async handleEthereumMessage(message: Request): Promise<void> {
    try {
      const response = await this._handleEthereumMessage(message)
      this.send(message.id, response)
    }
    catch (error) {
      this.handleMessageError(message.id, error)
    }
  }

  private handleMessageError(messageId: number, error: unknown): void {
    if (error instanceof MiniAppError) {
      this.sendError(messageId, error.type, error.message)
      // Show toast for user-actionable errors (skip permission denied - user already knows)
      if (!(error instanceof PermissionDeniedError) && !(error instanceof UnknownRequestError)) {
        this.showErrorToast(error.message)
      }
    }
    else {
      const message = `An unknown error occurred: ${(error as Error).message}`
      this.sendError(messageId, 'UNKNOWN_ERROR', message)
      this.showErrorToast(message)
    }
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

  private async _handleEthereumMessage(message: Request) {
    logger.log('[MiniAppHost] Handling Ethereum message:', message)
    const params = message.params ?? message.object

    switch (message.name) {
      case 'requestAccounts':
        return this.listEthAccounts()
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
    // Request user confirmation
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'accounts',
    })
    if (!confirmed) {
      throw new PermissionDeniedError('User denied account access.')
    }

    // Get Ethereum address from local wallet
    const { data: ethAddress, error } = useLocalWallet().getEthAddress()
    if (error) {
      throw new InternalError(`Failed to get Ethereum address: ${error}`)
    }

    return [ethAddress!]
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
    })
    if (!confirmed) {
      throw new PermissionDeniedError('User rejected message signing.')
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
    return await ethWallet.signMessage(messageToSign)
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
    })
    if (!confirmed) {
      throw new PermissionDeniedError('User rejected typed data signing.')
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
    return await ethWallet.signTypedData(typedData.domain, types, typedData.message)
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

    // --- Resolve all missing tx fields from RPC before showing confirmation ---
    const rpcUrl = txParams.rpcUrl || this.config.ethereumRpcUrl

    // Nonce resolution: fetch from broadcast RPC if not provided by dApp
    logger.log('[ETH_TX] Step 3 - Nonce analysis:', {
      nonceProvided: txParams.nonce !== undefined,
      nonceRawValue: txParams.nonce,
      nonceParsed: typeof txParams.nonce === 'string'
        ? Number.parseInt(txParams.nonce, 16) : txParams.nonce,
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
              ? Number.parseInt(txParams.nonce, 16) : txParams.nonce)
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
      },
    })

    if (!confirmed) {
      throw new PermissionDeniedError('User rejected transaction signing.')
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
    if (txParams.value) {
      tx.value = BigInt(txParams.value)
    }

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

    // Set chainId - use current chain if not provided, validate if provided
    const currentChainNumber = parseChainId(this.currentChainId)
    if (txParams.chainId) {
      const txChainIdNumber = parseChainId(txParams.chainId)
      if (!txChainIdNumber) {
        throw new InvalidTransactionError('Invalid chainId for Ethereum transaction')
      }
      if (!this.isAllowedChain(txChainIdNumber)) {
        throw new InvalidTransactionError(`Unsupported chainId for Ethereum transaction: ${txChainIdNumber}`)
      }
      // Validate transaction chainId matches current chain
      if (currentChainNumber && txChainIdNumber !== currentChainNumber) {
        throw new InvalidTransactionError(
          `Transaction chainId (${txChainIdNumber}) doesn't match current chain (${currentChainNumber})`,
        )
      }
      tx.chainId = BigInt(txChainIdNumber)
    }
    else if (currentChainNumber) {
      // Use current chain if not specified in transaction
      tx.chainId = BigInt(currentChainNumber)
    }

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

    return txHash
  }

  /**
   * Handle incoming message from mini app
   * @private
   */
  // private async handleMessage<T extends keyof RequestType>(message: RequestMessage<T>): Promise<ResponseType[T]> {
  private async _handleNimiqMessage(message: Request) {
    logger.log('[MiniAppHost] Handling Nimiq message:', message)

    try {
      switch (message.name) {
        case 'listAccounts': return this.listAccounts()
        case 'sign': return this.sign(message.params)
        case 'isConsensusEstablished': return this.isConsensusEstablished()
        case 'getBlockNumber': return this.getBlockNumber()
        case 'sendBasicTransaction': return this.sendBasicTransaction(message.params)
        case 'sendBasicTransactionWithData': return this.sendBasicTransactionWithData(message.params)
        default:
          logger.log('[MiniAppHost] Unknown message name:', message.name)
          throw new UnknownRequestError(`Unknown message name: ${message.name}`)
      }
    }
    catch (error) {
      logger.error('[MiniAppHost] Error handling message:', error)
      throw new InternalError(`Internal error handling message: ${(error as Error).message}`)
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
    })
    if (!confirmed) {
      throw new PermissionDeniedError('User said no.')
    }

    return [
      useLocalWallet().localAddress.toUserFriendlyAddress(),
      useRemoteSigner().remoteAddress?.toUserFriendlyAddress(),
    ].filter(Boolean)
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
    })
    if (!confirmed) {
      throw new PermissionDeniedError('User said no.')
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

    return {
      publicKey: localWallet.publicKey.toHex(),
      signature: signature.toHex(),
    }
  }

  private sendBasicTransaction(params: unknown): Promise<string> {
    // Parse params
    let recipient: string
    let value: number
    let fee = 0

    if (Array.isArray(params) && params.length >= 2) {
      recipient = String(params[0])
      value = Number(params[1])
      if (params.length >= 3) {
        fee = Number(params[2])
      }
    }
    else if (typeof params === 'object' && params !== null) {
      const txParams = params as NimiqTransactionParams
      recipient = String(txParams.recipient ?? '')
      value = Number(txParams.value ?? 0)
      if (txParams.fee !== undefined) {
        fee = Number(txParams.fee)
      }
    }
    else {
      throw new InternalError('Invalid parameters for createBasicTransaction method')
    }

    return this.sendPayment({ recipient, value, fee })
  }

  private sendBasicTransactionWithData(params: unknown): Promise<string> {
    // Parse params
    let recipient: string
    let value: number
    let fee = 0
    let message = ''

    if (Array.isArray(params) && params.length >= 2) {
      recipient = String(params[0])
      value = Number(params[1])
      if (params.length >= 3) {
        fee = Number(params[2])
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
        fee = Number(txParams.fee)
      }
      message = String(txParams.data ?? '')
    }
    else {
      throw new InternalError('Invalid parameters for createBasicTransaction method')
    }

    return this.sendPayment({ recipient, value, fee, message })
  }

  private async sendPayment(txData: {
    recipient: string
    value: number
    fee?: number
    message?: string
    merchant?: {
      name?: string
      // category?: string;
    }
  }): Promise<string> {
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'transaction',
      data: {
        recipient: txData.recipient,
        amount: txData.value,
        fee: txData.fee || 0,
        message: txData.message,
        merchantName: txData.merchant?.name,
      },
    })
    if (!confirmed) {
      throw new PermissionDeniedError('User said no.')
    }

    const result = await useTransactions().sendTx({
      recipient: txData.recipient,
      amount: txData.value,
      title: 'Payment',
      transfer: Transfer.UserPaymentToMerchant,
      message: txData.message,
      merchantName: txData.merchant?.name,
      // merchantCategory: txData.merchant?.category,
      // invoiced:
      // fiatAmount:
      // fiatCurrency:
      // paymentRef:
      meta: {
        miniApp: {
          url: this.config.url,
        },
      },
    })
    if (result.error || !result.data) {
      throw new InternalError(`Failed to send payment transaction: ${result.error || 'no transaction data'}`)
    }
    return result.data.tx.hash
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
  //     throw new PermissionDeniedError('User said no.');
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

  /**
   * Send a message to the mini app
   */
  private send(id: number, data: unknown): void {
    this.postMessage({ id, data })
  }

  /**
   * Send error response
   * @private
   */
  private sendError(id: number, type: string, message: string): void {
    this.postMessage({
      id,
      data: {
        error: {
          type,
          message,
        },
      },
    })
  }

  /**
   * Send a message to the mini app
   * @private
   */
  private postMessage(message: { id: number, data: unknown }): void {
    if (this.destroyed || !this.inAppBrowser) {
      logger.warn('[MiniAppHost] Cannot post message - host is destroyed')
      return
    }
    logger.log('[MiniAppHost] Posting message to mini app:', message)
    this.inAppBrowser.postMessage({ detail: message })
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
