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

interface ModalData {
  type: 'confirmation';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

declare global {
  interface Window {
    mobileApp?: {
      close: () => void;
    };
  }
}

const modalData = ref<ModalData>({
  type: 'confirmation',
  title: 'Confirmation',
  message: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
});

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
        <IonTitle>{{ modalData.title }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <p>{{ modalData.message }}</p>
    </IonContent>

    <IonFooter class="ion-no-border">
      <IonToolbar>
        <IonButtons slot="end">
          <IonButton color="medium" @click="handleCancel">
            {{ modalData.cancelText || 'Cancel' }}
          </IonButton>
          <IonButton color="primary" @click="handleConfirm">
            {{ modalData.confirmText || 'Confirm' }}
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonFooter>
  </IonPage>
</template>
