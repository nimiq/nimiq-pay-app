import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { until } from '@vueuse/core'
import type { AsyncResult } from '@/types'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { isDev } from '@/lib'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('useNimiqNetwork')

const { setToast, clearToast } = useToast()

export const useNimiqNetwork = defineStore('nimiq-network', () => {
  const client = ref<Nimiq.Client>()
  const consensus = ref<Nimiq.Client.ConsensusState>('connecting')
  const head = ref<Nimiq.Block>()
  const height = computed(() => head.value?.height || -1)
  const peerCount = ref(0)
  const networkName = ref('')

  async function init() {
    isDev
      ? Nimiq.GenesisConfig.test()
      : Nimiq.GenesisConfig.main()

    networkName.value = Nimiq.GenesisConfig.NETWORK_NAME

    await Nimiq.WasmHelper.doImport()
    client.value = Nimiq.Client.Configuration.builder().instantiateClient()

    head.value = await client.value.getHeadBlock()

    client.value.addConsensusChangedListener((newConsensus) => {
      logger.log('Consensus:', newConsensus)
      if (newConsensus === 'established') {
        clearToast()
      }
      // If consensus was established before, but now is not, show error toast
      else if (consensus.value === 'established') {
        setToast({
          message: `${i18n.t('Network consensus lost.')} ${translateConsensus(newConsensus)}`,
          type: 'spinner',
          keepOpen: true,
        })
      }

      consensus.value = newConsensus
    })
    client.value.addHeadChangedListener(async blockHash => head.value = await client.value?.getBlock(blockHash))

    try {
      await until(consensus).toBe('established', { timeout: 30 * 1e3, throwOnTimeout: true })
    }
    catch {
      setToast({
        message: `${i18n.t('Trying to establish network consensus:')} ${translateConsensus(consensus.value)}`,
        type: 'spinner',
        keepOpen: true,
      })
    }

    // @ts-expect-error Private property access
    ;(await client.value._consensus as Nimiq.BaseMiniConsensus).network.on('peers-changed', async () => {
      const stats = await client.value?.network.getStatistics()
      peerCount.value = stats?.totalPeerCount || 0
      logger.log('Peer count changed', peerCount.value)
    })
  }

  async function claimCashlink(cashlink: string, address: Nimiq.Address) {
    if (!cashlink)
      throw new Error(i18n.t('No Cashlink found'))

    cashlink = cashlink.split('cashlink/#')[1].replace(/~/g, '').replace(/=*$/, match => Array.from({ length: match.length }).fill('.').join(''))
    const buf = Nimiq.BufferUtils.fromBase64Url(cashlink)
    const keyPair = Nimiq.KeyPair.derive(Nimiq.PrivateKey.unserialize(buf))
    const wallet = new Nimiq.Wallet(keyPair)
    const { balance } = await client.value!.getAccount(wallet.address)
    const amount = Math.min(buf.readUint64(), balance)
    if (!address)
      throw new Error(i18n.t('Address missing'))
    if (amount <= 0)
      throw new Error(i18n.t('Cashlink has no balance'))

    const tx = wallet.createTransaction(
      address,
      amount,
      0,
      height.value,
    )

    logger.log('Claiming Cashlink', tx.toPlain())
    await client.value!.sendTransaction(tx)
  }

  async function getAccount(address: Nimiq.Address | undefined): AsyncResult<Nimiq.Account, string> {
    if (!address)
      return { data: undefined, error: i18n.t('Address missing') }
    const account = await client.value?.getAccount(address)
    if (!account)
      return { data: undefined, error: i18n.t('No account found') }
    return { data: account, error: undefined }
  }

  async function getAccounts(addressArray: Nimiq.Address[]): AsyncResult<Nimiq.Account[], string> {
    if (addressArray.length === 0)
      return { data: undefined, error: i18n.t('Addresses missing') }
    const accounts = await client.value?.getAccounts(addressArray)
    if (!accounts || accounts.length === 0)
      return { data: undefined, error: i18n.t('No accounts found') }
    return { data: accounts, error: undefined }
  }

  async function getAccountTransactions(address: Nimiq.Address | undefined, limit = 30) {
    if (!address)
      return { data: [], error: i18n.t('Address missing') }
    const transactions = await client.value?.getTransactionsByAddress(address, 0, undefined, limit)
    if (!transactions)
      return { data: [], error: i18n.t('No transactions found') }
    return { data: transactions, error: undefined }
  }

  function translateConsensus(consensusState: Nimiq.Client.ConsensusState) {
    // Define translations as record such that ts warns us if a translation for a consensus state is missing
    const consensusStateTranslations: Record<Nimiq.Client.ConsensusState, string> = {
      established: i18n.t('Consensus established.'),
      syncing: i18n.t('Syncing with network.'),
      connecting: i18n.t('Connecting to network.'),
    }
    return Object.keys(consensusStateTranslations).includes(consensusState)
      ? consensusStateTranslations[consensusState]
      : consensusStateTranslations.syncing
  }

  /**
   * Get all transactions from HTLCs and their consecutive extensions
   * @param htlcAddress
   * @returns Txs from HTLCs and extensions
   */
  async function getAllTransactionsFromHtlcs(htlcAddress: Nimiq.Address, txs: Nimiq.ClientTransactionDetails[] = []): Promise<Nimiq.ClientTransactionDetails[]> {
    try {
      const _txs = (await client.value?.getTransactionsByAddress(htlcAddress) || []).filter(tx => !tx.recipient.equals(htlcAddress))
      txs.push(..._txs)
      await Promise.all(_txs.filter(tx => tx.recipientType === Nimiq.Account.Type.HTLC).map(tx => getAllTransactionsFromHtlcs(tx.recipient, txs)))
      return txs
    }
    catch (error) {
      logger.error('Error getting transactions from HTLCs', error)
      return []
    }
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
    getAccounts,
    getAccountTransactions,
    getAllTransactionsFromHtlcs,
    networkName,
  }
})
