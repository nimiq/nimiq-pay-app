import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'
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
  const balance = computedAsync(async () => client.value?.getAccount(address.value!)?.then(a => a?.balance) || 0, 0)

  // onMounted(async () => {
  //   if (!client.value)
  //     return
  //   await client.value.waitForConsensusEstablished()

  //   // client.value.addHeadChangedListener(async () => {
  //   //   const account = await client.value!.getAccount(address.value!)
  //   //   await upsertWallet({ id: address.value!.toUserFriendlyAddress(), balance: account.balance, type: WalletType.Raw, status: WalletStatus.Active })
  //   //   const receipts = await client.value!.getTransactionReceiptsByHashes((await selectUnconfirmedTx()).data!)
  //   //   for (const { blockHeight, blockHash, transactionHash } of receipts) {
  //   //     const minHeight = head.value!.height + REQUIRED_BLOCK_CONFIRMATIONS
  //   //     const status = blockHeight > minHeight ? TransactionStatus.CONFIRMED : TransactionStatus.MINED
  //   //     await updateTx(transactionHash.toHex(), { status, block: blockHash.toHex(), blockHeight })
  //   //   }
  //   // })
  // })

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
