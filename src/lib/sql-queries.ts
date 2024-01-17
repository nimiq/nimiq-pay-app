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
   * The block of validity of the wallet has started to be valid
   */
  start: number

  /**
   * The block of validity of the wallet has ended
   */
  end: number
}

export enum SQLQuery {
  CreateKvTable = 'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  SelectKv = 'SELECT value FROM kv WHERE key = ?',
  UpsertKv = 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
  DeleteKv = 'DELETE FROM kv WHERE key = ?',

  CreateTxsTable = 'CREATE TABLE IF NOT EXISTS transactions (hash TEXT UNIQUE, timestamp INTEGER, sender TEXT, senderType INTEGER, recipient TEXT, recipientType INTEGER, amount INTEGER, fee INTEGER, status TEXT, raw TEXT, title TEXT, transfer TEXT, message TEXT, rail TEXT, railMerchantId TEXT, merchantName TEXT, merchantCategory TEXT, paymentRef TEXT, paymentMethod TEXT, fiatAmount REAL, fiatFeeAmount REAL, fiatCurrency TEXT)',
  SelectPaginationTransactions = 'SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency FROM transactions WHERE transfer IN (\'user-payment-to-merchant\', \'user-payment\', \'user-receipt\') ORDER BY timestamp DESC LIMIT ? OFFSET ?',
  SelectAllTransactions = 'SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency FROM transactions WHERE transfer IN (\'user-payment-to-merchant\', \'user-payment\', \'user-receipt\') ORDER BY timestamp DESC',
  GetAllUserReceipts = 'SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency FROM transactions WHERE transfer = \'user-receipt\' ORDER BY timestamp DESC',
  UpsertTx = 'INSERT OR REPLACE INTO transactions (hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  UpdateTxStatus = 'UPDATE transactions SET status = ?, timestamp = ? WHERE hash = ?',
  ClearTxHistory = 'DELETE FROM transactions',

  CreateRemoteSignersTable = 'CREATE TABLE IF NOT EXISTS remote_signers (address TEXT PRIMARY KEY, balance INTEGER, proofSize INTEGER, publicKey TEXT, start INTEGER, end INTEGER, active INTEGER)',
  GetActiveRemoteSigner = 'SELECT * FROM remote_signers WHERE active = 1',
  GetAllRemoteSigners = 'SELECT * FROM remote_signers',
  DeactivateRemoteSigners = 'UPDATE remote_signers SET active = 0',
  InsertRemoteSigner = 'INSERT OR REPLACE INTO remote_signers (address, balance, proofSize, publicKey, start, end, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
  UpdateActiveWallet = 'UPDATE remote_signers SET start = ?, end = ?, proofSize = ?, publicKey = ?, balance = ? WHERE address = ?',
  UpdateRemoteBalance = 'UPDATE remote_signers SET balance = ? WHERE address = ?',

  // These queries are used to ensure the correct state of the remote signers
  GetRemoteSignerWithBalance = 'SELECT * FROM remote_signers WHERE balance > 0',
  GetDeactivatedRemoteSignersWithBalance = 'SELECT * FROM remote_signers WHERE balance > 0 AND active = 0',

  CreateNimPricesTable = 'CREATE TABLE IF NOT EXISTS prices (fiat TEXT NOT NULL, checkpoint INTEGER NOT NULL, price INTEGER NOT NULL, crypto TEXT, UNIQUE(fiat, checkpoint, crypto))',
  InsertPrice = 'INSERT OR REPLACE INTO prices (fiat, checkpoint, price, crypto) VALUES (?, ?, ?, ?)',
  GetPriceAt = 'SELECT * FROM prices WHERE checkpoint = ? AND fiat = ? AND crypto = ? ORDER BY checkpoint DESC LIMIT 1',
  GetClosestPreviousPrice = 'SELECT * FROM prices WHERE checkpoint <= ? AND fiat = ? AND crypto = ? ORDER BY checkpoint DESC LIMIT 1',
}

export const DEFAULT_LIMIT = 30

export interface DbPagination {
  limit?: number
  offset?: number
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
