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
// Cap open() (connection, keying + migrations). Without it, a stalled open never resolves and
// resolveUnlockDb() is never reached, so every later query() awaits the unlock promise forever — a
// silent app-wide wedge with no error. The timeout turns that into a surfaced, recoverable error.
const DB_OPEN_TIMEOUT = 20 * 1e3

export const useConn = defineStore('conn', () => {
  const { isWeb } = useDevice()

  const sqlite = new SQLiteConnection(sqlitePlugin)
  const db = ref<SQLiteDBConnection>()

  const locked = ref(true)
  // Once the db is unlocked, this function is resolved and all the waiting promises are resolved.
  let resolveUnlockDb: () => void
  // The promise that resolves when the db is unlocked. When resolved, it sets locked to false.
  const unlockPromise = new Promise<void>((resolve) => {
    resolveUnlockDb = () => {
      locked.value = false
      resolve()
    }
  })
  // If the db is locked, it will return the promise that resolves when the db is unlocked.
  async function waitForUnlock(): AsyncOption<string> {
    if (locked.value)
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

  // Overlapping callers share one open: two runs would both see no connection, both call
  // createConnection (the second fails on the existing name) and run the migration chain twice.
  let opening: Promise<void> | undefined
  // Bumped when `opening` is cleared, so a timed-out attempt can tell it was abandoned.
  let openGeneration = 0

  async function open() {
    if (!opening) {
      const generation = openGeneration
      opening = (async () => {
        const encrypted = !isWeb // Only encrypt on mobile
        const mode = encrypted ? 'secret' : 'no-encryption'
        logger.log('🗄️ open: resolving connection')
        const conn = (await sqlite.checkConnectionsConsistency()).result && (await sqlite.isConnection(DB_NAME, false)).result
          ? await sqlite.retrieveConnection(DB_NAME, false)
          : await sqlite.createConnection(DB_NAME, encrypted, mode, DB_VERSION, false)
        logger.log('🗄️ open: connection ready, opening DB (keying + migrations)')
        await conn.open()
        logger.log('🗄️ open: DB opened')

        // https://github.com/capacitor-community/sqlite/issues/215#issuecomment-1028913155
        if (isWeb)
          await conn.execute(`PRAGMA journal_mode=WAL;`, false)

        const exists = !!(await sqlite.isDatabase(DB_NAME)).result
        // A timed-out open is abandoned: the retry's checkEncryptionSecret closes every native
        // connection, so this one must not become db or unlock queries onto a closed connection.
        if (generation !== openGeneration)
          throw new Error('DB open abandoned after timeout')
        db.value = conn
        dbExists.value = exists
        // No await after the check, so the timeout can't report a failure after the db unlocked.
        resolveUnlockDb()
        logger.log('🗄️ open: unlocked')
      })()
    }
    const current = opening
    // Timeout so a keying/migration stall surfaces as an error (caught by the decrypt caller)
    // instead of silently leaving `locked` true forever. Clearing on timeout abandons the attempt.
    await promiseWithTimeout(current, DB_OPEN_TIMEOUT).finally(() => {
      if (opening === current) {
        opening = undefined
        openGeneration++
      }
    })
  }

  async function close() {
    if (!isOpen.value)
      return
    await waitForUnlock()
    await db.value!.close()
  }

  async function deleteDatabase(reload: boolean = true) {
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
