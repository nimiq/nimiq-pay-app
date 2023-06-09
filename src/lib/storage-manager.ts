import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { InjectionKey } from "vue"

export interface StorageKey<T> { name: string; }

const DB_NAME = "storage"
const DB_VERSION = 1
const upgrades: { version: number, statements: string[] }[] = [
    {
        version: 1,
        statements: ["CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);"]
    }
]

interface InternalStorage {
    pin?: string
}

const InternalStorageKey = { name: "_" } as StorageKey<InternalStorage>

export class StorageManager {
    private unlockedReady: Promise<void>
    private unlocked?: Promise<void>
    private wasUnlocked: boolean = false
    private newPin?: string
    private markUnlocked?: (() => void)
    private sqlite?: SQLiteConnection
    private db?: SQLiteDBConnection

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
        if (Capacitor.getPlatform() === "web") {
            const jeepSqlite = document.createElement('jeep-sqlite');
            document.body.appendChild(jeepSqlite);
            await customElements.whenDefined('jeep-sqlite');
            await this.sqlite!.initWebStore();
        }
        plugin.addListener('sqliteBiometricEvent', async (it: any) => {
            const exists = await this.sqlite!.isDatabase(DB_NAME)
            const secret = await this.sqlite!.isSecretStored()
            if (it.result && exists.result && secret.result) {
                await this.open()
            }
        })
        for (const upgrade of upgrades) {
            await this.sqlite!.addUpgradeStatement(DB_NAME, upgrade.version, upgrade.statements)
        }
    }

    isUnlocked(): boolean {
        return this.wasUnlocked
    }

    async awaitUnlocked(): Promise<void> {
        await this.unlockedReady
        await this.unlocked
    }

    async get<T>(key: StorageKey<T>): Promise<T> {
        await this.awaitUnlocked()
        return this.getInternal(this.db!, key)
    }

    async getInternal<T>(db: SQLiteDBConnection, key: StorageKey<T>): Promise<T> {
        const result = await db.query("SELECT value FROM kv WHERE key = ?", [key.name])
        const values = result?.values
        if (Array.isArray(values) && values.length == 1) return JSON.parse(values[0].value) as T
        return {} as T
    }

    async has(key: StorageKey<any>): Promise<boolean> {
        await this.awaitUnlocked()
        const result = await this.db?.query("SELECT COUNT(*) AS count FROM kv WHERE key = ?", [key.name])
        const values = result?.values
        if (Array.isArray(values) && values.length == 1) return values[0].count > 0
        return false
    }

    async update<T>(key: StorageKey<T>, update: (storage: T) => void) {
        await this.awaitUnlocked()
        return this.updateInternal(this.db!, key, update)
    }

    async updateInternal<T>(db: SQLiteDBConnection, key: StorageKey<T>, update: (storage: T) => void) {
        const value = await this.get(key)
        update(value)
        await db.run("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", [key.name, JSON.stringify(value)])
        if (Capacitor.getPlatform() === "web") await this.sqlite!.saveToStore(DB_NAME)
    }

    async unlock(pin: string) {
        await this.unlockedReady
        this.db?.close()
        if (Capacitor.getPlatform() !== "web") {
            const exists = await this.sqlite!.isDatabase(DB_NAME)
            const secret = await this.sqlite!.isSecretStored()
            if (secret.result) {
                const check = await this.sqlite!.checkEncryptionSecret(pin)
                if (!check.result) throw 'Invalid secret'
            } else if (this.newPin != null) {
                await this.sqlite!.setEncryptionSecret(this.newPin)
            } else if (exists.result) {
                await this.sqlite!.setEncryptionSecret(pin)
            } else {
                throw 'Not set up'
            }
        } else {
            // No encryption on web, but we simulate PIN requirement
            const db = await this.sqlite!.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false)
            await db.open()
            const actualPin = (await this.getInternal(db, InternalStorageKey)).pin
            console.log(actualPin, pin, this.newPin)
            if (actualPin == null && this.newPin != null) {
                await this.updateInternal(db, InternalStorageKey, (storage) => storage.pin = this.newPin as string)
            } else if (actualPin != null) {
                if (pin != actualPin) {
                    throw 'Invalid secret'
                }
            } else {
                throw 'Not set up'
            }
            await db.close()
        }
        await this.open()
    }

    private async open() {
        if (Capacitor.getPlatform() !== "web") {
            this.db = await this.sqlite!.createConnection(DB_NAME, true, "secret", DB_VERSION, false)
        } else {
            this.db = await this.sqlite!.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false)
        }
        await this.db.open()
        this.markUnlocked?.call(null)
    }

    isPinAssigningActive(): boolean {
        return this.newPin != undefined
    }

    startNewPin(pin: string) {
        if (this.newPin != undefined) throw 'New PIN procedure already in process'
        if (pin == null) throw 'New PIN must not be null'
        this.newPin = pin
    }

    async confirmNewPin(pin: string) {
        if (this.newPin == undefined) throw 'New PIN procedure not active'
        if (pin != this.newPin) throw 'PIN mismatch'
        // TODO: Protect storage with pin
        await this.unlock(pin)
        this.newPin = undefined
    }

    cancelNewPin() {
        this.newPin = undefined
    }

    async exists() {
        return !!(await this.sqlite!.isDatabase(DB_NAME)).result
    }

    static KEY: InjectionKey<StorageManager> = Symbol(StorageManager.name)
}