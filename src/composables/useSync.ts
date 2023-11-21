import { storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import { computed } from 'vue'
import { useNimiqNetwork } from './useNimiqNetwork'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/database'

const MAX_BLOCK_HEIGHT_MISMATCH = 5
const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA = 120

export function useSync() {
  const { client, height: localHeight } = useNimiqNetwork()
  const { balance: localBalance, hasLocalWallet } = storeToRefs(useLocalWallet())
  const { remoteHeight, remoteBalance, hasHtlcExpired, end, start } = storeToRefs(useRemoteSigner())

  // Whether the remote wallet is synced with the local wallet or not.
  // We allow a difference of MAX_BLOCK_HEIGHT_MISMATCH blocks between the two wallets.
  const nodesAreSynced = computedAsync(() => remoteHeight.value > localHeight.value - MAX_BLOCK_HEIGHT_MISMATCH && remoteHeight.value < localHeight.value + MAX_BLOCK_HEIGHT_MISMATCH, false)

  // Checks if the sum of current block and CONSTANT is greater than the middle block of the HTLC validity.
  const htlcCanBeExtended = computed(() => end.value - (end.value - start.value) / 2 > localHeight.value + MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA)

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
    if (localBalance.value === 0 || nodesAreSynced.value)
      return
    useTransactions().sendTx({ transfer: remoteBalance.value > 0 ? Transfer.RemoteToLocal : Transfer.LocalToRemote })
  }

  function extendValidity() {
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
    if (!hasHtlcExpired.value)
      useTransactions().sendTx({ transfer: Transfer.RemoteToLocalAfterTimeout })
  }

  /**
   * Syncs the local and the remote wallet immediately and then every time a new block is mined.
   */
  async function syncWallets() {
    if (!hasLocalWallet.value)
      return

    await client.value?.waitForConsensusEstablished()

    handleFunds()
    checkRemoteValidity()
    extendValidity()

    client.value?.addBlockListener(handleFunds)
    client.value?.addBlockListener(checkRemoteValidity)
    client.value?.addBlockListener(extendValidity)
  }

  return {
    syncWallets,
  }
}
