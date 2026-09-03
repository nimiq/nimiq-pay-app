import type { Address, Client, ConsensusState, PlainAccount, PlainBlock, PlainTransactionDetails } from '@nimiq/core'
import type { AsyncResult } from '@/types'
import { until, useTimeoutFn, useTimestamp } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { isTestnet } from '@/lib'
import { reportCriticalError, trackConsensusEstablished } from '@/lib/analytics'
import { promiseWithTimeout, translateConsensus } from '@/lib/utils'
import { useLocks } from '@/stores/locks'

const logger = useLogger('useNimiqNetwork')

const timestamp = useTimestamp({ interval: 1e3 })
const { setToast, clearToast } = useToast()
const NIMIQ_SYNC_MODE = 'pico'

export const CashlinkExtraData = {
  FUNDING: new Uint8Array([0, 130, 128, 146, 135]), // 'CASH'.split('').map(c => c.charCodeAt(0) + 63)
  CLAIMING: new Uint8Array([0, 139, 136, 141, 138]), // 'LINK'.split('').map(c => c.charCodeAt(0) + 63)
}

export const CashlinkExtraDataHex = {
  FUNDING: CashlinkExtraData.FUNDING.reduce((hex, value) => hex + value.toString(16).padStart(2, '0'), ''),
  CLAIMING: CashlinkExtraData.CLAIMING.reduce((hex, value) => hex + value.toString(16).padStart(2, '0'), ''),
}

export const STAKING_CONTRACT_ADDRESS = 'NQ77 0000 0000 0000 0000 0000 0000 0000 0001'

export const NO_ACCOUNT_ERROR = 'No account found'

export const useNimiqNetwork = defineStore('nimiq-network', () => {
  const { isNetworkReconnecting, isAppStarting } = storeToRefs(useLocks())
  const client = ref<Client>()
  const consensus = ref<ConsensusState>('connecting')
  const head = ref<PlainBlock>()
  const headTimestamp = computed(() => consensus.value === 'established' && head.value ? head.value.timestamp : timestamp.value)
  const height = computed<number>(() => head.value?.height || -1)
  const lastMacroBlockHeight = ref(0)
  const peerCount = ref(0)
  const networkName = ref('')
  const networkId = ref(0)

  function buildClientConfig() {
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
    config.syncMode(NIMIQ_SYNC_MODE)
    return config.build()
  }

  async function init(options: { launchNimiqClient?: boolean } = { launchNimiqClient: true }) {
    networkName.value = isTestnet ? 'testalbatross' : 'MainAlbatross'

    try {
      await Nimiq.default()
    }
    catch (error) {
      // WASM instantiation can fail on some WebViews (e.g. a non-callable `crypto.getRandomValues`
      // import). Never let that become an uncaught rejection or wedge boot — log and bail so the app
      // still unlocks and renders; sync simply stays offline until the next launch.
      // iOS Lockdown Mode is gated out in main.ts before init() runs, so this is a genuine failure.
      logger.error('Nimiq WASM init failed; running without the PoS client', error)
      reportCriticalError(error, { context: 'nimiq-wasm-init', network: networkName.value })
      return
    }

    if (!options.launchNimiqClient)
      return

    // config.logLevel('debug')
    const clientConfig = buildClientConfig()
    logger.log('Creating Nimiq client with config', clientConfig)
    const consensusStartedAt = Date.now()
    let consensusTracked = false
    try {
      client.value = await promiseWithTimeout(Nimiq.Client.create(clientConfig), 30 * 1e3)
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
        if (!consensusTracked) {
          consensusTracked = true
          const durationMs = Date.now() - consensusStartedAt
          logger.log(`Consensus established in ${durationMs}ms`)
          trackConsensusEstablished({ duration_ms: durationMs, network: networkName.value, sync_mode: NIMIQ_SYNC_MODE })
        }
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

    client.value.addPeerChangedListener(async (_peerId, _reason, newPeerCount) => {
      peerCount.value = newPeerCount
      logger.log('Peer count changed', peerCount.value)
    })
  }

  let reconnectPromise: Promise<void> | undefined

  function reconnect() {
    if (reconnectPromise) {
      logger.log('Already reconnecting')
      return reconnectPromise
    }
    reconnectPromise = (async () => {
      isNetworkReconnecting.value = true
      try {
        logger.log('Reconnecting to network')
        await client.value?.disconnectNetwork()

        logger.log('Disconnecting from network, waiting for peer count to be 0', { peerCount: peerCount.value, consensus: consensus.value, height: height.value })
        await until(peerCount).toBe(0, { timeout: 60 * 1e3 })
        logger.log('Disconnected from network, connecting again...')
        await client.value?.connectNetwork()

        await until(consensus).toBe('established')
        logger.log('Connected to network')
      }
      finally {
        isNetworkReconnecting.value = false
        reconnectPromise = undefined
      }
    })()
    return reconnectPromise
  }

  async function disconnectHistoryClient(historyClient: Client, errorMessage: string) {
    try {
      await promiseWithTimeout(historyClient.disconnectNetwork(), 5 * 1e3)
    }
    catch (error) {
      logger.error(errorMessage, error)
    }
  }

  async function createHistoryClient() {
    // A separate client is the only safe retry when the original WASM history promise never settles.
    const creation = Nimiq.Client.create(buildClientConfig())
    let historyClient: Client
    try {
      historyClient = await promiseWithTimeout(creation, 30 * 1e3)
    }
    catch (error) {
      // Client.create cannot be cancelled, so dispose a client that appears after our timeout.
      void creation.then(client => disconnectHistoryClient(client, 'Failed to disconnect late history client'))
        .catch(disconnectError => logger.error('Failed to disconnect late history client', disconnectError))
      throw error
    }
    try {
      await promiseWithTimeout(historyClient.waitForConsensusEstablished(), 30 * 1e3)
      return historyClient
    }
    catch (error) {
      await disconnectHistoryClient(historyClient, 'Failed to disconnect unusable history client')
      throw error
    }
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
    tx.sign(keyPair, undefined)

    if (tx.networkId === networkId.value)
      logger.log('Claiming Cashlink', tx.toPlain())
    await client.value!.sendTransaction(tx)
  }

  async function getAccount(address: Address | undefined): AsyncResult<PlainAccount, string> {
    if (!address)
      return { data: undefined, error: i18n.t('Address missing') }
    try {
      const account = await client.value?.getAccount(address)
      if (!account)
        return { data: undefined, error: NO_ACCOUNT_ERROR }
      return { data: account, error: undefined }
    }
    catch (error) {
      logger.error('Error getting account', error)
      return { data: undefined, error: i18n.t('Error getting account') }
    }
  }

  async function getAccounts(addressArray: Address[]): AsyncResult<PlainAccount[], string> {
    if (addressArray.length === 0)
      return { data: undefined, error: i18n.t('Addresses missing') }
    try {
      const accounts = await client.value?.getAccounts(addressArray)
      if (!accounts || accounts.length === 0)
        return { data: undefined, error: i18n.t('No accounts found') }
      return { data: accounts, error: undefined }
    }
    catch (error) {
      logger.error('Error getting accounts', error)
      return { data: undefined, error: i18n.t('Error getting accounts') }
    }
  }

  async function getAccountTransactions(address: Address | undefined, limit?: number) {
    if (!address)
      return { data: [], error: i18n.t('Address missing') }
    try {
      const transactions = await client.value?.getTransactionsByAddress(address, 0, undefined, undefined, limit)
      if (!transactions)
        return { data: [], error: i18n.t('No transactions found') }
      return { data: transactions, error: undefined }
    }
    catch (error) {
      logger.error('Error getting account transactions', error)
      return { data: [], error: i18n.t('Error getting account transactions') }
    }
  }

  async function getBalance(address: Address | string | Uint8Array) {
    if (!address)
      return { data: 0, error: 'Address missing' } // No user facing
    try {
      const account = await client.value?.getAccount(address)
      if (!account)
        return { data: 0, error: NO_ACCOUNT_ERROR } // No user facing
      return { data: account.balance, error: undefined }
    }
    catch (error) {
      logger.error('Error getting balance', error)
      return { data: 0, error: 'Error getting balance' } // No user facing
    }
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
    createHistoryClient,
  }
})
