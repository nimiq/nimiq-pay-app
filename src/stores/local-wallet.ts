import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useApp } from './app'
import { i18n } from '@/i18n/i18n-setup'
import type { AsyncResult, Result } from '@/types'

export const useLocalWallet = defineStore('local-wallet', () => {
  const { entropyToMnemonic, mnemonicToExtendedPrivateKey, mnemonicToEntropy } = Nimiq.MnemonicUtils

  const { entropy } = storeToRefs(useApp())
  const localWallet = computed(() => new Nimiq.Wallet(Nimiq.KeyPair.derive(mnemonicToExtendedPrivateKey(entropyToMnemonic(entropy.value)).derivePath(`m/44'/242'/0'/0'`).privateKey)))

  const localAddress = computed(() => localWallet.value.address)
  const publicKey = computed(() => localWallet.value.publicKey.toHex())
  const localBalance = ref(0)

  async function getWords(): AsyncResult<string[]> {
    if (!entropy.value)
      return { error: i18n.t('No account has been found'), data: undefined }
    return { data: entropyToMnemonic(entropy.value), error: undefined }
  }

  function importWords(words: string[]): Result<void> {
    try {
      // eslint-disable-next-line ts/ban-ts-comment
      // @ts-expect-error
      Nimiq.Entropy.SIZE = 16
      entropy.value = mnemonicToEntropy(words).toHex()
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
        console.warn(`Untranslated message: ${errorMessage}`)
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
