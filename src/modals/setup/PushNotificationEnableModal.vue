<script setup lang="ts">
import { IonButton, toastController } from '@ionic/vue'
import { useRoute, useRouter } from 'vue-router'
import { PushNotifications } from '@capacitor/push-notifications'
import NotificationBell from '@/components/icons/notification-bell.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'

const router = useRouter()
const { path } = useRoute()

async function registerNotifications() {
  // TODO: implement this

  // let permStatus = await PushNotifications.checkPermissions()

  // if (permStatus.receive === 'prompt')
  //   permStatus = await PushNotifications.requestPermissions()

  // if (permStatus.receive !== 'granted')
  //   throw new Error('Permission not granted.')

  // await PushNotifications.register()
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

function handleClose() {
  if (path !== '/app')
    router.replace('/app')
}
</script>

<template>
  <ModalTemplate :on-closing="handleClose">
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
      <IonButton
        fill="clear" expand="block" class="text-base font-bold normal-case"
        style="--padding-top: 8px; --padding-bottom: 8px;" @click="router.replace('/app')"
      >
        Skip for now
      </IonButton>
    </div>
  </ModalTemplate>
</template>
