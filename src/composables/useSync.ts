/* eslint-disable no-console */

import { storeToRefs } from 'pinia'
import { computedAsync, until } from '@vueuse/core'
import { computed } from 'vue'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'

const MAX_BLOCK_HEIGHT_MISMATCH = 5
const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = 120

export function useSync() {
  const { getAccount } = useNimiqNetwork()
  const { client, height: localHeight } = storeToRefs(useNimiqNetwork())
  const { localAddress, hasLocalWallet } = storeToRefs(useLocalWallet())
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
    const localBalance = (await getAccount(localAddress.value)).data?.balance || 0
    if (localBalance === 0)
      return

    const remoteBalance = (await getAccount(remoteAddress.value!)).data?.balance || 0

    console.log(`Local balance: ${localBalance / 1e5} NIM. Remote balance: ${remoteBalance / 1e5} NIM. ${remoteBalance === 0 ? 'Creating new HTLC' : 'Liquidating HTLC'}}`)
    console.log({ isHtlcActive: isHtlcActive.value, isRemoteOk: isRemoteOk.value })

    if (remoteBalance === 0) {
      useTransactions().sendTx({ transfer: Transfer.LocalToRemote, amount: localBalance })
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
    if (remoteBalance.value === 0)
      return
    if (htlcCanBeExtended.value)
      useTransactions().sendTx({ transfer: Transfer.ExtendRemote })
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
   * Syncs the local and the remote wallet immediately and then every time a new block is mined.
   */
  async function syncWallets() {
    if (!hasLocalWallet.value)
      return

    await until(client).toBeTruthy()
    await client.value?.waitForConsensusEstablished()

    await useRemoteSigner().init()

    console.group(`🧬  Starting to sync wallets. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
    handleFunds()
    checkRemoteValidity()
    extendValidity()
    console.groupEnd()

    client.value?.addBlockListener(async () => {
      console.group(`⛏️  New block mined. Local height: ${localHeight.value}. Remote height: ${remoteHeight.value}`)
      await updateActiveWallet()

      handleFunds()
      checkRemoteValidity()
      extendValidity()
      console.groupEnd()
    })
  }

  return {
    syncWallets,
  }
}
