import type { PluginListenerHandle } from '@capacitor/core'
// import {
//     InvalidTransactionError,
//     NetworkError,
//     PermissionDeniedError,
//     PlainAccount,
//     PlainTransaction,
//     NimiqProvider as ProviderInterface,
//     SendPaymentData,
// } from "./../../mini-app-sdk/NimiqProvider"

import type { InAppBrowser } from '@capgo/inappbrowser'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { ALLOWED_EVM_CHAIN_IDS } from '../../web3-provider/src/allowedChains'
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
  private inAppBrowser: typeof InAppBrowser
  private config: MiniAppHostConfig
  private destroyed = false
  private messageFromWebviewListener: PluginListenerHandle | null = null

  constructor(inAppBrowser: typeof InAppBrowser, config: MiniAppHostConfig) {
    this.inAppBrowser = inAppBrowser
    this.config = config
    this.setupMessageListener()
  }

  public async destroy(): Promise<void> {
    await this.messageFromWebviewListener?.remove()
    await this.inAppBrowser.removeAllListeners()
    this.inAppBrowser = null as unknown as typeof InAppBrowser
    this.destroyed = true
  }

  /**
   * Setup listener for messages from the mini app
   */
  private async setupMessageListener(): Promise<void> {
    this.messageFromWebviewListener = await this.inAppBrowser.addListener('messageFromWebview', this.messageListener.bind(this))
  }

  private async messageListener(event: InAppBrowserMessageEvent) {
    if (this.destroyed)
      return
    if (!event.detail)
      return

    logger.log('[MiniAppHost] Received message from webview:', event.detail)

    // Ensure message structure
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
        this.handleNimiqMessage(message)
        break
      case 'ethereum':
        this.handleEthereumMessage(message)
        break
      default: {
        logger.log('[MiniAppHost] Unknown network in message:', event.detail.network)
        this.sendError(message.id, 'INVALID_NETWORK', `Unknown network: ${message.network}`)
      }
    }
  }

  private async handleNimiqMessage(message: Request) {
    try {
      const response = await this._handleNimiqMessage(message)
      this.send(message.id, response)
    }
    catch (error) {
      if (error instanceof UnknownRequestError
        || error instanceof InternalError
        || error instanceof PermissionDeniedError
        || error instanceof InvalidTransactionError
        || error instanceof NetworkError
      ) {
        this.sendError(message.id, error.type, error.message)
      }
      else {
        this.sendError(message.id, 'UNKNOWN_ERROR', `An unknown error occurred: ${(error as Error).message}`)
      }
    }
  }

  private async handleEthereumMessage(message: Request) {
    try {
      const response = await this._handleEthereumMessage(message)
      this.send(message.id, response)
    }
    catch (error) {
      if (error instanceof UnknownRequestError
        || error instanceof InternalError
        || error instanceof PermissionDeniedError
        || error instanceof InvalidTransactionError
        || error instanceof NetworkError
      ) {
        this.sendError(message.id, error.type, error.message)
      }
      else {
        this.sendError(message.id, 'UNKNOWN_ERROR', `An unknown error occurred: ${(error as Error).message}`)
      }
    }
  }

  private async _handleEthereumMessage(message: Request) {
    logger.log('[MiniAppHost] Handling Ethereum message:', message)

    switch (message.name) {
      case 'requestAccounts':
        return this.listEthAccounts()
      case 'signMessage':
      case 'signPersonalMessage':
        return this.signPersonalMessage(message.params ?? message.object)
      case 'signTypedMessage':
        return this.signTypedMessage(message.params ?? message.object)
      case 'signTransaction':
        return this.signEthTransaction(message.params ?? message.object)
      case 'rpcCall':
        return this.rpcCall(message.params ?? message.object)
      default:
        throw new UnknownRequestError(`Unknown Ethereum method: ${message.name}`)
    }
  }

  private parseChainId(chainId: unknown): number | null {
    if (chainId === undefined || chainId === null)
      return null

    if (typeof chainId === 'number' && Number.isInteger(chainId) && chainId > 0)
      return chainId

    if (typeof chainId === 'string') {
      const trimmed = chainId.trim()
      if (trimmed.length === 0)
        return null
      try {
        const normalized = trimmed.startsWith('0x') ? Number.parseInt(trimmed, 16) : Number.parseInt(trimmed, 10)
        if (Number.isInteger(normalized) && normalized > 0)
          return normalized
      }
      catch {
        return null
      }
    }

    return null
  }

  private isAllowedChain(chainId: number): boolean {
    return ALLOWED_EVM_CHAIN_IDS.has(chainId)
  }

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

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return await response.json()
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
    let data: string
    let address: string

    if (typeof params === 'object' && params !== null) {
      data = (params as { data?: string }).data ?? ''
      address = (params as { address?: string }).address ?? ''
    }
    else {
      logger.error('[MiniAppHost] Invalid parameters for signPersonalMessage:', params)
      throw new InternalError('Invalid parameters for signPersonalMessage')
    }

    if (!data) {
      logger.error('[MiniAppHost] Missing data parameter for signPersonalMessage')
      throw new InternalError('Missing data parameter for signPersonalMessage')
    }
    if (!address) {
      logger.error('[MiniAppHost] Missing address parameter for signPersonalMessage')
      throw new InternalError('Missing address parameter for signPersonalMessage')
    }

    // Decode hex message to display to user
    let messageToDisplay: string
    const isHex = data.startsWith('0x')
    if (isHex) {
      const hex = data.slice(2)
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => Number.parseInt(byte, 16)))
      messageToDisplay = new TextDecoder().decode(bytes)
    }
    else {
      messageToDisplay = data
    }

    // Request user confirmation
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided')
    }

    logger.log('[MiniAppHost] Requesting user confirmation for message signing:', messageToDisplay)
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'message',
      data: {
        message: messageToDisplay,
        isHex: false,
      },
    })
    if (!confirmed) {
      throw new PermissionDeniedError('User rejected message signing.')
    }

    // Get Ethereum wallet
    const { data: ethWallet, error } = useLocalWallet().getEthWallet()
    if (error) {
      throw new InternalError(`Failed to get Ethereum wallet: ${error}`)
    }

    // Verify the address matches
    if (ethWallet!.address.toLowerCase() !== address.toLowerCase()) {
      throw new PermissionDeniedError(`Address mismatch: requested ${address}, but wallet address is ${ethWallet!.address}`)
    }

    // Sign the message - ethers.js signMessage handles the personal_sign prefix
    // For hex data, we need to pass the raw bytes
    let messageToSign: string | Uint8Array
    if (isHex) {
      const hex = data.slice(2)
      messageToSign = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => Number.parseInt(byte, 16)))
    }
    else {
      messageToSign = data
    }

    const signature = await ethWallet!.signMessage(messageToSign)
    return signature
  }

  private async signTypedMessage(params: unknown): Promise<string> {
    // Parse params - expect { raw: string, address: string, version?: string }
    let raw: string
    let address: string

    if (typeof params === 'object' && params !== null) {
      raw = (params as { raw?: string }).raw ?? ''
      address = (params as { address?: string }).address ?? ''
    }
    else {
      throw new InternalError('Invalid parameters for signTypedMessage')
    }

    if (!raw) {
      throw new InternalError('Missing raw parameter for signTypedMessage')
    }
    if (!address) {
      throw new InternalError('Missing address parameter for signTypedMessage')
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

    const typedChainId = this.parseChainId((typedData.domain as { chainId?: unknown })?.chainId)
    if (typedChainId && !this.isAllowedChain(typedChainId)) {
      throw new InvalidTransactionError(`Unsupported chainId in typed data: ${typedChainId}`)
    }

    // Format typed data for display (show domain and message)
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
      data: {
        message: displayMessage,
        isHex: false,
      },
    })

    if (!confirmed) {
      throw new PermissionDeniedError('User rejected typed data signing.')
    }

    // Get Ethereum wallet
    const { data: ethWallet, error } = useLocalWallet().getEthWallet()
    if (error) {
      throw new InternalError(`Failed to get Ethereum wallet: ${error}`)
    }

    // Verify the address matches (case-insensitive)
    if (ethWallet!.address.toLowerCase() !== address.toLowerCase()) {
      throw new PermissionDeniedError(
        `Address mismatch: requested ${address}, but wallet address is ${ethWallet!.address}`,
      )
    }

    // Remove EIP712Domain from types (ethers.js handles it automatically)
    const { EIP712Domain, ...types } = typedData.types

    // Sign using ethers.js signTypedData (EIP-712)
    const signature = await ethWallet!.signTypedData(
      typedData.domain,
      types,
      typedData.message,
    )

    return signature
  }

  private async signEthTransaction(params: unknown): Promise<string> {
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

    // Validate required fields
    if (!txParams.to || !txParams.from) {
      throw new InternalError('Transaction must include "to" and "from" addresses')
    }

    const gasLimit = txParams.gas || txParams.gasLimit
    if (!gasLimit) {
      throw new InternalError('Transaction must include "gas" or "gasLimit"')
    }

    // Get Ethereum wallet to verify address
    const { data: ethWallet, error } = useLocalWallet().getEthWallet()
    if (error) {
      throw new InternalError(`Failed to get Ethereum wallet: ${error}`)
    }

    // Verify the from address matches the wallet (case-insensitive)
    if (ethWallet!.address.toLowerCase() !== txParams.from.toLowerCase()) {
      throw new PermissionDeniedError(
        `Address mismatch: requested ${txParams.from}, but wallet address is ${ethWallet!.address}`,
      )
    }

    // Request user confirmation
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
        gas: gasLimit,
        maxFeePerGas: txParams.maxFeePerGas,
        maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
        gasPrice: txParams.gasPrice,
        nonce: typeof txParams.nonce === 'string' ? Number.parseInt(txParams.nonce, 16) : txParams.nonce,
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
      gasLimit: BigInt(gasLimit),
    }

    // Set value (convert from hex wei)
    if (txParams.value) {
      tx.value = BigInt(txParams.value)
    }

    // Set data (calldata for contract interactions)
    if (txParams.data && txParams.data !== '0x') {
      tx.data = txParams.data
    }

    // Set gas parameters (EIP-1559 or legacy)
    if (txParams.maxFeePerGas) {
      tx.maxFeePerGas = BigInt(txParams.maxFeePerGas)
    }
    if (txParams.maxPriorityFeePerGas) {
      tx.maxPriorityFeePerGas = BigInt(txParams.maxPriorityFeePerGas)
    }
    if (txParams.gasPrice) {
      tx.gasPrice = BigInt(txParams.gasPrice)
    }

    // Set nonce if provided
    if (txParams.nonce !== undefined) {
      tx.nonce = typeof txParams.nonce === 'string' ? Number.parseInt(txParams.nonce, 16) : txParams.nonce
    }

    // Set chainId if provided and allowed
    if (txParams.chainId) {
      const chainIdNumber = this.parseChainId(txParams.chainId)
      if (!chainIdNumber) {
        throw new InvalidTransactionError('Invalid chainId for Ethereum transaction')
      }
      if (!this.isAllowedChain(chainIdNumber)) {
        throw new InvalidTransactionError(`Unsupported chainId for Ethereum transaction: ${chainIdNumber}`)
      }
      tx.chainId = BigInt(chainIdNumber)
    }

    // Sign the transaction
    const signedTx = await ethWallet!.signTransaction(tx)

    const rpcUrl = txParams.rpcUrl || this.config.ethereumRpcUrl
    if (!rpcUrl) {
      throw new NetworkError('Missing Ethereum RPC URL to broadcast transaction')
    }

    const rpcResponse = await this.rpcCall({
      rpcUrl,
      payload: {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'eth_sendRawTransaction',
        params: [signedTx],
      },
    })

    if (!rpcResponse || typeof rpcResponse !== 'object') {
      throw new NetworkError('Invalid RPC response while broadcasting transaction')
    }

    if ('error' in rpcResponse && (rpcResponse as { error?: { message?: string } }).error) {
      throw new NetworkError((rpcResponse as { error?: { message?: string } }).error?.message || 'RPC error while broadcasting transaction')
    }

    const txHash = (rpcResponse as { result?: string }).result
    if (!txHash || typeof txHash !== 'string') {
      throw new NetworkError('RPC response missing transaction hash')
    }

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
      isHex = Boolean(params[1].isHex)
    }
    else if (typeof params === 'object' && params !== null) {
      message = String((params as any).message)
      isHex = Boolean((params as any).isHex)
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
      recipient = String((params as any).recipient)
      value = Number((params as any).value)
      if ((params as any).fee !== undefined) {
        fee = Number((params as any).fee)
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
      recipient = String((params as any).recipient)
      value = Number((params as any).value)
      if ((params as any).fee !== undefined) {
        fee = Number((params as any).fee)
      }
      message = String((params as any).data)
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
    if (result.error) {
      throw new InternalError(`Failed to send payment transaction: ${result.error}`)
    }
    return result.data!.tx.hash
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
  private send(id: number, data: any): void {
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
  private postMessage(message: { id: number, data: any }): void {
    logger.log('[MiniAppHost] Posting message to mini app:', message)
    this.inAppBrowser.postMessage({ detail: message })
  }
}

class UnknownRequestError extends Error {
  readonly type = 'UNKNOWN_REQUEST'
}

class InternalError extends Error {
  readonly type = 'INTERNAL_ERROR'
}

export class PermissionDeniedError extends Error {
  readonly type = 'PERMISSION_DENIED'
}

export class NetworkError extends Error {
  readonly type = 'NETWORK_ERROR'
}

export class InvalidTransactionError extends Error {
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
