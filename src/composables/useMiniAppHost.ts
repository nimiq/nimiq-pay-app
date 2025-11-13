import type { InAppBrowser } from '@capgo/inappbrowser';
import {
    InvalidTransactionError,
    NetworkError,
    PermissionDeniedError,
    PlainAccount,
    PlainTransaction,
    NimiqProvider as ProviderInterface,
    TransactionData,
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

export interface InAppBrowserMessageEvent {
  detail: {
    message?: string;
    [key: string]: any;
  };
}

/**
 * Configuration for the MiniAppHost
 */
export interface MiniAppHostConfig {
  /**
   * Callback to request user confirmation for sensitive operations
   * @param message - Message to show to the user
   * @returns Promise that resolves to true if user confirms, false otherwise
   */
  requestUserConfirmation?: (message: string) => Promise<boolean>;
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
    const result = await store.getAccount(Nimiq.Address.fromUserFriendlyAddress(address));
    if (result.error) {
      throw new NetworkError(`Failed to get account: ${result.error}`);
    }
    return result.data!;
  }

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
