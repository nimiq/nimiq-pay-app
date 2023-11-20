import type { MaybeRef } from 'vue'

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

export interface BaseTransaction {
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
  details?: string

  sender: string
  recipient: string
  status: Nimiq.Client.TransactionState
  ts: number
  value: number
  fee: number
  hash: string
}

export type UserTransaction = BaseTransaction & { transfer: Omit<Transfer, Transfer.UserReceipt> }
export type ReceiptTransaction = BaseTransaction & { transfer: Transfer.UserReceipt }
export type Transaction = UserTransaction | ReceiptTransaction

export enum PaymentMethod {
  NIM = 'nim',
  Points = 'points',
}

export interface PriceTable {
  id: number
  currency: MaybeRef<string>
  ts: MaybeRef<number>
  value: MaybeRef<number>
}

export enum SQLQuery {

  // InsertTransaction = 'INSERT INTO transactions(id, remoteAddress, peerName, raw, rail, railId, railPeerId, details, recipient, status, transferType, ts, amount, fee, hash, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  // GetAllTransactions = 'SELECT * FROM transactions',

  InsertPrice = 'INSERT INTO nimPrices (currency, ts, value) VALUES (?, ?, ?)',
  GetPriceAt = 'SELECT * FROM nimPrices WHERE ts <= ? AND currency = ? ORDER BY ts DESC LIMIT 1',
}

export interface SQLQueryArg {
  // [SQLQuery.InsertTransaction]: Omit<Transaction, 'id'>
  // [SQLQuery.GetAllTransactions]: undefined

  [SQLQuery.InsertPrice]: Omit<PriceTable, 'id'>
  [SQLQuery.GetPriceAt]: { ts: number; currency: string }
}

export interface SQLQueryResult {
  // [SQLQuery.InsertTransaction]: undefined
  // [SQLQuery.GetAllTransactions]: Transaction[]

  [SQLQuery.InsertPrice]: undefined
  [SQLQuery.GetPriceAt]: PriceTable | undefined
}
