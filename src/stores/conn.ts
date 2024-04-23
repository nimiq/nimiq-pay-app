import { defineStore } from 'pinia'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection, CapacitorSQLite as sqlitePlugin } from '@capacitor-community/sqlite'
import { computed, ref } from 'vue'
import { computedAsync } from '@vueuse/core'
import { useDevice } from '@/composables/useDevice'
import { migrations } from '@/lib/sql-queries'
import type { AsyncOption } from '@/types'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('useConn')

const DB_NAME = 'storage'
const DB_VERSION = migrations.at(-1)!.toVersion

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

  async function open() {
    // await init()
    const encrypted = !isWeb // Only encrypt on mobile
    const mode = encrypted ? 'secret' : 'no-encryption'
    db.value = (await sqlite.checkConnectionsConsistency()).result && (await sqlite.isConnection(DB_NAME, false)).result
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, encrypted, mode, DB_VERSION, false)
    await db.value!.open()

    // https://github.com/capacitor-community/sqlite/issues/215#issuecomment-1028913155
    if (isWeb)
      await db.value!.execute(`PRAGMA journal_mode=WAL;`, false)

    resolveUnlockDb()
    dbExists.value = !!(await sqlite.isDatabase(DB_NAME)).result
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

    await db.value!.run(query, args, !isWeb)
    if (isWeb)
      await sqlite.saveToStore(DB_NAME)
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
    query,

    locked,
    waitForUnlock,

    deleteDatabase,
    resetSecret,
  }
})
