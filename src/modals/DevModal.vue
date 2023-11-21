<script setup lang="ts">
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, toastController } from '@ionic/vue'
import { Clipboard } from '@capacitor/clipboard'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useTransactions } from '@/stores/transactions'
import { useNimiqNetwork } from '@/composables/useNimiqNetwork'
import { useLocalWallet } from '@/stores/local-wallet'

const router = useRouter()
const { consensus, head, height } = useNimiqNetwork()
const { address: localAddress, balance: localBalance } = storeToRefs(useLocalWallet())
const { clearTxHistory } = useTransactions()

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
        <p>Balance: <code>{{ localBalance / 1e5 }} NIM</code></p>
        <IonButton
          :disabled="consensus !== 'established' || nimiqWallet.balanceRaw.value === 0"
          @click="instantPayWallet.deposit(nimiqWallet.balanceRaw.value)"
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
        <p @click="() => writeToClipboard(instantPayWallet.address.value?.toUserFriendlyAddress() || '')">
          Address: <code>{{ instantPayWallet.address.value?.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance (if valid): <code>{{ instantPayWallet.balance.value }} NIM</code></p>
        <p>
          Valid: <strong>{{ instantPayWallet.valid.value }}</strong> (from <strong>{{
            instantPayWallet.validityStart.value }}</strong> to
          <strong>{{ instantPayWallet.validityEnd.value }}</strong>)
        </p>
        <p>Timeouted: <strong>{{ instantPayWallet.timeouted.value }}</strong></p>
        <IonButton
          :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value === 0"
          @click="instantPayWallet.recover()"
        >
          Recover
        </IonButton>
        <IonButton
          :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value === 0"
          @click="instantPayWallet.extend()"
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
