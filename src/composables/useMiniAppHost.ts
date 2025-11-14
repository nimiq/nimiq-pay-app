import type { InAppBrowser } from '@capgo/inappbrowser';
import {
    InvalidTransactionError,
    NetworkError,
    PermissionDeniedError,
    PlainAccount,
    PlainTransaction,
    NimiqProvider as ProviderInterface,
    SendPaymentData,
} from "./../../mini-app-sdk/NimiqProvider"

import {
    ErrorData,
    ErrorMessage,
    Handler,
    RequestMessage,
    RequestType,
    ResponseData,
    ResponseMessage,
    ResponseType,
    SubscriptionMessage,
    SubscriptionType,
} from './../../mini-app-sdk/types'
import { mapError, Result, unwrap } from "./../../mini-app-sdk/Result";
import { useNimiqNetwork } from '@/stores/nimiq-network';
import { useLocalWallet } from '@/stores/local-wallet';
import { useRemoteSigner } from '@/stores/remote-signer';
import type { PlainTransactionSenderData, Transaction } from '@nimiq/core';
import { createResolveProof, getSignedTxByRemote } from '@/lib/tx';
import { storeToRefs } from 'pinia';
import { useTransactions } from '@/stores/transactions';
import { Transfer } from '@/types/transactions';

export interface InAppBrowserMessageEvent {
  detail: {
    message?: string;
    [key: string]: any;
  };
}

export type UserConfirmationRequest = {
  type: 'transaction',
  plain: Record<string, any>,
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
      console.log('[MiniAppHost] Received message from webview:', event.detail);
      console.log('[MiniAppHost] event.detail.type:', event.detail?.type);
      console.log('[MiniAppHost] Has type?', !!event.detail?.type);

      if (event.detail?.type) {
        console.log('[MiniAppHost] Calling handleMessage');
        const message = event.detail as RequestMessage;
        try {
          const data = await this.handleMessage(message);
          this.send({
            id: message.id,
            type: message.type,
            data,
          });
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
      } else {
        console.warn('[MiniAppHost] Message has no type property, skipping');
      }
    });
  }

  /**
   * Handle incoming message from mini app
   * @private
   */
  // private async handleMessage<T extends keyof RequestType>(message: RequestMessage<T>): Promise<ResponseType[T]> {
  private async handleMessage<T extends keyof RequestType>(message: RequestMessage<T>): Promise<ResponseData> {
    console.log('[MiniAppHost] Handling message:', message);

    // Handle built-in message types
    console.log('[MiniAppHost] Handling built-in message type:', message.type);
    try {
      switch (message.type) {
        case 'isConsensusEstablished': return this.handleIsConsensusEstablished();
        case 'getSenderAddress': return this.handleGetSenderAddress();
        case 'getDepositAddress': return this.handleGetDepositAddress();
        case 'getAccount': return this.getAccount(message.data as RequestType['getAccount']);
        case 'sendPayment': return this.sendPayment(message.data as RequestType['sendPayment']);
        // case 'signTransaction': return this.signTransaction(message.data as RequestType['signTransaction']);
        default:
          console.warn('[MiniAppHost] Unknown message type:', message.type);
          throw new UnknownRequestError(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[MiniAppHost] Error handling message:', error);
      throw new InternalError('Internal error handling message: ' + (error as Error).message);
    }
  }

  private handleIsConsensusEstablished(): ResponseType['isConsensusEstablished'] {
    return useNimiqNetwork().consensus === 'established';
  }

  private handleGetSenderAddress(): ResponseType['getSenderAddress'] {
    const address = useRemoteSigner().remoteAddress;
    return address?.toUserFriendlyAddress() || '';
  }

  private handleGetDepositAddress(): ResponseType['getDepositAddress'] {
    const address = useLocalWallet().localAddress;
    return address.toUserFriendlyAddress();
  }

  private async getAccount(address: RequestType['getAccount']): Promise<ResponseType['getAccount']> {
    const store = useNimiqNetwork();
    // TODO: If address is local or remote address, we can skip the network request and reply with data from the store
    const result = await store.getAccount(Nimiq.Address.fromUserFriendlyAddress(address));
    if (result.error) {
      throw new NetworkError(`Failed to get account: ${result.error}`);
    }
    return result.data!;
  }

  private async sendPayment(txData: SendPaymentData): Promise<ResponseType['sendPayment']> {
    // TODO: Validate txData fields

    if (!this.config.requestUserConfirmation) {
      throw new InternalError('Confirmation handler not provided');
    }

    const confirmed = await this.config.requestUserConfirmation({
      type: 'transaction',
      plain: txData,
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
    return {
      serialized: result.data!.serialized,
      plain: result.data!.tx as Record<string, any>,
    };
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
  private send<T extends ResponseMessage>(message: T): void {
    this.postMessage(message);
  }

  /**
   * Send error response
   * @private
   */
  private sendError(id: string, type: string, message: string): void {
    this.postMessage({
      type: 'error',
      id,
      data: {
        type,
        message,
      },
    });
  }

  /**
   * Send a message to the mini app
   * @private
   */
  private postMessage(message: ResponseMessage | ErrorMessage): void {
    console.log('[MiniAppHost] Posting message to mini app:', message);
    this.inAppBrowser.postMessage({ detail: message });
  }
}

class UnknownRequestError extends Error {
  readonly type = 'unknown-request';
}

class InternalError extends Error {
  readonly type = 'internal-error';
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
