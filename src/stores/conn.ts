import { defineStore } from 'pinia'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { CapacitorSQLite, SQLiteConnection, CapacitorSQLite as sqlitePlugin } from '@capacitor-community/sqlite'
import { computed, ref, watchEffect } from 'vue'
import { computedAsync } from '@vueuse/core'
import { useDevice } from '@/composables/useDevice'
import { migrations } from '@/lib/sql-queries'
import type { AsyncOption } from '@/types'

const DB_NAME = 'storage'
const DB_VERSION = migrations.at(-1)!.version

export const useConn = defineStore('conn', () => {
  const { isWeb } = useDevice()

  const sqlite = new SQLiteConnection(sqlitePlugin)
  const db = ref<SQLiteDBConnection>()

  const locked = ref(true)
  // Once the db is unlocked, this function is resolved and all the waiting promises are resolved.
  let resolveUnlockDb: () => void
  // The promise that resolves when the db is unlocked. When resolved, it sets locked to false.
  const unlockPromise = new Promise<void>((resolve) => { resolveUnlockDb = () => { locked.value = false; resolve() } })
  // If the db is locked, it will return the promise that resolves when the db is unlocked.
  async function waitForUnlock(): AsyncOption<string> {
    if (locked.value)
      await unlockPromise
    if (!db) {
      console.error('The db instance is not defined')
      return 'The db instance is not defined'
    }
    // if (locked.value)
    //   return 'The db is locked'
  }

  const lastUnlocked = ref(0)
  watchEffect(() => !locked.value && (lastUnlocked.value = Date.now()))

  const dbExists = computedAsync(async () => !!(await sqlite.isDatabase(DB_NAME)).result, false)

  const dbReady = computed(() => dbExists.value && !!db.value)
  const isOpen = computedAsync(async () => dbReady.value && !!((await db.value!.isDBOpen()).result), false)

  async function init() {
    const promises = await Promise.allSettled(migrations.map(({ version, statements }) => sqlite.addUpgradeStatement(DB_NAME, version, statements)))
    const rejected = promises.filter(({ status }) => status === 'rejected') as PromiseRejectedResult[]
    rejected.forEach(({ reason }) => console.error(reason))
  }

  async function open() {
    // await init()
    const encrypted = !isWeb // Only encrypt on mobile
    const mode = encrypted ? 'secret' : 'no-encryption'
    db.value = (await sqlite.checkConnectionsConsistency()).result && (await sqlite.isConnection(DB_NAME, false)).result
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, encrypted, mode, DB_VERSION, false)
    await db.value!.open()
    resolveUnlockDb()
  }

  async function close() {
    if (!isOpen.value)
      return
    await waitForUnlock()
    await db.value!.close()
  }

  // FIXME: This should not be necessary
  async function commit() {
    await close()
    await open()
  }

  async function deleteDatabase(reload: boolean = true) {
    await CapacitorSQLite.deleteDatabase({ database: DB_NAME })
    await db.value!.delete()
    await sqlite.closeAllConnections()
    if (reload)
      globalThis.document?.location.reload()
  }

  async function resetSecret() {
    await Promise.allSettled([sqlite.deleteOldDatabases(), sqlite.clearEncryptionSecret()])
  }

  return {
    init,
    db,
    sqlite,
    dbExists,

    isOpen,
    commit,
    open,
    close,

    locked,
    lastUnlocked,
    waitForUnlock,

    deleteDatabase,
    resetSecret,
  }
})
