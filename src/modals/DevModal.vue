<script setup lang="ts">
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, toastController } from '@ionic/vue'
import { inject } from 'vue'
import { Clipboard } from '@capacitor/clipboard'
import { useRouter } from 'vue-router'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { StorageManager } from '@/lib/storage-manager'

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const storageManager = inject(StorageManager.KEY) as StorageManager
const router = useRouter()

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
  await storageManager.run('DELETE FROM tx')
  router.go(0)
}
</script>

<template>
  <ModalTemplate>
    <IonButton
        class="text-base normal-case"
        style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
        @click="() => router.go(0)">
      Reload app
    </IonButton>
    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Nimiq Client</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>Initialized: <strong>{{ nimiqNetworkClient.initialized }}</strong></p>
        <p>Peer count: <strong>{{ nimiqNetworkClient.peerCount }}</strong></p>
        <p>Consensus state: <strong>{{ nimiqNetworkClient.consensusState.value }}</strong></p>
        <p>
          Head <strong>{{ nimiqNetworkClient.head.value?.height }}</strong>:
          <code>{{ nimiqNetworkClient.head.value?.hash()?.toHex() }}</code>
        </p>
      </IonCardContent>
    </IonCard>
    <IonCard class="w-full">
      <IonCardHeader>
        <IonCardTitle>Base wallet</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p @click="() => writeToClipboard(nimiqWallet.address.value?.toUserFriendlyAddress() || '')">
          Address: <code>{{ nimiqWallet.address.value?.toUserFriendlyAddress() }}</code>
        </p>
        <p>Balance: <code>{{ nimiqWallet.balance.value }} NIM</code></p>
        <IonButton
          class="text-base normal-case"
          style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
          :disabled="nimiqNetworkClient.consensusState.value !== 'established' || nimiqWallet.balanceRaw.value === 0"
          @click="instantPayWallet.deposit(nimiqWallet.balanceRaw.value)"
        >
          Move to instant
        </IonButton>
      </IonCardContent>
    </IonCard>
    <IonCard class="w-full">
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
        <p>Timed out: <strong>{{ instantPayWallet.timedOut.value }}</strong></p>
        <IonButton
          class="text-base normal-case"
          style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
          :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timedOut.value) || instantPayWallet.balance.value === 0"
          @click="instantPayWallet.recover()"
        >
          Recover
        </IonButton>
        <IonButton
          class="text-base normal-case"
          style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
          :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timedOut.value) || instantPayWallet.balance.value === 0"
          @click="instantPayWallet.extend()"
        >
          Extend
        </IonButton>
      </IonCardContent>
    </IonCard>
    <IonButton
      class="text-base normal-case mt-5 mb-8"
      style="--background: var(--colors-darkblue-6); --color: var(--colors-darkblue); --padding-top: 9px; --padding-bottom: 10px;"
      @click="handleClearTx">
      Clear Tx History
    </IonButton>
  </ModalTemplate>
</template>
