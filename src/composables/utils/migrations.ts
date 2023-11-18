import { SQLQuery } from '@/lib/sql-queries'

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
