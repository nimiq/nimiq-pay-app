import type { WidgetDefinition, WidgetPermission, WidgetSize } from '@/lib/mini-app-widgets'
import type { NetworkMode } from '@/lib/network'
import { SecureStorage, StorageError, StorageErrorType } from '@aparajita/capacitor-secure-storage'
import { until } from '@vueuse/core'
import { sha256Hex } from '@/lib/crypto'
import { promiseWithTimeout } from '@/lib/utils'
import { useLocalWallet } from '@/stores/local-wallet'

/** What outlasts a logout: the user's choices, never what a Mini App sent. */
export interface SavedWidget {
  scope: string
  widgetId: string
  network: NetworkMode
  size: WidgetSize
  definition: WidgetDefinition
  grants?: WidgetPermission[]
  stopped?: WidgetPermission[]
  /** It had a token, so it waits for the Mini App to send one again. */
  connected?: true
  /** Its server ended it: it stays ended. */
  gone?: true
}

const WAIT_MS = 5_000

export function widgetAccountKey(address: string): string {
  // Hashed, as the keys of the store can be listed.
  return `miniAppWidgets:v1:${sha256Hex(`miniAppWidgets ${address}`)}`
}

export function currentAccountKey(): string | undefined {
  const wallet = useLocalWallet()
  return wallet.hasLocalWallet ? widgetAccountKey(wallet.localAddress.toUserFriendlyAddress()) : undefined
}

/** The database opens before the wallet is read from it. */
export async function accountKey(): Promise<string> {
  await until(() => useLocalWallet().hasLocalWallet).toBeTruthy({ timeout: WAIT_MS, throwOnTimeout: true })
  return currentAccountKey()!
}

/** None for an entry that can never be read; fails when it cannot be read now. */
export async function readSavedWidgets(key: string): Promise<unknown[]> {
  try {
    const data = await promiseWithTimeout(SecureStorage.get(key, false, false), WAIT_MS)
    return Array.isArray(data) ? data : []
  }
  catch (error) {
    if (error instanceof StorageError && error.code === StorageErrorType.invalidData)
      return []
    throw error
  }
}
