import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConn } from './conn'

const mocks = vi.hoisted(() => {
  // Stateful like the native plugin: isDBOpen reflects open/close and queries need an open db.
  const state = { opened: false }
  const connections = new Set<string>()
  const openConnection = async () => {
    state.opened = true
  }
  const connection = {
    open: vi.fn(openConnection),
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
    connections,
    connection,
    openConnection,
    sqlite: {
      addUpgradeStatement: vi.fn(async () => {}),
      checkConnectionsConsistency: vi.fn(async () => ({ result: true })),
      isConnection: vi.fn(async (name: string) => ({ result: connections.has(name) })),
      retrieveConnection: vi.fn(async () => connection),
      // Mirrors the plugin: a second create on an existing name rejects.
      createConnection: vi.fn(async (name: string) => {
        if (connections.has(name))
          throw new Error(`Connection ${name} already exists`)
        connections.add(name)
        return connection
      }),
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
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/sql-queries', () => ({ migrations: [{ toVersion: 1, statements: [] }] }))

function resetMocks() {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.state.opened = false
  mocks.connections.clear()
  mocks.connection.open.mockImplementation(mocks.openConnection)
}

describe('useConn open', () => {
  beforeEach(resetMocks)

  it('shares one connection and one db.open() between overlapping calls', async () => {
    let finishOpen!: () => void
    mocks.connection.open.mockImplementation(() => new Promise<void>((resolve) => {
      finishOpen = resolve
    }))
    const conn = useConn()

    const first = conn.open()
    const second = conn.open()
    await vi.waitFor(() => expect(mocks.connection.open).toHaveBeenCalled())
    finishOpen()

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(mocks.sqlite.createConnection).toHaveBeenCalledTimes(1)
    expect(mocks.connection.open).toHaveBeenCalledTimes(1)
    expect(conn.locked).toBe(false)
  })

  // The decrypt retry's checkEncryptionSecret closes every native connection, so a late finish of
  // the timed-out open would unlock queries onto a closed connection.
  it('abandons a timed-out open so its late finish cannot unlock', async () => {
    vi.useFakeTimers()
    try {
      const finishOpen: Array<() => void> = []
      mocks.connection.open.mockImplementation(() => new Promise<void>((resolve) => {
        finishOpen.push(resolve)
      }))
      const conn = useConn()

      const first = conn.open()
      const firstResult = expect(first).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(20_000)
      await firstResult

      const retry = conn.open()
      await vi.advanceTimersByTimeAsync(0)
      expect(mocks.connection.open).toHaveBeenCalledTimes(2)

      finishOpen[0]()
      await vi.advanceTimersByTimeAsync(0)
      expect(conn.locked).toBe(true)

      finishOpen[1]()
      await expect(retry).resolves.toBeUndefined()
      expect(conn.locked).toBe(false)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

async function openConn() {
  const conn = useConn()
  await conn.open()
  return conn
}

describe('conn unlock gate', () => {
  beforeEach(resetMocks)

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
