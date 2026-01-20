import type { InAppBrowser } from '@capgo/inappbrowser';
// import {
//     InvalidTransactionError,
//     NetworkError,
//     PermissionDeniedError,
//     PlainAccount,
//     PlainTransaction,
//     NimiqProvider as ProviderInterface,
//     SendPaymentData,
// } from "./../../mini-app-sdk/NimiqProvider"

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
import { useNimiqNetwork } from '@/stores/nimiq-network';
import { useLocalWallet } from '@/stores/local-wallet';
import { useRemoteSigner } from '@/stores/remote-signer';
import type { PlainTransactionSenderData, Transaction } from '@nimiq/core';
import { createResolveProof, getSignedTxByRemote } from '@/lib/tx';
import { storeToRefs } from 'pinia';
import { useTransactions } from '@/stores/transactions';
import { Transfer } from '@/types/transactions';
import { PaymentRequestData } from '@/lib/flows/steps.types';

export interface InAppBrowserMessageEvent {
  detail: {
    message?: string;
    [key: string]: any;
  };
}

export type Request = {
  id: number;
  network: string;
  name: string; // The method being called
  params?: object | unknown[];
  object?: object | unknown[];
}

export type SignatureResult = {
  publicKey: string,
  signature: string,
}

export type UserConfirmationRequest = {
  url: string;
  name?: string;
} & ({
  type: 'accounts',
} | {
  type: 'transaction',
  data: Omit<PaymentRequestData, 'transfer'>,
} | {
  type: 'message',
  data: {
    message: string;
    isHex: boolean;
  },
})

/**
 * Configuration for the MiniAppHost
 */
export interface MiniAppHostConfig {
  url: string;
  title: string;

  /**
   * Callback to request user confirmation for sensitive operations
   * @param message - Message to show to the user
   * @returns Promise that resolves to true if user confirms, false otherwise
   */
  requestUserConfirmation?: (request: UserConfirmationRequest) => Promise<boolean>;
}

/**
 * MiniAppHost - SDK for the host native app that runs mini apps in InAppBrowser
 * Provides typed communication with mini apps and handles permissions, signing, transactions
 */
export class MiniAppHost {
  private inAppBrowser: typeof InAppBrowser;
  private config: MiniAppHostConfig;
  private destroyed = false;

  constructor(inAppBrowser: typeof InAppBrowser, config: MiniAppHostConfig) {
    this.inAppBrowser = inAppBrowser;
    this.config = config;
    this.setupMessageListener();
  }

  public destroy(): void {
    this.inAppBrowser.removeAllListeners();
    this.inAppBrowser = null as unknown as typeof InAppBrowser;
    this.destroyed = true;
  }

  /**
   * Setup listener for messages from the mini app
   */
  private setupMessageListener(): void {
    this.inAppBrowser.addListener('messageFromWebview', this.messageListener.bind(this));
  }

  private async messageListener(event: InAppBrowserMessageEvent) {
    if (this.destroyed) return;
    if (!event.detail) return;

    console.log('[MiniAppHost] Received message from webview:', event.detail);

    // Ensure message structure
    if (typeof event.detail.id !== 'number') {
      console.warn('[MiniAppHost] Message has no id property, skipping');
      this.sendError(NaN, 'INVALID_MESSAGE', 'Message has no id property');
      return;
    }

    if (typeof event.detail.network !== 'string') {
      console.warn('[MiniAppHost] Message has no network property, skipping');
      this.sendError(event.detail.id, 'INVALID_MESSAGE', 'Message has no network property');
      return;
    }

    if (typeof event.detail.name !== 'string') {
      console.warn('[MiniAppHost] Message has no name property, skipping');
      this.sendError(event.detail.id, 'INVALID_MESSAGE', 'Message has no name property');
      return;
    }

    const message = event.detail as Request;

    switch (message.network) {
      case 'nimiq': this.handleNimiqMessage(message); break;
      case 'ethereum': this.handleEthereumMessage(message); break;
      default: {
        console.warn('[MiniAppHost] Unknown network in message:', event.detail.network);
        this.sendError(message.id, 'INVALID_NETWORK', `Unknown network: ${message.network}`);
      }
    }
  }

  private async handleNimiqMessage(message: Request) {
    try {
      const response = await this._handleNimiqMessage(message);
      this.send(message.id, response);
    } catch (error) {
      if (error instanceof UnknownRequestError
        || error instanceof InternalError
        || error instanceof PermissionDeniedError
        || error instanceof InvalidTransactionError
        || error instanceof NetworkError
      ) {
        this.sendError(message.id, error.type, error.message);
      } else {
        this.sendError(message.id, 'UNKNOWN_ERROR', 'An unknown error occurred: ' + (error as Error).message);
      }
    }
  }

  private async handleEthereumMessage(message: Request) {
    console.warn('[MiniAppHost] Ethereum support not implemented yet.');
    this.sendError(message.id, 'NOT_IMPLEMENTED', 'Ethereum support not implemented yet.');
  }

  /**
   * Handle incoming message from mini app
   * @private
   */
  // private async handleMessage<T extends keyof RequestType>(message: RequestMessage<T>): Promise<ResponseType[T]> {
  private async _handleNimiqMessage(message: Request) {
    console.log('[MiniAppHost] Handling Nimiq message:', message);

    try {
      switch (message.name) {
        case 'listAccounts': return this.listAccounts();
        case 'sign': return this.sign(message.params);
        case 'isConsensusEstablished': return this.isConsensusEstablished();
        case 'getBlockNumber': return this.getBlockNumber();
        case 'sendBasicTransaction': return this.sendBasicTransaction(message.params);
        case 'sendBasicTransactionWithData': return this.sendBasicTransactionWithData(message.params);
        default:
          console.warn('[MiniAppHost] Unknown message name:', message.name);
          throw new UnknownRequestError(`Unknown message name: ${message.name}`);
      }
    } catch (error) {
      console.error('[MiniAppHost] Error handling message:', error);
      throw new InternalError('Internal error handling message: ' + (error as Error).message);
    }
  }

  private isConsensusEstablished() {
    return useNimiqNetwork().consensus === 'established';
  }

  private getBlockNumber() {
    return Math.max(useNimiqNetwork().height, useRemoteSigner().remoteHeight);
  }

  private async listAccounts() {
    // Ask user for persmission to list accounts
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided');
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'accounts',
    });
    if (!confirmed) {
      throw new PermissionDeniedError('User said no.');
    }

    return [
      useLocalWallet().localAddress.toUserFriendlyAddress(),
      useRemoteSigner().remoteAddress?.toUserFriendlyAddress(),
    ].filter(Boolean);
  }

  private async sign(params: unknown): Promise<SignatureResult> {
    // Parse params
    let message: string;
    let isHex = false;
    if (Array.isArray(params) && params.length > 0) {
      message = String(params[0]);
      isHex = Boolean(params[1].isHex);
    } else if (typeof params === 'object' && params !== null) {
      message = String((params as any).message);
      isHex = Boolean((params as any).isHex);
    } else {
      throw new InternalError('Invalid parameters for sign method');
    }

    // Ask user for persmission to sign the message
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided');
    }
    const confirmed = await this.config.requestUserConfirmation({
      url: this.config.url,
      name: this.config.title,
      type: 'message',
      data: {
        message,
        isHex,
      },
    });
    if (!confirmed) {
      throw new PermissionDeniedError('User said no.');
    }

    let messageBuffer: Uint8Array;
    if (isHex) {
      // Remove 0x prefix if present
      const hex = message.startsWith('0x') ? message.slice(2) : message;
      messageBuffer = Nimiq.BufferUtils.fromHex(hex);
    } else {
      messageBuffer = new TextEncoder().encode(message);
    }

    const localWallet = useLocalWallet().localWallet;
    const prefix = `\x16Nimiq Signed Message:\n${messageBuffer.length}`;

    const payload = new Nimiq.SerialBuffer(prefix.length + messageBuffer.length);
    payload.write(Nimiq.BufferUtils.fromUtf8(prefix));
    payload.write(messageBuffer);

    const hash = Nimiq.Hash.computeSha256(payload);
    const signature = localWallet.sign(hash);

    return {
      publicKey: localWallet.publicKey.toHex(),
      signature: signature.toHex(),
    };
  }

  private sendBasicTransaction(params: unknown): Promise<string> {
    // Parse params
    let recipient: string;
    let value: number;
    let fee = 0;

    if (Array.isArray(params) && params.length >= 2) {
      recipient = String(params[0]);
      value = Number(params[1]);
      if (params.length >= 3) {
        fee = Number(params[2]);
      }
    } else if (typeof params === 'object' && params !== null) {
      recipient = String((params as any).recipient);
      value = Number((params as any).value);
      if ((params as any).fee !== undefined) {
        fee = Number((params as any).fee);
      }
    } else {
      throw new InternalError('Invalid parameters for createBasicTransaction method');
    }

    return this.sendPayment({ recipient, value, fee });
  }

  private sendBasicTransactionWithData(params: unknown): Promise<string> {
    // Parse params
    let recipient: string;
    let value: number;
    let fee = 0;
    let message = '';

    if (Array.isArray(params) && params.length >= 2) {
      recipient = String(params[0]);
      value = Number(params[1]);
      if (params.length >= 3) {
        fee = Number(params[2]);
      }
      if (params.length >= 4) {
        message = String(params[3]);
      }
    } else if (typeof params === 'object' && params !== null) {
      recipient = String((params as any).recipient);
      value = Number((params as any).value);
      if ((params as any).fee !== undefined) {
        fee = Number((params as any).fee);
      }
      message = String((params as any).data);
    } else {
      throw new InternalError('Invalid parameters for createBasicTransaction method');
    }

    return this.sendPayment({ recipient, value, fee, message });
  }

  private async sendPayment(txData: {
    recipient: string;
    value: number;
    fee?: number;
    message?: string;
    merchant?: {
      name?: string;
      // category?: string;
    };
  }): Promise<string> {
    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided');
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
    });
    if (!confirmed) {
      throw new PermissionDeniedError('User said no.');
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
      throw new InternalError(`Failed to send payment transaction: ${result.error}`);
    }
    return result.data!.tx.hash;
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
    this.postMessage({ id, data });
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
    });
  }

  /**
   * Send a message to the mini app
   * @private
   */
  private postMessage(message: { id: number, data: any }): void {
    console.log('[MiniAppHost] Posting message to mini app:', message);
    this.inAppBrowser.postMessage({ detail: message });
  }
}

class UnknownRequestError extends Error {
  readonly type = 'UNKNOWN_REQUEST';
}

class InternalError extends Error {
  readonly type = 'INTERNAL_ERROR';
}

export class PermissionDeniedError extends Error {
    readonly type = 'PERMISSION_DENIED';
}

export class NetworkError extends Error {
    readonly type = 'NETWORK_ERROR';
}

export class InvalidTransactionError extends Error {
    readonly type = 'INVALID_TRANSACTION';
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
