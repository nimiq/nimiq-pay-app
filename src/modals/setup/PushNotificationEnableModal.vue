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
      Enable notifications
    </template>
    <template #subtitle>
      Get important info on transactions, top ups, security and more.
    </template>
    <NotificationBell class="w-36 h-36" />
    <div class="self-end w-full">
      <IonButton expand="block" class="text-base font-bold" @click="handlePushButton">
        Enable Notifications
      </IonButton>
      <IonButton fill="clear" expand="block" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="router.replace('/app')">
        Skip for now
      </IonButton>
    </div>
  </ModalTemplate>
</template>
