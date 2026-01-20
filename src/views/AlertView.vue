<script setup lang="ts">
import { AlertModalPostMessage, AlertModalResponseMessage } from '@/modals/MiniAppsModal.vue';
import { IonPage, IonContent, IonButton, IonButtons, IonHeader, IonFooter, IonToolbar, IonTitle } from '@ionic/vue';
import { useBroadcastChannel } from '@vueuse/core';
import { ref, onMounted, watch } from 'vue';

const { post: broadcast, data: broadcastMessage, error } = useBroadcastChannel<AlertModalPostMessage, AlertModalResponseMessage>({ name: 'alert-modal-channel' })
watch(error, (err) => {
  if (err) {
    console.error('Broadcast channel error:', err);
  }
}, { immediate: true });

declare global {
  interface Window {
    mobileApp?: {
      close: () => void;
    };
  }
}

const modalData = ref<AlertModalPostMessage['modalData']>();

watch(broadcastMessage, (newMessage) => {
  if (newMessage.type === 'modal-data') {
    modalData.value = newMessage.modalData;
  }
});

function handleConfirm() {
  broadcast({
    type: 'modal-response',
    action: 'confirm',
  });

  // Close using mobileApp if available, otherwise parent window will handle it
  if (window.mobileApp) {
    window.mobileApp.close();
  }
}

function handleCancel() {
  broadcast({
    type: 'modal-response',
    action: 'cancel',
  });

  // Close using mobileApp if available, otherwise parent window will handle it
  if (window.mobileApp) {
    window.mobileApp.close();
  }
}

onMounted(() => {
  // Request initial data from parent
  broadcast({ type: 'modal-ready' });
});

window.addEventListener("messageFromNative", (event) => {
  console.log(event);
});
</script>

<template>
  <IonPage>
    <IonHeader class="ion-no-border">
      <IonToolbar>
        <IonTitle>{{ $t('Generic Confirmation') }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <pre>{{ JSON.stringify(modalData, null, 2) }}</pre>
    </IonContent>

    <IonFooter class="ion-no-border">
      <IonToolbar>
        <IonButtons slot="end">
          <IonButton color="medium" @click="handleCancel">
            {{ $t('Cancel') }}
          </IonButton>
          <IonButton color="primary" @click="handleConfirm">
            {{ $t('Confirm') }}
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonFooter>
  </IonPage>
</template>
