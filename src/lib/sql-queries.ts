// export type PointsTransaction = BaseTransaction & { method: PaymentMethod.Points }
// export type NimTransaction = BaseTransaction & { method: PaymentMethod.NIM; hash: string }
// export type Transaction = PointsTransaction | NimTransaction

// We store the remote Wallet.
// The only thing we store about the local wallet is the entropy, and from that we can derive the private key
// and its remote wallet
export interface RemoteSigner {
  address: Nimiq.Address
  balance: number
  proofSize: number
  publicKey: string
  active: boolean

  /**
   * The validity of the wallet has started to be valid
   */
  start: number

  /**
   * The validity of the wallet has ended
   */
  end: number
}

export enum SQLQuery {
  CreateTxsTable = 'CREATE TABLE IF NOT EXISTS transactions (hash TEXT PRIMARY KEY, timestamp INTEGER, sender TEXT, recipient TEXT, value INTEGER, fee INTEGER, message TEXT, status TEXT, raw TEXT, rail TEXT, railId TEXT, railPeerId TEXT, transfer TEXT)',
  SelectPaginationTransactions = 'SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ? OFFSET ?',
  UpsertTx = 'INSERT OR REPLACE INTO transactions (hash, timestamp, sender, recipient, value, fee, message, status, raw, rail, railId, railPeerId, transfer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ClearTxHistory = 'DELETE FROM transactions',

  CreateRemoteSignersTable = 'CREATE TABLE IF NOT EXISTS remote_signers (address TEXT PRIMARY KEY, balance INTEGER, proofSize INTEGER, publicKey TEXT, start INTEGER, end INTEGER, active INTEGER)',
  GetActiveRemoteSigner = 'SELECT * FROM remote_signers WHERE active = 1',
  DeactivateRemoteSigners = 'UPDATE remote_signers SET active = 0',
  InsertRemoteSigner = 'INSERT OR REPLACE INTO remote_signers (address, balance, proofSize, publicKey, start, end, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
  UpdateValidityRemoteSigner = 'UPDATE remote_signers SET start = ?, end = ? WHERE address = ?',
  UpdateRemoteBalance = 'UPDATE remote_signers SET balance = ? WHERE active = 1',
}

interface Migration {
  version: number
  statements: string[]
}

export const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
      SQLQuery.CreateTxsTable,
      'CREATE TABLE IF NOT EXISTS wallets (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, balance INTEGER, start INTEGER, end INTEGER, proofSize INTEGER);',
      'CREATE TABLE IF NOT EXISTS nimPrices (id INTEGER PRIMARY KEY AUTOINCREMENT, currency TEXT NOT NULL, ts INTEGER NOT NULL, value INTEGER NOT NULL);',
    ],
  },
]
