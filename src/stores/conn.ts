import { defineStore } from 'pinia'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { CapacitorSQLite, SQLiteConnection, CapacitorSQLite as sqlitePlugin } from '@capacitor-community/sqlite'
import { computed, ref, watchEffect } from 'vue'
import { computedAsync } from '@vueuse/core'
import { useDevice } from '@/composables/useDevice'
import { migrations } from '@/composables/utils/migrations'
import type { AsyncOption } from '@/types'

const DB_NAME = 'storage'
const DB_VERSION = migrations[migrations.length - 1].version
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
    if (!db.value) {
      console.error('The db instance is not defined')
      return 'The db instance is not defined'
    }
    // if (locked.value)
    //   return 'The db is locked'
  }

  const lastUnlocked = ref(0)
  watchEffect(() => !locked.value && (lastUnlocked.value = Date.now()))

  const dbExists = computedAsync(async () => !!(await sqlitePlugin.isDatabase({ database: DB_NAME })).result, false)
  const hasSecret = computedAsync(async () => dbExists.value && !!((await sqlitePlugin.isSecretStored()).result), false)

  const dbReady = computed(() => dbExists.value && !!db.value)
  const isOpen = computedAsync(async () => dbReady.value && !!((await db.value!.isDBOpen()).result), false)

  async function init() {
    if (isWeb) {
      document.body.appendChild(document.createElement('jeep-sqlite'))
      await customElements.whenDefined('jeep-sqlite')
      await sqlitePlugin.initWebStore()
    }
    // @ts-expect-error The function is not defined, but it exists.
    sqlitePlugin.addListener('sqliteBiometricEvent', async ({ result }: any) => {
      if (result && hasSecret.value)
        await open()
    })

    const promises = await Promise.allSettled(migrations.map(({ version, statements }) => sqlite.addUpgradeStatement(DB_NAME, version, statements)))
    const rejected = promises.filter(({ status }) => status === 'rejected') as PromiseRejectedResult[]
    rejected.forEach(({ reason }) => console.error(reason))
  }

  async function open() {
    await init()
    const encrypted = !isWeb // Only encrypt on mobile
    const mode = isWeb ? 'secret' : 'no-encryption'
    db.value = await sqlite.createConnection(DB_NAME, encrypted, mode, DB_VERSION, false)
    await db.value.open()
    resolveUnlockDb()
  }

  async function close() {
    await waitForUnlock()
    await db.value!.close()
  }

  // FIXME: This should not be neccesary
  async function commit() {
    await close()
    await open()
  }

  async function deleteDatabase() {
    await waitForUnlock()
    await CapacitorSQLite.deleteDatabase({ database: DB_NAME })
    await db.value!.delete()
    await sqlite.closeAllConnections()
    globalThis.document?.location.reload()
  }

  return {
    init,
    db,
    sqlite,
    dbExists,
    hasSecret,

    isOpen,
    commit,
    open,
    close,

    locked,
    lastUnlocked,
    waitForUnlock,

    deleteDatabase,
  }
})
