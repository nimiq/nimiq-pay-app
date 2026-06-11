import type { PlainTransactionDetails, TransactionState } from '@nimiq/core'
import type { ContractWithEstimate } from '@nimiq/fastspot-api-v1'
import type { RemoteSignerTransactionState } from '@/composables/useApi'
import type { RemoteSigner } from '@/lib/sql-queries'
import type { ExternalTransaction, StakingTransaction, Transaction, UserReceiptTransaction } from '@/types/transactions'
import { SwapAsset } from '@nimiq/fastspot-api-v1'
import { until } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { useCplApi, useRemoteSignerApi } from '@/composables/useApi'
import { useFastspotApiV1 } from '@/composables/useFastspotv1'
import { useLogger } from '@/composables/useLogger'
import { usePrice } from '@/composables/usePrice'
import { nakaBufferAddresses } from '@/lib'
import { Asset } from '@/lib/assets'
import { isMockEnabled } from '@/lib/mock-mode'
import { SQLQuery } from '@/lib/sql-queries'
import { buildTopUpReceipt, toAccountType } from '@/lib/tx'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePoints } from '@/stores/points'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { PaymentMethod, PointsHashPrefix, Rail, Transfer } from '@/types/transactions'

const logger = useLogger('useSync')

// HTLC drains back to local carry the original creator's address inside the proof.
// For our own HTLCs (including extension chains) the creator is always the local wallet.
// Used by both batch refresh and the live tx listener to skip mis-categorized "Top-Up" entries.
export function isOwnHtlcDrain(tx: PlainTransactionDetails, localUserFriendly: string): boolean {
  return tx.senderType === 'htlc'
    && (tx.proof.type === 'timeout-resolve' || tx.proof.type === 'early-resolve')
    && tx.proof.creator === localUserFriendly
}

export const useSyncTransactions = defineStore('sync-transactions', () => {
  const { getAccountTransactions, getAllOutgoingTransactionsFromHtlcs } = useNimiqNetwork()
  const { query } = useConn()
  const { client, consensus } = storeToRefs(useNimiqNetwork())
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { remoteAddress } = storeToRefs(useRemoteSigner())
  const { getAllRemoteSigners, discoverRemoteSignersFromBlockchain } = useRemoteSigner()
  const { isUpdatingTransactions } = storeToRefs(useLocks())
  const { pendingTransactions, pendingRemoteDrainTxs, isTransactionPending } = storeToRefs(useSyncState())
  const {
    addUnknownPaymentToMerchantTransaction,
    addWithdrawalTransaction,
    addStakingtransaction,
    updateTransactionCashbackClaimed,
    updateTransactionStatus,
  } = useTransactions()

  async function updateSingleTransaction(hash: string) {
    if (!hasLocalWallet.value)
      return

    let state: TransactionState | RemoteSignerTransactionState, timestamp: number | undefined
    if (!client.value || consensus.value !== 'established') {
      const { data: tx, error } = await useRemoteSignerApi().getTransactionState({ hash })
      if (error || !tx || tx.state === 'unknown') {
        logger.error('[updateSingleTransaction] Error while getting transaction state', error)
        return
      }
      state = tx.state
      timestamp = tx.timestamp
    }
    else {
      try {
        try {
          const tx = await client.value!.getTransaction(hash)
          state = tx.state
          timestamp = tx.timestamp
        }
        catch {
          const { data: tx, error } = await useRemoteSignerApi().getTransactionState({ hash })
          if (error || !tx || tx.state === 'unknown') {
            logger.error('[updateSingleTransaction] Error while getting transaction state from remote signer', error)
            return
          }
          state = tx.state
          timestamp = tx.timestamp
        }
        if (state !== 'pending'
          && (pendingTransactions.value.some(pendingTx => pendingTx.transactionHash === hash)
            || pendingRemoteDrainTxs.value.some(pendingTx => pendingTx.hash === hash)
          )) {
          logger.log(`Removing transaction ${hash} from pending transactions`)
          pendingTransactions.value = pendingTransactions.value.filter(pendingTx => pendingTx.transactionHash !== hash)
          pendingRemoteDrainTxs.value = pendingRemoteDrainTxs.value.filter(pendingTx => pendingTx.hash !== hash)
        }
      }
      catch (error) {
        logger.error(`[updateSingleTransaction] Error while getting transaction: ${hash}`, error)
        return
      }
    }
    updateTransactionStatus({ hash, status: state, timestamp })
  }

  /**
   * Updates the transactions history getting transactions from the blockchain and adding them to the db if they are not already there.
   */
  async function updateTransactionHistory() {
    if (isMockEnabled)
      return

    try {
      await until(isTransactionPending).toBe(false, { timeout: 60_000 })
    }
    catch {
      logger.log('Skipping transaction history refresh while transactions are still pending')
      return
    }

    if (isUpdatingTransactions.value) {
      logger.log('📬 Transactions are already being updated')
      return
    }
    isUpdatingTransactions.value = true
    try {
      const userReceipts: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
      const accountTxs = await getAccountTransactions(localAddress.value!)

      // Register newly-observed own HTLCs once each before scanning, so concurrent drains from
      // the same HTLC don't issue duplicate getAccount calls during the parallel loop below.
      const ownHtlcSenders = new Set<string>()
      for (const tx of accountTxs.data) {
        if (isOwnHtlcDrain(tx, localAddress.value.toUserFriendlyAddress()))
          ownHtlcSenders.add(tx.sender)
      }
      if (ownHtlcSenders.size > 0)
        await Promise.all([...ownHtlcSenders].map(sender => useRemoteSigner().registerOwnHtlcIfMissing(sender)))

      await Promise.all(accountTxs.data.map(async (tx) => {
        if (tx.sender === localAddress.value.toUserFriendlyAddress() || (remoteAddress.value && tx.sender === remoteAddress.value.toUserFriendlyAddress()))
          return

        if (isOwnHtlcDrain(tx, localAddress.value.toUserFriendlyAddress())) {
          logger.log(`🚫 updateTransactionHistory skipped own-HTLC drain`, { hash: tx.transactionHash, sender: tx.sender, amount: tx.value })
          return
        }

        if (nakaBufferAddresses.includes(tx.sender)) {
          logger.log('NAKA reversal detected, marking matching tx as reversed', { tx })
          return useTransactions().setNakaTxRefunded(tx.value)
        }

        const hash = tx.transactionHash
        if (userReceipts.some(dbTx => dbTx.hash === hash))
          return

        logger.log(`📬 New ${tx.state} transaction received with ${usePrice(tx.value).crypto.formatted}`)
        if (tx.senderType === 'staking')
          handleStakingTxs(tx)
        else
          useTransactions().addReceiptTransaction(buildTopUpReceipt(tx))
      }))

      const allTransactions = await query<ExternalTransaction[]>(SQLQuery.SelectAllTransactions)
      const topUpAddresses = [...new Set(((await query<UserReceiptTransaction[]>(SQLQuery.GetAllUserReceipts))).map(tx => tx.sender))]

      function categorizeTransactions(txs: PlainTransactionDetails[]) {
        const htlcExtensionTxs: PlainTransactionDetails[] = []
        const htlcSwapTxs: PlainTransactionDetails[] = []
        const withdrawalTxs: PlainTransactionDetails[] = []
        const stakingTxs: PlainTransactionDetails[] = []
        const unknownTxs: PlainTransactionDetails[] = []
        for (const tx of txs) {
          if (tx.recipientType === 'htlc') {
            const data = tx.data
            if ('hashRoot' in data && data.hashRoot === '0000000000000000000000000000000000000000000000000000000000000000')
              htlcExtensionTxs.push(tx)
            else
              htlcSwapTxs.push(tx)
          }
          else if (tx.recipientType === 'staking' || tx.senderType === 'staking') {
            stakingTxs.push(tx)
          }
          else if (topUpAddresses.includes(tx.recipient)) {
            withdrawalTxs.push(tx)
          }
          else {
            unknownTxs.push(tx)
          }
        }
        return {
          htlcExtensionTxs,
          htlcSwapTxs,
          withdrawalTxs,
          stakingTxs,
          unknownTxs,
        }
      }

      await discoverRemoteSignersFromBlockchain()
      const remoteSigners = await getAllRemoteSigners()

      if (remoteSigners && remoteSigners.length) {
        // Drain-to-local txs are user reclaims tracked by _sendTx, and DB-known hashes are already
        // categorized — both filters apply at the outer level AND to recursive traversal results
        // (which can otherwise yield the same hash twice via overlapping extension chains).
        const localUserFriendly = localAddress.value.toUserFriendlyAddress()
        const seenHashes = new Set<string>(allTransactions.map(tx => tx.hash))
        const filterUnseen = (txs: PlainTransactionDetails[], origin: string) => {
          let droppedReclaim = 0
          let droppedDup = 0
          const result = txs.filter((tx) => {
            if (tx.recipient === localUserFriendly) {
              droppedReclaim++
              return false
            }
            if (seenHashes.has(tx.transactionHash)) {
              droppedDup++
              return false
            }
            seenHashes.add(tx.transactionHash)
            return true
          })
          if (droppedReclaim > 0 || droppedDup > 0)
            logger.log(`🧹 filterUnseen[${origin}] in=${txs.length} out=${result.length} reclaims=${droppedReclaim} dups=${droppedDup}`)
          return result
        }

        for (const remoteSigner of remoteSigners.sort((a, b) => b.end - a.end)) {
          const signerLabel = remoteSigner.address.toUserFriendlyAddress()
          const accountTxs = await getAccountTransactions(remoteSigner.address)
          const txsToProcess = filterUnseen(
            accountTxs.data.filter(tx => tx.sender === signerLabel),
            `outer:${signerLabel}`,
          )

          const { htlcExtensionTxs, htlcSwapTxs, withdrawalTxs, stakingTxs, unknownTxs } = categorizeTransactions(txsToProcess)
          logger.log(`📦 categorize[${signerLabel}] htlcExt=${htlcExtensionTxs.length} swap=${htlcSwapTxs.length} withdraw=${withdrawalTxs.length} staking=${stakingTxs.length} unknown=${unknownTxs.length}`)

          await Promise.all(htlcExtensionTxs.map(async (tx) => {
            const nestedTxs = await getAllOutgoingTransactionsFromHtlcs(Nimiq.Address.fromString(tx.recipient))
            const categorized = categorizeTransactions(filterUnseen(nestedTxs, `nested:${tx.recipient}`))
            htlcSwapTxs.push(...categorized.htlcSwapTxs)
            withdrawalTxs.push(...categorized.withdrawalTxs)
            stakingTxs.push(...categorized.stakingTxs)
            unknownTxs.push(...categorized.unknownTxs)
          }))
          await Promise.all([
            ...htlcSwapTxs.map(tx => handleSwapTxs(tx, { remoteSigner })),
            ...withdrawalTxs.map(tx => handleWithdrawalTxs(tx, { remoteSigner })),
            ...stakingTxs.map(tx => handleStakingTxs(tx)),
            ...unknownTxs.map(tx => handleUnknownTxs(tx, { remoteSigner })),
          ])
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
    const dbTxs: Transaction[] = await useConn().query(SQLQuery.SelectAllTransactions)

    await Promise.all(dbTxs.map(async (dbTx) => {
      if ((dbTx.asset || Asset.NIM) === Asset.USDT)
        return

      if ((dbTx.status === 'included' || dbTx.status === 'confirmed') && (dbTx.transfer === Transfer.UserPaymentToMerchant || dbTx.transfer === Transfer.UserPaymentToAtomicSwap) && dbTx.paymentMethod === PaymentMethod.NIM) {
        if (!dbTx.isCashbackClaimed && useApp().pointsToken) {
          const { error, errorType } = await usePoints().claimCashback(dbTx)
          if (error) {
            logger.error(error)
            if (errorType === 'CPL_PAYMENT_REQUEST_ALREADY_PROCESSED' || errorType === 'CPL_MERCHANT_NOT_FOUND')
              updateTransactionCashbackClaimed({ hash: dbTx.hash })
          }
          else {
            updateTransactionCashbackClaimed({ hash: dbTx.hash })
          }
        }
      }

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
          let state: TransactionState | RemoteSignerTransactionState, timestamp: number, amount: number
          if (!client.value || consensus.value !== 'established') {
            const { data: tx, error } = await useRemoteSignerApi().getTransactionState({ hash: dbTx.hash })
            if (error || !tx || tx.state === 'unknown') {
              logger.error('[updateTransactionsInDb] Error while getting transaction state', error)
              return
            }
            state = tx.state
            timestamp = tx.timestamp || 0
            amount = tx.value
          }
          else {
            const tx = await client.value!.getTransaction(dbTx.hash)
            state = tx.state
            timestamp = tx.timestamp || 0
            amount = tx.value
          }
          if ((dbTx.status !== state) || (dbTx.timestamp !== timestamp)) {
            logger.log(`📬 Updating transaction ${dbTx.hash} ${state} with ${usePrice(amount).crypto.formatted}`)
            updateTransactionStatus({ hash: dbTx.hash, status: state, timestamp })
          }
        }
        catch (error) {
          logger.error('[updateTransactionsInDb] Error while getting transaction', error)
        }
      }
    }))
  }

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

    if (contract.from.asset !== SwapAsset.NIM) {
      logger.error(`Found a swap from another asset than NIM (${contract.from.asset}) - This type of swap cannot yet be handled`)
    }
    else if (contract.to.asset === SwapAsset.BTC_LN) {
      logger.log(`📬 BTC_LN swap found with ${tx.value / 1e5} from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
      addUnknownPaymentToMerchantTransaction(tx, Transfer.UserPaymentToAtomicSwap, Rail.BitcoinLightning, '', {
        amount: (contract.to.amount - contract.to.fee) / 1e8,
        currency: 'BTC',
      }, {
        imported: true,
      })
      return
    }
    else {
      logger.error(`Found a swap to another asset than BTC_LN (${contract.to.asset}) - This type of swap cannot yet be handled`)
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
      title: 'Withdrawal',
      fee: tx.fee,
      // TODO: Proof size should be read from tx proof once all Nimiq client variants expose it consistently.
      proofSize: useRemoteSigner().remoteProofSize,
    })
  }

  function handleStakingTxs(tx: PlainTransactionDetails) {
    let title: StakingTransaction['title']
    if (tx.senderType === 'staking') {
      logger.log(`📬 New ${tx.senderData!.type} transaction found with ${tx.value / 1e5} NIM from staking contract`)
      switch (tx.senderData!.type) {
        case 'remove-stake':
          title = 'Remove Stake'
          break
        case 'delete-validator':
          title = 'Delete Validator'
          break
        default:
          title = 'Staking Contract'
          break
      }
    }
    else if (tx.recipientType === 'staking') {
      logger.log(`📬 New ${tx.data.type} transaction found with ${tx.value / 1e5} NIM to staking contract`)
      switch (tx.data.type) {
        case 'create-staker':
          title = 'Create Staker'
          break
        case 'add-stake':
          title = 'Add Stake'
          break
        case 'set-active-stake':
          title = 'Set Active Stake'
          break
        case 'update-staker':
          title = 'Update Staker'
          break
        case 'retire-stake':
          title = 'Retire Stake'
          break
        default:
          title = 'Staking Contract'
          break
      }
    }
    else {
      title = 'Staking Contract'
    }

    addStakingtransaction({
      transfer: Transfer.Staking,
      amount: tx.value,
      fee: tx.fee,
      hash: tx.transactionHash,
      sender: tx.sender,
      senderType: toAccountType(tx.senderType),
      senderData: tx.senderData ? Nimiq.BufferUtils.fromHex(tx.senderData.raw) : undefined,
      recipient: tx.recipient,
      recipientType: toAccountType(tx.recipientType),
      recipientData: tx.data?.raw ? Nimiq.BufferUtils.fromHex(tx.data.raw) : undefined,
      status: tx.state,
      timestamp: tx.timestamp,
      title,
      proofSize: tx.proof.raw.length / 2,
    })
  }

  function handleUnknownTxs(tx: PlainTransactionDetails, { remoteSigner }: { remoteSigner: RemoteSigner }) {
    logger.log(`📬 New merchant transaction found with ${tx.value / 1e5} NIM from remote signer ${remoteSigner.address.toUserFriendlyAddress()}`)
    addUnknownPaymentToMerchantTransaction(tx)
  }

  return {
    updateSingleTransaction,
    updateTransactionHistory,
    updateTransactionsInDb,
  }
})
