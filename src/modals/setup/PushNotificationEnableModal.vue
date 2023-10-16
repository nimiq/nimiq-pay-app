<script setup lang="ts">
import { IonButton, toastController } from '@ionic/vue'
import { useRouter } from 'vue-router'
import { PushNotifications } from '@capacitor/push-notifications'
import NotificationBell from '@/components/icons/notification-bell.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'

const router = useRouter()

async function registerNotifications() {
  let permStatus = await PushNotifications.checkPermissions()

  if (permStatus.receive === 'prompt')
    permStatus = await PushNotifications.requestPermissions()

  if (permStatus.receive !== 'granted')
    throw new Error('Permission not granted.')

  await PushNotifications.register()
}

async function handlePushButton() {
  try {
    await registerNotifications()
    router.replace('/app')
  }
  catch (e: any) {
    (await toastController.create({ message: e.message || e, duration: 2000 })).present()
  }
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      Get notified
    </template>
    <template #subtitle>
      Get notified about spendings, security, top up, challenges, and more, so you're always in the know
    </template>
    <NotificationBell class="w-36 h-36" />
    <div class="self-end w-full mb-2">
      <IonButton expand="block" @click="handlePushButton">
        Enable Push Notifications
      </IonButton>
      <IonButton fill="clear" expand="block" @click="router.push('/app')">
        Skip for now
      </IonButton>
    </div>
  </ModalTemplate>
</template>
