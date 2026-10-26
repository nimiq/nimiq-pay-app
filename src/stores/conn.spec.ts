import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConn } from './conn'

const mocks = vi.hoisted(() => {
  // Stateful like the native plugin: isDBOpen reflects open/close and queries need an open db.
  const state = { opened: false }
  const connection = {
    open: vi.fn(async () => { state.opened = true }),
    close: vi.fn(async () => { state.opened = false }),
    delete: vi.fn(async () => {}),
    isDBOpen: vi.fn(async () => ({ result: state.opened })),
    query: vi.fn(async () => {
      if (!state.opened)
        throw new Error('database not opened')
      return { values: [{ id: 1 }] }
    }),
  }
  return {
    state,
    connection,
    sqlite: {
      addUpgradeStatement: vi.fn(async () => {}),
      checkConnectionsConsistency: vi.fn(async () => ({ result: false })),
      isConnection: vi.fn(async () => ({ result: false })),
      createConnection: vi.fn(async () => connection),
      isDatabase: vi.fn(async () => ({ result: true })),
      closeAllConnections: vi.fn(async () => {}),
    },
  }
})

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: { deleteDatabase: vi.fn(async () => {}) },
  SQLiteConnection: class { constructor() { return mocks.sqlite } },
}))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => ({ isWeb: false }) }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/sql-queries', () => ({ migrations: [{ toVersion: 1, statements: [] }] }))

async function openConn() {
  const conn = useConn()
  await conn.open()
  return conn
}

describe('conn unlock gate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.state.opened = false
  })

  it('closes and locks an existing db opened after init()', async () => {
    const conn = useConn()
    await conn.init()
    await openConn()
    await conn.close()
    expect(mocks.connection.close).toHaveBeenCalledTimes(1)
    expect(conn.locked).toBe(true)
  })

  it('lets a query already past the unlock gate run before close()', async () => {
    const conn = await openConn()
    await expect(Promise.all([conn.query('SELECT 1'), conn.close()])).resolves.toEqual([[{ id: 1 }], undefined])
    expect(conn.locked).toBe(true)
  })

  it('makes queries wait for the reopen after close()', async () => {
    const conn = await openConn()
    await conn.close()
    expect(conn.locked).toBe(true)

    let settled = false
    const pending = conn.query('SELECT 1').finally(() => settled = true)
    await flushPromises()
    expect(settled).toBe(false)
    expect(mocks.connection.query).not.toHaveBeenCalled()

    await conn.open()
    await expect(pending).resolves.toEqual([{ id: 1 }])
    expect(conn.locked).toBe(false)
  })

  it('makes queries wait for the reopen after deleteDatabase() instead of throwing', async () => {
    const conn = await openConn()
    await conn.deleteDatabase(false)
    expect(conn.locked).toBe(true)

    let settled = false
    const pending = conn.query('SELECT 1').finally(() => settled = true)
    await flushPromises()
    expect(settled).toBe(false)

    await conn.open()
    await expect(pending).resolves.toEqual([{ id: 1 }])
  })

  it('returns from close() when already locked instead of waiting for an open', async () => {
    const conn = await openConn()
    await conn.deleteDatabase(false)
    await expect(conn.close()).resolves.toBeUndefined()
    expect(mocks.connection.close).not.toHaveBeenCalled()
  })

  it('closes the native connection once when close() runs concurrently', async () => {
    const conn = await openConn()
    await Promise.all([conn.close(), conn.close()])
    expect(mocks.connection.close).toHaveBeenCalledTimes(1)
  })

  it('keeps earlier waiters when locking an already locked db', async () => {
    const conn = await openConn()
    await conn.close()
    const pending = conn.query('SELECT 1')
    await conn.deleteDatabase(false)

    await conn.open()
    await expect(pending).resolves.toEqual([{ id: 1 }])
  })
})
