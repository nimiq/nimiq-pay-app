import { PlainAccount, PlainTransaction, TransactionData } from './NimiqProvider'

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
