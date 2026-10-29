import type { Option } from '@/types'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { sha256Hex } from '@/lib/crypto'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'

const logger = useLogger('useDecrypt')

// Must be defined outside the useDecrypt scope, to be shared between calls
const decrypted = ref(false)
// Tail of the decrypt queue. A PIN re-submit after a UI timeout or a biometric autofill can land
// while one is running; a second run would close the db under the first and race its open.
let decrypting: Promise<unknown> = Promise.resolve()

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

    logger.log('🔑 decryptMobile: entry', { isOpen: isOpen.value })
    // FIXME try to do this without closing the db
    if (isOpen.value) {
      logger.log('🔑 decryptMobile: closing existing db')
      await closeDb()
    }

    const secretStored = (await sqlite.isSecretStored()).result
    logger.log('🔑 decryptMobile: verifying secret', { secretStored })
    const error = secretStored
      ? await sqlite.checkEncryptionSecret(pin)
          .then(({ result }) => !result ? i18n.t('Invalid PIN') : undefined)
          .catch(() => i18n.t('Something went wrong decrypting the database. Try reloading the app.'))
      : await sqlite.setEncryptionSecret(pin)
          .then(() => undefined)
          .catch(() => i18n.t('Something went wrong decrypting the database. Try reloading the app.'))

    if (error) {
      logger.error(error)
      return error
    }

    logger.log('🔑 Database initialized and encrypted in mobile')

    try {
      logger.log('🔑 decryptMobile: openDb start')
      await openDb()
      logger.log('🔑 decryptMobile: openDb done')
    }
    catch (e) {
      logger.error('openDb failed during decrypt', e)
      return i18n.t('Something went wrong decrypting the database. Try reloading the app.')
    }
  }

  /**
   * Decrypts the database with the pin. If the database has been created but not encrypted yet, it will encrypt it.
   *
   * @param pin
   * @returns An error message if there was an error, undefined otherwise
   */
  async function decrypt(pin: string): Promise<Option<string>> {
    logger.log('🔓 decrypt: entry')
    // Queue rather than share: a later call may carry a different PIN, so it only reuses a success.
    // Chained on the real run, not a caller's timeout wrapper, since promiseWithTimeout doesn't cancel.
    const run = decrypting.catch(() => {}).then(async (): Promise<Option<string>> => {
      if (decrypted.value) {
        logger.log('🔓 decrypt: already decrypted, short-circuit')
        return
      }

      const inputHash = sha256Hex(pin)
      logger.log('🔓 decrypt: running', { isWeb })
      const error = await (isWeb ? decryptWeb(pin, inputHash) : decryptMobile(pin))
      logger.log('🔓 decrypt: db unlock done', { error })
      if (error)
        return error

      const { setEntropy, updatePinInputTs, migrateTopUpAddresses } = useApp()
      logger.log('🔓 decrypt: setEntropy start')
      await setEntropy()
      logger.log('🔓 decrypt: setEntropy done')
      updatePinInputTs()

      // One-time (APP-171): fold aliased top-up entries into withdrawal history, drop the rest.
      // Guarded so a migration failure never blocks unlock.
      try {
        await migrateTopUpAddresses()
      }
      catch (e) {
        logger.error('topUpAddresses migration failed', e)
      }

      pinHash.value = inputHash

      decrypted.value = true
      logger.log('🔓 decrypt: decrypted=true')
    })
    decrypting = run
    return run
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
    let ok = true
    try {
      // Native rekey closes every connection; close (and lock) first so queries wait for the reopen.
      await closeDb()
      await sqlite.changeEncryptionSecret(pin, oldPin)
    }
    catch (e) {
      logger.error(e)
      ok = false
    }
    // Reopen even if the rekey failed (with the still-stored old secret), or queries wait forever.
    try {
      await openDb()
    }
    catch (e) {
      logger.error(e)
      ok = false
    }
    if (!ok)
      return i18n.t('Something went wrong changing the PIN')
    pinHash.value = sha256Hex(pin)
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
