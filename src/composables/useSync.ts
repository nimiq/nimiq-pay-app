import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { computedAsync, createSharedComposable, until } from '@vueuse/core'
import type { ClientTransactionDetails } from '@nimiq/core-web'
import { usePrice } from './usePrice'
import { parseAddress, useRemoteSigner } from '@/stores/remote-signer'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useLocalWallet } from '@/stores/local-wallet'
import { useTransactions } from '@/stores/transactions'
import { PaymentMethod, PointsHashPrefix, Transfer } from '@/types/transactions'
import type { ExternalTransaction, Transaction, UserReceiptTransaction } from '@/types/transactions'
import { useConn } from '@/stores/conn'
import { type RemoteSigner, SQLQuery } from '@/lib/sql-queries'
import { usePoints } from '@/stores/points'
import { useApp } from '@/stores/app'
import { useCplApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('useSync')

const MAX_BLOCK_HEIGHT_MISMATCH = 5
export const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = 120

export function _useSync() {
  const { getAccount, getAccountTransactions, getAllOutgoingTransactionsFromHtlcs } = useNimiqNetwork()
  const { query } = useConn()
  const { client, height: localHeight } = storeToRefs(useNimiqNetwork())
  const { localAddress, localBalance, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { remoteHeight, remoteBalance, remoteAddress, hasHtlcExpired, end, start, isHtlcActive, isHtlcPending, isRemoteOk } = storeToRefs(useRemoteSigner())
  const { updateActiveWallet, getAllRemoteSigners } = useRemoteSigner()
  const { sendTx, addUnknownPaymentToMerchantTransaction, addWithdrawalTransaction, updateTransactionCashbackClaimed, updateTransactionStatus } = useTransactions()

  // Whether the remote wallet is synced with the local wallet or not.
  // We allow a difference of MAX_BLOCK_HEIGHT_MISMATCH blocks between the two wallets.
  const nodesAreSynced = computedAsync(() => remoteHeight.value > (localHeight.value - MAX_BLOCK_HEIGHT_MISMATCH) && remoteHeight.value < (localHeight.value + MAX_BLOCK_HEIGHT_MISMATCH), false)

  // Checks if the sum of current block and CONSTANT is greater than the middle block of the HTLC validity.
  const htlcCanBeExtended = computed(() => (end.value - (end.value - start.value) / 2) < (localHeight.value + MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA))

  const pendingTransactions: Ref<Nimiq.Client.TransactionDetails[]> = ref([])
  const isTransactionPending = computed(() => pendingTransactions.value.length > 0)

  /**
   * If the local wallet gets some funds, move them to the remote wallet immediately.
   *
   * 1. Check if the local wallet has funds and if the remote Nimiq's node and local Nimiq's node are synced.
   * 2. If there is already an active HTLC between the remote and the local wallet:
   *    2.1 Liquidate the HTLC by moving the funds from the remote wallet to the local wallet.
   *    2.2 Once the transaction is mined, `handleFunds` will be invoked again and step 3 will be executed.
   * 3. Else move the funds from the local wallet to the remote wallet.
   */
  async function handleFunds() {
    if (localBalance.value === 0)
      return
    if (isTransactionPending.value) {
      logger.log('There is a pending transaction. Delaying handleFunds')
      return
    }

    const remoteBalance = (await getAccount(remoteAddress.value!)).data?.balance || 0

    logger.log(`Local balance: ${localBalance.value / 1e5} NIM. Remote balance: ${remoteBalance / 1e5} NIM. ${remoteBalance === 0 ? 'Creating new HTLC' : 'Liquidating HTLC'}`)
    logger.log({ isHtlcActive: isHtlcActive.value, isRemoteOk: isRemoteOk.value, isHtlcPending: isHtlcPending.value })

    if (remoteBalance === 0 && !isHtlcPending.value) {
      const { error } = await sendTx({ transfer: Transfer.LocalToRemote })
      if (error)
        logger.error('Error while creating HTLC', error)
      return
    }

    if (!nodesAreSynced.value)
      return

    if (isHtlcActive.value && isRemoteOk.value) {
      const { error } = await sendTx({ transfer: Transfer.RemoteToLocal })
      if (error)
        logger.error('Error while liquidating HTLC', error)
      return
    }

    logger.log(`Delaying deposit. isHtlcActive: ${isHtlcActive.value}, isRemoteOk: ${isRemoteOk.value}, isHtlcPending: ${isHtlcPending.value}`)
  }

  async function extendValidity() {
    if (remoteBalance.value === 0 || !isHtlcActive.value)
      return
    logger.log(`Can the HTLC be extended? ${htlcCanBeExtended.value}`)
    if (htlcCanBeExtended.value) {
      const { error } = await sendTx({ transfer: Transfer.ExtendRemote })
      if (error)
        logger.error('Error while extending HTLC validity', error)
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
      const { error } = await useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: remoteBalance.value, sender: remoteAddress.value! })
      if (error)
        logger.error('Error while recovering funds from Remote', error)
    }
  }

  /**
   * Updates the local and the remote wallet balances.
   */
  async function updateBalances() {
    usePoints().updatePointsBalance()
    if (localAddress.value)
      localBalance.value = (await getAccount(localAddress.value)).data?.balance || 0
    else
      logger.log('Local address not found')
    if (remoteAddress.value) {
      remoteBalance.value = (await getAccount(remoteAddress.value!)).data?.balance || 0
      logger.log(`Remote balance for ${remoteAddress.value.toUserFriendlyAddress()} is ${remoteBalance.value}`)
    }
    else { logger.warn('Remote address not found') }
  }

  /**
   * Syncs the local and the remote wallet immediately and then every time a new block is mined.
   */
  async function syncWallets() {
    if (!hasLocalWallet.value)
      return

    await until(client).toBeTruthy()
    await client.value?.waitForConsensusEstablished()

    await useRemoteSigner().init()

    await updateBalances()
    await verifyRemoteSignersDb()

    logger.log(`🧬 Starting to sync wallets. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
    await Promise.all([handleFunds(), checkRemoteValidity(), extendValidity(), updateTransactionHistory(), updateTransactionsInDb()])

    client.value?.addHeadChangedListener(async () => {
      logger.log(`⛏️ New block mined. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)

      logger.log('pending transactions', pendingTransactions.value)
      // Check pending txs if they are still pending
      for (const tx of pendingTransactions.value) {
        const { state } = await client.value!.getTransaction(tx.transactionHash)
        if (state !== Nimiq.Client.TransactionState.PENDING) {
          logger.log(`Removing transaction ${tx.transactionHash.toHex()} from pending transactions`)
          pendingTransactions.value = pendingTransactions.value.filter(pendingTx => pendingTx.transactionHash.toHex() !== tx.transactionHash.toHex())
        }
      }

      await updateActiveWallet()
      // We need to update balances here because the remote balance is updated manually and needed before the sync
      await updateBalances()

      await Promise.all([handleFunds(), checkRemoteValidity(), extendValidity(), updateTransactionsInDb()])

      if (!isTransactionPending.value && localHeight.value % 10 === 0)
        await verifyRemoteSignersDb()
    })

    client.value?.addTransactionListener(async (tx) => {
      logger.log(`📬 New ${tx.state} transaction received`, tx.toPlain())
      // Only handle pending transactions, mined ones are handled by the block listener
      if (tx.state !== Nimiq.Client.TransactionState.PENDING) {
        // Removing the tx from the pending array
        pendingTransactions.value = pendingTransactions.value.filter(pendingTx => pendingTx.transactionHash.toHex() !== tx.transactionHash.toHex())
        return
      }

      // In the case that we have a pending tx, for example a tx coming from the remote, we need to wait until that
      // tx is mined before sending the local balance to the remote again
      pendingTransactions.value.push(tx)

      // Ignore transactions sent by the local wallet or the remote signer
      if (tx.sender.equals(localAddress.value) || (remoteAddress.value && tx.sender.equals(remoteAddress.value)))
        return

      // Check if tx is already in DB
      const dbTxs: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
      const isTxInDB = dbTxs.some(dbTx => dbTx.hash === tx.transactionHash.toHex())
      if (isTxInDB)
        return

      logger.log(`📬 Saving pending transaction with ${usePrice(tx.value).crypto.formatted}`)
      useApp().addNewTopUpAddress(tx.sender.toUserFriendlyAddress())
      useTransactions().addReceiptTransaction({
        transfer: Transfer.UserReceipt,
        amount: tx.value,
        sender: tx.sender.toUserFriendlyAddress(),
        senderType: tx.senderType,
        recipient: tx.recipient.toUserFriendlyAddress(),
        recipientType: tx.recipientType,
        hash: tx.transactionHash.toHex(),
        status: tx.state,
        // Timestamp is not available for pending transactions
        timestamp: Math.ceil(Date.now() / 1000),
        title: 'Top-Up', // translated at display time
        message: Nimiq.BufferUtils.toAscii(tx.data.raw),
        fee: tx.fee,
        proofSize: tx.proof.raw.length,
      })
    }, [useLocalWallet().localAddress])
  }

  const isUpdatingTransactions = ref(false)
  /**
   * Updates the transactions history getting transactions from the blockchain and adding them to the db if they are not already there.
   */
  async function updateTransactionHistory() {
    if (isUpdatingTransactions.value) {
      logger.log('📬 Transactions are already being updated')
      return
    }
    isUpdatingTransactions.value = true
    // No need to parse JSON fields, as those fields are not used here.
    const userReceipts: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
    const accountTxs = await getAccountTransactions(localAddress.value!)

    await Promise.all(accountTxs.data.map(async (tx) => {
      // TODO: Handle old remote signer setup transactions (recipientType === Nimiq.Account.Type.HTLC)

      if (tx.sender.equals(localAddress.value) || (remoteAddress.value && tx.sender.equals(remoteAddress.value)))
        return

      const txHash = tx.transactionHash.toHex()
      if (userReceipts.find(dbTx => dbTx.hash === txHash))
        return

      logger.log(`📬 New ${tx.state} transaction received with ${usePrice(tx.value).crypto.formatted}`)
      useTransactions().addReceiptTransaction({
        transfer: Transfer.UserReceipt,
        amount: tx.value,
        sender: tx.sender.toUserFriendlyAddress(),
        senderType: tx.senderType,
        recipient: tx.recipient.toUserFriendlyAddress(),
        recipientType: tx.recipientType,
        hash: tx.transactionHash.toHex(),
        status: tx.state,
        timestamp: tx.timestamp || Math.ceil(Date.now() / 1000),
        title: 'Top-Up', // translated at display time
        message: Nimiq.BufferUtils.toAscii(tx.data.raw),
        fee: tx.fee,
        proofSize: tx.proof.raw.length,
      })
    }))

    function handleWithdrawalTxs(tx: ClientTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
      logger.log(`📬 New withdrawal transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
      addWithdrawalTransaction({
        transfer: Transfer.UserPayment,
        amount: tx.value,
        sender: tx.sender.toUserFriendlyAddress(),
        senderType: tx.senderType,
        recipient: tx.recipient.toUserFriendlyAddress(),
        recipientType: tx.recipientType,
        hash: tx.transactionHash.toHex(),
        status: tx.state,
        timestamp: tx.timestamp || Math.ceil(Date.now() / 1000),
        title: 'Withdrawal', // translated at display time
        fee: tx.fee,
        proofSize: tx.proof.raw.length,
      })
    }

    function handleUnknownTxs(tx: ClientTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
      logger.log(`📬 New merchant transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
      addUnknownPaymentToMerchantTransaction(tx)
    }

    const allTransactions = await query<ExternalTransaction[]>(SQLQuery.SelectAllTransactions)
    const topUpAddresses = [...new Set(((await query<UserReceiptTransaction[]>(SQLQuery.GetAllUserReceipts))).map(tx => tx.sender))]

    function categorizeTransactions(txs: ClientTransactionDetails[]) {
      const htlcTxs: ClientTransactionDetails[] = []
      const withdrawalTxs: ClientTransactionDetails[] = []
      const unknownTxs: ClientTransactionDetails[] = []
      for (const tx of txs) {
        if (tx.recipientType === Nimiq.Account.Type.HTLC)
          htlcTxs.push(tx)
        else if (topUpAddresses.includes(tx.recipient.toUserFriendlyAddress()))
          withdrawalTxs.push(tx)
        else unknownTxs.push(tx)
      }
      return [htlcTxs, withdrawalTxs, unknownTxs] as const
    }

    // Check for transactions made from the remote signers
    for (const remoteSigner of await getAllRemoteSigners()) {
      const accountTxs = await getAccountTransactions(remoteSigner.address)
      const txsToProcess = accountTxs.data
        // Only transactions sent from the remote signer to other addresses
        .filter(tx => tx.sender.equals(remoteSigner.address) && !tx.recipient.equals(localAddress.value))
        // Only transactions not already in the db
        .filter((tx) => {
          const hash = tx.transactionHash.toHex()
          for (const dbTx of allTransactions) {
            // Make use of the timestamp ordering of allTransactions and bail when the db transactions are older than the tx we are looking for
            if (dbTx.timestamp < tx.timestamp)
              break
            // If the tx is already known, do not process it further
            if (dbTx.hash === hash)
              return false
          }
          return true
        })

      const [htlcTxs, withdrawalTxs, unknownTxs] = categorizeTransactions(txsToProcess)

      await Promise.all(htlcTxs.map(async (tx) => {
        const txs = await getAllOutgoingTransactionsFromHtlcs(tx.recipient)
        // Check if txs are withdrawals or unknown payments
        const categorized = categorizeTransactions(txs)
        if (categorized[0].length > 0)
          logger.error('HTLC txs should not have HTLCs')
        withdrawalTxs.concat(categorized[1])
        unknownTxs.concat(categorized[2])
      }))
      await Promise.all([
        withdrawalTxs.map(tx => handleWithdrawalTxs(tx, { remoteSigner })),
        unknownTxs.map(tx => handleUnknownTxs(tx, { remoteSigner })),
      ].flat())
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
      // We need to check this if it's mined or confirmed just in case the user closes the app
      // before the tx is mined and opened again after it's confirmed
      if ((dbTx.status === 'mined' || dbTx.status === 'confirmed') && dbTx.transfer === Transfer.UserPaymentToMerchant && dbTx.paymentMethod === PaymentMethod.NIM) {
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
      if (dbTx.status === Nimiq.Client.TransactionState.CONFIRMED)
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

        const txStatus = data?.status as Nimiq.Client.TransactionState
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
        const tx = await client.value?.getTransaction(dbTx.hash)
        if (!tx)
          return

        // Check if status in db is different from status in blockchain or timestamp in db is different from timestamp in blockchain
        if ((dbTx.status !== tx.state) || (dbTx.timestamp !== tx.timestamp)) {
          logger.log(`📬 Updating transaction ${tx.transactionHash.toHex()} ${tx.state} with ${usePrice(tx.value).crypto.formatted}`)
          updateTransactionStatus({ hash: tx.transactionHash.toHex(), status: tx.state, timestamp: tx.timestamp })
        }
      }
    }))
  }

  /**
   * Sends all the funds from the remote signer to the local signer.
   */
  async function drainRemoteSigner({ address, balance, end }: RemoteSigner) {
    const amount = await useNimiqNetwork().getAccount(address).then(account => account.data?.balance || balance)
    if (!amount) {
      logger.error('Error while draining remote signer. Amount is undefined', { address: address.toUserFriendlyAddress(), amount })
      return
    }
    const transfer = end < localHeight.value ? Transfer.RemoteToLocalAfterTimeout : Transfer.RemoteToLocalImmediateReclaim
    sendTx({ transfer, amount, sender: address })
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
      if (balance > 0 && !active) {
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

    const canEveryHtlcBeDrained = remoteSigners.every(remoteSigner => remoteSigner.start < localHeight.value)
    if (canEveryHtlcBeDrained) {
      logger.log('😱 There are multiple remote signers with a balance greater than zero. Initiating transactions to transfer funds to the local wallet')
      remoteSigners.forEach(drainRemoteSigner)
    }
    else {
      logger.log('🫠 There are multiple remote signers with a balance greater than zero, but cannot be drained yet... Delaying draining')
    }
  }

  async function verifyRemoteSignersDb() {
    await useRemoteSigner().updateSignersTableBalance()
    await ensureSingleRemoteSignerWithBalance()
  }

  return {
    syncWallets,
    updateBalances,
    updateTransactionHistory,
    pendingTransactions,
    isUpdatingTransactions,

    verifyRemoteSignersDb,
  }
}

export const useSync = createSharedComposable(_useSync)
