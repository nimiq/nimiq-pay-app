<script setup lang="ts">
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, toastController } from '@ionic/vue'
import { inject, onBeforeUnmount, onDeactivated } from 'vue'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { Clipboard } from '@capacitor/clipboard'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { NimiqWallet } from '@/lib/nimiq-wallet'

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet

async function startScan() {
  await BarcodeScanner.checkPermission({ force: true })
  await BarcodeScanner.hideBackground()
  while (true) {
    const result = await BarcodeScanner.startScan()
    if (!result.hasContent)
      continue
    if (!result.content.startsWith('nimiq:'))
      continue
    try {
      const url = new URL(result.content)
      const address = Nimiq.Address.fromString(url.pathname)
      const searchParams = new URLSearchParams(url.search)
      const amountString = searchParams.get('amount')
      if (amountString == null)
        continue
      const amount = Math.round(Number.parseFloat(amountString) * 100000)
      await instantPayWallet.sendTransaction(address, amount)
      break
    }
    catch (e) {
      console.error(e)
    }
  }
  await stopScan()
}

async function stopScan() {
  await BarcodeScanner.showBackground()
  await BarcodeScanner.stopScan()
}

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

onBeforeUnmount(stopScan)
onDeactivated(stopScan)
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
        <p>Address: <code>{{ instantPayWallet.address.value?.toUserFriendlyAddress() }}</code></p>
        <p>Balance (if valid): <code>{{ instantPayWallet.balance.value }} NIM</code></p>
        <p>
          Valid: <strong>{{ instantPayWallet.valid.value }}</strong> (from <strong>{{
            instantPayWallet.validityStart.value }}</strong> to
          <strong>{{ instantPayWallet.validityEnd.value }}</strong>)
        </p>
        <p>Timeouted: <strong>{{ instantPayWallet.timeouted.value }}</strong></p>
        <IonButton
          :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value === 0"
          @click="startScan()"
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
