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

const decrypted = ref(false)
let decrypting: Promise<unknown> = Promise.resolve()

export function useDecrypt() {
  const { isWeb } = useDevice()
  const { sqlite, open: openDb, close: closeDb } = useConn()
  const { isOpen } = storeToRefs(useConn())
  const { pinHash } = storeToRefs(useApp())

  async function decryptWeb(inputPin: string, inputHash: string): Promise<Option<string>> {
    if (!isWeb)
      throw new Error('This method is not supported in mobile.')

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
      throw new Error('This method is not supported in web.')

    logger.log('🔑 decryptMobile: entry', { isOpen: isOpen.value })
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

  async function decrypt(pin: string): Promise<Option<string>> {
    logger.log('🔓 decrypt: entry')
    const run = decrypting.catch(() => {}).then(async (): Promise<Option<string>> => {
      const inputHash = sha256Hex(pin)
      if (decrypted.value) {
        logger.log('🔓 decrypt: already decrypted, short-circuit')
        return inputHash === pinHash.value ? undefined : i18n.t('Invalid PIN')
      }

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
      throw new Error('This method is not supported in mobile.')
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
