import type { PlainAccount, PlainTransactionDetails } from '@nimiq/core'
import type { RemoteSigner } from '@/lib/sql-queries'
import { defineStore, storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { isMockEnabled } from '@/lib/mock-mode'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { NO_ACCOUNT_ERROR, useNimiqNetwork } from '@/stores/nimiq-network'
import { usePoints } from '@/stores/points'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSyncState } from '@/stores/sync/state'

const logger = useLogger('useSync')

function isHtlcExtensionTx(tx: PlainTransactionDetails) {
  return 'hashRoot' in tx.data && tx.data.hashRoot === '0000000000000000000000000000000000000000000000000000000000000000'
}

export const useSyncBalances = defineStore('sync-balances', () => {
  const { getAllOutgoingTransactionsFromHtlcs, getBalance } = useNimiqNetwork()
  const { client, height: localHeight, consensus } = storeToRefs(useNimiqNetwork())
  const { localAddress, localBalance, pendingNimSince } = storeToRefs(useLocalWallet())
  const { isSendingTx } = storeToRefs(useLocks())
  const { remoteBalance, remoteAddress, remotePublicKey, remoteSigner } = storeToRefs(useRemoteSigner())
  const { getAllRemoteSigners, blockHeightToTimestamp } = useRemoteSigner()
  const { isUpdatingBalancesNow, shouldUpdateBalancesAgain } = storeToRefs(useSyncState())

  /**
   * Updates the local and the remote wallet balances.
   */
  async function updateBalances() {
    // Pull-to-refresh / head listeners must not overwrite mock balances with chain values.
    if (isMockEnabled)
      return

    if (isUpdatingBalancesNow.value) {
      shouldUpdateBalancesAgain.value = true
      logger.log('Balance update already running. Scheduling another update')
      return
    }

    isUpdatingBalancesNow.value = true
    try {
      do {
        shouldUpdateBalancesAgain.value = false
        await updateBalancesOnce()
      } while (shouldUpdateBalancesAgain.value)
    }
    finally {
      isUpdatingBalancesNow.value = false
    }
  }

  async function updateBalancesOnce() {
    if (localHeight.value % 10 === 0)
      usePoints().updatePointsBalance()

    if (isSendingTx.value) {
      logger.log('There is a pending transaction. Delaying updateBalances')
      return
    }

    if (localAddress.value) {
      const { data, error } = await getBalance(localAddress.value)
      if (error)
        logger.error('Error while getting local balance', error)
      if (!error || error === NO_ACCOUNT_ERROR) {
        const updatedLocalBalance = data ?? 0
        if (updatedLocalBalance === 0)
          pendingNimSince.value = 0
        else if (pendingNimSince.value === 0)
          pendingNimSince.value = Date.now()
        localBalance.value = updatedLocalBalance
      }
    }
    else {
      logger.log('Local address not found')
    }

    if (!remoteAddress.value) {
      if (localHeight.value % Nimiq.Policy.BLOCKS_PER_BATCH === 0)
        logger.warn('Remote address not found')
      return
    }

    const oldBalance = remoteBalance.value
    let newBalance = oldBalance
    let canCheckHtlcExtensions = true
    if (consensus.value === 'established') {
      const { data, error } = await getBalance(remoteAddress.value)
      if (error) {
        logger.error('Error while getting remote balance', error)
        canCheckHtlcExtensions = false
      }
      else {
        newBalance = data
      }
    }
    else {
      newBalance = remoteSigner.value?.balance ?? oldBalance
    }

    remoteBalance.value = newBalance
    if (oldBalance !== remoteBalance.value)
      logger.log(`Remote balance for ${remoteAddress.value.toUserFriendlyAddress()} is ${remoteBalance.value}, old was: ${oldBalance}`)

    if (canCheckHtlcExtensions && newBalance === 0)
      await checkMissingHtlcExtensions()
  }

  async function checkMissingHtlcExtensions() {
    const [txs, remoteSigners] = await Promise.all([
      getAllOutgoingTransactionsFromHtlcs(remoteAddress.value!),
      getAllRemoteSigners(),
    ])

    let foundNewExtension = false
    for (const tx of txs) {
      if (!isHtlcExtensionTx(tx))
        continue
      const knownRemoteSigner = remoteSigners.find((remoteSigner: RemoteSigner) => remoteSigner.address.toUserFriendlyAddress() === tx.recipient)
      if (knownRemoteSigner)
        continue

      try {
        logger.log('Found an HTLC extension that is not in the remote signer table', tx)
        const account = await client.value!.getAccount(tx.recipient) as PlainAccount
        await useRemoteSigner().updateRemoteSigner({
          active: true,
          balance: account.balance,
          address: Nimiq.Address.fromString(tx.recipient),
          publicKey: remotePublicKey.value!,
          start: tx.timestamp || await blockHeightToTimestamp(tx.validityStartHeight),
          end: 'timeout' in account ? account.timeout : Number.MAX_VALUE,
          // TODO: Proof size should be read from tx proof once all Nimiq client variants expose it consistently.
          proofSize: useRemoteSigner().remoteProofSize,
        })
        foundNewExtension = true
      }
      catch (error) {
        logger.error('Error while checking HTLC extension transaction', error)
      }
    }

    if (foundNewExtension)
      shouldUpdateBalancesAgain.value = true
  }

  return {
    updateBalances,
  }
})
