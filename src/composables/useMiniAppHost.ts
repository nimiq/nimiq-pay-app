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

export type UserConfirmationRequest = {
  type: 'transaction',
  data: Omit<PaymentRequestData, 'transfer'>,
}

/**
 * Configuration for the MiniAppHost
 */
export interface MiniAppHostConfig {
  url: string;

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

  constructor(inAppBrowser: typeof InAppBrowser, config: MiniAppHostConfig) {
    this.inAppBrowser = inAppBrowser;
    this.config = config;
    this.setupMessageListener();
  }

  /**
   * Setup listener for messages from the mini app
   */
  private setupMessageListener(): void {
    this.inAppBrowser.addListener('messageFromWebview', async (event: InAppBrowserMessageEvent) => {
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
    });
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
        case 'isConsensusEstablished': return this.handleIsConsensusEstablished();
        case 'requestAccounts': return this.requestAccounts();
        // case 'getAccount': return this.getAccount(message.data as RequestType['getAccount']);
        // case 'sendPayment': return this.sendPayment(message.data as RequestType['sendPayment']);
        // case 'signTransaction': return this.signTransaction(message.data as RequestType['signTransaction']);
        default:
          console.warn('[MiniAppHost] Unknown message name:', message.name);
          throw new UnknownRequestError(`Unknown message name: ${message.name}`);
      }
    } catch (error) {
      console.error('[MiniAppHost] Error handling message:', error);
      throw new InternalError('Internal error handling message: ' + (error as Error).message);
    }
  }

  private handleIsConsensusEstablished() {
    return useNimiqNetwork().consensus === 'established';
  }

  private requestAccounts() {
    const remoteAddress = useRemoteSigner().remoteAddress;
    const localAddress = useLocalWallet().localAddress;
    return [localAddress.toUserFriendlyAddress(), remoteAddress?.toUserFriendlyAddress()].filter(Boolean);
  }

  // private async getAccount(address: RequestType['getAccount']): Promise<ResponseType['getAccount']> {
  //   const store = useNimiqNetwork();
  //   // TODO: If address is local or remote address, we can skip the network request and reply with data from the store
  //   const result = await store.getAccount(Nimiq.Address.fromUserFriendlyAddress(address));
  //   if (result.error) {
  //     throw new NetworkError(`Failed to get account: ${result.error}`);
  //   }
  //   return result.data!;
  // }

  // private async sendPayment(txData: SendPaymentData): Promise<ResponseType['sendPayment']> {
  //   // TODO: Validate txData fields

  //   if (!this.config.requestUserConfirmation) {
  //     throw new InternalError('Confirmation handler not provided');
  //   }

  //   const confirmed = await this.config.requestUserConfirmation({
  //     type: 'transaction',
  //     data: {
  //       recipient: txData.recipient,
  //       amount: txData.value,
  //       fee: txData.fee || 0,
  //       message: txData.message,
  //       merchantName: txData.merchant?.name,
  //     },
  //   });
  //   if (!confirmed) {
  //     throw new PermissionDeniedError('User said no.');
  //   }

  //   const result = await useTransactions().sendTx({
  //     recipient: txData.recipient,
  //     amount: txData.value,
  //     title: 'Payment',
  //     transfer: Transfer.UserPaymentToMerchant,
  //     message: txData.message,
  //     merchantName: txData.merchant?.name,
  //     // merchantCategory: txData.merchant?.category,
  //     // invoiced:
  //     // fiatAmount:
  //     // fiatCurrency:
  //     // paymentRef:
  //     meta: {
  //       miniApp: {
  //         url: this.config.url,
  //       },
  //     },
  //   })
  //   if (result.error) {
  //     throw new InternalError(`Failed to send payment transaction: ${result.error}`);
  //   }
  //   return {
  //     serialized: result.data!.serialized,
  //     plain: result.data!.tx as Record<string, any>,
  //   };
  // }

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
