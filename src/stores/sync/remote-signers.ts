import type { RemoteSigner } from '@/lib/sql-queries'
import { defineStore, storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from '@/stores/conn'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { parseAddress, useRemoteSigner } from '@/stores/remote-signer'
import { useSyncBalances } from '@/stores/sync/balances'
import { useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const logger = useLogger('useSync')

export const useSyncRemoteSigners = defineStore('sync-remote-signers', () => {
  const { getBalance } = useNimiqNetwork()
  const { headTimestamp } = storeToRefs(useNimiqNetwork())
  const { isSendingTx } = storeToRefs(useLocks())
  const { pendingRemoteDrainTxs, pendingTransactions, pendingHtlcCreationTransactions, isTransactionPending, isVerifyingRemoteSignersDb } = storeToRefs(useSyncState())
  const { updateBalances } = useSyncBalances()
  const { sendTx } = useTransactions()
  const { discoverRemoteSignersFromBlockchain } = useRemoteSigner()

  /**
   * Sends all the funds from the remote signer to the local signer.
   */
  async function drainRemoteSigner({ address, end }: RemoteSigner) {
    const { data: balance, error } = (await useNimiqNetwork().getBalance(address))
    const amount = error ? 0 : balance
    if (!amount) {
      if (balance === 0) {
        logger.log('Remote signer is empty, updating balance', { address: address.toUserFriendlyAddress })
        await useConn().run(SQLQuery.UpdateRemoteBalance, [balance, address.toUserFriendlyAddress()])
      }
      else {
        logger.error(`Error while draining remote signer. ${error}`, { address: address.toUserFriendlyAddress(), amount })
      }
      return false
    }
    const transfer = end < headTimestamp.value ? Transfer.RemoteToLocalAfterTimeout : Transfer.RemoteToLocalImmediateReclaim
    const { data, error: errorTx } = await sendTx({ transfer, amount, sender: address })
    if (errorTx) {
      logger.error(`Error while draining remote signer. ${errorTx}`, { address: address.toUserFriendlyAddress(), amount })
      return false
    }
    if (data) {
      pendingRemoteDrainTxs.value.push(data.tx)
    }
    else {
      logger.error('Error while draining remote signer. No transaction returned', { address: address.toUserFriendlyAddress(), amount })
      return false
    }

    logger.log('Draining remote signer', { address: address.toUserFriendlyAddress(), amount })
    return true
  }

  async function ensureSingleRemoteActive() {
    const remoteSigners = await useConn().query<RemoteSigner[]>(SQLQuery.GetActiveRemoteSigner).then(parseAddress)
    if (remoteSigners.length <= 1)
      return false

    logger.log('😵‍💫 There are multiple active remote signers. Checking balances...', { remoteSigners })

    const remoteSignersWithBalance: RemoteSigner[] = []
    for (const remoteSigner of remoteSigners) {
      const { data: balance, error } = await getBalance(remoteSigner.address)
      if (error) {
        logger.error('Error while getting balance in ensureSingleRemoteActive', error)
        continue
      }
      if (balance > 0)
        remoteSignersWithBalance.push(remoteSigner)
    }

    if (remoteSignersWithBalance.length === 1) {
      logger.log('🫥 There is one remote signers with a balance greater than zero. Setting the one with balance as active', remoteSignersWithBalance[0].address.toUserFriendlyAddress())
      await useRemoteSigner().updateRemoteSigner({
        ...remoteSignersWithBalance[0],
        active: true,
      })
    }
    else {
      logger.log('😱 There are multiple active remote signers with a balance greater than zero. Draining them', remoteSignersWithBalance.map((x) => {
        return { ...x, address: x.address.toUserFriendlyAddress() }
      }))
      return await drainFirstRecoverableSigner(remoteSignersWithBalance)
    }

    await updateBalances()
    return false
  }

  /**
   * This function ensures that there is only one active remote signer with a balance greater than zero.
   */
  async function ensureSingleRemoteSignerWithBalance() {
    const remoteSigners = await useConn().query<RemoteSigner[]>(SQLQuery.GetRemoteSignerWithBalance).then(parseAddress)
    if (remoteSigners.length === 0)
      return false

    if (remoteSigners.length === 1) {
      const { active, balance, address, start, end, proofSize, publicKey } = remoteSigners[0]
      const { data: newBalance, error } = await getBalance(address)
      if (error) {
        logger.error('Error while getting balance in ensureSingleRemoteSignerWithBalance', error)
        return false
      }
      if (newBalance !== balance) {
        logger.error('Balance in db is different from balance in blockchain in ensureSingleRemoteSignerWithBalance', { balance, newBalance })
        await useConn().run(SQLQuery.UpdateRemoteBalance, [newBalance, address.toUserFriendlyAddress()])
        return false
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
        await updateBalances()
      }
      return false
    }

    logger.log('😱 There are multiple remote signers with a balance greater than zero. Initiating transactions to transfer funds to the local wallet', remoteSigners.map((x) => {
      return { ...x, address: x.address.toUserFriendlyAddress() }
    }))
    return await drainFirstRecoverableSigner(remoteSigners)
  }

  async function drainFirstRecoverableSigner(signers: RemoteSigner[]) {
    const recoverable = signers
      .filter(signer => signer.start < headTimestamp.value)
      .sort((a, b) => Number(a.active) - Number(b.active) || a.start - b.start)
    if (recoverable.length === 0) {
      logger.log('🫠 There are multiple remote signers with a balance greater than zero, but cannot be drained yet... Delaying draining')
      return false
    }
    return await drainRemoteSigner(recoverable[0])
  }

  async function verifyRemoteSignersDb() {
    if (isVerifyingRemoteSignersDb.value) {
      logger.log('Remote signer DB verification already running. Skipping duplicate run')
      return
    }
    if (isTransactionPending.value || isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying remote signer DB verification', { pendingRemoteDrainTxs: pendingRemoteDrainTxs.value, pendingTransactions: pendingTransactions.value, pendingHtlcCreationTransactions: pendingHtlcCreationTransactions.value })
      return
    }

    isVerifyingRemoteSignersDb.value = true
    try {
      await discoverRemoteSignersFromBlockchain()
      await useRemoteSigner().updateSignersTableBalance()
      const recoveryStarted = await ensureSingleRemoteActive()
      if (recoveryStarted || isTransactionPending.value || isSendingTx.value) {
        logger.log('Remote signer DB verification started recovery transactions. Skipping remaining checks until they settle')
        return
      }
      await ensureSingleRemoteSignerWithBalance()
    }
    finally {
      isVerifyingRemoteSignersDb.value = false
    }
  }

  return {
    drainRemoteSigner,
    verifyRemoteSignersDb,
  }
})
