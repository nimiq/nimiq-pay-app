<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import NotificationBell from './icons/notification-bell.vue'

// import { PushNotifications } from '@capacitor/push-notifications'
defineEmits<{ done: []; skip: [] }>()
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <NotificationBell class="w-16 h-16 text-space flex-1" />
    <div class="flex flex-col justify-center mt-auto pb-6">
      <IonButton id="present-alert" size="small" class="text-base font-bold" @click="$emit('done')">
        Allow notifications
      </IonButton>
      <IonButton fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('skip')">
        Skip for now
      </IonButton>
    </div>
  </div>
</template>
