import { computedAsync } from '@vueuse/core'
import { onMounted, ref } from 'vue'

export function useNimiqNetwork() {
  const client = ref<Nimiq.Client>()
  const consensus = ref<Nimiq.Client.ConsensusState>()
  const head = ref<Nimiq.Block>()
  const height = computedAsync(() => head.value?.height || -1, -1)

  onMounted(async () => {
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
  })

  return {
    client, // make sure to await for client.value.waitForConsensusEstablished() before using it
    consensus,
    head,
    height,
  }
}
