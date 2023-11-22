import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Option } from '@/types'
import { useDevice } from '@/composables/useDevice'
import { useConn } from '@/stores/conn'

const pinHashLocalStorageKey = '_pin'

/**
 * Hashes an input to SHA-256, encoded as hex
 */
async function hash(pin: string): Promise<string> {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return new Uint8Array(digest).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
}

// Must be defined outside the useDecrypt scope, to be shared between calls
const decrypted = ref(false)

/**
 * Once the db is initialized, the database needs to be decrypted to make operations on it
 *
 * We need to decrypt the db on mobile, but on web we fake it
 */
export function useDecrypt() {
  const { isWeb } = useDevice()
  const { sqlite, open: openDb, close: closeDb } = useConn()
  const { isOpen } = storeToRefs(useConn())

  // No encryption on web, but we simulate PIN requirement
  async function decryptWeb(inputPin: string): Promise<Option<string>> {
    if (!isWeb)
      throw new Error('This method is not supported in mobile.')

    if (!isOpen.value)
      await openDb()

    let expectedPinHash = window.localStorage.getItem(pinHashLocalStorageKey)

    if (!expectedPinHash && !inputPin) {
      return 'Both expected and the given PIN are empty'
    }

    if (inputPin.length !== 4) return `Invalid PIN length ${inputPin.length}`

    const pinHash = await hash(inputPin)

    // If this is the first time the user opens the app, we need to set the PIN
    if (!expectedPinHash) {
      // Set PIN
      localStorage.setItem(pinHashLocalStorageKey, pinHash)
      expectedPinHash = pinHash
    }

    if (pinHash !== expectedPinHash) {
      return 'Invalid PIN'
    }
    // else {} If the PIN is correct, we don't need to do anything
  }

  async function decryptMobile(pin: string): Promise<Option<string>> {
    if (isWeb)
      throw new Error('This method is not supported in web.')

    // FIXME try to do this without closing the db
    if (isOpen.value)
      await closeDb()

    const error = (await sqlite.isSecretStored()).result
      ? await sqlite.checkEncryptionSecret(pin)
        .then(({ result }) => !result ? 'There was an error' : undefined)
        .catch(() => 'Invalid PIN')
      : await sqlite.setEncryptionSecret(pin)
        .then(() => undefined)
        .catch(() => 'There was an error')

    if (error) {
      console.error(error)
      return error
    }

    // eslint-disable-next-line no-console
    console.log('🔑 Database initialized and encrypted in mobile')

    await openDb()
  }

  /**
   * Decrypts the database with the pin. If the database has been created but not encrypted yet, it will encrypt it.
   *
   * @param pin
   * @returns An error message if there was an error, undefined otherwise
   */
  async function decrypt(pin: string): Promise<Option<string>> {
    if (decrypted.value)
      return

    const error = await (isWeb ? decryptWeb(pin) : decryptMobile(pin))
    if (error)
      return error

    decrypted.value = true
  }

  function hasPin() {
    if (!isWeb) throw new Error('This method is not supported in mobile.')
    return window.localStorage.getItem(pinHashLocalStorageKey) !== null
  }

  return {
    decrypted,
    decrypt,
    hasPin,
  }
}
