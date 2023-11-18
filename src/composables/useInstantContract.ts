import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRemoteSignerApi } from './useApi'
import { useNimiqNetwork } from './useNimiqNetwork'
import { useTxDatabase, useWalletDatabase } from './useDatabase'
import { createResolveProof, getExtendedTx } from '@/lib/tx'
import type { AsyncOption } from '@/types'
import { WalletStatus, WalletType } from '@/types/database'
import { useLocalWallet } from '@/stores/local-wallet'
import type { RemoteState } from '@/types/api'

const MAX_BLOCK_HEIGHT_MISMATCH = 5
const MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND = 120

export async function useInstantContract() {
  const { getStatus, getState, sendTransaction } = useRemoteSignerApi()
  const { head, client } = useNimiqNetwork()
  const { insertWallet, updateWallet } = useWalletDatabase()
  const { localWallet } = storeToRefs(useLocalWallet())
  const { insertTx } = useTxDatabase()

  const nextAddress = ref<Nimiq.Address>()

  const remoteSigner = ref<RemoteState>()
  watch([nextAddress, localWallet], async () => {
    const address = nextAddress.value || localWallet.value?.address
    if (!address)
      throw new Error('No address')
    const { data: wallet, error } = await getState({ address })
    if (error)
      throw new Error(error)
    remoteSigner.value = wallet
  })
  const remoteSignerIsValid = computed(() => {
    if (!remoteSigner.value || !head.value)
      return false
    const { validityEnd: end, validityStart: start } = remoteSigner.value
    return start < head.value!.height && end > head.value!.height
  })

  const statusReady = computed(async () => {
    const { data, error } = await getStatus()
    if (error)
      return false
    const bottomLimit = head.value!.height - MAX_BLOCK_HEIGHT_MISMATCH
    const topLimit = head.value!.height + MAX_BLOCK_HEIGHT_MISMATCH
    return data!.blockHeight > bottomLimit && data!.blockHeight < topLimit
  })

  const isValid = ({ validityEnd: end, validityStart: start }: RemoteState) => {
    return start < head.value!.height && end > head.value!.height
  }

  async function sync(): AsyncOption<string> {
    await client.value?.waitForConsensusEstablished()
    if (!await statusReady.value)
      return 'Status not ready'
    const { data: wallets = [], error } = await selectWallets({ status: WalletStatus.ACTIVE })
    if (error)
      return error

    // Update the validity of all pending wallets
    const pendingAddresses = wallets.filter(({ status }) => status === WalletStatus.PENDING).map(({ id }) => id)
    const pendingPromises = pendingAddresses.map(async (id) => {
      const wallet = await getState({ address: id })
      if (wallet.error || !wallet.data)
        return wallet.error
      const w = wallet.data!
      updateWallet({ start: w.validityStart, end: w.validityEnd, proofSize: w.serviceSignatureProofSize, id: w.address })
    })

    const activeWallets = wallets
      .filter(({ status }) => status === WalletStatus.ACTIVE)
      .filter(({ end, start }) => end - (end - start) / 2 < head.value!.height + MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND)
      .map(({ id }) => extend(id))

    await Promise.all([...pendingPromises, ...activeWallets])
  }

  // FIXME Maybe move this function outside of this composable
  async function extend(address: string) {
    await client.value?.waitForConsensusEstablished()
    const { data: status } = await getStatus()
    const account = await client.value?.getAccount(address)
    const tx = getExtendedTx({ localWallet, address, remoteSigner, status })

    if (await statusReady.value && remoteSignerIsValid.value) {
      tx.proof = createResolveProof({ localWallet, tx, remoteSigner, mode: 'early' })
      const { data: receipt, error } = await sendTransaction({ address, tx })
      if (error)
        throw new Error(error)
      const signedTx = Nimiq.Transaction.fromAny(receipt!.details)
      nextAddress.value = signedTx.recipient
      client.value!.sendTransaction(signedTx)
      await insertTx({
        id: tx.hash().toHex(),
        ts: Date.now() / 1000,
        amount: tx.value,
        wlId: tx.sender.toUserFriendlyAddress(),
        peerId: tx.recipient.toUserFriendlyAddress(),
        raw: Nimiq.BufferUtils.toHex(signedTx.serializeContent()),
      })
    }
    else if (account instanceof Nimiq.HashedTimeLockedContract && account.timeout < head.value!.height) {
      tx.proof = createResolveProof({ localWallet, tx, remoteSigner, mode: 'timeout' })
      nextAddress.value = tx.recipient
      client.value!.sendTransaction(tx)
      await insertTx({
        id: tx.hash().toHex(),
        ts: Date.now() / 1000,
        amount: tx.value,
        wlId: tx.sender.toUserFriendlyAddress(),
        peerId: tx.recipient.toUserFriendlyAddress(),
        raw: Nimiq.BufferUtils.toHex(tx.serializeContent()),
      })
    }
    // else {} // Case not handled
    insertWallet({
      status: WalletStatus.Emptied,
      type: WalletType.Instant,
      address: tx.sender.toUserFriendlyAddress(),
      balance: tx.value,
      active: true,
      start: tx.validityStart,
      end: tx.validityEnd,
    })
  }

  async function updateReactive(): AsyncOption<string> {
    await client.value?.waitForConsensusEstablished()
    if (!await statusReady.value)
      return 'Status not ready'

    let wallets

    const hasActiveWallets = (await countByStatus({ status: WalletStatus.ACTIVE })).data!
    const hasPendingWallets = (await countByStatus({ status: WalletStatus.PENDING })).data!
    if (hasActiveWallets || hasPendingWallets) {
      const { data: _wallets, error: errorSelect } = await selectWallets({ status: WalletStatus.ACTIVE || WalletStatus.PENDING })
      if (errorSelect)
        return errorSelect
      wallets = _wallets
    }
    else {
      const wallet = await getState({ address: localWallet.value?.address })
      if (wallet.error)
        return wallet.error
      wallets = [{ id: wallet.data!.address, start: wallet.data!.validityStart, end: wallet.data!.validityEnd, balance: wallet.data!.balance }]
    }
  // TODO
  }
  console.warn()

  return {
    sync,
  }
}
