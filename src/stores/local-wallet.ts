import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useConn } from './conn'
import { useApp } from './app'
import type { AsyncResult } from '@/types'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'

// const REQUIRED_BLOCK_CONFIRMATIONS = 10

export const useLocalWallet = defineStore('local-wallet', () => {
  const { entropyToMnemonic, mnemonicToExtendedPrivateKey } = Nimiq.MnemonicUtils
  const { waitForUnlock } = useConn()
  const { client } = useNimiqNetwork()

  const { entropy } = storeToRefs(useApp())
  const localWallet = computed(() => new Nimiq.Wallet(Nimiq.KeyPair.derive(mnemonicToExtendedPrivateKey(entropyToMnemonic(entropy.value)).derivePath(`m/44'/242'/0'/0'`).privateKey)))

  const localAddress = computed(() => localWallet.value.address)
  const publicKey = computed(() => localWallet.value.publicKey.toHex())
  const localBalance = ref(0)

  async function getWords(): AsyncResult<string[]> {
    await waitForUnlock()
    if (!entropy.value)
      return { error: 'The entropy is not defined', data: undefined }
    return { data: entropyToMnemonic(entropy.value), error: undefined }
  }

  // onMounted(async () => {
  //   await client.value?.waitForConsensusEstablished()

  //   client.value?.addHeadChangedListener(async () => {
  //     const account = await client.value?.getAccount(localAddress.value)
  //     localBalance.value = account?.balance || 0
  //   })
  // })

  return {
    hasLocalWallet: computed(() => !!entropy?.value),
    localWallet,
    localAddress,
    publicKey,
    localBalance,
    getWords,
  }
})
