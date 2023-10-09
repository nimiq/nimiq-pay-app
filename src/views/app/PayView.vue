<template>
    <ion-page style="--background: none">
        <div class="scanner-hole"></div>
    </ion-page>
</template>

<style>
.scanner-hole {
    position: absolute;
    left: 50%;
    top: 50%;
    border: max(100vh, 100vw) solid var(--ion-background-color, #fff);
    height: min(80vh, 80vw);
    width: min(80vh, 80vw);
    transform: translate(-50%, -50%);
    border-radius: calc(max(100vh, 100vw) + 20px);
    opacity: 80%;
    box-sizing: content-box;
}
</style>

<script setup lang="ts">
import { onDeactivated, onBeforeUnmount, onMounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage } from '@ionic/vue';
import { InstantPayWallet } from "@/lib/instant-pay-wallet";
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const router = useRouter()

async function startScan() {
    await BarcodeScanner.checkPermission({ force: true })
    await BarcodeScanner.hideBackground()
    document.body.classList.add("scanner-active")
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
            const message = searchParams.get("message")
            const label = searchParams.get("label")
            const gocrypto_id = searchParams.get("gocrypto_id")
            let rail, railId
            if (gocrypto_id != null) {
                rail = "gocrypto"
                railId = gocrypto_id
            } else if (message != null && message.startsWith("Ref #") && label != null) {
                rail = "cpl"
            }
            await instantPayWallet.preparePayment({address, amount, message, label, rail, railId})
            break
        } catch (e) {
            console.log(e)
        }
    }
    await stopScan()
    router.push("/app/pay/confirm")
}

async function stopScan() {
    document.body.classList.remove("scanner-active")
    await BarcodeScanner.showBackground()
    await BarcodeScanner.stopScan()
}
onMounted(startScan)
onBeforeUnmount(stopScan)
onDeactivated(stopScan)
</script>