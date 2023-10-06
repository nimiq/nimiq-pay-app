<script setup lang="ts">
import {
  IonAlert,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonIcon,
  IonMenu,
  IonMenuButton,
  IonPage,
  IonRow,
  IonTitle,
  IonToolbar,
  alertController,
} from '@ionic/vue'
import { inject, onBeforeUnmount, onDeactivated, onMounted } from 'vue'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { useRouter } from 'vue-router'
import { chevronForwardOutline, trendingUpOutline } from 'ionicons/icons'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { FiatHandler } from '@/lib/fiat-handler'
import { StorageManager } from '@/lib/storage-manager'

const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const fiatHandler = inject(FiatHandler.KEY) as FiatHandler
const storageManager = inject(StorageManager.KEY) as StorageManager

const router = useRouter()

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

onBeforeUnmount(stopScan)
onDeactivated(stopScan)
</script>

<template>
  <IonMenu content-id="main-content">
    <IonContent class="ion-padding">
      This is the menu content.
    </IonContent>
  </IonMenu>
  <IonPage>
    <IonContent id="main-content" :fullscreen="true">
      <IonToolbar style="--background: transparent">
        <IonButtons slot="start">
          <IonMenuButton />
        </IonButtons>
        <IonButtons slot="end">
          <IonButton fill="solid">
            BonusNIM
            <IonIcon slot="end" :icon="chevronForwardOutline" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
      <div class="balance-view">
        <div class="line-fiat">
          <span class="balance-fiat">{{ Math.floor(instantPayWallet.balance.value * fiatHandler.price.value * 100)
            / 100 }} €</span>
        </div>
        <div class="line-nim">
          <span class="balance-nim">{{ Math.floor(instantPayWallet.balance.value) }} NIM</span>
          <span class="price-change"><IonIcon slot="start" :icon="trendingUpOutline" /> {{
            Math.round(fiatHandler.priceChange.value * 1000) / 10 }}%</span>
        </div>
        <div class="line-topup">
          <IonButton fill="clear">
            Top up
            <IonIcon slot="end" :icon="chevronForwardOutline" />
          </IonButton>
        </div>
      </div>
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
          <p>Address: <code>{{ nimiqWallet.address.value?.toUserFriendlyAddress() }}</code></p>
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
            :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value == 0"
            @click="startScan()"
          >
            Pay
          </IonButton>
          <IonButton
            :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value == 0"
            @click="instantPayWallet.recover()"
          >
            Recover
          </IonButton>
          <IonButton
            :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value == 0"
            @click="instantPayWallet.extend()"
          >
            Extend
          </IonButton>
        </IonCardContent>
      </IonCard>
    </IonContent>
    <IonFooter>
      <IonToolbar>
        <IonGrid>
          <IonRow class="ion-justify-content-center">
            <IonCol size="8">
              <IonButton
                expand="block" :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value === 0"
                @click="startScan()"
              >
                Pay
              </IonButton>
            </IonCol>
          </IonRow>
        </IonGrid>
      </IonToolbar>
    </IonFooter>
  </IonPage>
</template>

<style>
.balance-view {
    padding: 4rem 1rem;
    text-align: center;
}

.line-fiat {
    font-size: 2.5em;
}

.line-nim {
    padding-top: 0.1rem;
}

.price-change {
    padding-left: 0.5rem;
}
</style>
