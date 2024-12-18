import type { Address } from '@nimiq/core/web'
import { Transfer } from '../types/transactions'

// We store the remote Wallet.
// The only thing we store about the local wallet is the entropy, and from that we can derive the private key
// and its remote wallet
export interface RemoteSigner {
  address: Address
  balance: number
  proofSize: number
  publicKey: string
  active: boolean

  /**
   * The timestamp when the wallet has started to be valid
   */
  start: number

  /**
   * The timestamp when the wallet validity has ended
   */
  end: number
}

export enum SQLQuery {
  // Key-Value Store
  CreateKvTable = 'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  SelectKv = 'SELECT value FROM kv WHERE key = ?',
  UpsertKv = 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
  DeleteKv = 'DELETE FROM kv WHERE key = ?',

  // Transactions
  CreateTxsTable = 'CREATE TABLE IF NOT EXISTS transactions (hash TEXT UNIQUE, timestamp INTEGER, sender TEXT, senderType INTEGER, recipient TEXT, recipientType INTEGER, amount INTEGER, fee INTEGER, status TEXT, raw TEXT, title TEXT, transfer TEXT, message TEXT, rail TEXT, railMerchantId TEXT, merchantName TEXT, merchantCategory TEXT, paymentRef TEXT, paymentMethod TEXT, fiatAmount REAL, fiatFeeAmount REAL, fiatCurrency TEXT, isCashbackClaimed INTEGER)',
  SelectPaginationTransactions = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE transfer IN (\'${Transfer.UserPaymentToMerchant}\', \'${Transfer.UserPaymentToAtomicSwap}\', \'${Transfer.UserPayment}\', \'${Transfer.UserReceipt}\') ORDER BY timestamp DESC NULLS FIRST LIMIT ? OFFSET ?`, // eslint-disable-line ts/prefer-literal-enum-member
  SelectAllTransactions = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE transfer IN (\'${Transfer.UserPaymentToMerchant}\', \'${Transfer.UserPaymentToAtomicSwap}\', \'${Transfer.UserPayment}\', \'${Transfer.UserReceipt}\') ORDER BY timestamp DESC NULLS FIRST`, // eslint-disable-line ts/prefer-literal-enum-member
  GetAllUserReceipts = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE transfer = \'${Transfer.UserReceipt}\' ORDER BY timestamp DESC NULLS FIRST`, // eslint-disable-line ts/prefer-literal-enum-member
  UpsertTx = 'INSERT OR REPLACE INTO transactions (hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, invoiced_json, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  UpdateTxStatus = 'UPDATE transactions SET status = ?, timestamp = ? WHERE hash = ?',
  UpdateCashbackStatus = 'UPDATE transactions SET isCashbackClaimed = ? WHERE hash = ?',
  ClearTxHistory = 'DELETE FROM transactions',
  AddInvoicedColumnToTxsTable = 'ALTER TABLE transactions ADD COLUMN invoiced_json TEXT',
  AddMetaColumnToTxsTable = 'ALTER TABLE transactions ADD COLUMN meta_json TEXT',

  // Remote Signers
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

  // NIM Prices
  CreateNimPricesTable = 'CREATE TABLE IF NOT EXISTS prices (fiat TEXT NOT NULL, checkpoint INTEGER NOT NULL, price INTEGER NOT NULL, crypto TEXT, UNIQUE(fiat, checkpoint, crypto))',
  InsertPrice = 'INSERT OR REPLACE INTO prices (fiat, checkpoint, price, crypto) VALUES (?, ?, ?, ?)',
  GetPriceAt = 'SELECT * FROM prices WHERE checkpoint = ? AND fiat = ? AND crypto = ? ORDER BY checkpoint DESC LIMIT 1',
  GetClosestPreviousPrice = 'SELECT * FROM prices WHERE checkpoint <= ? AND fiat = ? AND crypto = ? ORDER BY checkpoint DESC LIMIT 1',

  // Swap HTLCs
  CreateSwapHtlcTable = 'CREATE TABLE IF NOT EXISTS swap_htlcs (address TEXT PRIMARY KEY NOT NULL, amount INTEGER NOT NULL, timeout_block INTEGER NOT NULL, swap_id TEXT NOT NULL, swap_status TEXT NOT NULL)',
  InsertSwapHtlc = 'INSERT OR REPLACE INTO swap_htlcs (address, amount, timeout_block, swap_id, swap_status) VALUES (?, ?, ?, ?, ?)',
  DeleteSwapHtlc = 'DELETE FROM swap_htlcs WHERE address = ?',
  GetExpiredSwapHtlcs = 'SELECT * FROM swap_htlcs WHERE timeout_block < ?',
  GetSwapTimeoutTime = 'SELECT timeout_block FROM swap_htlcs WHERE address = ? LIMIT 1',

  // Swap Quotes
  CreateSwapQuotesTable = 'CREATE TABLE IF NOT EXISTS swap_quotes (ln_invoice TEXT PRIMARY KEY NOT NULL, swap_id TEXT NOT NULL, timeout INTEGER NOT NULL)',
  InsertSwapQuote = 'INSERT OR REPLACE INTO swap_quotes (ln_invoice, swap_id, timeout) VALUES (?, ?, ?)',
  DeleteSwapQuote = 'DELETE FROM swap_quotes WHERE swap_id = ?',
  DeleteExpiredSwapQuotes = 'DELETE FROM swap_quotes WHERE timeout < ?',
  GetSwapQuote = 'SELECT * FROM swap_quotes WHERE ln_invoice = ? LIMIT 1',
  GetAllSwapQuotes = 'SELECT * FROM swap_quotes',
}

export const DEFAULT_LIMIT = 30

export interface DbPagination {
  limit?: number
  offset?: number
}

interface Migration {
  toVersion: number
  statements: string[]
}

export const migrations: Migration[] = [
  {
    toVersion: 1,
    statements: [
      SQLQuery.CreateKvTable,
      SQLQuery.CreateTxsTable,
      SQLQuery.CreateRemoteSignersTable,
      SQLQuery.CreateNimPricesTable,
    ],
  },
  {
    toVersion: 2,
    statements: [
      SQLQuery.AddInvoicedColumnToTxsTable,
      SQLQuery.AddMetaColumnToTxsTable,
    ],
  },
  {
    toVersion: 3,
    statements: [
      SQLQuery.CreateSwapHtlcTable,
    ],
  },
  {
    toVersion: 4,
    statements: [
      SQLQuery.CreateSwapQuotesTable,
    ],
  },
]
