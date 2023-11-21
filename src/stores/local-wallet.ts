import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { computedAsync } from '@vueuse/core'
import { useConn } from './conn'
import { useApp } from './app'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'
import type { AsyncResult } from '@/types'

// const REQUIRED_BLOCK_CONFIRMATIONS = 10

export const useLocalWallet = defineStore('local-wallet', () => {
  const { client } = useNimiqNetwork()
  const { entropyToMnemonic, mnemonicToExtendedPrivateKey } = Nimiq.MnemonicUtils
  const { waitForUnlock } = useConn()

  const { entropy } = storeToRefs(useApp())
  const localWallet = computed(() => new Nimiq.Wallet(Nimiq.KeyPair.derive(mnemonicToExtendedPrivateKey(entropyToMnemonic(entropy.value)).derivePath(`m/44'/242'/0'/0'`).privateKey)))

  const address = computed(() => localWallet.value.address)
  const publicKey = computed(() => localWallet.value.publicKey.toHex())
  const balance = ref(0)

  onMounted(async () => {
    client.value.addHeadChangedListener(async () => {
      console.log('Head changed', address.value)
      const account = await client.value!.getAccount(address.value!)
      balance.value = account?.balance || 0
    })
  })

  async function getWords(): AsyncResult<string[]> {
    await waitForUnlock()
    if (!entropy.value)
      return { error: 'The entropy is not defined', data: undefined }
    return { data: entropyToMnemonic(entropy.value), error: undefined }
  }

  return {
    hasLocalWallet: computed(() => !!entropy?.value),
    localWallet,
    address,
    publicKey,
    balance,
    getWords,
  }
})
