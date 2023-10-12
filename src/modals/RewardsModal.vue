<script setup lang="ts">
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonRow, IonToolbar } from '@ionic/vue'
import { chevronForwardOutline, close } from 'ionicons/icons'
import { ModalType, useModal } from '@/composables/useModal'
import TaskCard from '@/components/TaskCard.vue'

const { closeModal, showModal } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click="() => closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="ion-padding">
    <IonGrid class="flex flex-col gap-y-2">
      <IonRow class="ion-justify-content-center">
        <!-- TODO: get this from API -->
        <h1 class="text-5xl font-light">
          4000 NIM
        </h1>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <p class="">
          3,44 €
        </p>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <IonButton fill="clear" class="font-medium" @click="showModal(ModalType.ExpiringRewards, { isOnTop: true })">
          800 NIM expiring soon <IonIcon slot="end" :icon="chevronForwardOutline" />
        </IonButton>
      </IonRow>
      <!-- Earn NIM -->
      <IonRow>
        <p class="mt-4 ml-1 text-lg font-semibold">
          Earn NIM
        </p>
      </IonRow>

      <!-- Referral -->
      <IonRow class="mt-4">
        <TaskCard highlight large>
          Invite a friend and earn up to 20€ both!
        </TaskCard>
      </IonRow>
      <!-- Tasks -->
      <!-- TODO: get them from array -->
      <IonRow>
        <IonCol>
          <TaskCard>
            Earn BonusNIM with Cash Back
          </TaskCard>
        </IonCol>
        <IonCol>
          <TaskCard :reward="2000" :progress="2" :total="4">
            Task Name
          </TaskCard>
        </IonCol>
      </IonRow>
      <IonRow>
        <IonCol>
          <TaskCard :reward="1000" :progress="0" :total="4">
            Task Name
          </TaskCard>
        </IonCol>
        <IonCol>
          <TaskCard :reward="500">
            Task Name
          </TaskCard>
        </IonCol>
      </IonRow>
    </IonGrid>
  </IonContent>
</template>

<style scoped>
ion-col {
  --ion-grid-column-padding: 0;
}

ion-row {
  column-gap: 0.5rem;
}
</style>
