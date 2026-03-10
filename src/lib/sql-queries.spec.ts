import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sqlQueriesSource = readFileSync(
  path.resolve(import.meta.dirname, './sql-queries.ts'),
  'utf8',
)
const selectPaginationLine = sqlQueriesSource.split('\n').find(line => line.includes('SelectPaginationTransactions ='))
const selectAllLine = sqlQueriesSource.split('\n').find(line => line.includes('SelectAllTransactions ='))

describe('sql transaction query definitions', () => {
  it('includes staking transactions in paginated transaction reads', () => {
    expect(selectPaginationLine).toContain('Transfer.Staking')
  })

  it('includes staking transactions in full transaction reads', () => {
    expect(selectAllLine).toContain('Transfer.Staking')
  })
})
