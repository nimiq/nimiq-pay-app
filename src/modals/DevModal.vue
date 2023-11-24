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

const router = useRouter()
const { consensus, head, height, peerCount, client } = storeToRefs(useNimiqNetwork())
const { localAddress, localBalance } = storeToRefs(useLocalWallet())
const { remoteAddress, remoteBalance, start: validityStart, end: validityEnd, isRemoteOk, isHtlcActive, hasHtlcExpired } = storeToRefs(useRemoteSigner())
const { clearTxHistory, sendTx } = useTransactions()
const { query } = useConn()
const txInMemPool: Ref<Nimiq.ClientTransactionDetails | undefined> = ref()

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

onMounted(async () => {
  const res = await query('SELECT * FROM remote_signers')
  console.log('Remote Signers Table', res.length, res)

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
    <IonButton @click="handleClearTx">
      Clear Tx History
    </IonButton>
  </ModalTemplate>
</template>
