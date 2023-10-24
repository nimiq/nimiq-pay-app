<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { ModalType, useModal } from '@/composables/useModal'
import Info from '@/components/icons/info.vue'

const { showModal, closeModal } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full ion-padding gap-y-4">
    <h1 class="my-4">
      Top Up
    </h1>
    <div class="flex items-start self-start justify-center gap-2 px-4 py-2 mb-8 text-xl text-center border border-blue-500 rounded-md">
      <Info class="w-6 mt-1" />
      <p>Payments only available 10 minutes after top-up</p>
    </div>
    <div class="self-end w-full py-8">
      <IonButton
        expand="block"
        disabled
        class="mb-4 font-bold"
      >
        With Credit Card
      </IonButton>
      <IonButton
        expand="block"
        class="font-bold"
        @click="showModal(ModalType.NimTransfer, { isFullscreen: true, isOnTop: true })"
      >
        With NIM transfer
      </IonButton>
    </div>
  </div>
</template>
