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
  CreateKvTable = 'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  SelectKv = 'SELECT value FROM kv WHERE key = ?',
  UpsertKv = 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
  DeleteKv = 'DELETE FROM kv WHERE key = ?',

  CreateTxsTable = 'CREATE TABLE IF NOT EXISTS transactions (hash TEXT PRIMARY KEY, timestamp INTEGER, sender TEXT, recipient TEXT, amount INTEGER, fee INTEGER, message TEXT, status TEXT, raw TEXT, rail TEXT, railPeerId TEXT, transfer TEXT)',
  SelectPaginationTransactions = 'SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ? OFFSET ?',
  UpsertTx = 'INSERT OR REPLACE INTO transactions (hash, timestamp, sender, recipient, amount, fee, message, status, raw, rail, railPeerId, transfer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ClearTxHistory = 'DELETE FROM transactions',

  CreateRemoteSignersTable = 'CREATE TABLE IF NOT EXISTS remote_signers (address TEXT PRIMARY KEY, balance INTEGER, proofSize INTEGER, publicKey TEXT, start INTEGER, end INTEGER, active INTEGER)',
  GetActiveRemoteSigner = 'SELECT * FROM remote_signers WHERE active = 1',
  DeactivateRemoteSigners = 'UPDATE remote_signers SET active = 0',
  InsertRemoteSigner = 'INSERT OR REPLACE INTO remote_signers (address, balance, proofSize, publicKey, start, end, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
  UpdateActiveWallet = 'UPDATE remote_signers SET start = ?, end = ?, proofSize = ?, publicKey = ?, balance = ? WHERE address = ?',
  UpdateRemoteBalance = 'UPDATE remote_signers SET balance = ? WHERE address = ?',

  CreateNimPricesTable = 'CREATE TABLE IF NOT EXISTS nim_prices (currency TEXT NOT NULL, ts INTEGER NOT NULL, value INTEGER NOT NULL)',
  InsertPrice = 'INSERT INTO nim_prices (currency, ts, value) VALUES (?, ?, ?)',
  GetPriceAt = 'SELECT * FROM nim_prices WHERE ts = ? AND currency = ? ORDER BY ts DESC LIMIT 1',
}

interface Migration {
  version: number
  statements: string[]
}

export const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      SQLQuery.CreateKvTable,
      SQLQuery.CreateTxsTable,
      SQLQuery.CreateRemoteSignersTable,
      SQLQuery.CreateNimPricesTable,
    ],
  },
]
