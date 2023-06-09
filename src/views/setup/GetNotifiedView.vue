<template>
    <ion-page>
        <ion-content id="main-content" style="text-align: center;">
            <h2>Get notified</h2>
            <p>Get notified about spendings, security, top up, challenges, and more, so you're always in the know.</p>
            <ion-icon :icon="notifications" class="icon-extra-large"></ion-icon>
            <p><ion-button @click="handlePushButton">Enable Push Notifications</ion-button></p>
            <p><ion-button fill="clear" @click="router.push('/app')">Skip for now</ion-button></p>
        </ion-content>
    </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent, IonIcon, IonButton, toastController } from '@ionic/vue';
import { PushNotifications } from '@capacitor/push-notifications';
import { useRouter } from 'vue-router';
import { notifications } from 'ionicons/icons';

const router = useRouter()

async function registerNotifications() {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
        throw new Error('Permission not granted.');
    }

    await PushNotifications.register();
}

async function handlePushButton() {
    try {
        await registerNotifications()
        router.push('/app')
    } catch (e: any) {
        (await toastController.create({ message: e.message || e, duration: 2000 })).present()
    }
}

</script>