<template>
    <ion-page>
        <ion-content id="main-content" style="text-align: center;">
            <h2>Verify your phone number</h2>
            <p>It's so easy. Just verify your phone number.</p>
            <form :onsubmit="handleSubmit">
                <input type="phone" class="phone" ref="phoneInput"
                    @input="event => phoneNumber = (event.target as HTMLInputElement).value" size="16">
            </form>
            <p style="font-size: 80%;">You get an SMS. Standard rates may apply.</p>
            <ion-button fill="clear" @click="router.push('/setup/get-notified')">Skip</ion-button>
        </ion-content>
    </ion-page>
</template>
  
<script setup lang="ts">
import { inject, ref, onMounted, nextTick } from "vue";
import { IonPage, IonContent, IonButton } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { BonusWallet } from "@/lib/bonus-wallet";

const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const router = useRouter()
const phoneInput = ref()
let phoneNumber = ""

function handleSubmit() {
    (async () => {
        try {
            await bonusWallet.authorize(phoneNumber)
            router.push("/setup/confirm-phone")
        } catch (e: any) {
            phoneInput.value.setCustomValidity(e.message || e)
            phoneInput.value.reportValidity()
        }
    })()
    return false
}

function shown() {
    setTimeout(() => {
        phoneInput.value.focus()
    }, 200)
}

onMounted(shown)
</script>