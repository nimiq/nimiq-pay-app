/* eslint-disable no-console */

import { storeToRefs } from 'pinia'
import { computedAsync, until } from '@vueuse/core'
import { computed } from 'vue'
import { usePrice } from './usePrice'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useLocalWallet } from '@/stores/local-wallet'
import { parseAddress, useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import type { UserReceiptTransaction } from '@/types/transactions'
import { ShopCategory, Transfer } from '@/types/transactions'
import { useConn } from '@/stores/conn'
import type { RemoteSigner } from '@/lib/sql-queries'
import { SQLQuery } from '@/lib/sql-queries'

const MAX_BLOCK_HEIGHT_MISMATCH = 5
const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = 120

export function useSync() {
  const { getAccount, getAccountTransactions } = useNimiqNetwork()
  const { client, height: localHeight } = storeToRefs(useNimiqNetwork())
  const { localAddress, localBalance, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { remoteHeight, remoteBalance, remoteAddress, hasHtlcExpired, end, start, isHtlcActive, isRemoteOk } = storeToRefs(useRemoteSigner())
  const { updateActiveWallet } = useRemoteSigner()

  // Whether the remote wallet is synced with the local wallet or not.
  // We allow a difference of MAX_BLOCK_HEIGHT_MISMATCH blocks between the two wallets.
  const nodesAreSynced = computedAsync(() => remoteHeight.value > (localHeight.value - MAX_BLOCK_HEIGHT_MISMATCH) && remoteHeight.value < (localHeight.value + MAX_BLOCK_HEIGHT_MISMATCH), false)

  // Checks if the sum of current block and CONSTANT is greater than the middle block of the HTLC validity.
  const htlcCanBeExtended = computed(() => (end.value - (end.value - start.value) / 2) < (localHeight.value + MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA))

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

    const remoteBalance = (await getAccount(remoteAddress.value!)).data?.balance || 0

    console.log(`Local balance: ${localBalance.value / 1e5} NIM. Remote balance: ${remoteBalance / 1e5} NIM. ${remoteBalance === 0 ? 'Creating new HTLC' : 'Liquidating HTLC'}`)
    console.log({ isHtlcActive: isHtlcActive.value, isRemoteOk: isRemoteOk.value })

    if (remoteBalance === 0) {
      useTransactions().sendTx({ transfer: Transfer.LocalToRemote })
      return
    }

    if (!nodesAreSynced.value)
      return

    if (isHtlcActive.value && isRemoteOk.value) {
      useTransactions().sendTx({ transfer: Transfer.RemoteToLocal })
      return
    }

    console.log(`Delaying deposit. isHtlcActive: ${isHtlcActive.value}, isRemoteOk: ${isRemoteOk.value}`)
  }

  function extendValidity() {
    // TODO: this is not working
    // if (remoteBalance.value === 0)
    //   return
    // if (htlcCanBeExtended.value)
    //   useTransactions().sendTx({ transfer: Transfer.ExtendRemote })
  }

  /**
   * If the server misses the deadline to finalize the HTLC, the local wallet has to recover the funds
   * and create a new HTLC.
   *
   * Note: This function is just a safety net. The server should never miss the deadline.
   */
  function checkRemoteValidity() {
    if (remoteBalance.value === 0)
      return
    console.log(`Did the HTLC expire? ${hasHtlcExpired.value}`)
    if (hasHtlcExpired.value)
      useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout })
  }

  /**
   * Updates the local and the remote wallet balances.
   */
  async function updateBalances() {
    if (localAddress.value)
      localBalance.value = (await getAccount(localAddress.value)).data?.balance || 0
    else
      console.log('Local address not found')
    if (remoteAddress.value)
      remoteBalance.value = (await getAccount(remoteAddress.value!)).data?.balance || 0
    else
      console.warn('Remote address not found')
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

    await verifyRemoteSignersDb()

    console.group(`🧬  Starting to sync wallets. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
    await updateBalances()
    handleFunds()
    checkRemoteValidity()
    extendValidity()
    console.groupEnd()

    client.value?.addBlockListener(async () => {
      console.log(`⛏️  New block mined. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
      await updateActiveWallet()
      await updateBalances()
      await updateTransactionHistory()

      handleFunds()
      checkRemoteValidity()
      extendValidity()
    })

    client.value?.addTransactionListener(async (tx) => {
      console.log('📬  New transaction received', tx)
      // Only handle pending transactions, mined ones are handled by the block listener
      if (tx.state !== Nimiq.Client.TransactionState.PENDING)
        return
      // Ignore transactions sent by the local wallet or the remote signer
      if (tx.sender.equals(localAddress.value) || (remoteAddress.value && tx.sender.equals(remoteAddress.value)))
        return

      // Check if tx is already in DB
      const dbTxs: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
      const isTxInDB = dbTxs.some(dbTx => dbTx.hash === tx.transactionHash.toHex())
      if (isTxInDB)
        return

      console.log(`📬  New transaction received with ${usePrice(tx.value).crypto.formatted}`)
      useTransactions().addReceiptTransaction({
        transfer: Transfer.UserReceipt,
        amount: tx.value,
        sender: tx.sender.toHex(),
        senderType: tx.senderType,
        recipient: tx.recipient.toHex(),
        recipientType: tx.recipientType,
        hash: tx.transactionHash.toHex(),
        status: tx.state,
        // Timestamp is not available for pending transactions
        timestamp: Math.ceil(Date.now() / 1000),
        title: 'Top Up',
        message: Nimiq.BufferUtils.toAscii(tx.data.raw),
        fee: tx.fee,
        shopCategory: ShopCategory.Deposit,
      })
    }, [useLocalWallet().localAddress])
  }

  /**
   * Updates the transaction history.
   */
  async function updateTransactionHistory() {
    const dbTxs: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
    const accountTxs = await getAccountTransactions(localAddress.value!)
    console.log('📡 Updating transaction history', { dbTxs, accountTxs })
    await Promise.all(accountTxs.data.map(async (tx) => {
      if (tx.sender.equals(localAddress.value) || (remoteAddress.value && tx.sender.equals(remoteAddress.value)))
        return

      const dbTx = dbTxs.find(dbTx => dbTx.hash === tx.transactionHash.toHex())
      if (dbTx) {
        // Check if the status in db was pending
        if ((dbTx.status === Nimiq.Client.TransactionState.PENDING && tx.state !== Nimiq.Client.TransactionState.PENDING) || (dbTx.timestamp !== tx.timestamp)) {
          console.log(`📬  Transaction ${tx.transactionHash.toHex()} mined with ${usePrice(tx.value).crypto.formatted}`)
          useTransactions().updateTransactionStatus({ hash: tx.transactionHash.toHex(), status: tx.state, timestamp: tx.timestamp })
        }
        return
      }

      console.log(`📬  New transaction received with ${usePrice(tx.value).crypto.formatted}`)
      useTransactions().addReceiptTransaction({
        transfer: Transfer.UserReceipt,
        amount: tx.value,
        sender: tx.sender.toHex(),
        senderType: tx.senderType,
        recipient: tx.recipient.toHex(),
        recipientType: tx.recipientType,
        hash: tx.transactionHash.toHex(),
        status: tx.state,
        timestamp: tx.timestamp,
        title: 'Top Up',
        message: Nimiq.BufferUtils.toAscii(tx.data.raw),
        fee: tx.fee,
        shopCategory: ShopCategory.Deposit,
      })
    }))
  }

  /**
   * Sends all the funds from the remote signer to the local signer.
   */
  async function drainRemoteSigner({ address, balance }: RemoteSigner) {
    const amount = await useNimiqNetwork().getAccount(address).then(account => account.data?.balance || balance)
    useTransactions().sendTx({ transfer: Transfer.RemoteToLocalImmediateReclaim, sender: address, amount })

    console.log('📡 Draining remote signer', { address: address.toUserFriendlyAddress(), amount })
  }

  /**
   * This function ensures that there is only one active remote signer with a balance greater than zero.
   * If there are multiple, it initiates transactions to transfer the balance from the remote to the local signer.
   * useSync composable later will take care of the rest.
   */
  async function ensureSingleRemoteSignerWithBalance() {
    const remoteSigners = await useConn().query<RemoteSigner[]>(SQLQuery.GetRemoteSignerWithBalance)
    if (remoteSigners.length <= 1)
      return

    console.log('😱 There are multiple remote signers with a balance greater than zero. Initiating transactions to transfer funds to the local wallet')
    remoteSigners.forEach(drainRemoteSigner)
  }

  /**
   * This function ensures that there are no deactivated remote signers with a balance greater than zero.
   * If there are, it initiates transactions to transfer the balance from the remote to the local signer.
   */
  async function ensureDeactivatedRemoteSignersWithoutBalance() {
    const remoteSigners = await useConn().query<RemoteSigner[]>(SQLQuery.GetDeactivatedRemoteSignersWithBalance).then(parseAddress)
    if (remoteSigners.length === 0)
      return

    console.log('😱 There are deactivated remote signers with a balance greater than zero. Initiating transactions to transfer funds to the local wallet')
    remoteSigners.forEach(drainRemoteSigner)
  }

  async function verifyRemoteSignersDb() {
    await useRemoteSigner().updateSignersTableBalance()
    await ensureSingleRemoteSignerWithBalance()
    await ensureDeactivatedRemoteSignersWithoutBalance()
  }

  return {
    syncWallets,
    updateBalances,
    updateTransactionHistory,

    verifyRemoteSignersDb,
  }
}
