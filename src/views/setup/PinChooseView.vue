<template>
    <ion-page>
        <ion-content id="main-content" style="text-align: center;">
            <h2>Choose PIN</h2>
            <p>Just a PIN<br>No personal data needed.</p>
            <form :onsubmit="handleSubmit">
                <input type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="4" size="4"
                    placeholder="••••" class="pin" autofocus="true" ref="pinField"
                    @input="event => handlePinInput((event.target as HTMLInputElement).value)">
            </form>
        </ion-content>
    </ion-page>
</template>

<script setup lang="ts">
import { inject, ref, onMounted, nextTick } from "vue";
import { IonPage, IonContent } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { StorageManager } from "@/lib/storage-manager";

const storageManager = inject(StorageManager.KEY) as StorageManager
const router = useRouter()
const pinField = ref()
let pin = ""

function handlePinInput(newValue: string) {
    pin = newValue
    if (pin.length == 4) handleSubmit()
}

function handleSubmit() {
    if (pin.length < 4) return false
    storageManager.cancelNewPin()
    storageManager.startNewPin(pin)
    router.push('confirm-pin')
    return false
}

function shown() {
    storageManager.cancelNewPin()
    setTimeout(() => {
        pinField.value.focus()
    }, 200)
}

onMounted(shown)
</script>