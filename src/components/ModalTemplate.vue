<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonGrid, IonHeader, IonIcon, IonRow, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useModal } from '@/composables/useModal'

defineProps({
  closeAll: {
    type: Boolean,
    default: false,
  },
})

const { closeModal, closeAllModals } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <slot name="leftButton" />
      <IonButtons slot="end">
        <IonButton @click.stop="closeAll ? closeAllModals() : closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="text-center ion-padding">
    <IonGrid class="flex flex-col h-full gap-4 mx-6">
      <IonRow class="ion-justify-content-center">
        <h1 class="text-2xl font-bold">
          <slot name="title" />
        </h1>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <p class="text-lg font-normal text-space/60">
          <slot name="subtitle" />
        </p>
      </IonRow>
      <IonRow class="flex-1 ion-justify-content-center ion-align-items-center">
        <slot />
      </IonRow>
    </IonGrid>
  </IonContent>
</template>
