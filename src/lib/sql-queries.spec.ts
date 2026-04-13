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
})
