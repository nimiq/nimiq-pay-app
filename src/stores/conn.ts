import type { capSQLiteSet, SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { AsyncOption } from '@/types'
import { CapacitorSQLite, SQLiteConnection, CapacitorSQLite as sqlitePlugin } from '@capacitor-community/sqlite'
import { computedAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { migrations } from '@/lib/sql-queries'
import { promiseWithTimeout } from '@/lib/utils'

const logger = useLogger('useConn')

const DB_NAME = 'storage'
const DB_VERSION = migrations.at(-1)!.toVersion
// Cap db.open() (keying + migrations run here). Without it, a stalled open never resolves and
// resolveUnlockDb() is never reached, so every later query() awaits the unlock promise forever — a
// silent app-wide wedge with no error. The timeout turns that into a surfaced, recoverable error.
const DB_OPEN_TIMEOUT = 20 * 1e3

export const useConn = defineStore('conn', () => {
  const { isWeb } = useDevice()

  const sqlite = new SQLiteConnection(sqlitePlugin)
  const db = ref<SQLiteDBConnection>()

  const locked = ref(true)
  // Resolved by open(). close() and deleteDatabase() re-arm it, so queries issued while the db is
  // closed wait for the next open() instead of hitting a dead or missing handle.
  let resolveUnlockDb!: () => void
  let unlockPromise = new Promise<void>(resolve => resolveUnlockDb = resolve)
  function lock() {
    // Keep the pending promise when already locked: callers may be awaiting it.
    if (locked.value)
      return
    locked.value = true
    unlockPromise = new Promise<void>(resolve => resolveUnlockDb = resolve)
  }
  // Waits until the db is open, including across close()/reopen cycles.
  async function waitForUnlock(): AsyncOption<string> {
    // Loop: the db can be locked again between open() resolving and this waiter resuming.
    while (locked.value)
      await unlockPromise
    if (!db.value) {
      logger.error('The db instance is not defined')
      return 'The db instance is not defined' // no translation as not user-facing; just a dev error
    }
    // if (locked.value)
    //   return 'The db is locked' // no translation as not user-facing; just a dev error
  }

  const dbExists = ref(false)

  const dbReady = computed(() => dbExists.value && !!db.value)
  const isOpen = computedAsync(async () => dbReady.value && !!((await db.value!.isDBOpen()).result), false)

  async function init() {
    if (isWeb) {
      await customElements.whenDefined('jeep-sqlite')
      document.body.appendChild(document.createElement('jeep-sqlite'))
      await sqlite.initWebStore()
    }

    if (import.meta.env.DEV)
      logger.log(`📚 Initializing database`, migrations)

    await sqlite.addUpgradeStatement(DB_NAME, migrations)

    if (isWeb) {
      await open()
      await sqlite.saveToStore(DB_NAME)
    }

    dbExists.value = !!(await sqlite.isDatabase(DB_NAME)).result
  }

  async function open() {
    // await init()
    const encrypted = !isWeb // Only encrypt on mobile
    const mode = encrypted ? 'secret' : 'no-encryption'
    logger.log('🗄️ open: resolving connection')
    db.value = (await sqlite.checkConnectionsConsistency()).result && (await sqlite.isConnection(DB_NAME, false)).result
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, encrypted, mode, DB_VERSION, false)
    logger.log('🗄️ open: connection ready, opening DB (keying + migrations)')
    // Timeout the open so a keying/migration stall surfaces as an error (caught by the decrypt
    // caller) instead of silently leaving `locked` true forever.
    await promiseWithTimeout(db.value!.open(), DB_OPEN_TIMEOUT)
    logger.log('🗄️ open: DB opened')

    // https://github.com/capacitor-community/sqlite/issues/215#issuecomment-1028913155
    if (isWeb)
      await db.value!.execute(`PRAGMA journal_mode=WAL;`, false)

    locked.value = false
    resolveUnlockDb()
    logger.log('🗄️ open: unlocked')
    dbExists.value = !!(await sqlite.isDatabase(DB_NAME)).result
  }

  async function close() {
    // Locked means already closed, deleted or never opened. isOpen is not used: it can stay false
    // for an open db (computed before the native open finishes).
    if (locked.value)
      return
    lock()
    // Yield once so queries already past waitForUnlock() dispatch before the native close.
    await Promise.resolve()
    await db.value!.close()
  }

  async function deleteDatabase(reload: boolean = true) {
    lock()
    try {
      if (dbExists.value) {
        logger.log('Deleting database')
        await CapacitorSQLite.deleteDatabase({ database: DB_NAME })
        await db.value!.delete()
        await sqlite.closeAllConnections()
        db.value = undefined
        dbExists.value = false
      }
    }
    catch (e) {
      logger.error(e)
    }
    logger.log('Database deleted, reloading', reload)
    if (reload)
      globalThis.document?.location.reload()
  }

  async function resetSecret() {
    await Promise.allSettled([sqlite.deleteOldDatabases(), sqlite.clearEncryptionSecret()])
  }

  interface QueryOptions {
    single: boolean
  }
  async function query<T = any>(query: string, args: any[] = [], options: Partial<QueryOptions> = {}) {
    const err = await waitForUnlock()
    if (err)
      throw new Error(err)
    const res = await db.value!.query(query, args)

    return options.single ? res.values?.at(0) as T : res.values as T
  }

  async function run(query: string, args: any[] = []) {
    const err = await waitForUnlock()
    if (err)
      throw new Error(err)

    const result = await db.value!.run(query, args, !isWeb)
    if (isWeb)
      await sqlite.saveToStore(DB_NAME)
    return result
  }

  async function runSet(set: capSQLiteSet[]) {
    const err = await waitForUnlock()
    if (err)
      throw new Error(err)

    const result = await db.value!.executeSet(set)
    if (isWeb)
      await sqlite.saveToStore(DB_NAME)
    return result
  }

  return {
    init,
    db,
    sqlite,
    dbExists,

    isOpen,
    open,
    close,

    run,
    runSet,
    query,

    locked,
    waitForUnlock,

    deleteDatabase,
    resetSecret,
  }
})
