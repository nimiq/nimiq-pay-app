<script setup lang="ts">
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, toastController } from '@ionic/vue'
import Nimiq from '@nimiq/core-web'
import { Clipboard } from '@capacitor/clipboard'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useTransactions } from '@/stores/transactions'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/database'

const router = useRouter()
const { consensus, head, height } = useNimiqNetwork()
const { address: localAddress, balance: localBalance } = storeToRefs(useLocalWallet())
const { remoteAddress, remoteBalance, start: validityStart, end: validityEnd, isRemoteOk, isHtlcActive, hasHtlcExpired } = storeToRefs(useRemoteSigner())
const { clearTxHistory, sendTx } = useTransactions()

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
        <p @click="() => writeToClipboard(localAddress.toUserFriendlyAddress() || '')">
          Address: <code>{{ localAddress.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance: <code>{{ localBalance }} NIM</code></p>
        <IonButton
          :disabled="consensus !== Nimiq.Client.ConsensusState.ESTABLISHED || localBalance === 0"
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
        <p>Balance (if valid): <code>{{ remoteBalance }} NIM</code></p>
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
