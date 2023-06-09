<template>
    <ion-page>
        <ion-content id="main-content" style="text-align: center;">
            <h2>Confirm your phone number</h2>
            <p>We've sent you a code, please confirm.</p>
            <form :onsubmit="handleSubmit">
                <input type="text" inputmode="numeric" pattern="[0-9]*" minlength="6" maxlength="8" size="8"
                    class="pin" autofocus="true" ref="codeField"
                    @input="event => handleCodeInput((event.target as HTMLInputElement).value)">
            </form>
            <span>{{ prefill }}</span>
        </ion-content>
    </ion-page>
</template>
  
<script setup lang="ts">
import { inject, ref, onMounted, nextTick } from "vue";
import { IonPage, IonContent } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { BonusWallet } from "@/lib/bonus-wallet";

const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const router = useRouter()
const codeField = ref()
const prefill = bonusWallet.getPrefillAccessCode()
let code = ""

function handleCodeInput(newValue: string) {
    code = newValue
    codeField.value.setCustomValidity("")
    if (code.length == 8) handleSubmit()
}

function handleSubmit() {
    (async () => {
        try {
            await bonusWallet.verify(code)
            router.push('/setup/get-notified')
        } catch (e: any) {
            codeField.value.setCustomValidity(e.message || e)
            codeField.value.reportValidity()
        }
    })()
    return false
}

onMounted(() => {
    setTimeout(() => {
        codeField.value.focus()
    }, 200)
})

</script>