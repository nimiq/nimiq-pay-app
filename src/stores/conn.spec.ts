import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const connections = new Set<string>()
  const dbConn = {
    open: vi.fn(),
    isDBOpen: vi.fn(async () => ({ result: true })),
  }
  return {
    connections,
    dbConn,
    sqlite: {
      checkConnectionsConsistency: vi.fn(async () => ({ result: true })),
      isConnection: vi.fn(async (name: string) => ({ result: connections.has(name) })),
      retrieveConnection: vi.fn(async () => dbConn),
      // Mirrors the plugin: a second create on an existing name rejects.
      createConnection: vi.fn(async (name: string) => {
        if (connections.has(name))
          throw new Error(`Connection ${name} already exists`)
        connections.add(name)
        return dbConn
      }),
      isDatabase: vi.fn(async () => ({ result: true })),
    },
  }
})

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(() => mocks.sqlite),
}))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => ({ isWeb: false }) }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/sql-queries', () => ({ migrations: [{ toVersion: 1, statements: [] }] }))

describe('useConn open', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.connections.clear()
    vi.clearAllMocks()
  })

  it('shares one connection and one db.open() between overlapping calls', async () => {
    let finishOpen!: () => void
    mocks.dbConn.open.mockImplementation(() => new Promise<void>((resolve) => {
      finishOpen = resolve
    }))
    const { useConn } = await import('./conn')
    const conn = useConn()

    const first = conn.open()
    const second = conn.open()
    await vi.waitFor(() => expect(mocks.dbConn.open).toHaveBeenCalled())
    finishOpen()

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(mocks.sqlite.createConnection).toHaveBeenCalledTimes(1)
    expect(mocks.dbConn.open).toHaveBeenCalledTimes(1)
    expect(conn.locked).toBe(false)
  })

  // The decrypt retry's checkEncryptionSecret closes every native connection, so a late finish of
  // the timed-out open would unlock queries onto a closed connection.
  it('abandons a timed-out open so its late finish cannot unlock', async () => {
    vi.useFakeTimers()
    try {
      const finishOpen: Array<() => void> = []
      mocks.dbConn.open.mockImplementation(() => new Promise<void>((resolve) => {
        finishOpen.push(resolve)
      }))
      const { useConn } = await import('./conn')
      const conn = useConn()

      const first = conn.open()
      const firstResult = expect(first).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(20_000)
      await firstResult

      const retry = conn.open()
      await vi.advanceTimersByTimeAsync(0)
      expect(mocks.dbConn.open).toHaveBeenCalledTimes(2)

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
