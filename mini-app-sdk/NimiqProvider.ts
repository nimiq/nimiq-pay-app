import type { PlainAccount, PlainTransaction, PlainTransactionRecipientData } from '@nimiq/core'
import { Result } from './Result'

export { PlainAccount, PlainTransaction, PlainTransactionRecipientData }

export interface NimiqProvider {
    /**
     * Checks if the app has established consensus on the Nimiq network.
     * @returns A boolean indicating whether consensus is established
     */
    isConsensusEstablished(): Promise<boolean>

    /**
     * Retrieves the sender address for the user's account.
     * @returns The sender address as a string
     */
    getSenderAddress(): Promise<Result<string, PermissionDeniedError>>

    /**
     * Retrieves the deposit address for the user's account.
     * @returns The deposit address as a string
     */
    getDepositAddress(): Promise<Result<string, PermissionDeniedError>>

    /**
     * Retrieves the account information for a given Nimiq address.
     * @param address - The Nimiq address to get the account for
     * @returns The PlainAccount representation of the account
     */
    getAccount(address: string): Promise<Result<PlainAccount, NetworkError>>

    /**
     * Creates a transaction based on the provided transaction data.
     * @param transactionData - The transaction data
     * @returns An object containing the serialized transaction as a hex string, the serialized content for signing, and the PlainTransaction representation
     */
    makeTransaction(transactionData: TransactionData): Promise<Result<{
        serialized: string,
        serializedContent: string,
        plain: PlainTransaction,
    }, InvalidTransactionError>>

    /**
     * Signs a transaction with the user's private key.
     * @param transactionData - The transaction data to be signed
     * @returns An object containing the serialized signed transaction as a hex string and the PlainTransaction representation
     */
    // TODO: Rename to "sendPayment" (which are automatically broadcast as well by the cosigner), and separate claiming transactions into their own method
    signTransaction(transactionData: string | TransactionData): Promise<Result<{
        serialized: string,
        plain: PlainTransaction,
    }, PermissionDeniedError | InvalidTransactionError>>

    /**
     * Sends a signed transaction to the Nimiq network.
     * @param signedTransaction - The signed transaction as a hex string or PlainTransaction
     * @returns The transaction hash as a hex string
     */
    sendTransaction(signedTransaction: string | PlainTransaction): Promise<Result<string, NetworkError | InvalidTransactionError>>

    /**
     * Retrieves the user's transaction history.
     * @param limit - The maximum number of transactions to return
     * @param cursor - Only transactions earlier than this hash will be returned (if the hash does not exist in the user's history, no results are returned)
     * @return An array of PlainTransaction objects
     */
    getUserTransactions(limit?: number, cursor?: string): Promise<Result<PlainTransaction[], PermissionDeniedError | NetworkError>>

    /**
     * Retrieves the transaction history for a specific Nimiq address.
     * @param address - The Nimiq address to get transactions for
     * @param limit - The maximum number of transactions to return
     * @param cursor - Only transactions earlier than this hash will be returned (if the hash does not exist in the address's history, no results are returned)
     * @return An array of PlainTransaction objects
     */
    getTransactionsByAddress(address: string, limit?: number, cursor?: string): Promise<Result<PlainTransaction[], NetworkError>>

    /**
     * Converts a hex string to a byte array.
     * @param hex - A hex string
     * @returns The corresponding byte array
     */
    hexToBytes(hex: string): Uint8Array

    /**
     * Converts a byte array to a hex string.
     * @param bytes - A byte array
     * @returns The corresponding hex string
     */
    bytesToHex(bytes: Uint8Array): string
}

/// INPUTS

export type SendTransactionData = {
    direction: 'send',
    recipient: string,
    recipientType?: 'basic' | 'vesting' | 'htlc' | 'staking',
    value: number,
    fee?: number,
    data?: PlainTransactionRecipientData,
    flags?: number,
}

export type ClaimTransactionData = {
    direction: 'claim',
    sender: string,
    senderType: 'vesting' | 'htlc' | 'staking',
    senderData?: {
        type: 'delete-validator',
    } | {
        type: 'remove-stake',
    },
    value: number,
    fee?: number,
    data?: PlainTransactionRecipientData,
}

export type TransactionData = SendTransactionData | ClaimTransactionData

/// RETURN VALUES

export class PermissionDeniedError extends Error {
    readonly type = 'permission-denied'
}

export class NetworkError extends Error {
    readonly type = 'network'
}

export class InvalidTransactionError extends Error {
    readonly type = 'invalid-transaction'
}

export class TimeoutError extends Error {
    readonly type = 'timeout'
}
