<template>
    <ion-menu contentId="main-content">
        <ion-content class="ion-padding">This is the menu content.</ion-content>
    </ion-menu>
    <ion-page>
        <ion-content :fullscreen="true" id="main-content">
            <ion-toolbar style="--background: transparent">
                <ion-buttons slot="start">
                    <ion-menu-button></ion-menu-button>
                </ion-buttons>
                <ion-buttons slot="end">
                    <ion-button fill="solid">BonusNIM
                        <ion-icon slot="end" :icon="chevronForwardOutline"></ion-icon>
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
                    <span class="price-change"><ion-icon slot="start" :icon="trendingUpOutline"></ion-icon> {{
                        Math.round(fiatHandler.priceChange.value * 1000) / 10 }}%</span>
                </div>
                <div class="line-topup">
                    <ion-button fill="clear">Top up
                        <ion-icon slot="end" :icon="chevronForwardOutline"></ion-icon>
                    </ion-button>
                </div>
            </div>
            <div style="height: 100rem" />
            <ion-card>
                <ion-card-header>
                    <ion-card-title>Nimiq Client</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                    <p>Initialized: <strong>{{ nimiqNetworkClient.initialized }}</strong></p>
                    <p>Consensus state: <strong>{{ nimiqNetworkClient.consensusState.value }}</strong></p>
                    <p>Head <strong>{{ nimiqNetworkClient.head.value?.height }}</strong>:
                        <code>{{ nimiqNetworkClient.head.value?.hash()?.toHex() }}</code></p>
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
                    <ion-button @click="startScan()"
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
        </ion-content>
        <ion-footer>
            <ion-toolbar>
                <ion-grid>
                    <ion-row class="ion-justify-content-center">
                        <ion-col size="8">
                            <ion-button expand="block" @click="startScan()"
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
import {
    IonAlert,
    IonPage,
    IonContent,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonHeader,
    IonMenu,
    IonFooter,
    IonButtons,
    IonRow,
    IonCol,
    IonMenuButton,
    IonGrid,
    IonIcon,
    IonTitle,
    IonToolbar,
    alertController
} from '@ionic/vue';
import { inject, onMounted, onDeactivated, onBeforeUnmount } from "vue";
import { NimiqNetworkClient } from "@/lib/nimiq-network-client";
import { NimiqWallet } from "@/lib/nimiq-wallet";
import { InstantPayWallet } from "@/lib/instant-pay-wallet";
import { FiatHandler } from "@/lib/fiat-handler";
import { StorageManager } from "@/lib/storage-manager";
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { useRouter } from 'vue-router';
import { chevronForwardOutline, trendingUpOutline } from 'ionicons/icons'

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
        if (!result.hasContent) continue
        if (!result.content.startsWith("nimiq:")) continue
        try {
            const url = new URL(result.content)
            const address = Nimiq.Address.fromString(url.pathname)
            const searchParams = new URLSearchParams(url.search)
            const amountString = searchParams.get("amount")
            if (amountString == null) continue
            const amount = Math.round(parseFloat(amountString) * 100000)
            await instantPayWallet.sendTransaction(address, amount)
            break
        } catch (e) {
            console.log(e)
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
