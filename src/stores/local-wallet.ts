import type { AsyncResult, Result } from '@/types'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useApp } from './app'

const logger = useLogger('local-wallet')

export const useLocalWallet = defineStore('local-wallet', () => {
  const { entropy } = storeToRefs(useApp())
  const localWallet = computed(() => {
    Nimiq.Entropy.SIZE = 16
    return Nimiq.KeyPair.derive(
      Nimiq.Entropy.fromHex(entropy.value).toExtendedPrivateKey().derivePath(`m/44'/242'/0'/0'`).privateKey,
    )
  })

  const localAddress = computed(() => localWallet.value.toAddress())
  const publicKey = computed(() => localWallet.value.publicKey.toHex())
  const localBalance = ref(0)

  function getWords(): Result<string[], string> {
    if (!entropy.value) {
      const err = i18n.t('No account has been found')
      logger.error(err)
      return { error: err, data: undefined }
    }
    return { data: Nimiq.Entropy.fromHex(entropy.value).toMnemonic(), error: undefined }
  }

  function importWords(words: string[]): Result<void, string> {
    try {
      Nimiq.Entropy.SIZE = 16
      entropy.value = Nimiq.MnemonicUtils.mnemonicToEntropy(words).toHex()
      return { data: undefined, error: undefined }
    }
    catch (error) {
      let errorMessage = (error as Error).message || i18n.t('An unknown error occurred while importing words')
      // Translate and reword Nimiq core error messages
      const invalidWordErrorMatch = errorMessage.match(/^Invalid mnemonic, word >(.*)< is not in wordlist$/)
      if (invalidWordErrorMatch) {
        const word = invalidWordErrorMatch[1]
        errorMessage = i18n.t('"{word}" is an invalid recovery word', { word })
      }
      else if (/Invalid mnemonic, (?:less|more|words % 3)|Invalid generated key, length (?:<|>|% 4)/.test(errorMessage)) {
        errorMessage = i18n.t('Wrong number of recovery words')
      }
      else if (errorMessage === 'Invalid checksum') {
        errorMessage = i18n.t('Invalid recovery words')
      }
      else {
        logger.warn(`Untranslated message: ${errorMessage}`)
      }
      return { error: errorMessage, data: undefined }
    }
  }

  return {
    hasLocalWallet: computed(() => !!entropy?.value),
    localWallet,
    localAddress,
    publicKey,
    localBalance,
    getWords,
    importWords,
  }
})
