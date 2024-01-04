<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import NotificationBell from './icons/notification-bell.vue'

// import { PushNotifications } from '@capacitor/push-notifications'
defineEmits<{ done: []; skip: [] }>()
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <NotificationBell class="flex-1 w-16 h-16 text-space" />
    <div class="flex flex-col justify-center w-full pb-6 mt-auto">
      <IonButton id="present-alert" size="small" class="text-base font-bold" @click="$emit('done')">{{
        $t('Enable notifications')
      }}</IonButton>
      <IonButton fill="clear" class="text-base font-bold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="$emit('skip')">{{
        $t('Skip for now')
      }}</IonButton>
    </div>
  </div>
</template>
