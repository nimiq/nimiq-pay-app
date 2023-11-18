export enum SQLQuery {
  CreateTxsTable = 'CREATE TABLE IF NOT EXISTS transactions (hash TEXT PRIMARY KEY, timestamp INTEGER, sender TEXT, recipient TEXT, value INTEGER, fee INTEGER, data TEXT, status TEXT, raw TEXT, rail TEXT, railId TEXT, railPeerId TEXT, details TEXT)',
  SelectPaginationTransactions = 'SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ? OFFSET ?',
  UpsertTx = 'INSERT OR REPLACE INTO transactions (hash, timestamp, sender, recipient, value, fee, data, status, raw, rail, railId, railPeerId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
}
