import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sqlQueriesSource = readFileSync(
  path.resolve(import.meta.dirname, './sql-queries.ts'),
  'utf8',
)
const createTxsTableLine = sqlQueriesSource.split('\n').find(line => line.includes('CreateTxsTable ='))
const selectPaginationLine = sqlQueriesSource.split('\n').find(line => line.includes('SelectPaginationTransactions ='))
const selectAllLine = sqlQueriesSource.split('\n').find(line => line.includes('SelectAllTransactions ='))

describe('sql transaction query definitions', () => {
  it('keeps the base transactions table aligned with the v1 schema', () => {
    expect(createTxsTableLine).not.toContain('asset TEXT')
    expect(createTxsTableLine).not.toContain('chain TEXT')
  })

  it('includes staking transactions in paginated transaction reads', () => {
    expect(selectPaginationLine).toContain('Transfer.Staking')
  })

  it('includes staking transactions in asset-specific paginated reads', () => {
    expect(sqlQueriesSource).toContain('SelectPaginationTransactionsByAsset')
    expect(sqlQueriesSource).toContain('asset = ?')
    expect(sqlQueriesSource).toContain('Transfer.Staking')
  })

  it('includes staking transactions in full transaction reads', () => {
    expect(selectAllLine).toContain('Transfer.Staking')
  })

  it('includes staking transactions in asset-specific full reads', () => {
    expect(sqlQueriesSource).toContain('SelectTransactionsByAsset')
    expect(sqlQueriesSource).toContain('asset = ?')
    expect(sqlQueriesSource).toContain('Transfer.Staking')
  })

  it('backfills asset and chain through migrations', () => {
    expect(sqlQueriesSource).toContain('AddAssetToTxsTable')
    expect(sqlQueriesSource).toContain('AddChainToTxsTable')
    expect(sqlQueriesSource).toContain('BackfillTransactionAsset')
    expect(sqlQueriesSource).toContain('BackfillTransactionChain')
  })

  it('adds durable funding and refund hashes to swap recovery rows', () => {
    expect(sqlQueriesSource).toContain('ALTER TABLE swap_htlcs ADD COLUMN tx_hash TEXT')
    expect(sqlQueriesSource).toContain('ALTER TABLE swap_htlcs ADD COLUMN refund_hash TEXT')
    expect(sqlQueriesSource).toContain('ALTER TABLE swap_htlcs ADD COLUMN refund_timestamp INTEGER')
    expect(sqlQueriesSource).toContain('ALTER TABLE swap_htlcs ADD COLUMN refund_block INTEGER')
    expect(sqlQueriesSource).toContain('SET tx_hash = address WHERE htlc_id IS NOT NULL')
    expect(sqlQueriesSource).toContain('toVersion: 9')
  })

  it('keeps the refund event scan block when clearing a rejected relay hash', () => {
    expect(sqlQueriesSource).toContain('ClearSwapHtlcRefundHash = \'UPDATE swap_htlcs SET refund_hash = NULL, refund_timestamp = NULL WHERE address = ?\'')
  })

  it('adopts replacement transaction hashes without unique-key collisions', () => {
    expect(sqlQueriesSource).toContain('UPDATE OR REPLACE transactions SET hash = ? WHERE hash = ?')
  })
})
