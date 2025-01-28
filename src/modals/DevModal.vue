<script setup lang="ts">
import type { PlainTransactionDetails } from '@nimiq/core'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA } from '@/stores/sync'
import { useTransactions } from '@/stores/transactions'
import { Transfer } from '@/types/transactions'
import { Clipboard } from '@capacitor/clipboard'
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, toastController } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { onMounted, type Ref, ref } from 'vue'
import { useRouter } from 'vue-router'

const logger = useLogger('DevModal')

// Note: no translations in this file as it's for dev purposes only.

const router = useRouter()
const { consensus, head, height, peerCount, client, networkName } = storeToRefs(useNimiqNetwork())
const { localAddress, localBalance } = storeToRefs(useLocalWallet())
const { remoteAddress, remoteBalance, start: validityStart, end: validityEnd, isRemoteOk, isHtlcActive, hasHtlcExpired } = storeToRefs(useRemoteSigner())
const { headChangePendingDrainLock, htlcCheckLock, headChangeUpdatesLock, isNetworkReconnecting, isProcessingRemote, isSendingTx, isSyncingWallets, isUpdatingTransactions } = storeToRefs(useLocks())
const { clearTxHistory, sendTx } = useTransactions()
const { query } = useConn()
const txInMemPool: Ref<PlainTransactionDetails | undefined> = ref()
const htlcsFromBlockchain: Ref<{ address: string, validityStart: number, value: number }[]> = ref([])

async function writeToClipboard(string: string) {
  await Clipboard.write({
    string,
  })
  const toast = await toastController.create({
    message: 'Address copied to clipboard',
    duration: 1500,
    position: 'bottom',
  })

  await toast.present()
};

async function handleClearTx() {
  // Clear tx table
  await clearTxHistory()
  router.go(0)
}

async function getAllHtlcs() {
  const transactions = await client.value?.getTransactionsByAddress(localAddress.value)
  logger.log('All Transactions from Blockchain', transactions?.map(tx => tx))
  const htlcTransactions = transactions?.filter(tx => tx.data.type === 'htlc')
  htlcsFromBlockchain.value = htlcTransactions?.map((tx) => {
    return {
      address: tx.recipient,
      validityStart: tx.validityStartHeight,
      value: tx.value / 1e5,
    }
  }) || []
}

onMounted(async () => {
  getAllHtlcs()

  const remoteSignerTable = await query('SELECT * FROM remote_signers')

  logger.log('Remote Signers Table', remoteSignerTable.length, remoteSignerTable)
  const activeSigner = await query('SELECT * FROM remote_signers WHERE active = 1')

  logger.log('Active Signer', activeSigner)

  const transacions = await query('SELECT * FROM transactions')

  logger.log('Transactions from DB', transacions)

  const priceTable = await query('SELECT * FROM prices')

  logger.log('Price table', priceTable)

  const pendingSwapQuotes = await query(SQLQuery.GetAllSwapQuotes)

  logger.log('Pending Swap Quotes', pendingSwapQuotes)

  client.value?.addTransactionListener(async (tx) => {
    txInMemPool.value = tx
  }, [localAddress.value])
})
</script>

<template>
  <ModalTemplate>
    <IonButton class="w-full" @click="() => router.go(0)">
      Reload
    </IonButton>
    <IonButton class="w-full" @click="() => useNimiqNetwork().reconnect()">
      Reconnect to Network
    </IonButton>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Nimiq Client</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>Peer count: <strong>{{ peerCount }}</strong></p>
        <p>Consensus state: <strong>{{ consensus }}</strong></p>
        <p>
          Head <strong>{{ height }}</strong>:
          <code>{{ head?.hash }}</code>
        </p>
        <p>Network: <strong>{{ networkName }}</strong></p>
      </IonCardContent>
    </IonCard>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Local Wallet</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p @click="() => writeToClipboard(localAddress && localAddress.toUserFriendlyAddress() || '')">
          Address: <code>{{ localAddress && localAddress.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance: <code>{{ localBalance / 1e5 }} NIM</code></p>
        <IonButton
          :disabled="consensus !== 'established' || localBalance === 0"
          @click="sendTx({ transfer: Transfer.LocalToRemote })"
        >
          Move
          to instant
        </IonButton>
      </IonCardContent>
    </IonCard>

    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Remote Wallet</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p @click="() => writeToClipboard(remoteAddress?.toUserFriendlyAddress() || '')">
          Address: <code>{{ remoteAddress?.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance (if valid): <code>{{ remoteBalance / 1e5 }} NIM</code></p>
        <p>
          Valid: <strong>{{ isHtlcActive }}</strong>
          (from <strong>{{ validityStart }}</strong>
          to <strong>{{ validityEnd }}</strong>)
        </p>
        <p>Will be extended in: <strong> {{ Math.ceil(validityEnd - (validityEnd - validityStart) / 2) - MAX_BLOCKS_HALF_BEFORE_AUTO_EXTEND_PLEASE_DO_IT_WHENEVER_YOU_FEEL_LIKE_NO_STRESS_PURA_VIDA + 1 }}</strong></p>
        <p>Timeouted: <strong>{{ hasHtlcExpired }}</strong></p>
        <IonButton
          :disabled="!(isRemoteOk || hasHtlcExpired) || remoteBalance === 0"
          @click="sendTx({ transfer: Transfer.RemoteToLocal })"
        >
          Recover
        </IonButton>
        <IonButton
          :disabled="!(isRemoteOk || hasHtlcExpired) || remoteBalance === 0"
          @click="sendTx({ transfer: Transfer.ExtendRemote })"
        >
          Extend
        </IonButton>
      </IonCardContent>
    </IonCard>

    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Tx Listener</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="flex flex-col">
          <span>Recipient: {{ txInMemPool?.recipient }}</span>
          <span>Sender: {{ txInMemPool?.sender }}</span>
          <span>Value: {{ (txInMemPool?.value || 0) / 1e5 }} NIM</span>
          <span>State: {{ txInMemPool?.state }} </span>
          <span>Hash: {{ txInMemPool?.transactionHash }} </span>
          <span>Network: {{ txInMemPool?.network }}</span>
        </p>
      </IonCardContent>
    </IonCard>

    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Locks</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p class="flex flex-col">
          <span>Head change pending drain lock: {{ headChangePendingDrainLock }}</span>
          <span>HTLC check lock: {{ htlcCheckLock }}</span>
          <span>Head change updates lock: {{ headChangeUpdatesLock }}</span>
          <span>Network reconnecting: {{ isNetworkReconnecting }}</span>
          <span>Processing remote: {{ isProcessingRemote }}</span>
          <span>Sending tx: {{ isSendingTx }}</span>
          <span>Syncing wallets: {{ isSyncingWallets }}</span>
          <span>Updating transactions: {{ isUpdatingTransactions }}</span>
        </p>
      </IonCardContent>
    </IonCard>

    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Previous HTLC from blockchain</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p v-for="htlc in htlcsFromBlockchain" :key="htlc.address" class="flex flex-col">
          <span>Address: {{ htlc.address }}</span>
          <span>Value (not current one): {{ htlc.value }} NIM</span>
          <span>Valid from: {{ htlc.validityStart }}</span>
          <span>-----</span>
        </p>
      </IonCardContent>
    </IonCard>

    <IonButton @click="handleClearTx">
      Clear Tx History
    </IonButton>
  </ModalTemplate>
</template>
