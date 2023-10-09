
<template>
    <ion-page>
        <ion-content style="text-align: center;">
            <div style="padding-bottom: 2rem;" v-if="pendingPayment?.label">
                <ion-icon style="vertical-align: middle;" :icon="basket" size="large"></ion-icon>
                <span style="padding-inline-start: 0.5rem;">{{ pendingPayment?.label }}</span>
            </div>
            <div v-if="pendingPayment?.fiatAmount">
                <div class="primary-amount">{{ pendingPayment?.fiatAmount }} {{ pendingPayment?.fiatUnit }}</div>
                <div class="secondary-amount">{{ (pendingPayment?.amount ?? 0) / 100000 }} NIM</div>
            </div>
            <div v-else>
                <div class="primary-amount">{{ (pendingPayment?.amount ?? 0) / 100000 }} NIM</div>
            </div>
            <ion-button style="margin-top: 2rem;" size="large" @click="pay">Pay</ion-button>
        </ion-content>
    </ion-page>
</template>

<style>
.primary-amount {
    font-size: 2.5em;
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, inject, ref } from 'vue';
import { IonPage, IonContent, IonButton, IonLoading, IonIcon, loadingController } from '@ionic/vue';
import { InstantPayWallet } from "@/lib/instant-pay-wallet";
import { useRouter } from 'vue-router';
import { basket } from 'ionicons/icons';

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const pendingPayment = instantPayWallet.getPendingPayment()
const router = useRouter()

if (pendingPayment == null) {
    router.back()
}

async function pay() {
    if (pendingPayment == null) return
    const loading = await loadingController.create({})
    loading.present()
    await instantPayWallet.completePendingPayment(pendingPayment)
    loading.dismiss()
    router.push("/app")
}

async function cancel() {
    instantPayWallet.cancelPendingPayment()
}

onBeforeUnmount(cancel)
</script>