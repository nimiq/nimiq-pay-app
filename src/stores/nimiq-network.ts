import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { until } from '@vueuse/core'
import type { AsyncResult } from '@/types'
import { useToast } from '@/composables/useToast'

const { setToast, clearToast } = useToast()

export const useNimiqNetwork = defineStore('nimiq-network', () => {
  const client = ref<Nimiq.Client>()
  const consensus = ref<Nimiq.Client.ConsensusState>('connecting')
  const head = ref<Nimiq.Block>()
  const height = computed(() => head.value?.height || -1)
  const peerCount = ref(0)

  async function init() {
    // TODO: use mainnet in production
    // import.meta.env.DEV
    // ? Nimiq.GenesisConfig.test()
    // : Nimiq.GenesisConfig.main()

    Nimiq.GenesisConfig.test()

    await Nimiq.WasmHelper.doImport()
    client.value = Nimiq.Client.Configuration.builder().instantiateClient()

    head.value = await client.value.getHeadBlock()

    client.value.addConsensusChangedListener((newConsensus) => {
      if (newConsensus === 'established')
        clearToast()
      // If consensus was established before, but now is not, show error toast
      else if (consensus.value === 'established')
        setToast({ message: `Consensus lost, ${newConsensus}`, keepOpen: true, error: true })

      consensus.value = newConsensus
    })
    client.value.addHeadChangedListener(async blockHash => head.value = await client.value?.getBlock(blockHash))

    try {
      await until(consensus).toBe('established', { timeout: 30 * 1e3, throwOnTimeout: true })
    }
    catch {
      setToast({ message: `Consensus ${consensus.value}`, error: true, keepOpen: true })
    }

    // @ts-expect-error Private property access
    ;(await client.value._consensus as Nimiq.BaseMiniConsensus).network.on('peers-changed', async () => {
      const stats = await client.value?.network.getStatistics()
      peerCount.value = stats?.totalPeerCount || 0
    })
  }

  async function claimCashlink(cashlink: string, address: Nimiq.Address) {
    if (!cashlink)
      throw new Error('No Cashlink found')

    cashlink = cashlink.split('cashlink/#')[1].replace(/~/g, '').replace(/=*$/, match => Array.from({ length: match.length }).fill('.').join(''))
    const buf = Nimiq.BufferUtils.fromBase64Url(cashlink)
    const keyPair = Nimiq.KeyPair.derive(Nimiq.PrivateKey.unserialize(buf))
    const wallet = new Nimiq.Wallet(keyPair)
    const { balance } = await client.value!.getAccount(wallet.address)
    const amount = Math.min(buf.readUint64(), balance)
    if (!address)
      throw new Error('No Nimiq Wallet address found')
    if (amount <= 0)
      throw new Error('Cashlink has no balance')

    const tx = wallet.createTransaction(
      address,
      amount,
      0,
      height.value,
    )
    await client.value!.sendTransaction(tx)
  }

  async function getAccount(address: Nimiq.Address | undefined): AsyncResult<Nimiq.Account> {
    if (!address)
      return { data: undefined, error: 'No address' }
    const account = await client.value?.getAccount(address)
    if (!account)
      return { data: undefined, error: 'No account' }
    return { data: account, error: undefined }
  }

  return {
    client, // make sure to await for client.value.waitForConsensusEstablished() before using it
    consensus,
    head,
    height,
    peerCount,
    init,
    claimCashlink,
    getAccount,
  }
})
