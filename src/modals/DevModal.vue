<script setup lang="ts">
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, toastController } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { type Ref, onMounted, ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useTransactions } from '@/stores/transactions'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/transactions'
import { useConn } from '@/stores/conn'
import { Client } from '@/types/nimiq'

const router = useRouter()
const { consensus, head, height, peerCount, client } = storeToRefs(useNimiqNetwork())
const { localAddress, localBalance } = storeToRefs(useLocalWallet())
const { remoteAddress, remoteBalance, start: validityStart, end: validityEnd, isRemoteOk, isHtlcActive, hasHtlcExpired } = storeToRefs(useRemoteSigner())
const { clearTxHistory, sendTx } = useTransactions()
const { query } = useConn()
const txInMemPool: Ref<Nimiq.ClientTransactionDetails | undefined> = ref()
const htlcsFromBlockchain: Ref<{ address: string; validityStart: number; value: number; }[]> = ref([])

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
  console.log('All Transactions', transactions?.map(tx => tx.toPlain()))
  const htlcTransactions = transactions?.filter(tx => tx.recipientType === Nimiq.Account.Type.HTLC)
  console.log('HTLC Transactions', htlcTransactions?.map(tx => tx.toPlain()))
  htlcsFromBlockchain.value = htlcTransactions?.map((tx) => {
    return {
      address: tx.recipient.toUserFriendlyAddress(),
      validityStart: tx.validityStartHeight,
      value: tx.value / 1e5,
    }
  }) || []
}

onMounted(async () => {
  const res = await query('SELECT * FROM remote_signers')
  console.log('Remote Signers Table', res.length, res)
  getAllHtlcs()

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
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Nimiq Client</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>Peer count: <strong>{{ peerCount }}</strong></p>
        <p>Consensus state: <strong>{{ consensus }}</strong></p>
        <p>
          Head <strong>{{ height }}</strong>:
          <code>{{ head?.hash()?.toHex() }}</code>
        </p>
      </IonCardContent>
    </IonCard>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Base wallet</IonCardTitle>
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
        <IonCardTitle>Instant wallet</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p @click="() => writeToClipboard(remoteAddress?.toUserFriendlyAddress() || '')">
          Address: <code>{{ remoteAddress?.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance (if valid): <code>{{ remoteBalance / 1e5 }} NIM</code></p>
        <p>
          Valid: <strong>{{ isHtlcActive }}</strong> (from <strong>{{
            validityStart }}</strong> to
          <strong>{{ validityEnd }}</strong>)
        </p>
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
          <span>Recipient: {{ txInMemPool?.recipient.toUserFriendlyAddress() }}</span>
          <span>Sender: {{ txInMemPool?.sender.toUserFriendlyAddress() }}</span>
          <span>Value: {{ (txInMemPool?.value || 0) / 1e5 }} NIM</span>
          <span>State: {{ txInMemPool?.state }} </span>
          <span>Hash: {{ txInMemPool?.transactionHash.toHex() }} </span>
          <span>Network: {{ txInMemPool?.network }}</span>
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
