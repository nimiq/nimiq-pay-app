import type { PlainAccount } from '@nimiq/core'
import type { SwapHtlc } from '@/types/swapHtlcs'
import { until } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { SQLQuery } from '@/lib/sql-queries'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { NO_ACCOUNT_ERROR, useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSyncState } from '@/stores/sync/state'
import { useTransactions } from '@/stores/transactions'
import { getSwapHtlcTxHash } from '@/types/swapHtlcs'
import { Transfer } from '@/types/transactions'

const logger = useLogger('useSync')
const { setToast } = useToast()

export const useSyncHtlc = defineStore('sync-htlc', () => {
  const { getBalance } = useNimiqNetwork()
  const { client, height: localHeight, consensus, headTimestamp, networkId } = storeToRefs(useNimiqNetwork())
  const { localAddress, localBalance, localWallet } = storeToRefs(useLocalWallet())
  const { isProcessingRemote, isSendingTx, htlcCheckLock } = storeToRefs(useLocks())
  const { remoteHeight, remoteBalance, remoteAddress, hasHtlcExpired, end, start, isHtlcActive, isHtlcPending, isRemoteOk } = storeToRefs(useRemoteSigner())
  const { sendTx } = useTransactions()
  const { htlcThreshold } = storeToRefs(useApp())
  const { isTransactionPending, nodesAreSynced, pendingRemoteDrainTxs, pendingTransactions, pendingHtlcCreationTransactions, htlcCanBeExtended } = storeToRefs(useSyncState())

  /**
   * If the local wallet gets some funds, move them to the remote wallet immediately.
   */
  async function handleFunds(bypassThreshold = false) {
    if (localBalance.value === 0)
      return
    if (isTransactionPending.value || isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying handleFunds', { pendingRemoteDrainTxs: pendingRemoteDrainTxs.value, pendingTransactions: pendingTransactions.value, pendingHtlcCreationTransactions: pendingHtlcCreationTransactions.value })
      return
    }

    // Let micro-payments accumulate in the local wallet until they reach the threshold before
    // topping up the HTLC, instead of creating/topping-up an HTLC for every payment. Only applies
    // once a secured balance exists: with remoteBalance 0 there's nothing to batch onto, so a
    // below-threshold deposit would otherwise sit pending forever — secure it immediately instead.
    // Gated before the remote-balance RPC below so an accumulating top-up skips it.
    // Expired signers must still hit the RPC: the cosigner can lag behind a timeout reclaim.
    // (localBalance is already > 0 here, so a threshold of 0 keeps the previous immediate behavior.)
    if (!bypassThreshold && !hasHtlcExpired.value && remoteBalance.value > 0 && localBalance.value < htlcThreshold.value) {
      logger.log(`💤 Local balance ${localBalance.value / 1e5} NIM below HTLC threshold ${htlcThreshold.value / 1e5} NIM — accumulating, skipping HTLC create/top-up`)
      return
    }

    let remoteBalanceOnChain = 0
    if (remoteAddress.value) {
      const { data, error } = await getBalance(remoteAddress.value)
      if (error && error !== NO_ACCOUNT_ERROR) {
        logger.error('Error while getting remote balance before handling funds', error)
        return
      }
      remoteBalanceOnChain = data ?? 0
    }

    logger.log(`Local balance: ${localBalance.value / 1e5} NIM. Remote balance: ${remoteBalanceOnChain / 1e5} NIM. ${remoteBalanceOnChain === 0 ? 'Creating new HTLC' : 'Liquidating HTLC'}`)
    logger.log({ isHtlcActive: isHtlcActive.value, isRemoteOk: isRemoteOk.value, isHtlcPending: isHtlcPending.value })

    if (remoteBalanceOnChain === 0 && !isHtlcPending.value) {
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
      const liquidationContext = {
        localBalance: localBalance.value,
        remoteBalance: remoteBalanceOnChain,
        storeRemoteBalance: remoteBalance.value,
        remoteAddress: remoteAddress.value?.toUserFriendlyAddress(),
        localHeight: localHeight.value,
        remoteHeight: remoteHeight.value,
        nodesAreSynced: nodesAreSynced.value,
        isHtlcActive: isHtlcActive.value,
        isRemoteOk: isRemoteOk.value,
        isHtlcPending: isHtlcPending.value,
        pendingRemoteDrainTxs: pendingRemoteDrainTxs.value.length,
        pendingTransactions: pendingTransactions.value.length,
        pendingHtlcCreationTransactions: pendingHtlcCreationTransactions.value.length,
      }
      logger.log('Preparing to top up deposit by liquidating active HTLC', liquidationContext)
      isProcessingRemote.value = true
      const { data, error } = await sendTx({ transfer: Transfer.RemoteToLocal })
      if (error) {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while topping up deposit'), type: 'error', duration: 5000 })
        logger.error('Error while liquidating HTLC', error, liquidationContext)
        return
      }
      if (data) {
        pendingRemoteDrainTxs.value.push(data.tx)
      }
      else {
        logger.error('No transaction returned from sendTx when liquidating HTLC')
      }
      return
    }

    logger.log(`Delaying deposit. isHtlcActive: ${isHtlcActive.value}, isRemoteOk: ${isRemoteOk.value}, isHtlcPending: ${isHtlcPending.value}`)
  }

  async function extendValidity() {
    if (remoteBalance.value === 0 || !isHtlcActive.value || remoteHeight.value === -1)
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
        const { data, error: claimError } = await sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: remoteBalance.value, sender: remoteAddress.value! })
        if (claimError || !data)
          logger.error('Error while claiming funds from Remote after extending error', { claimError, data })
      }
    }
  }

  /**
   * If the server misses the deadline to finalize the HTLC, the local wallet has to recover the funds.
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
      const { data, error } = await sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout, amount: remoteBalance.value, sender: remoteAddress.value! })
      if (error) {
        isProcessingRemote.value = false
        setToast({ message: i18n.t('Error while recovering deposit'), type: 'error', duration: 5000 })
        logger.error('Error while recovering funds from Remote', error)
      }
      else if (data) {
        pendingRemoteDrainTxs.value.push(data.tx)
      }
      else {
        logger.error('No transaction returned from sendTx when recovering HTLC in checkRemoteValidity')
      }
    }
  }

  async function checkHtlcState() {
    if (isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying checkHtlcState')
      return
    }

    if (remoteBalance.value > 0 && start.value < headTimestamp.value && end.value > headTimestamp.value) {
      if (pendingHtlcCreationTransactions.value.length === 0) {
        logger.log('No pending HTLC transactions')
        isHtlcActive.value = true
        return
      }
      await until(client).not.toBeUndefined()
      await client.value!.waitForConsensusEstablished()
      try {
        const txs = await Promise.all(pendingHtlcCreationTransactions.value.map(tx => client.value!.getTransaction(tx.transactionHash)))
        logger.log('Checking pending HTLC transactions', txs)
        isHtlcActive.value = txs.every(tx => tx && tx.state === 'confirmed')
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

  let lastExpiredSwapHtlcCheckTimestamp = 0
  async function checkExpiredSwapHtlcs() {
    if (htlcCheckLock.value)
      return
    htlcCheckLock.value = true
    try {
      const heightTimestamp = headTimestamp.value > 1 ? headTimestamp.value : Date.now()
      if (heightTimestamp <= lastExpiredSwapHtlcCheckTimestamp + Nimiq.Policy.BLOCKS_PER_BATCH)
        return
      lastExpiredSwapHtlcCheckTimestamp = heightTimestamp

      const conn = useConn()
      const expiredSwapHtlcs = await conn.query<SwapHtlc[]>(SQLQuery.GetExpiredSwapHtlcs, [heightTimestamp])
      logger.log('Expired swap HTLCs:', expiredSwapHtlcs)

      const hasPolygonRows = expiredSwapHtlcs.some(htlc => htlc.address.startsWith('0x'))
      // Loaded once per sweep — dynamic import breaks a polygon-usdt → useSync circular import.
      const polygonUsdt = hasPolygonRows ? (await import('@/stores/polygon-usdt')).usePolygonUsdt() : null

      for (const htlc of expiredSwapHtlcs) {
        if (htlc.address.startsWith('0x')) {
          await handleExpiredPolygonSwapHtlc(htlc, polygonUsdt!)
          continue
        }

        try {
          const account = await client.value!.getAccount(htlc.address) as PlainAccount
          if (!account.balance) {
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
          if (txDetails.state !== 'invalidated')
            useTransactions().setSwapHtlcRefunded(htlc.address)
          else
            logger.error('Error while sending refund swap HTLC tx', txDetails)
        }
        catch (error) {
          logger.error('Error while refunding swap HTLC', error)
        }
      }
      conn.run(SQLQuery.DeleteExpiredSwapQuotes, [heightTimestamp])
    }
    finally {
      htlcCheckLock.value = false
    }
  }

  async function handleExpiredPolygonSwapHtlc(htlc: SwapHtlc, polygonUsdt: ReturnType<typeof import('@/stores/polygon-usdt').usePolygonUsdt>) {
    // Pre-migration rows have no on-chain HTLC ID; can't broadcast refund. Fall back to
    // the original cosmetic-only behavior so the UI still moves the tx out of "pending".
    if (!htlc.htlc_id) {
      await useConn().run(SQLQuery.DeleteSwapHtlc, [htlc.address])
      await useTransactions().updateTransactionStatus({ hash: htlc.address, status: 'expired', timestamp: undefined })
      return
    }

    try {
      const result = await polygonUsdt.refundPolygonSwapHtlc(htlc)
      if (result.refunded || !result.preimage)
        return

      logger.log('Skipping Polygon refund — Lightning preimage arrived late', htlc)
      const txHash = getSwapHtlcTxHash(htlc)
      if (txHash)
        await polygonUsdt.updateSingleTransaction(txHash)
      else
        await useConn().run(SQLQuery.DeleteSwapHtlc, [htlc.address])
    }
    catch (error) {
      // Leave the row in place so the next sweep retries. refund(...) reverts on already-refunded
      // HTLCs, so retries are safe.
      logger.error('Polygon HTLC refund failed; will retry next sweep', error)
    }
  }

  async function maybeCheckHtlcState() {
    if (consensus.value !== 'established')
      return
    if (localHeight.value % 10 !== 0)
      return
    if (htlcCheckLock.value)
      return

    htlcCheckLock.value = true
    await checkHtlcState()
    htlcCheckLock.value = false
  }

  return {
    handleFunds,
    extendValidity,
    checkRemoteValidity,
    checkHtlcState,
    checkExpiredSwapHtlcs,
    maybeCheckHtlcState,
  }
})
