import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useApp } from './app'
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
      return { error: 'The entropy is not defined', data: undefined }
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
      return { error: (error as Error).message || 'Unknown error importing words', data: undefined }
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
