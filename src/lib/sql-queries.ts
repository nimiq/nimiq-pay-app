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
  SelectPaginationTransactions = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, asset, chain, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE transfer IN (\'${Transfer.UserPaymentToMerchant}\', \'${Transfer.UserPaymentToAtomicSwap}\', \'${Transfer.UserPayment}\', \'${Transfer.UserReceipt}\', \'${Transfer.Staking}\') ORDER BY timestamp DESC NULLS FIRST LIMIT ? OFFSET ?`, // eslint-disable-line ts/prefer-literal-enum-member
  SelectPaginationTransactionsByAsset = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, asset, chain, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE asset = ? AND transfer IN (\'${Transfer.UserPaymentToMerchant}\', \'${Transfer.UserPaymentToAtomicSwap}\', \'${Transfer.UserPayment}\', \'${Transfer.UserReceipt}\', \'${Transfer.Staking}\') ORDER BY timestamp DESC NULLS FIRST LIMIT ? OFFSET ?`, // eslint-disable-line ts/prefer-literal-enum-member
  SelectAllTransactions = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, asset, chain, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE transfer IN (\'${Transfer.UserPaymentToMerchant}\', \'${Transfer.UserPaymentToAtomicSwap}\', \'${Transfer.UserPayment}\', \'${Transfer.UserReceipt}\', \'${Transfer.Staking}\') ORDER BY timestamp DESC NULLS FIRST`, // eslint-disable-line ts/prefer-literal-enum-member
  GetAllUserReceipts = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, asset, chain, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE transfer = \'${Transfer.UserReceipt}\' ORDER BY timestamp DESC NULLS FIRST`, // eslint-disable-line ts/prefer-literal-enum-member
  GetUserReceiptSenders = `SELECT DISTINCT sender FROM transactions WHERE transfer = \'${Transfer.UserReceipt}\'`, // eslint-disable-line ts/prefer-literal-enum-member
  GetTransactionByHash = 'SELECT hash, validityStartHeight, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, asset, chain, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE hash = ? LIMIT 1',
  UpsertTx = 'INSERT OR REPLACE INTO transactions (hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, asset, chain, invoiced_json, meta_json, senderData, recipientData, validityStartHeight) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  UpdateTxHash = 'UPDATE OR REPLACE transactions SET hash = ? WHERE hash = ?',
  MergeReplacementTxState = `UPDATE transactions SET
    status = COALESCE((SELECT status FROM transactions WHERE hash = ?), status),
    timestamp = COALESCE((SELECT timestamp FROM transactions WHERE hash = ?), timestamp),
    fee = COALESCE((SELECT fee FROM transactions WHERE hash = ?), fee),
    raw = COALESCE((SELECT raw FROM transactions WHERE hash = ?), raw)
    WHERE hash = ?`,
  SetPolygonSwapPreimage = `UPDATE transactions SET status = 'confirmed', meta_json = json_set(COALESCE(meta_json, '{}'), '$.secret', ?) WHERE hash = ?`,
  SetPolygonTxRefunded = `UPDATE transactions SET meta_json = json_set(COALESCE(meta_json, '{}'), '$.refunded', json('true')) WHERE hash = ?`,
  UpdateTxStatus = 'UPDATE transactions SET status = ?, timestamp = COALESCE(?, timestamp) WHERE hash = ?',
  BackfillTxValidityStartHeight = 'UPDATE transactions SET validityStartHeight = ? WHERE hash = ? AND validityStartHeight IS NULL',
  UpdateTxTitle = 'UPDATE transactions SET title = ? WHERE hash = ?',
  UpdateCashbackStatus = 'UPDATE transactions SET isCashbackClaimed = ? WHERE hash = ?',
  ClearTxHistory = 'DELETE FROM transactions',
  AddInvoicedColumnToTxsTable = 'ALTER TABLE transactions ADD COLUMN invoiced_json TEXT',
  AddMetaColumnToTxsTable = 'ALTER TABLE transactions ADD COLUMN meta_json TEXT',
  GetIncludedTransactionsByRailAfter = `SELECT hash, timestamp, amount, status FROM transactions WHERE status IN ('included', 'confirmed') AND rail = ? AND timestamp >= ? ORDER BY timestamp`,
  AddSenderDataToTxsTable = 'ALTER TABLE transactions ADD COLUMN senderData TEXT',
  AddRecipientDataToTxsTable = 'ALTER TABLE transactions ADD COLUMN recipientData TEXT',
  AddAssetToTxsTable = 'ALTER TABLE transactions ADD COLUMN asset TEXT',
  AddChainToTxsTable = 'ALTER TABLE transactions ADD COLUMN chain TEXT',
  AddValidityStartHeightToTxsTable = 'ALTER TABLE transactions ADD COLUMN validityStartHeight INTEGER',
  BackfillTransactionAsset = 'UPDATE transactions SET asset = COALESCE(asset, \'NIM\')',
  BackfillTransactionChain = 'UPDATE transactions SET chain = COALESCE(chain, \'Nimiq\')',
  GetTransactionAssetByHash = 'SELECT asset FROM transactions WHERE hash = ? LIMIT 1',
  SelectTransactionsByAsset = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, raw, title, transfer, message, rail, railMerchantId, merchantName, merchantCategory, paymentRef, paymentMethod, fiatAmount, fiatFeeAmount, fiatCurrency, isCashbackClaimed, asset, chain, invoiced_json as invoiced, meta_json as meta FROM transactions WHERE asset = ? AND transfer IN (\'${Transfer.UserPaymentToMerchant}\', \'${Transfer.UserPaymentToAtomicSwap}\', \'${Transfer.UserPayment}\', \'${Transfer.UserReceipt}\', \'${Transfer.Staking}\') ORDER BY timestamp DESC NULLS FIRST`, // eslint-disable-line ts/prefer-literal-enum-member
  SelectPendingTransactionsByAsset = 'SELECT hash, status, timestamp, asset FROM transactions WHERE asset = ? AND (status != \'confirmed\' OR timestamp IS NULL)',
  // eslint-disable-next-line ts/prefer-literal-enum-member
  SelectPendingOutgoingTransactions = `WITH RECURSIVE owned_remote_signers(address) AS (
    SELECT address FROM remote_signers
    UNION
    SELECT recipient
    FROM transactions
    WHERE sender = ?1 AND transfer = '${Transfer.LocalToRemote}'
    UNION
    SELECT transactions.recipient
    FROM transactions
    JOIN owned_remote_signers ON transactions.sender = owned_remote_signers.address
    WHERE transactions.transfer = '${Transfer.ExtendRemote}'
  )
  SELECT hash, timestamp, sender, senderType, recipient, recipientType, amount, fee, status, transfer, validityStartHeight
  FROM transactions
  WHERE asset = 'NIM'
    AND chain = 'Nimiq'
    AND status IN ('new', 'pending')
    AND (
      ((sender = ?1 OR sender IN (SELECT address FROM owned_remote_signers)) AND transfer IN ('${Transfer.UserPaymentToMerchant}', '${Transfer.UserPaymentToAtomicSwap}', '${Transfer.UserPayment}', '${Transfer.Staking}'))
      OR (recipient = ?1 AND transfer IN ('${Transfer.Staking}', '${Transfer.RemoteToLocal}', '${Transfer.RemoteToLocalAfterTimeout}', '${Transfer.RemoteToLocalImmediateReclaim}'))
    )`,
  // eslint-disable-next-line ts/prefer-literal-enum-member
  SelectUnconfirmedNimPayments = `SELECT hash FROM transactions
    WHERE status IN ('new', 'pending', 'included')
      AND COALESCE(asset, 'NIM') = 'NIM' AND COALESCE(paymentMethod, 'nim') = 'nim'
      AND transfer IN ('${Transfer.UserPayment}', '${Transfer.UserPaymentToMerchant}', '${Transfer.UserPaymentToAtomicSwap}')`,
  SelectPendingHtlcCreations = `SELECT hash, timestamp, sender, senderType, recipient, recipientType, status, validityStartHeight, raw FROM transactions WHERE status IN ('new', 'pending', 'included') AND transfer IN (\'${Transfer.LocalToRemote}\', \'${Transfer.ExtendRemote}\')`, // eslint-disable-line ts/prefer-literal-enum-member

  // Remote Signers
  CreateRemoteSignersTable = 'CREATE TABLE IF NOT EXISTS remote_signers (address TEXT PRIMARY KEY, balance INTEGER, proofSize INTEGER, publicKey TEXT, start INTEGER, end INTEGER, active INTEGER)',
  GetActiveRemoteSigner = 'SELECT * FROM remote_signers WHERE active = 1',
  GetAllRemoteSigners = 'SELECT * FROM remote_signers',
  GetRemoteSignerByAddress = 'SELECT * FROM remote_signers WHERE address = ?',
  DeactivateRemoteSigners = 'UPDATE remote_signers SET active = 0',
  DeactivateRemoteSigner = 'UPDATE remote_signers SET active = 0 WHERE address = ?',
  DeleteRemoteSigner = 'DELETE FROM remote_signers WHERE address = ?',
  UpsertTargetRemoteSigner = `INSERT INTO remote_signers (address, balance, proofSize, publicKey, start, end, active)
  VALUES (?, ?, ?, ?, ?, ?, 0)
  ON CONFLICT(address) DO UPDATE SET
    balance = excluded.balance,
    proofSize = excluded.proofSize,
    publicKey = excluded.publicKey,
    start = excluded.start,
    end = excluded.end,
    active = 0`,
  InsertRemoteSigner = 'INSERT OR REPLACE INTO remote_signers (address, balance, proofSize, publicKey, start, end, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
  // Recovery must not overwrite an existing signer's metadata or active state.
  InsertInactiveRemoteSigner = 'INSERT OR IGNORE INTO remote_signers (address, balance, proofSize, publicKey, start, end, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
  UpdateActiveWallet = 'UPDATE remote_signers SET start = ?, end = ?, proofSize = ?, publicKey = ?, balance = ? WHERE address = ?',
  UpdateRemoteBalance = 'UPDATE remote_signers SET balance = ? WHERE address = ?',
  PurgeRemoteSigners = 'DELETE FROM remote_signers',

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
  AddHtlcIdColumnToSwapHtlcs = 'ALTER TABLE swap_htlcs ADD COLUMN htlc_id TEXT',
  AddTxHashColumnToSwapHtlcs = 'ALTER TABLE swap_htlcs ADD COLUMN tx_hash TEXT',
  AddRefundHashColumnToSwapHtlcs = 'ALTER TABLE swap_htlcs ADD COLUMN refund_hash TEXT',
  AddRefundTimestampColumnToSwapHtlcs = 'ALTER TABLE swap_htlcs ADD COLUMN refund_timestamp INTEGER',
  AddRefundBlockColumnToSwapHtlcs = 'ALTER TABLE swap_htlcs ADD COLUMN refund_block INTEGER',
  BackfillSwapHtlcTxHash = 'UPDATE swap_htlcs SET tx_hash = address WHERE htlc_id IS NOT NULL AND tx_hash IS NULL AND address != htlc_id',
  InsertSwapHtlc = 'INSERT OR REPLACE INTO swap_htlcs (address, amount, timeout_block, swap_id, swap_status, htlc_id) VALUES (?, ?, ?, ?, ?, ?)',
  InsertSwapHtlcProvisional = 'INSERT INTO swap_htlcs (address, amount, timeout_block, swap_id, swap_status, htlc_id) VALUES (?, ?, ?, ?, ?, ?)',
  SetSwapHtlcTxHash = 'UPDATE swap_htlcs SET tx_hash = COALESCE(tx_hash, ?) WHERE address = ?',
  ReplaceSwapHtlcTxHash = 'UPDATE swap_htlcs SET tx_hash = ? WHERE address = ? AND tx_hash = ?',
  ClearSwapHtlcTxHash = 'UPDATE swap_htlcs SET tx_hash = NULL WHERE address = ?',
  SetSwapHtlcRefundHash = 'UPDATE swap_htlcs SET refund_hash = ?, refund_timestamp = ?, refund_block = COALESCE(refund_block, ?) WHERE address = ?',
  SetSwapHtlcRefundAttempt = 'UPDATE swap_htlcs SET refund_timestamp = ?, refund_block = COALESCE(refund_block, ?) WHERE address = ?',
  ClearSwapHtlcRefundHash = 'UPDATE swap_htlcs SET refund_hash = NULL, refund_timestamp = NULL WHERE address = ?',
  DeleteSwapHtlc = 'DELETE FROM swap_htlcs WHERE address = ?',
  DeleteSwapHtlcByTxHash = 'DELETE FROM swap_htlcs WHERE address = ? OR tx_hash = ?',
  GetSwapHtlcByAddress = 'SELECT * FROM swap_htlcs WHERE address = ? OR htlc_id = ? LIMIT 1',
  GetExpiredSwapHtlcs = 'SELECT * FROM swap_htlcs WHERE timeout_block < ?',
  GetSwapTimeoutTime = 'SELECT timeout_block FROM swap_htlcs WHERE address = ? OR tx_hash = ? LIMIT 1',
  PurgeSwapHtlcs = 'DELETE FROM swap_htlcs',

  // Swap Quotes
  CreateSwapQuotesTable = 'CREATE TABLE IF NOT EXISTS swap_quotes (ln_invoice TEXT PRIMARY KEY NOT NULL, swap_id TEXT NOT NULL, timeout INTEGER NOT NULL)',
  InsertSwapQuote = 'INSERT OR REPLACE INTO swap_quotes (ln_invoice, swap_id, timeout) VALUES (?, ?, ?)',
  DeleteSwapQuote = 'DELETE FROM swap_quotes WHERE swap_id = ?',
  DeleteExpiredSwapQuotes = 'DELETE FROM swap_quotes WHERE timeout < ?',
  GetSwapQuote = 'SELECT * FROM swap_quotes WHERE ln_invoice = ? LIMIT 1',
  GetAllSwapQuotes = 'SELECT * FROM swap_quotes',
  PurgeSwapQuotes = 'DELETE FROM swap_quotes',

  // Polygon payment attempts
  CreatePolygonPaymentAttemptsTable = 'CREATE TABLE IF NOT EXISTS polygon_payment_attempts (network TEXT NOT NULL, sender TEXT NOT NULL, request_json TEXT NOT NULL, title TEXT NOT NULL, relay_request_json TEXT NOT NULL, relay_url TEXT NOT NULL, signature TEXT NOT NULL, fee INTEGER NOT NULL, start_block INTEGER NOT NULL, created_at INTEGER NOT NULL, relay_hash TEXT, PRIMARY KEY (network, sender))',
  InsertPolygonPaymentAttempt = 'INSERT INTO polygon_payment_attempts (network, sender, request_json, title, relay_request_json, relay_url, signature, fee, start_block, created_at, relay_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  GetPolygonPaymentAttempt = 'SELECT * FROM polygon_payment_attempts WHERE network = ? AND sender = ? LIMIT 1',
  SetPolygonPaymentAttemptRelayHash = 'UPDATE polygon_payment_attempts SET relay_hash = ? WHERE network = ? AND sender = ?',
  DeletePolygonPaymentAttempt = 'DELETE FROM polygon_payment_attempts WHERE network = ? AND sender = ?',
  PurgePolygonPaymentAttempts = 'DELETE FROM polygon_payment_attempts',

  // NAKA
  CreateNakaCardsTable = 'CREATE TABLE IF NOT EXISTS naka_cards (sourceId TEXT PRIMARY KEY NOT NULL, statusId TEXT NOT NULL, expiryDate TEXT NOT NULL, meta TEXT NOT NULL)',
  InsertNakaCard = 'INSERT OR REPLACE INTO naka_cards (sourceId, statusId, expiryDate, meta) VALUES (?, ?, ?, JSON(?))',
  // GetNakaCard = 'SELECT sourceId, statusId, expiryDate, meta FROM naka_cards WHERE sourceId = ? LIMIT 1',
  // GetActiveNakaCard = 'SELECT sourceId, statusId, expiryDate, meta FROM naka_cards WHERE statusId = "Active" LIMIT 1',
  GetAllNakaCards = 'SELECT sourceId, statusId, expiryDate, meta FROM naka_cards',
  DeleteNakaCard = 'DELETE FROM naka_cards WHERE sourceId = ?',
  PurgeNakaCards = 'DELETE FROM naka_cards',
}

// History refreshes chain evidence without replacing richer payment metadata.
export const UPSERT_POLYGON_HISTORY_TX = `${SQLQuery.UpsertTx.replace('INSERT OR REPLACE', 'INSERT')}
  ON CONFLICT(hash) DO UPDATE SET
    status = excluded.status,
    timestamp = COALESCE(excluded.timestamp, transactions.timestamp),
    fee = excluded.fee,
    raw = COALESCE(excluded.raw, transactions.raw)`

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
  {
    toVersion: 5,
    statements: [
      SQLQuery.CreateNakaCardsTable,
    ],
  },
  {
    toVersion: 6,
    statements: [
      SQLQuery.AddSenderDataToTxsTable,
      SQLQuery.AddRecipientDataToTxsTable,
    ],
  },
  {
    toVersion: 7,
    statements: [
      SQLQuery.AddAssetToTxsTable,
      SQLQuery.AddChainToTxsTable,
      SQLQuery.BackfillTransactionAsset,
      SQLQuery.BackfillTransactionChain,
    ],
  },
  {
    toVersion: 8,
    statements: [
      SQLQuery.AddHtlcIdColumnToSwapHtlcs,
    ],
  },
  {
    toVersion: 9,
    statements: [
      SQLQuery.AddValidityStartHeightToTxsTable,
    ],
  },
  {
    toVersion: 10,
    statements: [
      SQLQuery.AddTxHashColumnToSwapHtlcs,
      SQLQuery.AddRefundHashColumnToSwapHtlcs,
      SQLQuery.AddRefundTimestampColumnToSwapHtlcs,
      SQLQuery.AddRefundBlockColumnToSwapHtlcs,
      SQLQuery.BackfillSwapHtlcTxHash,
    ],
  },
  {
    toVersion: 11,
    statements: [
      SQLQuery.CreatePolygonPaymentAttemptsTable,
    ],
  },
]
