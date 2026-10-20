import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConn } from './conn'

const mocks = vi.hoisted(() => {
  const connection = {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    isDBOpen: vi.fn(async () => ({ result: true })),
    query: vi.fn(async () => ({ values: [{ id: 1 }] })),
  }
  return {
    connection,
    sqlite: {
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
  // Let the async isOpen computed settle so close() sees an open db.
  await flushPromises()
  return conn
}

describe('conn unlock gate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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
