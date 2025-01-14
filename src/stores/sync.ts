import type { SwapHtlc } from '@/types/swapHtlcs'
import type { ExternalTransaction, Transaction, TransactionSentByUser, UserReceiptTransaction } from '@/types/transactions'
import type { TransactionState } from '@nimiq/core'
import type { PlainAccount, PlainTransactionDetails } from '@nimiq/core/web'
import type { ContractWithEstimate } from '@nimiq/fastspot-api-v1'
import type { Ref } from 'vue'
import { useCplApi } from '@/composables/useApi'
import { useFastspotApiV1 } from '@/composables/useFastspotv1'
import { useLogger } from '@/composables/useLogger'
import { usePrice } from '@/composables/usePrice'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { type RemoteSigner, SQLQuery } from '@/lib/sql-queries'
import { toAccountType } from '@/lib/tx'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { CashlinkExtraDataHex, useNimiqNetwork } from '@/stores/nimiq-network'
import { usePoints } from '@/stores/points'
import { parseAddress, useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import { PaymentMethod, PointsHashPrefix, Rail, Transfer } from '@/types/transactions'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { computedAsync, until, useTimeoutFn } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

const logger = useLogger('useSync')
const { isProcessingRemote, isSendingTx, isSyncingWallets, isUpdatingTransactions, headChangePendingDrainLock, headChangeUpdatesLock, htlcCheckLock } = storeToRefs(useLocks())
const { setToast } = useToast()

const MAX_BLOCK_HEIGHT_MISMATCH = Nimiq.Policy.BLOCKS_PER_BATCH
export const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = 120 * Nimiq.Policy.BLOCKS_PER_BATCH

export const useSync = defineStore('sync', () => {
  const { getAccountTransactions, getAllOutgoingTransactionsFromHtlcs, getBalance } = useNimiqNetwork()
  const { query } = useConn()
  const { client, height: localHeight, lastMacroBlockHeight, consensus, headTimestamp, networkId } = storeToRefs(useNimiqNetwork())
  const { localAddress, localBalance, localWallet, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { remoteHeight, remoteBalance, remoteAddress, hasHtlcExpired, end, start, isHtlcActive, isHtlcPending, isRemoteOk, remotePublicKey } = storeToRefs(useRemoteSigner())
  const { getAllRemoteSigners, addRemoteSigner, blockHeightToTimestamp } = useRemoteSigner()
  const { sendTx, addUnknownPaymentToMerchantTransaction, addWithdrawalTransaction, updateTransactionCashbackClaimed, updateTransactionStatus } = useTransactions()

  // Whether the remote wallet is synced with the local wallet or not.
  // We allow a difference of MAX_BLOCK_HEIGHT_MISMATCH blocks between the two wallets.
  const nodesAreSynced = computedAsync(() => remoteHeight.value > (localHeight.value - MAX_BLOCK_HEIGHT_MISMATCH) && remoteHeight.value < (localHeight.value + MAX_BLOCK_HEIGHT_MISMATCH), false)

  // Checks if the sum of current block and CONSTANT is greater than the middle block of the HTLC validity.
  const htlcCanBeExtended = computed(() => (end.value - (end.value - start.value) / 2) < (headTimestamp.value + MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA))

  // Since macro blocks take a while, only show if < 50 blocks left
  const blocksUntilNextMacroBlock = computed(() => {
    const blocksLeft = lastMacroBlockHeight.value > 0 ? lastMacroBlockHeight.value + Nimiq.Policy.BLOCKS_PER_BATCH - localHeight.value : 0
    return blocksLeft < 50 ? blocksLeft : 0
  })

  const pendingTransactions: Ref<(PlainTransactionDetails)[]> = ref([])
  const pendingRemoteDrainTxs: Ref<TransactionSentByUser[]> = ref([])
  const pendingHtlcCreationTransactions: Ref<PlainTransactionDetails[]> = ref([])
  const isTransactionPending = computed(() => pendingTransactions.value.length > 0 || pendingRemoteDrainTxs.value.length > 0 || pendingHtlcCreationTransactions.value.length > 0)

  /**
   * If the local wallet gets some funds, move them to the remote wallet immediately.
   *
   * 1. Check if the local wallet has funds and if the remote Nimiq's node and local Nimiq's node are synced.
   * 2. If there is already an active HTLC between the remote and the local wallet:
   *    2.1 Liquidate the HTLC by moving the funds from the remote wallet to the local wallet.
   *    2.2 Once the transaction is included, `handleFunds` will be invoked again and step 3 will be executed.
   * 3. Else move the funds from the local wallet to the remote wallet.
   */
  async function handleFunds() {
    if (localBalance.value === 0)
      return
    if (isTransactionPending.value || isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying handleFunds', pendingRemoteDrainTxs, pendingTransactions, pendingHtlcCreationTransactions)
      return
    }

    const remoteBalance = (await getBalance(remoteAddress.value!)).data || 0

    logger.log(`Local balance: ${localBalance.value / 1e5} NIM. Remote balance: ${remoteBalance / 1e5} NIM. ${remoteBalance === 0 ? 'Creating new HTLC' : 'Liquidating HTLC'}`)
    logger.log({ isHtlcActive: isHtlcActive.value, isRemoteOk: isRemoteOk.value, isHtlcPending: isHtlcPending.value })

    if (remoteBalance === 0 && !isHtlcPending.value) {
      isProcessingRemote.value = true
      const { error } = await sendTx({ transfer: Transfer.LocalToRemote })
      if (error) {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while creating deposit'), type: 'error', duration: 5000 })
        logger.error('Error while creating HTLC', error)
      }
      return
    }

    if (!nodesAreSynced.value)
      return

    if (isHtlcActive.value && isRemoteOk.value) {
      isProcessingRemote.value = true
      const { error } = await sendTx({ transfer: Transfer.RemoteToLocal })
      if (error) {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while topping up deposit'), type: 'error', duration: 5000 })
        logger.error('Error while liquidating HTLC', error)
      }
      return
    }

    logger.log(`Delaying deposit. isHtlcActive: ${isHtlcActive.value}, isRemoteOk: ${isRemoteOk.value}, isHtlcPending: ${isHtlcPending.value}`)
  }

  async function extendValidity() {
    if (remoteBalance.value === 0 || !isHtlcActive.value)
      return
    logger.log(`Can the HTLC be extended? ${htlcCanBeExtended.value}`)
    if (htlcCanBeExtended.value) {
      if (isSendingTx.value) {
        logger.log('There is a pending transaction. Delaying extendValidity')
        return
      }
      isProcessingRemote.value = true
      const { error } = await sendTx({ transfer: Transfer.ExtendRemote })
      if (error) {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while extending deposit'), type: 'error', duration: 5000 })
        logger.error('Error while extending HTLC validity', error)
        // Claim the funds after timeout from the remote signer
        // TODO: This is a temp fix for Nimiq 1.0 migration
        const { error: claimError } = await sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: remoteBalance.value, sender: remoteAddress.value! })
        if (claimError) {
          logger.error('Error while claiming funds from Remote after extending error', claimError)
        }
      }
    }
  }

  /**
   * If the server misses the deadline to finalize the HTLC, the local wallet has to recover the funds
   * and create a new HTLC.
   *
   * Note: This function is just a safety net. The server should never miss the deadline.
   */
  async function checkRemoteValidity() {
    if (remoteBalance.value === 0)
      return
    logger.log(`Did the HTLC expire? ${hasHtlcExpired.value}`)
    if (hasHtlcExpired.value) {
      if (isSendingTx.value) {
        logger.log('There is a pending transaction. Delaying extendValidity')
        return
      }
      isProcessingRemote.value = true
      const { error } = await sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: remoteBalance.value, sender: remoteAddress.value! })
      if (error) {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while recovering deposit'), type: 'error', duration: 5000 })
        logger.error('Error while recovering funds from Remote', error)
      }
    }
  }

  /**
   * Updates the local and the remote wallet balances.
   */
  async function updateBalances() {
    if (localHeight.value % 10 === 0)
      usePoints().updatePointsBalance()

    if (isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying updateBalances')
      return
    }

    if (localAddress.value)
      localBalance.value = (await getBalance(localAddress.value)).data || 0
    else
      logger.log('Local address not found')
    if (remoteAddress.value) {
      const oldBalance = remoteBalance.value
      const { data: newBalance, error } = await getBalance(remoteAddress.value!)
      if (error) {
        logger.error('Error while getting remote balance', error)
        return
      }
      remoteBalance.value = newBalance
      if (oldBalance !== remoteBalance.value)
        logger.log(`Remote balance for ${remoteAddress.value.toUserFriendlyAddress()} is ${remoteBalance.value}, old was: ${oldBalance}`)

      // TODO: move this to a separate function
      // Sometimes the extended HTLC was not saved in the DB, so we assume that an address with 0 balance can be an HTLC extension
      if (remoteBalance.value === 0) {
        const [txs, remoteSigners] = await Promise.all([getAllOutgoingTransactionsFromHtlcs(remoteAddress.value), getAllRemoteSigners()])

        txs.forEach(async (tx) => {
          // HTLC extension, set that as the active HTLC
          if ('hashRoot' in tx.data && tx.data.hashRoot === '0000000000000000000000000000000000000000000000000000000000000000') {
            const remoteSigner = remoteSigners.find(remoteSigner => remoteSigner.address.toUserFriendlyAddress() === tx.recipient)
            if (remoteSigner)
              return

            logger.log('Found an HTLC extension that is not in the remote signer table', tx)
            const account = await client.value!.getAccount(tx.recipient) as PlainAccount
            await useRemoteSigner().updateRemoteSigner({
              active: true,
              balance: account.balance,
              address: Nimiq.Address.fromString(tx.recipient),
              publicKey: remotePublicKey.value!,
              start: tx.timestamp || blockHeightToTimestamp(tx.validityStartHeight),
              end: 'timeout' in account ? account.timeout : Number.MAX_VALUE,
              // proofSize: 'raw' in tx.proof ? Math.floor(tx.proof. raw.length / 2) : 0,
              // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
              proofSize: useRemoteSigner().remoteProofSize,
            })
            // Updating balance because the active remote signer has changed
            updateBalances()
          }
        })
      }
    }
    else {
      if (localHeight.value % Nimiq.Policy.BLOCKS_PER_BATCH === 0)
        logger.warn('Remote address not found')
    }
  }

  /**
   * Syncs the local and the remote wallet immediately and then every time a new block is minted.
   */
  async function syncWallets() {
    if (!hasLocalWallet.value)
      return

    isSyncingWallets.value = true
    await until(client).toBeTruthy()
    await client.value?.waitForConsensusEstablished()

    await useRemoteSigner().init()

    await updateBalances()
    await verifyRemoteSignersDb()

    logger.log(`🧬 Starting to sync wallets. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
    await Promise.all([handleFunds(), checkRemoteValidity(), extendValidity(), updateTransactionsInDb()])
    await checkHtlcState()
    updateTransactionHistory()

    client.value?.addHeadChangedListener(async () => {
      if (headChangePendingDrainLock.value)
        return
      headChangePendingDrainLock.value = true

      if (pendingRemoteDrainTxs.value.length > 0) {
        try {
          for (const tx of pendingRemoteDrainTxs.value) {
            await updateSingleTransaction(tx.hash)
          }
        }
        catch (error) {
          logger.error('Error checking pending transactions', error)
        }
      }
      headChangePendingDrainLock.value = false
    })

    client.value?.addHeadChangedListener(async () => {
      if (!isTransactionPending.value && localHeight.value % 10 * Nimiq.Policy.BLOCKS_PER_BATCH === 0)
        await verifyRemoteSignersDb()
      else if (remoteBalance.value === 0 && localHeight.value % 10 === 0)
        await verifyRemoteSignersDb()

      if (headChangeUpdatesLock.value)
        return
      headChangeUpdatesLock.value = true

      if (pendingTransactions.value.length > 0) {
        try {
          for (const tx of pendingTransactions.value) {
            await updateSingleTransaction(tx.transactionHash)
          }
        }
        catch (error) {
          logger.error('Error checking pending transactions', error)
        }
      }

      try {
        // We need to update balances here because the remote balance is updated manually and needed before the sync
        await updateBalances()
        await handleFunds()

        if (localHeight.value % Nimiq.Policy.BLOCKS_PER_BATCH === 0)
          await Promise.all([checkRemoteValidity(), extendValidity()])

        if (localHeight.value % 10 === 0) {
          await Promise.all([
            updateTransactionsInDb(),
            // TODO: check if this need to be activate again
            // updateActiveWallet(),
          ])
        }
      }
      catch (error) {
        logger.error('Error in headChangeUpdates', error)
      }
      headChangeUpdatesLock.value = false
    })

    client.value?.addTransactionListener(async (tx) => {
      logger.log(`📬 New ${tx.state} transaction received`, tx)
      // Only handle pending transactions, included ones are handled by the block listener

      // In the case that we have a pending tx, for example a tx coming from the remote, we need to wait until that
      // tx is included before sending the local balance to the remote again
      // pendingTransactions.value.push(tx)

      // Ignore transactions sent by the local wallet or the remote signer
      if (tx.sender === localAddress.value.toUserFriendlyAddress() || (remoteAddress.value && tx.sender === remoteAddress.value.toUserFriendlyAddress()))
        return

      // Check if tx is already in DB
      const dbTxs: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
      const hash = tx.transactionHash
      if (dbTxs.some(dbTx => dbTx.hash === hash))
        return

      logger.log(`📬 Saving ${tx.state} transaction with ${usePrice(tx.value).crypto.formatted}`)

      // Only add non cashlink address to the withdrawal list
      if (tx.data.raw !== CashlinkExtraDataHex.CLAIMING)
        useApp().addNewTopUpAddress(tx.sender)

      useTransactions().addReceiptTransaction({
        transfer: Transfer.UserReceipt,
        amount: tx.value,
        sender: tx.sender,
        senderType: toAccountType(tx.senderType),
        recipient: tx.recipient,
        recipientType: toAccountType(tx.recipientType),
        hash,
        status: tx.state,
        timestamp: tx.timestamp,
        title: 'Top-Up', // translated at display time
        message: Nimiq.BufferUtils.toUtf8(Nimiq.BufferUtils.fromHex(tx.data.raw)),
        fee: tx.fee,
        // proofSize: 'raw' in tx.proof ? Math.floor(tx.proof.raw.length / 2) : 0,
        // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
        proofSize: useRemoteSigner().remoteProofSize,
      })
    }, [localAddress.value])

    isSyncingWallets.value = false
  }

  async function checkHtlcState() {
    if (isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying checkHtlcState')
      return
    }

    await until(client).not.toBeUndefined()
    if (remoteBalance.value > 0 && start.value < headTimestamp.value && end.value > headTimestamp.value) {
      // HTLC can only be used after the tx creation state is confirmed
      try {
        const txs = await Promise.all(pendingHtlcCreationTransactions.value.map(tx => client.value!.getTransaction(tx.transactionHash)))
        logger.log('Checking pending HTLC transactions', txs)
        if (txs.every(tx => tx && tx.state === 'confirmed'))
          isHtlcActive.value = true
        else
          isHtlcActive.value = false
        // Remove txs that are confirmed
        pendingHtlcCreationTransactions.value = pendingHtlcCreationTransactions.value.filter(tx => txs.some(t => t && t.transactionHash === tx.transactionHash && t.state !== 'confirmed'))
      }
      catch (e) {
        logger.error('Error checking pending HTLC transactions', e)
        isHtlcActive.value = false
      }
    }
    else {
      isHtlcActive.value = false
    }
  }

  async function updateSingleTransaction(hash: string) {
    if (!hasLocalWallet.value)
      return

    await until(client).toBeTruthy()
    await client.value?.waitForConsensusEstablished()

    try {
      const tx = await client.value!.getTransaction(hash)
      if (tx.state !== 'pending'
        && (pendingTransactions.value.some(pendingTx => pendingTx.transactionHash === tx.transactionHash)
          || pendingRemoteDrainTxs.value.some(pendingTx => pendingTx.hash === tx.transactionHash)
        )) {
        logger.log(`Removing transaction ${tx.transactionHash} from pending transactions`)
        pendingTransactions.value = pendingTransactions.value.filter(pendingTx => pendingTx.transactionHash !== tx.transactionHash)
        pendingRemoteDrainTxs.value = pendingRemoteDrainTxs.value.filter(pendingTx => pendingTx.hash !== tx.transactionHash)
      }

      updateTransactionStatus({ hash: tx.transactionHash, status: tx.state, timestamp: tx.timestamp })
    }
    catch (error) {
      logger.error(`Error while getting transaction: ${hash}`, error)
    }
  }

  /**
   * Updates the transactions history getting transactions from the blockchain and adding them to the db if they are not already there.
   */
  async function updateTransactionHistory() {
    if (isUpdatingTransactions.value) {
      logger.log('📬 Transactions are already being updated')
      return
    }
    isUpdatingTransactions.value = true
    try {
    // No need to parse JSON fields, as those fields are not used here.
      const userReceipts: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
      const accountTxs = await getAccountTransactions(localAddress.value!)

      await Promise.all(accountTxs.data.map(async (tx) => {
      // TODO: Handle old remote signer setup transactions (recipientType === Nimiq.Account.Type.HTLC)

        if (tx.sender === localAddress.value.toUserFriendlyAddress() || (remoteAddress.value && tx.sender === remoteAddress.value.toUserFriendlyAddress()))
          return

        const hash = tx.transactionHash
        if (userReceipts.some(dbTx => dbTx.hash === hash))
          return

        logger.log(`📬 New ${tx.state} transaction received with ${usePrice(tx.value).crypto.formatted}`)
        useTransactions().addReceiptTransaction({
          transfer: Transfer.UserReceipt,
          amount: tx.value,
          sender: tx.sender,
          senderType: toAccountType(tx.senderType),
          recipient: tx.recipient,
          recipientType: toAccountType(tx.recipientType),
          hash,
          status: tx.state,
          timestamp: tx.timestamp,
          title: 'Top-Up', // translated at display time
          message: Nimiq.BufferUtils.toUtf8(Nimiq.BufferUtils.fromHex(tx.data.raw)),
          fee: tx.fee,
          // proofSize: 'raw' in tx.proof ? Math.floor(tx.proof.raw.length / 2) : 0,
          // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
          proofSize: useRemoteSigner().remoteProofSize,
        })
      }))

      async function handleSwapTxs(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
        let contract: ContractWithEstimate<SwapAsset>
        try {
          const fastspot = await useFastspotApiV1()
          contract = await fastspot.getContract(SwapAsset.NIM, tx.recipient)
        }
        catch (error: any) {
          logger.error('Error fetching contract info from Fastspot:', error.message)
          addUnknownPaymentToMerchantTransaction(tx)
          return
        }

        // Check swap type
        if (contract.from.asset !== SwapAsset.NIM) {
          logger.error(`Found a swap from another asset than NIM (${contract.from.asset}) - This type of swap cannot yet be handled`)
        // Fall through
        }
        else if (contract.to.asset === SwapAsset.BTC_LN) {
          logger.log(`📬 BTC_LN swap found with ${tx.value / 1e5} from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
          addUnknownPaymentToMerchantTransaction(tx, Transfer.UserPaymentToAtomicSwap, Rail.BitcoinLightning, '', {
            amount: (contract.to.amount - contract.to.fee) / 1e8,
            currency: 'BTC',
          }, {
          // TODO: Find if the swap was completed (set `secret`) or refunded (set `refunded`)
            imported: true,
          })
          return
        }
        else {
          logger.error(`Found a swap to another asset than BTC_LN (${contract.to.asset}) - This type of swap cannot yet be handled`)
        // Fall through
        }

        addUnknownPaymentToMerchantTransaction(tx)
      }

      function handleWithdrawalTxs(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
        logger.log(`📬 New withdrawal transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
        addWithdrawalTransaction({
          transfer: Transfer.UserPayment,
          amount: tx.value,
          sender: tx.sender,
          senderType: toAccountType(tx.senderType),
          recipient: tx.recipient,
          recipientType: toAccountType(tx.recipientType),
          hash: tx.transactionHash,
          status: tx.state,
          timestamp: tx.timestamp,
          title: 'Withdrawal', // translated at display time
          fee: tx.fee,
          // proofSize: 'raw' in tx.proof ? Math.floor(tx.proof.raw.length / 2) : 0,
          // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
          proofSize: useRemoteSigner().remoteProofSize,
        })
      }

      function handleUnknownTxs(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
        logger.log(`📬 New merchant transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
        addUnknownPaymentToMerchantTransaction(tx)
      }

      const allTransactions = await query<ExternalTransaction[]>(SQLQuery.SelectAllTransactions)
      const topUpAddresses = [...new Set(((await query<UserReceiptTransaction[]>(SQLQuery.GetAllUserReceipts))).map(tx => tx.sender))]

      function categorizeTransactions(txs: PlainTransactionDetails[]) {
        const htlcExtensionTxs: PlainTransactionDetails[] = []
        const htlcSwapTxs: PlainTransactionDetails[] = []
        const withdrawalTxs: PlainTransactionDetails[] = []
        const unknownTxs: PlainTransactionDetails[] = []
        for (const tx of txs) {
          if (tx.recipientType === 'htlc') {
          // Differentiate between HTLC extensions (hashRoot is zeroes) and swap HTLCs (hashRoot is non-zeroes)
            const data = tx.data
            if ('hashRoot' in data && data.hashRoot === '0000000000000000000000000000000000000000000000000000000000000000')
              htlcExtensionTxs.push(tx)
            else
              htlcSwapTxs.push(tx)
          }
          else if (topUpAddresses.includes(tx.recipient)) {
            withdrawalTxs.push(tx)
          }
          else { unknownTxs.push(tx) }
        }
        return {
          htlcExtensionTxs,
          htlcSwapTxs,
          withdrawalTxs,
          unknownTxs,
        }
      }

      // Make sure all the created HTLCs are in the remote signers db
      // This would prevent a missing HTLC when the user closes the app before the HTLC is stored in the db
      // TODO: Get also extended HTLCs
      const htlcTransactions = accountTxs.data.filter(tx => tx.recipientType === 'htlc')
      const remoteSigners = await getAllRemoteSigners()
      for (const tx of htlcTransactions) {
        const remoteSigner = remoteSigners.find(remoteSigner => remoteSigner.address.toUserFriendlyAddress() === tx.recipient)
        if (remoteSigner)
          continue

        logger.error('Remote signer not found in db', tx)
        const htlcData = tx.data
        addRemoteSigner({
          active: false,
          balance: (await getBalance(Nimiq.Address.fromString(tx.recipient))).data,
          address: Nimiq.Address.fromString(tx.recipient),
          publicKey: remotePublicKey.value!,
          start: tx.timestamp || blockHeightToTimestamp(tx.validityStartHeight),
          end: 'timeout' in htlcData ? htlcData.timeout : Number.MAX_VALUE,
          // proofSize: 'raw' in tx.proof ? Math.floor(tx.proof.raw.length / 2) : 0,
          // TODO: This is a temporary fix, proof size should always be the same but better to get it from the tx instead of hardcoding it
          proofSize: useRemoteSigner().remoteProofSize,
        })
      }

      // Check for transactions made from the remote signers
      if (remoteSigners && remoteSigners.length) {
        for (const remoteSigner of remoteSigners) {
          const accountTxs = await getAccountTransactions(remoteSigner.address)
          const txsToProcess = accountTxs.data
          // Only transactions sent from the remote signer to other addresses
            .filter(tx => tx.sender === remoteSigner.address.toUserFriendlyAddress() && tx.recipient !== localAddress.value.toUserFriendlyAddress())
          // Only transactions not already in the db
            .filter((tx) => {
              const hash = tx.transactionHash
              for (const dbTx of allTransactions) {
              // Make use of the timestamp ordering of allTransactions and bail when the db transactions are older than the tx we are looking for
                if ((dbTx.timestamp || Number.MAX_SAFE_INTEGER) < (tx.timestamp || Number.MAX_SAFE_INTEGER))
                  break
                // If the tx is already known, do not process it further
                if (dbTx.hash === hash)
                  return false
              }
              return true
            })

          const { htlcExtensionTxs, htlcSwapTxs, withdrawalTxs, unknownTxs } = categorizeTransactions(txsToProcess)

          await Promise.all(htlcExtensionTxs.map(async (tx) => {
            const txs = await getAllOutgoingTransactionsFromHtlcs(Nimiq.Address.fromString(tx.recipient))
            const categorized = categorizeTransactions(txs)
            htlcSwapTxs.concat(categorized.htlcSwapTxs)
            withdrawalTxs.concat(categorized.withdrawalTxs)
            unknownTxs.concat(categorized.unknownTxs)
          }))
          await Promise.all([
            htlcSwapTxs.map(tx => handleSwapTxs(tx, { remoteSigner })),
            withdrawalTxs.map(tx => handleWithdrawalTxs(tx, { remoteSigner })),
            unknownTxs.map(tx => handleUnknownTxs(tx, { remoteSigner })),
          ].flat())
        }
      }
    }
    catch (error) {
      logger.error('Error while updating transaction history', error)
    }
    isUpdatingTransactions.value = false
  }

  /**
   * Updates the transactions in the db if they have a different status or timestamp.
   */
  async function updateTransactionsInDb() {
    // No need to parse JSON fields, as those fields are not used here.
    const dbTxs: Transaction[] = await useConn().query(SQLQuery.SelectAllTransactions)

    await Promise.all(dbTxs.map(async (dbTx) => {
      // Checking for tx with cashback to claim
      // We need to check this if it's included or confirmed just in case the user closes the app
      // before the tx is included and opened again after it's confirmed
      if ((dbTx.status === 'included' || dbTx.status === 'confirmed') && (dbTx.transfer === Transfer.UserPaymentToMerchant || dbTx.transfer === Transfer.UserPaymentToAtomicSwap) && dbTx.paymentMethod === PaymentMethod.NIM) {
        // Only check if cashback not claimed and user has points account, if not continue with the rest
        if (!dbTx.isCashbackClaimed && useApp().pointsToken) {
          const { error, errorType } = await usePoints().claimCashback(dbTx)
          if (error) {
            logger.error(error)
            // TODO: get errors from enum
            if (errorType === 'CPL_PAYMENT_REQUEST_ALREADY_PROCESSED' || errorType === 'CPL_MERCHANT_NOT_FOUND')
              updateTransactionCashbackClaimed({ hash: dbTx.hash })
          }
          else {
            updateTransactionCashbackClaimed({ hash: dbTx.hash })
          }
        }
      }

      // If tx is confirmed, we can guarantee that the status and timestamp in the db are correct
      // so we don't need to check it and that prevents us from making an unnecessary request to the blockchain
      // that can get us rate limited
      // In the case of a swap, the tx timestamp is undefined, so we need to check the blockchain
      if (dbTx.status === 'confirmed' && dbTx.timestamp)
        return

      if (dbTx.hash.includes(PointsHashPrefix)) {
        if (!dbTx.paymentRef) {
          logger.error('Reference not found', dbTx)
          return
        }
        const { data, error } = await useCplApi().getOrderById({ id: dbTx.paymentRef })
        if (error) {
          logger.error(error)
          return
        }

        const txStatus = data?.status as TransactionState
        if (!txStatus) {
          logger.error('No status from CPL API')
          return
        }
        if (dbTx.status !== txStatus) {
          logger.log(`📬 Updating transaction ${dbTx.hash} ${txStatus}`)
          updateTransactionStatus({ hash: dbTx.hash, status: txStatus, timestamp: dbTx.timestamp })
        }
      }
      else {
        try {
          await until(client).toBeTruthy()
          const tx = await client.value!.getTransaction(dbTx.hash)

          // Check if status in db is different from status in blockchain or timestamp in db is different from timestamp in blockchain
          if ((dbTx.status !== tx.state) || (dbTx.timestamp !== tx.timestamp)) {
            logger.log(`📬 Updating transaction ${tx.transactionHash} ${tx.state} with ${usePrice(tx.value).crypto.formatted}`)
            updateTransactionStatus({ hash: tx.transactionHash, status: tx.state, timestamp: tx.timestamp })
          }
        }
        catch (error) {
          logger.error('[updateTransactionsInDb] Error while getting transaction', error)
        }
      }
    }))
  }

  /**
   * Sends all the funds from the remote signer to the local signer.
   */
  async function drainRemoteSigner({ address, end }: RemoteSigner) {
    const { data: balance, error } = (await useNimiqNetwork().getBalance(address))
    const amount = error ? 0 : balance
    if (!amount) {
      // If balance is 0, update the remote in the db
      if (balance === 0) {
        logger.log('Remote signer is empty, updating balance', { address: address.toUserFriendlyAddress })
        await useConn().run(SQLQuery.UpdateRemoteBalance, [balance, address.toUserFriendlyAddress()])
      }
      else {
        logger.error(`Error while draining remote signer. ${error}`, { address: address.toUserFriendlyAddress(), amount })
      }
      return
    }
    const transfer = end < headTimestamp.value ? Transfer.RemoteToLocalAfterTimeout : Transfer.RemoteToLocalImmediateReclaim
    const { data: tx, error: errorTx } = await sendTx({ transfer, amount, sender: address })
    if (errorTx) {
      logger.error(`Error while draining remote signer. ${error}`, { address: address.toUserFriendlyAddress(), amount })
      return
    }
    if (tx)
      pendingRemoteDrainTxs.value.push(tx)

    logger.log('Draining remote signer', { address: address.toUserFriendlyAddress(), amount })
  }

  /**
   * This function ensures that there is only one active remote signer with a balance greater than zero.
   * If there are multiple, it initiates transactions to transfer the balance from the remote to the local signer.
   * useSync composable later will take care of the rest.
   */
  async function ensureSingleRemoteSignerWithBalance() {
    const remoteSigners = await useConn().query<RemoteSigner[]>(SQLQuery.GetRemoteSignerWithBalance).then(parseAddress)
    if (remoteSigners.length === 0)
      return

    if (remoteSigners.length === 1) {
      // If there is only one remote signer with a balance greater than zero, but it is not the active one, set it as active
      const { active, balance, address, start, end, proofSize, publicKey } = remoteSigners[0]
      const { data: newBalance, error } = await getBalance(address)
      if (error) {
        logger.error('Error while getting balance in ensureSingleRemoteSignerWithBalance', error)
        return
      }
      if (newBalance !== balance) {
        logger.error('Balance in db is different from balance in blockchain in ensureSingleRemoteSignerWithBalance', { balance, newBalance })
        await useConn().run(SQLQuery.UpdateRemoteBalance, [newBalance, address.toUserFriendlyAddress()])
        return
      }
      if (newBalance > 0 && !active) {
        logger.log('🫥 There is one remote signers with a balance greater than zero, but it is not the active one. Setting the one with balance as active')
        await useRemoteSigner().updateRemoteSigner({
          active: true,
          balance,
          address,
          publicKey,
          start,
          end,
          proofSize,
        })
        // Updating balance because the active remote signer has changed
        updateBalances()
      }
      return
    }

    const canEveryHtlcBeDrained = remoteSigners.every(remoteSigner => remoteSigner.start < Date.now())
    if (canEveryHtlcBeDrained) {
      logger.log('😱 There are multiple remote signers with a balance greater than zero. Initiating transactions to transfer funds to the local wallet', remoteSigners.map((x) => {
        return { ...x, address: x.address.toUserFriendlyAddress() }
      }))
      await Promise.all(remoteSigners.map(async remoteSigner => await drainRemoteSigner(remoteSigner)))
    }
    else {
      logger.log('🫠 There are multiple remote signers with a balance greater than zero, but cannot be drained yet... Delaying draining')
    }
  }

  async function verifyRemoteSignersDb() {
    await useRemoteSigner().updateSignersTableBalance()
    await ensureSingleRemoteSignerWithBalance()
  }

  let lastExpiredSwapHtlcCheckTimestamp = 0
  async function checkExpiredSwapHtlcs() {
    const heightTimestamp = headTimestamp.value > 1 ? headTimestamp.value : Date.now()
    if (heightTimestamp <= lastExpiredSwapHtlcCheckTimestamp + 1 * Nimiq.Policy.BLOCKS_PER_BATCH)
      return
    lastExpiredSwapHtlcCheckTimestamp = heightTimestamp

    const conn = useConn()
    const expiredSwapHtlcs = await conn.query<SwapHtlc[]>(SQLQuery.GetExpiredSwapHtlcs, [heightTimestamp])
    logger.log('Expired swap HTLCs:', expiredSwapHtlcs)

    for (const htlc of expiredSwapHtlcs) {
      try {
        const account = await client.value!.getAccount(htlc.address) as PlainAccount
        if (!account.balance) {
        // TODO: Check if HTLC was redeemed, and add secret to tx

          logger.log('Swap HTLC is empty, deleting from db', htlc)
          await conn.run(SQLQuery.DeleteSwapHtlc, [htlc.address])

          continue
        }

        logger.log('Refunding swap HTLC', htlc, account)
        const refundTx = new Nimiq.Transaction(
          Nimiq.Address.fromUserFriendlyAddress(htlc.address),
          Nimiq.AccountType.HTLC,
          new Uint8Array(0),
          localAddress.value,
          Nimiq.AccountType.Basic,
          new Uint8Array(0),
          BigInt(account.balance),
          0n,
          0,
          localHeight.value,
          networkId.value,
        )
        const { privateKey, publicKey } = localWallet.value
        const sig = Nimiq.Signature.create(privateKey, publicKey, refundTx.serializeContent())
        const sigProof = Nimiq.SignatureProof.singleSig(publicKey, sig).serialize()
        const proof = new Nimiq.SerialBuffer(1 + sigProof.length)
        proof.writeUint8(/* TIMEOUT_RESOLVE */ 2)
        proof.write(sigProof)
        refundTx.proof = proof
        const txDetails = await client.value!.sendTransaction(refundTx)
        if (txDetails.state !== 'invalidated') {
          // Mark transaction as refunded
          useTransactions().setSwapHtlcRefunded(htlc.address)
        }
        else {
          logger.error('Error while sending refund swap HTLC tx', txDetails)
        }
      }
      catch (error) {
        logger.error('Error while refunding swap HTLC', error)
      }
    }
    useConn().run(SQLQuery.DeleteExpiredSwapQuotes, [heightTimestamp])
  }

  watch(consensus, (newConsensus, oldConsensus) => {
    if (newConsensus === 'established' && (!oldConsensus || oldConsensus === 'syncing'))
      checkExpiredSwapHtlcs()
  }, { immediate: true })

  watch(localHeight, async (newHeight) => {
    if (newHeight > 1 && newHeight % (10 * Nimiq.Policy.BLOCKS_PER_BATCH) === 0)
      checkExpiredSwapHtlcs()
  })

  watch([remoteBalance, isHtlcActive], async ([newBalance], [oldBalance]) => {
    if (newBalance > 0 && isHtlcActive.value) {
      logger.log('Remote signer has funds. Show balance instead of skeleton', { newBalance, oldBalance })
      isProcessingRemote.value = false
    }
  })

  // Reconnect the network if the nodes are not synced after 2 minutes of waiting
  const { isPending: isPendingReconnectNetwork, start: startReconnectNetwork, stop: stopReconnectNetwork } = useTimeoutFn(() => {
    useNimiqNetwork().reconnect()
  }, 2 * 60 * 1e3, { immediate: false }) // 2 minutes
  watch(nodesAreSynced, (synced) => {
    if (consensus.value !== 'established')
      return
    if (synced && isPendingReconnectNetwork.value) {
      logger.log('Nodes are synced. Stopping reconnect network timeout', { localHeight: localHeight.value, remoteHeight: remoteHeight.value, synced, isPending: isPendingReconnectNetwork.value })
      stopReconnectNetwork()
    }
    else if (!synced && !isPendingReconnectNetwork.value && localHeight.value !== -1) {
      logger.log('Nodes are not synced. Starting reconnect network timeout', { localHeight: localHeight.value, remoteHeight: remoteHeight.value, synced, isPending: isPendingReconnectNetwork.value })
      startReconnectNetwork()
    }
  }, { immediate: true })

  watch(localHeight, async () => {
    if (localHeight.value % 10 !== 0)
      return
    if (htlcCheckLock.value)
      return

    htlcCheckLock.value = true
    await checkHtlcState()
    htlcCheckLock.value = false
  })

  return {
    syncWallets,
    updateBalances,
    updateSingleTransaction,
    updateTransactionHistory,
    pendingTransactions,
    isTransactionPending,
    nodesAreSynced,
    pendingHtlcCreationTransactions,

    blocksUntilNextMacroBlock,

    verifyRemoteSignersDb,
  }
})
