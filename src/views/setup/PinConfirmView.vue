<template>
    <ion-page>
        <ion-content id="main-content" style="text-align: center;">
            <h2>Confirm your PIN</h2>
            <p>Just a PIN<br>No personal data needed.</p>
            <form :onsubmit="handleSubmit">
                <input type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="4" size="4"
                    placeholder="••••" class="pin" autofocus="true" id="pin-input" ref="pinField"
                    @input="event => handlePinInput((event.target as HTMLInputElement).value)"
                    @keydown="handlePinInputKeyEvent">
            </form>
        </ion-content>
    </ion-page>
</template>

<script setup lang="ts">
import { inject, ref, onMounted, nextTick } from "vue";
import { IonPage, IonContent, IonButton } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { StorageManager } from "@/lib/storage-manager";

const storageManager = inject(StorageManager.KEY) as StorageManager
const router = useRouter()
const pinField = ref()
let pin = ""

function handlePinInputKeyEvent(event: KeyboardEvent) {
    if (pin == "" && event.key == 'Backspace') {
        router.back()
    }
}

function handlePinInput(newValue: string) {
    pin = newValue
    pinField.value.setCustomValidity("")
    if (pin.length == 4) handleSubmit()
}

function handleSubmit() {
    (async () => {
        try {
            await storageManager.confirmNewPin(pin)
            router.push('/setup/enter-phone')
        } catch (e: any) {
            pinField.value.setCustomValidity(e.message || e)
            pinField.value.reportValidity()
        }
    })()
    return false
}

onMounted(() => {
    if (!storageManager.isPinAssigningActive()) {
        router.back()
        return
    }
    setTimeout(() => {
        pinField.value.focus()
    }, 200)
})

</script>