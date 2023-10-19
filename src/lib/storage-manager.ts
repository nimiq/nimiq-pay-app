import { Capacitor } from '@capacitor/core'
import type {
  SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import {
  CapacitorSQLite,
  SQLiteConnection,
} from '@capacitor-community/sqlite'
import { type InjectionKey, type Ref, computed, ref } from 'vue'

export interface StorageKey<T> {
  name: string
}

const DB_NAME = 'storage'
const DB_VERSION = 5
const upgrades: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: ['CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);'],
  },
  {
    version: 2,
    statements: [
      'CREATE TABLE IF NOT EXISTS tx (id TEXT PRIMARY KEY NOT NULL, type INTEGER NOT NULL, ts INTEGER NOT NULL, amount INTEGER NOT NULL, status INTEGER NOT NULL, wlId TEXT NOT NULL, peerId TEXT, peerName TEXT, fee INTEGER, fiatUnit TEXT, fiatAmount TEXT, raw TEXT);',
      'CREATE TABLE IF NOT EXISTS wl (id TEXT PRIMARY KEY NOT NULL, type INTEGER NOT NULL, status INTEGER NOT NULL, balance INTEGER, start INTEGER, end INTEGER);',
    ],
  },
  {
    version: 3,
    statements: [
      'ALTER TABLE wl ADD COLUMN proofSize INTEGER;',
    ],
  },
  {
    version: 4,
    statements: [
      'ALTER TABLE tx ADD COLUMN block INTEGER;',
      'ALTER TABLE tx ADD COLUMN blockHeight TEXT;',
      'ALTER TABLE tx ADD COLUMN details TEXT;',
      'ALTER TABLE tx ADD COLUMN rail TEXT;',
      'ALTER TABLE tx ADD COLUMN railId TEXT;',
      'ALTER TABLE tx ADD COLUMN railPeerId TEXT;',
    ],
  },
  {
    version: 5,
    statements: [
      "CREATE TABLE IF NOT EXISTS price (ts INTEGER NOT NULL PRIMARY KEY, value INTEGER NOT NULL);",
      "CREATE TABLE IF NOT EXISTS fiat (currency TEXT NOT NULL, ts INTEGER NOT NULL, value INTEGER NOT NULL, UNIQUE (currency, ts));",
    ]
  },
]

interface InternalStorage {
  pin?: string
  isBackupDone?: boolean
}

const InternalStorageKey = { name: '_' } as StorageKey<InternalStorage>

export enum TransactionType {
  UNKNOWN = 0,
  PAYMENT = 1,
  DEPOSIT_TO_INSTANT = 2,
  EXTEND_INSTANT = 3,
  RECOVER_INSTANT = 4,
}

export enum TransactionStatus {
  UNKNOWN = 0,
  PENDING = 1,
  MINED = 2,
  CONFIRMED = 3,
}

export enum WalletType {
  UNKNOWN = 0,
  RAW = 1,
  INSTANT = 2,
  BONUS = 3,
}

export enum WalletStatus {
  UNKNOWN = 0,
  PENDING = 1,
  ACTIVE = 2,
  EXPIRED = 3,
  EMPTIED = 4,
}

export class StorageManager {
  private unlockedReady: Promise<void>
  private unlocked?: Promise<void>
  private wasUnlocked: boolean = false
  private newPin?: string
  private markUnlocked?: (() => void)
  private sqlite?: SQLiteConnection
  private db?: SQLiteDBConnection
  private lastUnlocked: number = 0
  private isBackup: Ref<boolean> = ref(false)

  constructor() {
    this.unlockedReady = new Promise((resolveUnlockedReady) => {
      this.unlocked = new Promise<void>((resolveUnlocked) => {
        this.markUnlocked = resolveUnlocked
        resolveUnlockedReady()
      }).then(() => {
        this.wasUnlocked = true
      })
    })
  }

  async init(): Promise<void> {
    const plugin: any = CapacitorSQLite
    this.sqlite = new SQLiteConnection(plugin)
    if (Capacitor.getPlatform() === 'web') {
      const jeepSqlite = document.createElement('jeep-sqlite')
      document.body.appendChild(jeepSqlite)
      await customElements.whenDefined('jeep-sqlite')
      await this.sqlite!.initWebStore()
    }
    plugin.addListener('sqliteBiometricEvent', async (it: any) => {
      const exists = await this.sqlite!.isDatabase(DB_NAME)
      const secret = await this.sqlite!.isSecretStored()
      if (it.result && exists.result && secret.result)
        await this.open()
    })
    for (const upgrade of upgrades)
      await this.sqlite!.addUpgradeStatement(DB_NAME, upgrade.version, upgrade.statements)
  }

  isUnlocked(): boolean {
    return this.wasUnlocked
  }

  async awaitUnlocked(): Promise<void> {
    await this.unlockedReady
    await this.unlocked
  }

  async query(statement: string, params?: any[]): Promise<any[]> {
    await this.awaitUnlocked()
    const result = await this.db!.query(statement, params)
    const values = result?.values
    if (Array.isArray(values))
      return values
    return []
  }

  async run(statement: string, params?: any[]): Promise<number> {
    await this.awaitUnlocked()
    const result = await this.db!.run(statement, params)
    if (Capacitor.getPlatform() === 'web')
      await this.sqlite!.saveToStore(DB_NAME)
    return result.changes?.changes || 0
  }

  async get<T>(key: StorageKey<T>): Promise<T> {
    await this.awaitUnlocked()
    return this.getInternal(this.db!, key)
  }

  async getInternal<T>(db: SQLiteDBConnection, key: StorageKey<T>): Promise<T> {
    const result = await db.query('SELECT value FROM kv WHERE key = ?', [
      key.name,
    ])
    const values = result?.values
    if (Array.isArray(values) && values.length === 1)
      return JSON.parse(values[0].value) as T

    return {} as T
  }

  async has(key: StorageKey<any>): Promise<boolean> {
    await this.awaitUnlocked()
    const result = await this.db?.query(
      'SELECT COUNT(*) AS count FROM kv WHERE key = ?',
      [key.name],
    )
    const values = result?.values
    if (Array.isArray(values) && values.length === 1)
      return values[0].count > 0
    return false
  }

  async update<T>(key: StorageKey<T>, update: (storage: T) => void) {
    await this.awaitUnlocked()
    return this.updateInternal(this.db!, key, update)
  }

  async updateInternal<T>(db: SQLiteDBConnection, key: StorageKey<T>, update: (storage: T) => void) {
    const value = await this.getInternal(db, key)
    update(value)
    await db.run('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)', [key.name, JSON.stringify(value)])
    if (Capacitor.getPlatform() === 'web')
      await this.sqlite!.saveToStore(DB_NAME)
  }

  async checkPin(pin: string) {
    if (this.isUnlocked()) {
      if (Capacitor.getPlatform() !== 'web') {
        const check = await this.sqlite!.checkEncryptionSecret(pin)
        if (!check.result)
          throw new Error('Invalid secret')
      }
      else {
        const actualPin = (await this.get(InternalStorageKey)).pin
        if (pin !== actualPin)
          throw new Error('Invalid secret')
      }
    }
    else {
      await this.unlock(pin)
    }
    return true
  }

  async unlock(pin: string) {
    await this.unlockedReady
    this.db?.close()
    if (Capacitor.getPlatform() !== 'web') {
      const exists = await this.sqlite!.isDatabase(DB_NAME)
      const secret = await this.sqlite!.isSecretStored()
      if (secret.result) {
        const check = await this.sqlite!.checkEncryptionSecret(pin)
        if (!check.result)
          throw new Error('Invalid secret')
      }
      else if (this.newPin != null) {
        await this.sqlite!.setEncryptionSecret(this.newPin)
      }
      else if (exists.result) {
        await this.sqlite!.setEncryptionSecret(pin)
      }
      else {
        throw new Error('Not set up')
      }
    }
    else {
      // No encryption on web, but we simulate PIN requirement
      const db = await this.sqlite!.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)
      await db.open()
      const actualPin = (await this.getInternal(db, InternalStorageKey)).pin
      if (actualPin === undefined && this.newPin !== undefined) {
        await this.updateInternal(db, InternalStorageKey, storage => storage.pin = this.newPin as string)
      }
      else if (actualPin !== undefined) {
        if (pin !== actualPin)
          throw new Error('Invalid secret')
      }
      else {
        throw new Error('Not set up')
      }
      await db.close()
    }
    this.lastUnlocked = Date.now()
    await this.open()
  }

  getLastUnlocked(): number {
    return this.lastUnlocked
  }

  private async open() {
    if (this.db === undefined || !this.db.isDBOpen()) {
      if (Capacitor.getPlatform() !== 'web')
        this.db = await this.sqlite!.createConnection(DB_NAME, true, 'secret', DB_VERSION, false)

      else
        this.db = await this.sqlite!.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)

      await this.db.open()
      this.markUnlocked?.call(null)
      this.isBackup.value = (await this.get(InternalStorageKey)).isBackupDone ?? false
    }
  }

  isPinAssigningActive(): boolean {
    return this.newPin !== undefined
  }

  startNewPin(pin: string) {
    if (this.newPin !== undefined)
      throw new Error('New PIN procedure already in process')
    if (pin == null)
      throw new Error('New PIN must not be null')
    this.newPin = pin
  }

  async confirmNewPin(pin: string) {
    if (this.newPin === undefined)
      throw new Error('New PIN procedure not active')
    if (pin !== this.newPin)
      throw new Error('PIN mismatch')
    // TODO: Protect storage with pin
    await this.unlock(pin)
    this.newPin = undefined
  }

  async setPin(pin: string) {
    this.newPin = pin
    await this.unlock(pin)
    this.newPin = undefined
  }

  async exists() {
    return !!(await this.sqlite!.isDatabase(DB_NAME)).result
  }

  async setBackupDone(value: boolean) {
    await this.update(InternalStorageKey, storage => storage.isBackupDone = value)
    this.isBackup.value = value
  }

  isBackupDone() {
    console.log('isBackupDone', this.isBackup)
    return this.isBackup
  }

  async deleteDatabase() {
    await CapacitorSQLite.deleteDatabase({ database: DB_NAME })
    await this.db?.delete()
    this.db = undefined
    return await this.sqlite!.closeAllConnections()
  }

  static KEY: InjectionKey<StorageManager> = Symbol(StorageManager.name)
}
