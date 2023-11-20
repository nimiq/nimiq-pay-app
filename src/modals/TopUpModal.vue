<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { Modal, useModal } from '@/composables/useModal'
import InfoIcon from '@/components/icons/info.vue'

const { showModal, closeModal } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full">
    <h1 class="mb-8 text-2xl font-bold">
      Top Up
    </h1>
    <div class="flex items-start justify-center mb-auto font-semibold gap-x-2 text-pumpkin">
      <InfoIcon class="h-5 w-4 mt-1 stroke-[1.5] text-pumpkin" />
      <span>
        Top ups take ~10 min to become available.
      </span>
    </div>
    <div class="self-end w-3/4 py-8 mx-auto mt-16">
      <IonButton
        expand="block"
        disabled
        class="mb-4 text-base"
      >
        Credit Card
      </IonButton>
      <IonButton
        expand="block"
        class="text-base"
        @click="showModal(Modal.NimTransfer, { isFullscreen: true, isOnTop: true })"
      >
        NIM transfer
      </IonButton>
    </div>
  </div>
</template>
