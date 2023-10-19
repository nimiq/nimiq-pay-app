<script setup lang="ts">
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, toastController } from '@ionic/vue'
import { inject } from 'vue'
import { Clipboard } from '@capacitor/clipboard'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { NimiqWallet } from '@/lib/nimiq-wallet'

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet

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
</script>

<template>
  <ModalTemplate>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Nimiq Client</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>Initialized: <strong>{{ nimiqNetworkClient.initialized }}</strong></p>
        <p>Consensus state: <strong>{{ nimiqNetworkClient.consensusState.value }}</strong></p>
        <p>
          Head <strong>{{ nimiqNetworkClient.head.value?.height }}</strong>:
          <code>{{ nimiqNetworkClient.head.value?.hash()?.toHex() }}</code>
        </p>
      </IonCardContent>
    </IonCard>
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Base wallet</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p @click="() => writeToClipboard(nimiqWallet.address.value?.toUserFriendlyAddress() || '')">
          Address: <code>{{ nimiqWallet.address.value?.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance: <code>{{ nimiqWallet.balance.value }} NIM</code></p>
        <IonButton
          :disabled="nimiqNetworkClient.consensusState.value !== 'established' || nimiqWallet.balanceRaw.value === 0"
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
          :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value === 0"
          @click="() => console.log('Pay clicked')"
        >
          Pay
        </IonButton>
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
  </ModalTemplate>
</template>
