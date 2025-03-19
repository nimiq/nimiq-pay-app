import type { AsyncResult } from '@/types'
import type { Address, Client, ConsensusState, PlainAccount, PlainBlock, PlainTransactionDetails } from '@nimiq/core/web'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { isDev } from '@/lib'
import { promiseWithTimeout } from '@/lib/utils'
import { useLocks } from '@/stores/locks'
import { until, useTimeoutFn } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const logger = useLogger('useNimiqNetwork')

const { setToast, clearToast } = useToast()

export const CashlinkExtraData = {
  FUNDING: new Uint8Array([0, 130, 128, 146, 135]), // 'CASH'.split('').map(c => c.charCodeAt(0) + 63)
  CLAIMING: new Uint8Array([0, 139, 136, 141, 138]), // 'LINK'.split('').map(c => c.charCodeAt(0) + 63)
}

export const CashlinkExtraDataHex = {
  FUNDING: CashlinkExtraData.FUNDING.reduce((hex, value) => hex + value.toString(16).padStart(2, '0'), ''),
  CLAIMING: CashlinkExtraData.CLAIMING.reduce((hex, value) => hex + value.toString(16).padStart(2, '0'), ''),
}

export const useNimiqNetwork = defineStore('nimiq-network', () => {
  const { isNetworkReconnecting, isAppStarting } = storeToRefs(useLocks())
  const client = ref<Client>()
  const consensus = ref<ConsensusState>('connecting')
  const head = ref<PlainBlock>()
  const headTimestamp = computed(() => head.value?.timestamp || -1)
  const height = computed<number>(() => head.value?.height || -1)
  const lastMacroBlockHeight = ref(0)
  const peerCount = ref(0)
  const networkName = ref('')
  const networkId = ref(0)

  async function init() {
    networkName.value = isDev ? 'testalbatross' : 'MainAlbatross'

    await Nimiq.default()

    const config = new Nimiq.ClientConfiguration()
    config.network(networkName.value)
    if (networkName.value === 'testalbatross') {
      config.seedNodes([
        '/dns4/seed1.pos.nimiq-testnet.com/tcp/8443/wss',
        '/dns4/seed2.pos.nimiq-testnet.com/tcp/8443/wss',
        '/dns4/seed3.pos.nimiq-testnet.com/tcp/8443/wss',
        '/dns4/seed4.pos.nimiq-testnet.com/tcp/8443/wss',
      ])
    }
    config.syncMode('pico')

    // config.logLevel('debug')
    logger.log('Creating Nimiq client with config', config.build())
    try {
      client.value = await promiseWithTimeout(Nimiq.Client.create(config.build()), 30 * 1e3)
      logger.log('Nimiq client created')
    }
    catch (error) {
      logger.error('Error creating Nimiq client', error)
      return await init()
    }
    head.value = await client.value.getHeadBlock()
    networkId.value = await useNimiqNetwork().client!.getNetworkId()

    const { isPending: isPendingReconnectNetwork, start: startReconnectNetwork, stop: stopReconnectNetwork } = useTimeoutFn(() => {
      useNimiqNetwork().reconnect()
    }, 2 * 60 * 1e3, { immediate: false }) // 2 minutes

    client.value.addConsensusChangedListener(async (newConsensus) => {
      logger.log('Consensus:', newConsensus)
      if (newConsensus === 'established') {
        isAppStarting.value = false
        clearToast()
        if (isPendingReconnectNetwork.value) {
          logger.log('Consensus established, stopping reconnect')
          stopReconnectNetwork()
        }
      }
      // If consensus was established before, but now is not, show error toast
      else if (consensus.value === 'established') {
        setToast({
          message: `${i18n.t('Network consensus lost.')} ${translateConsensus(newConsensus)}`,
          type: 'spinner',
          keepOpen: true,
        })
        if (!isPendingReconnectNetwork.value) {
          logger.log('Starting reconnect')
          startReconnectNetwork()
        }
      }

      consensus.value = newConsensus
    })
    client.value.addHeadChangedListener(async (blockHash) => {
      head.value = await client.value?.getBlock(blockHash)
      if (head.value?.type === 'macro')
        lastMacroBlockHeight.value = head.value.height
    })

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

    client.value.addPeerChangedListener(async (_peerId, _reason, newPeerCount) => {
      peerCount.value = newPeerCount
      logger.log('Peer count changed', peerCount.value)
    })
  }

  async function reconnect() {
    if (isNetworkReconnecting.value) {
      logger.log('Already reconnecting')
      return
    }
    isNetworkReconnecting.value = true
    logger.log('Reconnecting to network')
    await client.value?.disconnectNetwork()

    logger.log('Disconnecting from network, waiting for peer count to be 0', { peerCount: peerCount.value, consensus: consensus.value, height: height.value })
    await until(peerCount).toBe(0, { timeout: 60 * 1e3 })
    logger.log('Disconnected from network, connecting again...')
    await client.value?.connectNetwork()

    await until(consensus).toBe('established')
    logger.log('Connected to network')
    isNetworkReconnecting.value = false
  }

  async function claimCashlink(cashlink: string, address: Address) {
    if (!cashlink)
      throw new Error(i18n.t('No Cashlink found'))

    cashlink = cashlink.split('cashlink/#')[1].replace(/~/g, '').replace(/=*$/, match => Array.from({ length: match.length }).fill('.').join(''))
    const buf = Nimiq.BufferUtils.fromBase64Url(cashlink)
    const keyPair = Nimiq.KeyPair.derive(Nimiq.PrivateKey.deserialize(buf.read(32)))
    const { balance } = await client.value!.getAccount(keyPair.toAddress())
    const amount = Math.min(buf.readUint64(), balance)
    if (!address)
      throw new Error(i18n.t('Address missing'))
    if (amount <= 0)
      throw new Error(i18n.t('Cashlink has no balance'))

    const tx = Nimiq.TransactionBuilder.newBasicWithData(
      keyPair.toAddress(), // sender address
      address, // recipient address
      CashlinkExtraData.CLAIMING, // extraData
      BigInt(balance),
      0n, // fee
      height.value,
      await client.value!.getNetworkId(),
    )
    tx.sign(keyPair)

    if (tx.networkId === networkId.value)
      logger.log('Claiming Cashlink', tx.toPlain())
    await client.value!.sendTransaction(tx)
  }

  async function getAccount(address: Address | undefined): AsyncResult<PlainAccount, string> {
    if (!address)
      return { data: undefined, error: i18n.t('Address missing') }
    const account = await client.value?.getAccount(address)
    if (!account)
      return { data: undefined, error: i18n.t('No account found') }
    return { data: account, error: undefined }
  }

  async function getAccounts(addressArray: Address[]): AsyncResult<PlainAccount[], string> {
    if (addressArray.length === 0)
      return { data: undefined, error: i18n.t('Addresses missing') }
    const accounts = await client.value?.getAccounts(addressArray)
    if (!accounts || accounts.length === 0)
      return { data: undefined, error: i18n.t('No accounts found') }
    return { data: accounts, error: undefined }
  }

  async function getAccountTransactions(address: Address | undefined, limit?: number) {
    if (!address)
      return { data: [], error: i18n.t('Address missing') }
    const transactions = await client.value?.getTransactionsByAddress(address, 0, undefined, undefined, limit)
    if (!transactions)
      return { data: [], error: i18n.t('No transactions found') }
    return { data: transactions, error: undefined }
  }

  async function getBalance(address: Address | string | Uint8Array) {
    if (!address)
      return { data: 0, error: 'Address missing' } // No user facing
    const account = await client.value?.getAccount(address)
    if (!account)
      return { data: 0, error: 'No account found' } // No user facing
    return { data: account.balance, error: undefined }
  }

  function translateConsensus(consensusState: ConsensusState) {
    // Define translations as record such that ts warns us if a translation for a consensus state is missing
    const consensusStateTranslations: Record<ConsensusState, string> = {
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
  async function getAllOutgoingTransactionsFromHtlcs(htlcAddress: Address, txs: PlainTransactionDetails[] = []): Promise<PlainTransactionDetails[]> {
    try {
      const plainHtlcAddress = htlcAddress.toUserFriendlyAddress()
      const _txs = (await client.value?.getTransactionsByAddress(htlcAddress) || []).filter(
        tx => tx.recipient !== plainHtlcAddress,
      )
      txs.push(..._txs)
      await Promise.all(_txs
        .filter(tx => tx.recipientType === 'htlc')
        .map(tx => getAllOutgoingTransactionsFromHtlcs(Nimiq.Address.fromString(tx.recipient), txs)))
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
    headTimestamp,
    height,
    lastMacroBlockHeight,
    peerCount,
    init,
    claimCashlink,
    getAccount,
    getAccounts,
    getAccountTransactions,
    getAllOutgoingTransactionsFromHtlcs,
    getBalance,
    networkName,
    networkId,
    reconnect,
  }
})
