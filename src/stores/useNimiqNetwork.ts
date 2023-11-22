import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useNimiqNetwork = defineStore('nimiq-network', () => {
  const client = ref<Nimiq.Client>()
  const consensus = ref<Nimiq.Client.ConsensusState>()
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

    client.value.addConsensusChangedListener(newConsensus => consensus.value = newConsensus)
    client.value.addHeadChangedListener(async blockHash => head.value = await client.value?.getBlock(blockHash))

    // @ts-expect-error Private property access
    ;(client.value._consensus as Nimiq.BaseMiniConsensus).on('peers-changed', async () => {
      const { totalPeerCount } = await client.value!.network.getStatistics()
      peerCount.value = totalPeerCount
    })
  }

  return {
    client, // make sure to await for client.value.waitForConsensusEstablished() before using it
    consensus,
    head,
    height,
    peerCount,
    init,
  }
})
