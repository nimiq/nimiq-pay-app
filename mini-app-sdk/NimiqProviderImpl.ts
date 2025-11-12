import {
    InvalidTransactionError,
    NetworkError,
    PermissionDeniedError,
    PlainAccount,
    PlainTransaction,
    NimiqProvider as ProviderInterface,
    Result,
    TransactionData,
} from "./NimiqProvider"

/**
 * Window interface extension for mobileApp injected by InAppBrowser
 */
export interface MobileAppWindow extends Window {
  mobileApp?: {
    postMessage: (message: any) => void;
  };
}

export class NimiqProvider implements ProviderInterface {
    private subscriptions: {[K in keyof SubscriptionType]?: Set<Handler<K>>}= {};
    private requestId = 0;
    private pendingRequests = new Map<string, { resolve: (value: ResponseData) => void; reject: (error: ErrorData) => void }>();

    constructor() {
        this.setupMessageListener();
    }

    /**
     * Check if running inside InAppBrowser
     */
    public isInMiniApp(): boolean {
        return !!(window as MobileAppWindow).mobileApp;
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

    isConsensusEstablished(): Promise<boolean> {
        return this.request('isConsensusEstablished', {})
    }

    async getSenderAddress(): Promise<Result<string, PermissionDeniedError>> {
        try {
            const address = await this.request('getSenderAddress', {})
            return { ok: true, value: address }
        } catch (error) {
            if (error === 'permission-denied') {
                return { ok: false, error: new PermissionDeniedError('User denied permission to access sender address.') }
            }
            throw error
        }
    }

    async getDepositAddress(): Promise<Result<string, PermissionDeniedError>> {
        try {
            const address = await this.request('getDepositAddress', {})
            return { ok: true, value: address }
        } catch (error) {
            if (error === 'permission-denied') {
                return Promise.resolve({ ok: false, error: new PermissionDeniedError('User denied permission to access deposit address.') })
            }
            throw error
        }
    }

    async getAccount(address: string): Promise<Result<PlainAccount, NetworkError>> {
        try {
            const account = await this.request('getAccount', { address })
            return { ok: true, value: account }
        } catch (error) {
            if (error === 'network') {
                return { ok: false, error: new NetworkError('Network error while fetching account.') }
            }
            throw error
        }
    }

    async makeTransaction(transactionData: TransactionData): Promise<Result<{
        serialized: string,
        serializedContent: string,
        plain: PlainTransaction,
    }, InvalidTransactionError>> {
        try {
            const result = await this.request('makeTransaction', transactionData)
            return { ok: true, value: result }
        } catch (error) {
            if (error === 'invalid-transaction') {
                return { ok: false, error: new InvalidTransactionError('The provided transaction data is invalid.') }
            }
            throw error
        }
    }

    async signTransaction(transactionData: string | TransactionData): Promise<Result<{
        serialized: string,
        plain: PlainTransaction,
    }, PermissionDeniedError | InvalidTransactionError>> {
        try {
            const result = await this.request('signTransaction', transactionData)
            return { ok: true, value: result }
        } catch (error) {
            if (error === 'permission-denied') {
                return { ok: false, error: new PermissionDeniedError('User denied permission to sign the transaction.') }
            } else if (error === 'invalid-transaction') {
                return { ok: false, error: new InvalidTransactionError('The provided transaction data is invalid.') }
            }
            throw error
        }
    }

    async sendTransaction(signedTransaction: string | PlainTransaction): Promise<Result<string, NetworkError | InvalidTransactionError>> {
        try {
            const txHash = await this.request('sendTransaction', signedTransaction)
            return { ok: true, value: txHash }
        } catch (error) {
            if (error === 'network') {
                return { ok: false, error: new NetworkError('Network error while sending transaction.') }
            } else if (error === 'invalid-transaction') {
                return { ok: false, error: new InvalidTransactionError('The signed transaction is invalid.') }
            }
            throw error
        }
    }

    async getUserTransactions(limit?: number, cursor?: string): Promise<Result<PlainTransaction[], PermissionDeniedError | NetworkError>> {
        try {
            const transactions = await this.request('getUserTransactions', { limit, cursor })
            return { ok: true, value: transactions }
        } catch (error) {
            if (error === 'permission-denied') {
                return { ok: false, error: new PermissionDeniedError('User denied permission to access transaction history.') }
            } else if (error === 'network') {
                return { ok: false, error: new NetworkError('Network error while fetching user transactions.') }
            }
            throw error
        }
    }

    async getTransactionsByAddress(address: string, limit?: number, cursor?: string): Promise<Result<PlainTransaction[], NetworkError>> {
        try {
            const transactions = await this.request('getTransactionsByAddress', { address, limit, cursor })
            return { ok: true, value: transactions }
        } catch (error) {
            if (error === 'network') {
                return { ok: false, error: new NetworkError('Network error while fetching transactions for address.') }
            }
            throw error
        }
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

            const pending = this.pendingRequests.get(message.id)!;
            this.pendingRequests.delete(message.id);
            if (message.type === 'error') {
                pending.reject(message.data);
            } else {
                pending.resolve(message.data);
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
        const win = window as MobileAppWindow;
        if (!win.mobileApp) {
            console.warn('[MiniAppClient] mobileApp not available, are you running inside InAppBrowser?');
            return;
        }

        win.mobileApp.postMessage({ detail: message });
    }

    private async request<T extends keyof RequestType>(type: T, data: RequestType[T]): Promise<ResponseType[T]> {
        return new Promise<ResponseType[T]>((resolve, reject) => {
            const id = `request-${++this.requestId}`;
            // const timeout = setTimeout(() => {
            //   this.pendingRequests.delete(id);
            //   reject(new Error('Request timeout'));
            // }, 5000);

            this.pendingRequests.set(id, {
                resolve: (message: ResponseData) => {
                    // clearTimeout(timeout);
                    resolve(message as ResponseType[T]);
                },
                reject: (error) => {
                    // clearTimeout(timeout);
                    reject(error);
                },
            });

            this.postMessage({
                type,
                data,
                id,
            });
        });
    }
}

export type RequestType = {
    isConsensusEstablished: {},
    getSenderAddress: {},
    getDepositAddress: {},
    getAccount: { address: string },
    makeTransaction: TransactionData,
    signTransaction: string | TransactionData,
    sendTransaction: string | PlainTransaction,
    getUserTransactions: { limit?: number, cursor?: string },
    getTransactionsByAddress: { address: string, limit?: number, cursor?: string },
}

export type RequestMessage<T extends keyof RequestType = keyof RequestType> = { type: T, data: RequestType[T], id: string }

export type ResponseType = {
    isConsensusEstablished: boolean,
    getSenderAddress: string,
    getDepositAddress: string,
    getAccount: PlainAccount,
    makeTransaction: {
        serialized: string,
        serializedContent: string,
        plain: PlainTransaction,
    },
    signTransaction: {
        serialized: string,
        plain: PlainTransaction,
    },
    sendTransaction: string,
    getUserTransactions: PlainTransaction[],
    getTransactionsByAddress: PlainTransaction[],
}

export type ResponseData = ResponseType[keyof ResponseType]

export type ErrorData = {
    type: string,
    message: string,
    details?: any,
}

export type ResponseMessage<T extends keyof ResponseType = keyof ResponseType> = { type: T, data: ResponseType[T], id: string }
export type ErrorMessage = { type: 'error', data: ErrorData, id: string }

export type SubscriptionType = {
    // consensusEstablished: boolean,
    // peerCount: number,
}

export type SubscriptionMessage<T extends keyof SubscriptionType = keyof SubscriptionType> = { type: T, data: SubscriptionType[T] }

/**
 * Message handler callback type
 */
export type Handler<T extends keyof SubscriptionType> = (message: SubscriptionType[T]) => void | Promise<void>;
