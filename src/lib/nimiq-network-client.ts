import type { InjectionKey, Ref } from 'vue'
import { ref } from 'vue'

const initPromise = (async () => {
  Nimiq.GenesisConfig.test()
  await Nimiq.WasmHelper.doImport()
})()

export class NimiqNetworkClient {
  private readonly clientPromise: Promise<Nimiq.Client>
  public readonly initialized: Ref<boolean> = ref(false)
  public readonly consensusState: Ref<Nimiq.Client.ConsensusState> = ref('connecting')
  public readonly head: Ref<Nimiq.Block | null> = ref(null)

  constructor() {
    this.clientPromise = initPromise.then(() => {
      return Nimiq.Client.Configuration.builder().instantiateClient()
    })
    this.clientPromise.then((async (client) => {
      await client.addConsensusChangedListener((consensusState) => {
        this.consensusState.value = consensusState
      })
      await client.addHeadChangedListener(async (blockHash, reason, revertedBlocks, adoptedBlocks) => {
        this.head.value = await client.getBlock(blockHash)
      })
      const block = await client.getHeadBlock()
      this.initialized.value = true
      this.head.value = block
    }))
  }

  async awaitInitialized() {
    await initPromise
  }

  async awaitConsensus() {
    await this.getClientWithConsensus().then(() => {
    })
  }

  async getClient() {
    return this.clientPromise
  }

  async getClientWithConsensus() {
    const client = await this.clientPromise
    await client.waitForConsensusEstablished()
    return client
  }

  async getHeadHeight() {
    const client = await this.getClientWithConsensus()
    return client.getHeadHeight()
  }

  async getHeadHeightOrPending() {
    const client = await this.clientPromise
    return client.getHeadHeight()
  }

  async getAccount(address: Nimiq.Address | string) {
    const client = await this.getClientWithConsensus()
    return client.getAccount(address)
  }

  async getTransactionReceipts(hashes: (Nimiq.Hash | string)[]) {
    const client = await this.getClientWithConsensus()
    return client.getTransactionReceiptsByHashes(hashes)
  }

  async sendTransaction(tx: Nimiq.Transaction) {
    const client = await this.getClientWithConsensus()
    return client.sendTransaction(tx)
  }

  static KEY: InjectionKey<NimiqNetworkClient> = Symbol(NimiqNetworkClient.name)
}
