<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar, modalController } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { close } from 'ionicons/icons'
import { ModalType, useModal } from '@/composables/useModal'

const { showModal, closeModal } = useModal()

onMounted(async () => {
  const modal = await modalController.getTop()
  console.log(modal)
})
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
    <p class="self-start px-4 mb-8 text-xl text-center">
      Lorem ipsum dolor sit amet, consectetur adipiscing.
    </p>
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
