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
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuButton,
  IonModal,
  IonNote,

    IonPage,
    IonRouterOutlet,
    IonRow,
    IonText,
    IonTitle,
    IonToolbar,
    alertController} from '@ionic/vue'
import { inject, onBeforeUnmount, onDeactivated, onMounted , ref } from 'vue'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { useRouter } from 'vue-router'
import { chevronForwardOutline, trendingUpOutline } from 'ionicons/icons'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { FiatHandler } from '@/lib/fiat-handler'
import { StorageManager } from '@/lib/storage-manager'
</script>

<template>
    <ion-page>
        <ion-content :fullscreen="true" id="main-content">
            <ion-toolbar style="--background: transparent">
                <ion-buttons slot="start">
                    <ion-button id="main-menu-button">
                        <ion-icon :icon="menu"></ion-icon>
                    </ion-button>
                </ion-buttons>
                <ion-buttons slot="end">
                    <ion-button fill="solid">BonusNIM
                        <ion-icon slot="end" :icon="chevronForward"></ion-icon>
                    </ion-button>
                </ion-buttons>
            </ion-toolbar>
            <div class="balance-view">
                <div class="line-fiat">
                    <span class="balance-fiat">{{ Math.floor(instantPayWallet.balance.value * fiatHandler.price.value * 100)
                        / 100 }} €</span>
                </div>
                <div class="line-nim">
                    <span class="balance-nim">{{ Math.floor(instantPayWallet.balance.value) }} NIM</span>
                    <span class="price-change"><ion-icon slot="start" :icon="trendingUp"></ion-icon> {{
                        Math.round(fiatHandler.priceChange.value * 1000) / 10 }}%</span>
                </div>
                <div class="line-topup">
                    <ion-button fill="clear">Top up
                        <ion-icon slot="end" :icon="chevronForward"></ion-icon>
                    </ion-button>
                </div>
            </div>
            <ion-list v-if="instantPayWallet.transactions.value.length > 0" lines="none">
                <ion-item v-for="tx in instantPayWallet.transactions.value.slice(0, 3)" :button="true" :detail="false">
                    <ion-icon slot="start" :icon="basket" size="large"></ion-icon>
                    <ion-label>
                        <ion-text>{{ tx.title }}</ion-text><br/>
                        <ion-note color="medium">{{ tx.datetime }}</ion-note>
                    </ion-label>
                    <div slot="end">
                        <div>{{ tx.fiatAmount }}</div>
                        <ion-note color="medium">{{ tx.amount / 100000 }} NIM</ion-note>
                    </div>
                </ion-item>
                <div style="text-align: center">
                    <ion-button fill="clear">Show all</ion-button>
                </div>
            </ion-list>
            <div style="height: 100rem" />
            <ion-card>
                <ion-card-header>
                    <ion-card-title>Nimiq Client</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                    <p>Initialized: <strong>{{ nimiqNetworkClient.initialized }}</strong></p>
                    <p>Consensus state: <strong>{{ nimiqNetworkClient.consensusState.value }}</strong></p>
                    <p>Head <strong>{{ nimiqNetworkClient.head.value?.height }}</strong>:
                        <code>{{ nimiqNetworkClient.head.value?.hash()?.toHex() }}</code>
                    </p>
                </ion-card-content>
            </ion-card>
            <ion-card>
                <ion-card-header>
                    <ion-card-title>Base wallet</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                    <p>Address: <code>{{ nimiqWallet.address.value?.toUserFriendlyAddress() }}</code></p>
                    <p>Balance: <code>{{ nimiqWallet.balance.value }} NIM</code></p>
                    <ion-button @click="instantPayWallet.deposit(nimiqWallet.balanceRaw.value)"
                        :disabled="nimiqNetworkClient.consensusState.value != 'established' || nimiqWallet.balanceRaw.value == 0">Move
                        to instant
                    </ion-button>
                </ion-card-content>
            </ion-card>
            <ion-card>
                <ion-card-header>
                    <ion-card-title>Instant wallet</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                    <p>Address: <code>{{ instantPayWallet.address.value?.toUserFriendlyAddress() }}</code></p>
                    <p>Balance (if valid): <code>{{ instantPayWallet.balance.value }} NIM</code></p>
                    <p>Valid: <strong>{{ instantPayWallet.valid.value }}</strong> (from <strong>{{
                        instantPayWallet.validityStart.value }}</strong> to
                        <strong>{{ instantPayWallet.validityEnd.value }}</strong>)
                    </p>
                    <p>Timeouted: <strong>{{ instantPayWallet.timeouted.value }}</strong></p>
                    <ion-button @click="openModal('/app/pay')"
                        :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value == 0">
                        Pay
                    </ion-button>
                    <ion-button @click="instantPayWallet.recover()"
                        :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value == 0">
                        Recover
                    </ion-button>
                    <ion-button @click="instantPayWallet.extend()"
                        :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value || instantPayWallet.timeouted.value) || instantPayWallet.balance.value == 0">
                        Extend
                    </ion-button>
                </ion-card-content>
            </ion-card>
            <ion-modal ref="menuModal" trigger="main-menu-button" can-dismiss="true" :initial-breakpoint="1"
                :breakpoints="[0, 1]" handle="false" style="--height: auto">
                <ion-toolbar style="--background: transparent;">
                    <ion-buttons slot="end">
                        <ion-button @click="menuModal.$el.dismiss()"><ion-icon :icon="close"></ion-icon></ion-button>
                    </ion-buttons>
                </ion-toolbar>
                <ion-list lines="none">
                    <ion-item button :detail="false">Top Up</ion-item>
                    <ion-item button :detail="false">Withdraw</ion-item>
                    <div class="menu-list-divider"></div>
                    <ion-item button :detail="false">Activate Bluecode payments</ion-item>
                    <ion-item button :detail="false">Activate Cashback & Rewards</ion-item>
                    <div class="menu-list-divider"></div>
                    <ion-item button :detail="false">Settings</ion-item>
                    <ion-item button :detail="false">Back Up</ion-item>
                    <ion-item button :detail="false">Log Out</ion-item>
                </ion-list>
            </ion-modal>
            <ion-modal ref="modal" can-dismiss="true" handle="false" :initial-breakpoint="1" :breakpoints="[0, 1]">
                <ion-toolbar>
                    <ion-buttons slot="start" :style="{ display: backVisible ? 'flex' : 'none' }">
                        <ion-button @click="backModal"><ion-icon :icon="chevronBack"></ion-icon></ion-button>
                    </ion-buttons>
                    <ion-buttons slot="end">
                        <ion-button @click="closeModal"><ion-icon :icon="close"></ion-icon></ion-button>
                    </ion-buttons>
                </ion-toolbar>
                <ion-content class="ion-padding">
                    <ion-router-outlet></ion-router-outlet>
                </ion-content>
            </ion-modal>
        </ion-content>
        <ion-footer>
            <ion-toolbar>
                <ion-grid>
                    <ion-row class="ion-justify-content-center">
                        <ion-col size="8">
                            <ion-button expand="block" @click="openModal('/app/pay')"
                                :disabled="!(instantPayWallet.ready.value && instantPayWallet.valid.value) || instantPayWallet.balance.value == 0">Pay
                            </ion-button>
                        </ion-col>
                    </ion-row>
                </ion-grid>
            </ion-toolbar>
        </ion-footer>
    </ion-page>
</template>

<style>
.menu-list-divider {
    height: 1px;
    background-color: rgba(0,0,0,0.2);
    margin: 0.5rem 1rem;
}
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

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { FiatHandler } from '@/lib/fiat-handler'
import { StorageManager } from '@/lib/storage-manager'
import { basket, chevronBack, chevronForward, close, menu, trendingUp } from 'ionicons/icons'

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

const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const fiatHandler = inject(FiatHandler.KEY) as FiatHandler
const storageManager = inject(StorageManager.KEY) as StorageManager

const router = useRouter()
const menuModal = ref()
const modal = ref()
const backVisible = ref()

router.afterEach((to) => {
  backVisible.value = false
  if (to.path == '/app')
    closeModal()
})

function openModal(target: string) {
  router.push(target)
  modal.value.$el.present()
}

function backModal() {
  if (router.currentRoute.value.path != '/app/pay')
    router.back()
}

function closeModal() {
  modal.value.$el.dismiss()
}
</script>
