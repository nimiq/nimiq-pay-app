<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useModal } from '@/composables/useModal'

const { closeModal } = useModal()

function handleDeletePointsAccount() {
  console.log('TODO: Delete points account')
}
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
  <div class="flex flex-col items-center h-full p-8 pt-0 text-center">
    <h1 class="text-2xl font-bold">
      {{ $t('Really delete your Points rewards account?') }}
    </h1>
    <p class="mt-5 font-medium text-pumpkin">
      {{ $t('Deleting your phone number from the Points rewards system will result in the permanent loss of any Points you currently hold.') }}
    </p>

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base" @click="handleDeletePointsAccount">
      <span>
        {{ $t('Delete Points Account') }}
      </span>
    </IonButton>
  </div>
</template>

<style scoped>
ion-button {
  --background: radial-gradient(100% 100% at 100% 100%, #CC3047 0%, #D94432 100%);
}
</style>
