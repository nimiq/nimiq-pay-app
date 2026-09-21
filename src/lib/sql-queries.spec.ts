import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSwapHtlcTxHash } from '@/types/swapHtlcs'
import { migrations, SQLQuery } from './sql-queries'

vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))

let db: DatabaseSync

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const migration of migrations)
    db.exec(migration.statements.join(';'))
})
afterEach(() => db.close())

describe('transaction recovery queries', () => {
  it('preserves absent timestamps and backfills legacy height only once', () => {
    db.prepare('INSERT INTO transactions (hash, timestamp) VALUES (?, ?)').run('legacy', 123)
    db.prepare(SQLQuery.UpdateTxStatus).run('failed', null, 'legacy')
    expect(db.prepare('SELECT timestamp FROM transactions').get()).toEqual({ timestamp: 123 })
    db.prepare(SQLQuery.UpdateTxStatus).run('confirmed', 0, 'legacy')
    expect(db.prepare('SELECT timestamp FROM transactions').get()).toEqual({ timestamp: 0 })
    db.prepare(SQLQuery.BackfillTxValidityStartHeight).run(100, 'legacy')
    db.prepare(SQLQuery.BackfillTxValidityStartHeight).run(200, 'legacy')
    expect(db.prepare(SQLQuery.GetTransactionByHash).get('legacy')).toMatchObject({ validityStartHeight: 100 })
  })

  it('tracks unconfirmed NIM payments through reinclusion and stops at final states', () => {
    const insert = db.prepare(`INSERT INTO transactions (hash, transfer, status, asset, paymentMethod)
      VALUES (?, 'user-payment', ?, ?, ?)`)
    for (const status of ['new', 'pending', 'included', 'confirmed', 'failed', 'invalidated', 'expired'])
      insert.run(status, status, 'NIM', 'nim')
    insert.run('points', 'pending', 'NIM', 'points')
    insert.run('polygon', 'included', 'USDT', 'usdt')
    const rows = db.prepare(SQLQuery.SelectUnconfirmedNimPayments).all() as { hash: string }[]
    const hashes = rows.map(row => row.hash)
    expect(hashes.sort()).toEqual(['included', 'new', 'pending'])
    db.exec('UPDATE transactions SET status = \'pending\' WHERE hash = \'included\'')
    expect(db.prepare(SQLQuery.SelectUnconfirmedNimPayments).all()).toContainEqual({ hash: 'included' })
    db.exec('UPDATE transactions SET status = \'invalidated\' WHERE hash = \'included\'')
    expect(db.prepare(SQLQuery.SelectUnconfirmedNimPayments).all()).not.toContainEqual({ hash: 'included' })
  })

  it('restores pending sends from owned signers and their extension chain only', () => {
    db.prepare(SQLQuery.InsertRemoteSigner).run('imported', 10, 98, 'key', 1, 2, 0)
    const insert = db.prepare(`INSERT INTO transactions
      (hash, sender, recipient, transfer, status, asset, chain, validityStartHeight)
      VALUES (?, ?, ?, ?, ?, 'NIM', 'Nimiq', 100)`)
    for (const row of [
      ['creation', 'owner', 'root', 'local-to-remote', 'confirmed'],
      ['extension', 'root', 'child', 'extend-remote', 'confirmed'],
      ['imported-send', 'imported', 'merchant', 'user-payment', 'pending'],
      ['child-send', 'child', 'merchant', 'user-payment-to-merchant', 'new'],
      ['foreign-send', 'foreign', 'merchant', 'user-payment', 'pending'],
      ['resolved-send', 'child', 'merchant', 'user-payment', 'confirmed'],
      ['withdraw-stake', 'staking', 'owner', 'staking', 'pending'],
      ['foreign-stake', 'staking', 'other-owner', 'staking', 'pending'],
      ['drain', 'child', 'owner', 'remote-to-local', 'pending'],
    ])
      insert.run(...row)

    const rows = db.prepare(SQLQuery.SelectPendingOutgoingTransactions).all('owner') as { hash: string }[]
    const hashes = rows.map(row => row.hash)
    expect(hashes.sort()).toEqual(['child-send', 'drain', 'imported-send', 'withdraw-stake'])
  })

  it('updates only the requested signer during targeted recovery', () => {
    db.prepare(SQLQuery.InsertRemoteSigner).run('target', 10, 98, 'old-key', 1, 2, 1)
    db.prepare(SQLQuery.InsertRemoteSigner).run('other', 20, 98, 'key', 1, 2, 1)
    db.prepare(SQLQuery.UpsertTargetRemoteSigner).run('target', 30, 104, 'new-key', 3, 4)
    db.prepare(SQLQuery.DeactivateRemoteSigner).run('target')

    expect(db.prepare(SQLQuery.GetAllRemoteSigners).all()).toEqual([
      { address: 'target', balance: 30, proofSize: 104, publicKey: 'new-key', start: 3, end: 4, active: 0 },
      { address: 'other', balance: 20, proofSize: 98, publicKey: 'key', start: 1, end: 2, active: 1 },
    ])
  })

  it('keeps included creations selectable until finality', () => {
    db.exec(`INSERT INTO transactions (hash, recipient, status, transfer, validityStartHeight)
      VALUES ('creation', 'signer', 'included', 'local-to-remote', 100)`)
    expect(db.prepare(SQLQuery.SelectPendingHtlcCreations).all()).toMatchObject([
      { hash: 'creation', validityStartHeight: 100, status: 'included' },
    ])
    db.prepare(SQLQuery.InsertRemoteSigner).run('signer', 10, 98, 'key', 1, 2, 1)
    expect(db.prepare(SQLQuery.SelectPendingHtlcCreations).all()).toHaveLength(1)
    db.exec('UPDATE transactions SET status = \'confirmed\' WHERE hash = \'creation\'')
    expect(db.prepare(SQLQuery.SelectPendingHtlcCreations).all()).toEqual([])
  })

  it('preserves legacy transactions when applying additive migrations', () => {
    db.close()
    db = new DatabaseSync(':memory:')
    db.exec(migrations[0].statements.join(';'))
    db.exec('INSERT INTO transactions (hash, transfer, status) VALUES (\'legacy\', \'user-payment\', \'pending\')')
    for (const migration of migrations.slice(1))
      db.exec(migration.statements.join(';'))

    expect(db.prepare('SELECT hash, asset, chain, validityStartHeight FROM transactions').all()).toEqual([
      { hash: 'legacy', asset: 'NIM', chain: 'Nimiq', validityStartHeight: null },
    ])
  })

  it.each([
    [SQLQuery.SelectPaginationTransactions, [10, 0]],
    [SQLQuery.SelectPaginationTransactionsByAsset, ['NIM', 10, 0]],
    [SQLQuery.SelectAllTransactions, []],
    [SQLQuery.SelectTransactionsByAsset, ['NIM']],
  ])('includes staking in transaction reads %#', (query, values) => {
    db.exec('INSERT INTO transactions (hash, transfer, asset, chain) VALUES (\'stake\', \'staking\', \'NIM\', \'Nimiq\')')
    expect(db.prepare(query).all(...values)).toMatchObject([{ hash: 'stake', transfer: 'staking' }])
  })
})

describe('polygon recovery migrations', () => {
  it('creates each recovery column once on a fresh database', () => {
    const columns = (db.prepare('PRAGMA table_info(swap_htlcs)').all() as { name: string }[]).map(column => column.name)
    expect(columns).toEqual([
      'address',
      'amount',
      'timeout_block',
      'swap_id',
      'swap_status',
      'htlc_id',
      'tx_hash',
      'refund_hash',
      'refund_timestamp',
      'refund_block',
    ])
    expect(migrations.map(migration => migration.toVersion)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(migrations.find(migration => migration.toVersion === 9)?.statements).toEqual([
      SQLQuery.AddValidityStartHeightToTxsTable,
    ])
  })

  it.each([8, 9])('upgrades released v%s rows without modifying NIM recovery', (version) => {
    const legacyDb = new DatabaseSync(':memory:')
    try {
      for (const migration of migrations.filter(migration => migration.toVersion <= version))
        legacyDb.exec(migration.statements.join(';'))
      const insert = legacyDb.prepare(SQLQuery.InsertSwapHtlc)
      insert.run('nim-address', 1, 100, 'nim-swap', 'pending', null)
      insert.run('polygon-funding-hash', 2, 200, 'polygon-swap', 'pending', 'polygon-htlc')
      insert.run('polygon-htlc', 3, 300, 'provisional-swap', 'pending', 'polygon-htlc')
      if (version === 9)
        legacyDb.exec('INSERT INTO transactions (hash, validityStartHeight) VALUES (\'nim-send\', 456)')

      for (const migration of migrations.filter(migration => migration.toVersion > version))
        legacyDb.exec(migration.statements.join(';'))

      expect(legacyDb.prepare('SELECT address, tx_hash, refund_hash, refund_timestamp, refund_block FROM swap_htlcs ORDER BY address').all()).toEqual([
        { address: 'nim-address', tx_hash: null, refund_hash: null, refund_timestamp: null, refund_block: null },
        { address: 'polygon-funding-hash', tx_hash: 'polygon-funding-hash', refund_hash: null, refund_timestamp: null, refund_block: null },
        { address: 'polygon-htlc', tx_hash: null, refund_hash: null, refund_timestamp: null, refund_block: null },
      ])
      if (version === 9)
        expect(legacyDb.prepare('SELECT validityStartHeight FROM transactions').get()).toEqual({ validityStartHeight: 456 })
    }
    finally {
      legacyDb.close()
    }
  })

  it('retains the first refund scan block across failed and repeated attempts', () => {
    db.prepare(SQLQuery.InsertSwapHtlcProvisional).run('htlc', 1, 100, 'swap', 'pending', 'htlc')
    db.prepare(SQLQuery.SetSwapHtlcRefundAttempt).run(1_000, 50, 'htlc')
    db.prepare(SQLQuery.SetSwapHtlcRefundHash).run('refund', 2_000, 60, 'htlc')
    db.prepare(SQLQuery.ClearSwapHtlcRefundHash).run('htlc')
    db.prepare(SQLQuery.SetSwapHtlcRefundHash).run(null, 3_000, 70, 'htlc')
    expect(db.prepare(SQLQuery.GetSwapHtlcByAddress).get('htlc', 'htlc')).toMatchObject({
      refund_hash: null,
      refund_timestamp: 3_000,
      refund_block: 50,
    })
  })

  it('resolves explicit, legacy and provisional funding hashes', () => {
    const row = { address: 'legacy-hash', amount: 1, timeout_block: 1, swap_id: 'swap', swap_status: 'pending', htlc_id: 'htlc' }
    expect(getSwapHtlcTxHash(row)).toBe('legacy-hash')
    expect(getSwapHtlcTxHash({ ...row, tx_hash: 'replacement' })).toBe('replacement')
    expect(getSwapHtlcTxHash({ ...row, address: 'htlc' })).toBeNull()
    expect(getSwapHtlcTxHash({ ...row, address: 'nim-address', htlc_id: null })).toBe('nim-address')
  })
})
