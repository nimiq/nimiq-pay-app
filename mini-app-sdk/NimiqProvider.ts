import type { PlainAccount, PlainTransaction } from '@nimiq/core'
import { Result } from './Result'

export type { PlainAccount, PlainTransaction }

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
     * Signs a transaction with the user's private key.
     * @param paymentData - The payment data to be signed
     * @returns An object containing the serialized signed transaction as a hex string and the PlainTransaction representation
     */
    // TODO: Separate claiming transactions into their own method
    sendPayment(paymentData: SendPaymentData): Promise<Result<{
        serialized: string,
        plain: Record<string, any>,
    }, PermissionDeniedError | InvalidTransactionError>>

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

export type SendPaymentData = {
    recipient: string,
    value: number,
    fee?: number,
    message?: string,
    merchant?: {
        name: string,
        // category?: string,
    },
}

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
