import type { MaybeRef } from 'vue'

export enum PaymentMethod {
  NIM = 'nim',
  Points = 'points',
}

export enum TransactionType {
  Payment = 'payment',
  LocalToRemote = 'local-to-remote',
  RemoteToLocal = 'remote-to-local',
  DepositLocal = 'deposit-local',
  DepositRemote = 'deposit-remote',
  ExtendRemote = 'extend-remote',
}

export enum WalletType {
  Unknown = 'unknown',
  Raw = 'raw',
  Instant = 'instant',
  Bonus = 'bonus',
}

export enum WalletStatus {
  Unknown = 'unknown',
  Pending = 'pending',
  Active = 'active',
  Expired = 'expired',
  Emptied = 'emptied',
}

export interface Kv {
  'pin': string // Only used in Web
  'isBackupDone': boolean
  'entropy': string
}
export type KvKey = keyof Kv
export interface Pair<K extends KvKey> { key: MaybeRef<K>; value: Kv[K] }

export type Transaction = {
  /**
   * Autoincremented id
   */
  id: MaybeRef<number>

  /**
   * The remote wallet id that paid the transaction
   */
  remoteAddress: MaybeRef<string>

  /**
   * Human merchant name
   */
  peerName?: MaybeRef<string>

  /**
   * Raw transaction
   */
  raw?: MaybeRef<string>

  /**
   * Also known as the provide e.g 'bluecode', 'cpl'...
   */
  rail?: MaybeRef<string>

  /**
   * Reference of the payment
   */
  railId?: MaybeRef<string>

  /**
   * Id of the merchant in Bluecode
   */
  railPeerId?: MaybeRef<string>

  /**
   * Details of the transaction
   */
  details?: MaybeRef<string>

  /**
   * Block height when the transaction was mined
   * TODO Do we need it?
   */
  block?: MaybeRef<number>

  recipient: MaybeRef<string>
  status: MaybeRef<Nimiq.Client.TransactionState>
  type: MaybeRef<TransactionType>
  ts: MaybeRef<number>
  amount: MaybeRef<number>
  fee: MaybeRef<number>
} & (
  { method: PaymentMethod.NIM; hash: MaybeRef<string | undefined> }
  | { method: PaymentMethod.Points }
)

export interface WalletTable {
  id: MaybeRef<string>
  type: MaybeRef<number>
  status: MaybeRef<number>
  balance: MaybeRef<number>
  start: MaybeRef<number>
  end: MaybeRef<number>
  proofSize: MaybeRef<number>
  active: MaybeRef<boolean>
}

export interface PriceTable {
  id: number
  currency: MaybeRef<string>
  ts: MaybeRef<number>
  value: MaybeRef<number>
}
export interface Kv {
  'pin': string // Only used in Web
  'isBackupDone': boolean
  'entropy': string
  'fiatPrice': number
  'fiatPriceChange': number
}

export enum SQLQuery {
  SelectKey = 'SELECT value FROM kv WHERE key = ?',
  HasKey = 'SELECT EXISTS (SELECT 1 FROM kv WHERE key = ?) AS exists',
  UpsertKeyValue = 'INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)',
  DeleteKey = 'DELETE FROM kv WHERE key = ?',

  SelectActiveWallet = 'SELECT * FROM wallets WHERE active = 1',
  InsertWallet = 'INSERT INTO wallets(id, type, status, balance, start, end, proofSize, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  DeactivateWallet = 'UPDATE wallets SET active = 0 WHERE id = ?',

  InsertTransaction = 'INSERT INTO transactions(id, remoteWalletAddress, peerName, raw, rail, railId, railPeerId, details, block, recipientAddress, status, type, ts, amount, fee, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  GetAllTransactions = 'SELECT * FROM transactions',
}

export interface SQLQueryArg {
  [SQLQuery.SelectKey]: MaybeRef<KvKey>
  [SQLQuery.HasKey]: MaybeRef<KvKey>
  [SQLQuery.UpsertKeyValue]: Pair<KvKey>
  [SQLQuery.DeleteKey]: MaybeRef<KvKey>

  [SQLQuery.SelectActiveWallet]: undefined
  [SQLQuery.InsertWallet]: WalletTable
  [SQLQuery.DeactivateWallet]: MaybeRef<string>

  [SQLQuery.InsertTransaction]: Omit<Transaction, 'id'>
  [SQLQuery.GetAllTransactions]: undefined
}

export interface SQLQueryResult {
  [SQLQuery.SelectKey]: Pair<KvKey>
  [SQLQuery.HasKey]: boolean
  [SQLQuery.UpsertKeyValue]: undefined
  [SQLQuery.DeleteKey]: undefined

  [SQLQuery.SelectActiveWallet]: WalletTable | undefined
  [SQLQuery.InsertWallet]: undefined
  [SQLQuery.DeactivateWallet]: undefined

  [SQLQuery.InsertTransaction]: undefined
  [SQLQuery.GetAllTransactions]: Transaction[]
}
