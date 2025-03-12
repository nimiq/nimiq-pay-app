import type { Option } from '@/types'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import jsSHA from 'jssha'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

const logger = useLogger('useDecrypt')

/**
 * Hashes an input to SHA-256, encoded as hex
 */
export function hash(pin: string): string {
  // We need to use a pure JS library because the native one doesn't work on unsecure contexts
  // https://forums.appgyver.com/t/error-in-crypto-subtle-on-ios-preview/12946
  // eslint-disable-next-line new-cap
  return new jsSHA('SHA-256', 'TEXT', { encoding: 'UTF8' }).update(pin).getHash('HEX')
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
  const { pinHash } = storeToRefs(useApp())

  // No encryption on web, but we simulate PIN requirement
  async function decryptWeb(inputPin: string, inputHash: string): Promise<Option<string>> {
    if (!isWeb)
      throw new Error('This method is not supported in mobile.') // no translation as not user-facing

    if (!isOpen.value)
      await openDb()

    if (!pinHash.value && !inputPin)
      return i18n.t('Both expected and the given PIN are empty')

    if (inputPin.length !== 4)
      return i18n.t('Invalid PIN length {length}', { length: inputPin.length })

    if (pinHash.value && inputHash !== pinHash.value)
      return i18n.t('Invalid PIN')
  }

  async function decryptMobile(pin: string): Promise<Option<string>> {
    if (isWeb)
      throw new Error('This method is not supported in web.') // no translation as not user-facing

    // FIXME try to do this without closing the db
    if (isOpen.value)
      await closeDb()

    const error = (await sqlite.isSecretStored()).result
      ? await sqlite.checkEncryptionSecret(pin)
        .then(({ result }) => !result ? i18n.t('Invalid PIN') : undefined)
        .catch(() => i18n.t('Something went wrong decrypting the database'))
      : await sqlite.setEncryptionSecret(pin)
        .then(() => undefined)
        .catch(() => i18n.t('Something went wrong decrypting the database'))

    if (error) {
      logger.error(error)
      return error
    }

    logger.log('🔑 Database initialized and encrypted in mobile')

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

    const inputHash = hash(pin)
    const error = await (isWeb ? decryptWeb(pin, inputHash) : decryptMobile(pin))
    if (error)
      return error

    const { setEntropy, updatePinInputTs } = useApp()
    await setEntropy()
    updatePinInputTs()

    pinHash.value = inputHash

    decrypted.value = true
  }

  /**
   * Resets the decrypted state and the pin hash. This is useful when the user reset the password.
   *
   * For example, in the setup flow, the user can go do:
   *   1. pin code & pin code confirm
   *   2. Once in the phon input step, click 'back'
   *   3. Redo the whole flow
   *
   * In this case, we need to reset the state of this composable to make it work
   */
  function reset() {
    decrypted.value = false
    pinHash.value = ''
  }

  async function changePin(pin: string, oldPin: string) {
    try {
      await sqlite.changeEncryptionSecret(pin, oldPin)
      await openDb()
      pinHash.value = hash(pin)
    }
    catch (e) {
      logger.error(e)
      return i18n.t('Something went wrong changing the PIN')
    }
  }

  function hasPin() {
    if (!isWeb)
      throw new Error('This method is not supported in mobile.') // no translation as not user-facing
    return useApp().pinHash !== ''
  }

  return {
    decrypted,
    decrypt,
    hasPin,
    reset,
    changePin,
  }
}
