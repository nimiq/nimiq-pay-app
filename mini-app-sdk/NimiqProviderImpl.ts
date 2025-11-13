import {
    InvalidTransactionError,
    NetworkError,
    PermissionDeniedError,
    PlainAccount,
    PlainTransaction,
    NimiqProvider as ProviderInterface,
    TransactionData,
} from "./NimiqProvider"
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
} from './types'
import { mapError, Result, unwrap } from "./Result";

/**
 * Window interface extension for `mobileApp` injected by InAppBrowser plugin
 */
declare global {
    interface Window {
        mobileApp?: {
            postMessage: (message: any) => void;
        };
    }
}

export class NimiqProvider implements ProviderInterface {
    private subscriptions: { [K in keyof SubscriptionType]?: Set<Handler<K>> } = {};
    private requestId = 0;
    private pendingRequests = new Map<string, (value: Result<ResponseData, ErrorData>) => void>();

    constructor() {
        this.setupMessageListener();
    }

    /**
     * Check if running inside InAppBrowser
     */
    public isInMiniApp(): boolean {
        return !!window.mobileApp;
    }

    /**
     * Subscribe to a specific message type
     */
    public subscribe<T extends keyof SubscriptionType>(type: T, handler: Handler<T>): () => void {
        if (!this.subscriptions[type]) {
            Object.assign(this.subscriptions, { [type]: new Set() });
        }

        this.subscriptions[type]!.add(handler);

        // Return unsubscribe function
        return () => {
            const handlers = this.subscriptions[type];
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    async isConsensusEstablished(): Promise<boolean> {
        const result = await this.request('isConsensusEstablished', {})
        return unwrap(result)
    }

    async getSenderAddress(): Promise<Result<string, PermissionDeniedError>> {
        const result = await this.request('getSenderAddress', {})
        return mapError(result, (error) => {
            switch (error.type) {
                case 'permission-denied': return new PermissionDeniedError(error.message)
                default: throw new Error(`${error.type}: ${error.message}`)
            }
        })
    }

    async getDepositAddress(): Promise<Result<string, PermissionDeniedError>> {
        const result = await this.request('getDepositAddress', {})
        return mapError(result, (error) => {
            switch (error.type) {
                case 'permission-denied': return new PermissionDeniedError(error.message)
                default: throw new Error(`${error.type}: ${error.message}`)
            }
        })
    }

    async getAccount(address: string): Promise<Result<PlainAccount, NetworkError>> {
        const result = await this.request('getAccount', { address })
        return mapError(result, (error) => {
            switch (error.type) {
                case 'network': return new NetworkError(error.message)
                default: throw new Error(`${error.type}: ${error.message}`)
            }
        })
    }

    async makeTransaction(transactionData: TransactionData): Promise<Result<{
        serialized: string,
        serializedContent: string,
        plain: PlainTransaction,
    }, InvalidTransactionError>> {
        const result = await this.request('makeTransaction', transactionData)
        return mapError(result, (error) => {
            if (error.type === 'invalid-transaction') {
                return new InvalidTransactionError(error.message)
            }
            throw new Error(`${error.type}: ${error.message}`)
        })
    }

    async signTransaction(transactionData: string | TransactionData): Promise<Result<{
        serialized: string,
        plain: PlainTransaction,
    }, PermissionDeniedError | InvalidTransactionError>> {
        const result = await this.request('signTransaction', transactionData)
        return mapError(result, (error) => {
            switch (error.type) {
                case 'permission-denied': return new PermissionDeniedError(error.message)
                case 'invalid-transaction': return new InvalidTransactionError(error.message)
                default: throw new Error(`${error.type}: ${error.message}`)
            }
        })
    }

    async sendTransaction(signedTransaction: string | PlainTransaction): Promise<Result<string, NetworkError | InvalidTransactionError>> {
        const result = await this.request('sendTransaction', signedTransaction)
        return mapError(result, (error) => {
            switch (error.type) {
                case 'network': return new NetworkError(error.message)
                case 'invalid-transaction': return new InvalidTransactionError(error.message)
                default: throw new Error(`${error.type}: ${error.message}`)
            }
        })
    }

    async getUserTransactions(limit?: number, cursor?: string): Promise<Result<PlainTransaction[], PermissionDeniedError | NetworkError>> {
        const result = await this.request('getUserTransactions', { limit, cursor })
        return mapError(result, (error) => {
            switch (error.type) {
                case 'permission-denied': return new PermissionDeniedError(error.message)
                case 'network': return new NetworkError(error.message)
                default: throw new Error(`${error.type}: ${error.message}`)
            }
        })
    }

    async getTransactionsByAddress(address: string, limit?: number, cursor?: string): Promise<Result<PlainTransaction[], NetworkError>> {
        const result = await this.request('getTransactionsByAddress', { address, limit, cursor })
        return mapError(result, (error) => {
            switch (error.type) {
                case 'network': return new NetworkError(error.message)
                default: throw new Error(`${error.type}: ${error.message}`)
            }
        })
    }

    hexToBytes(hex: string): Uint8Array {
        hex = hex.trim().toLowerCase();
        if (hex.length % 2 !== 0) {
            throw new Error("Invalid hex string length.")
        }
        if (hex.startsWith('0x')) {
            hex = hex.slice(2)
        }
        if (!/^[0-9a-f]*$/.test(hex)) {
            throw new Error("Invalid hex string.")
        }
        return new Uint8Array((hex.match(/.{2}/g) || []).map(byte => parseInt(byte, 16)))
    }

    bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
    }

    /**
     * Setup listener for messages from the host app
     */
    private setupMessageListener(): void {
        window.addEventListener('messageFromNative', ((event: CustomEvent) => {
            const detail: ResponseMessage | ErrorMessage | undefined = event.detail;
            console.log('[MiniAppClient] Received message from native:', detail);

            if (detail?.type) {
                this.handleMessage(detail);
            }
        }) as EventListener);
    }

    /**
     * Handle incoming message from host
     */
    private async handleMessage(message: ResponseMessage | ErrorMessage | SubscriptionMessage): Promise<void> {
        // Handle pending request responses
        if ('id' in message) {
            if (!this.pendingRequests.has(message.id)) return;

            const resolver = this.pendingRequests.get(message.id)!;
            this.pendingRequests.delete(message.id);
            if (message.type === 'error') {
                resolver({ ok: false, error: message.data });
            } else {
                resolver({ ok: true, value: message.data });
            }
            return;
        }

        // Handle subscription handlers
        const handlers = (this.subscriptions[message.type] ?? new Set()) as Set<Handler<keyof SubscriptionType>>;
        handlers.forEach(async (handler) => {
            try {
                await handler(message.data)
            } catch (error) {
                console.error('[MiniAppClient] Error in message handler:', error);
            }
        });
    }

    /**
     * Send a message to the host app
     */
    private postMessage(message: RequestMessage): void {
        if (!window.mobileApp) {
            console.warn('[MiniAppClient] mobileApp not available, are you running inside InAppBrowser?');
            return;
        }

        window.mobileApp.postMessage({ detail: message });
    }

    private async request<T extends keyof RequestType>(type: T, data: RequestType[T]): Promise<Result<ResponseType[T], ErrorData>> {
        return new Promise((resolve) => {
            const id = `request-${++this.requestId}`;
            // const timeout = setTimeout(() => {
            //   this.pendingRequests.delete(id);
            //   reject(new Error('Request timeout'));
            // }, 5000);

            this.pendingRequests.set(id, resolve as (message: Result<ResponseData, ErrorData>) => void);
            this.postMessage({ type, data, id });
        });
    }
}
