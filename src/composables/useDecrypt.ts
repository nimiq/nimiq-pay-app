import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useApp } from '@/stores/app'
import type { Option } from '@/types'
import { useDevice } from '@/composables/useDevice'
import { useConn } from '@/stores/conn'

/**
 * Once the db is initialized, the database needs to be decrypted to make operations on it
 *
 * We need to decrypt the db on mobile, but on web we fake it
 */
export function useDecrypt() {
  const { isWeb } = useDevice()
  const { sqlite, open: openDb, close: closeDb } = useConn()
  const { isOpen, hasSecret, dbExists } = storeToRefs(useConn())
  const { pinCode } = storeToRefs(useApp())

  const decrypted = ref(false)

  // No encryption on web, but we simulate PIN requirement
  async function decryptWeb(inputPin: string): Promise<Option<string>> {
    if (!isWeb)
      throw new Error('This method is not supported in mobile.')

    if (!isOpen.value)
      await openDb()

    let error: string | undefined

    if (!pinCode.value && !inputPin)
      error = 'Both expected and the given PIN are empty'
    else if (!pinCode.value)
      pinCode.value = inputPin
    else if (inputPin !== pinCode.value)
      error = 'Invalid PIN'
    // else {} If the PIN is correct, we don't need to do anything

    return error
  }

  async function decryptMobile(pin: string): Promise<Option<string>> {
    if (isWeb)
      throw new Error('This method is not supported in web.')
    if (!dbExists.value)
      throw new Error('The db does not exist')

    // FIXME try to do this without closing the db
    await closeDb()

    const error = hasSecret.value
      ? sqlite.checkEncryptionSecret(pin).then(({ result }) => !result ? 'There was an error' : undefined).catch(() => 'Invalid PIN')
      : sqlite.setEncryptionSecret(pin).then(() => undefined).catch(() => 'There was an error')
    if (error)
      return error

    await openDb()
  }

  /**
   * Decrypts the database with the pin. If the database has been created but not encrypted yet, it will encrypt it.
   *
   * @param pin
   * @returns
   */
  async function decrypt(pin: string): Promise<Option<string>> {
    if (decrypted.value)
      return

    const error = await (isWeb ? decryptWeb(pin) : decryptMobile(pin))
    if (error)
      return error

    decrypted.value = true
  }

  return {
    decrypted,
    decrypt,
  }
}
