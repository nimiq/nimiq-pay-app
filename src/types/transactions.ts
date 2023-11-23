import type { MaybeRef, Ref } from 'vue'

export enum Transfer {
  // Normal payment from the user to the merchant or another user
  UserPayment = 'user-payment',

  // The users receives funds from any other user
  UserReceipt = 'user-receipt',

  // When the user receives funds, they will be automatically send to the HTLC contract
  LocalToRemote = 'local-to-remote',

  // When the user sends funds to the HTLC contract but there is already a HTLC contract with the user's address,
  // then the funds need to be recovered. And then the user can start a new HTLC contract.
  RemoteToLocal = 'remote-to-local',

  // If the server misbehave and doesn't sends the funds before the timeout of the HTLC, then the user can recover the funds. Usually the server will send the funds before the timeout.
  RemoteToLocalAfterTimeout = 'remote-to-local-after-timeout',

  // A special transaction to extend the validity of the HTLC contract
  ExtendRemote = 'extend-remote',
}

export interface BaseTransactionDb {
  /**
   * Human merchant name
   */
  peerName?: string

  /**
   * Raw transaction
   */
  raw?: string

  /**
   * Also known as the provide e.g 'bluecode', 'cpl'...
   */
  rail?: string

  /**
   * Reference of the payment
   */
  railId?: string

  /**
   * Id of the merchant in Bluecode
   */
  railPeerId?: string

  /**
   * Details of the transaction
   */
  message?: string

  sender: string
  recipient: string
  status: Nimiq.Client.TransactionState
  timestamp: number
  value: number
  fee: number
  hash: string
}

export type UserTransactionDb = BaseTransactionDb & { transfer: Omit<Transfer, Transfer.UserReceipt> }
export type ReceiptTransactionDb = BaseTransactionDb & { transfer: Transfer.UserReceipt }
export type TransactionDb = UserTransactionDb | ReceiptTransactionDb

export type Transaction = TransactionDb & {
  title: string
  fiatAmount: number
  fiatUnit: string
  location?: string
}
