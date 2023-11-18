<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { Modal, useModal } from '@/composables/useModal'

const { closeModal, showModal, closeAllModals } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeAllModals()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full p-8 text-center gap-y-4">
    <h1 class="mb-4">
      Back up your account before log out
    </h1>
    <p class="px-4 mb-8 text-xl text-center text-red-500">
      You will lose your money and data if you don't back up your account
    </p>

    <IonButton class="self-end w-full mt-16 font-semibold" @click="showModal(Modal.Backup)">
      Back up account
    </IonButton>
  </div>
</template>
