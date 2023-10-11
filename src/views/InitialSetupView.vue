<script setup lang="ts">
import { IonButton, IonContent, IonGrid, IonHeader, IonPage, IonRow, IonToolbar } from '@ionic/vue'
import { ref } from 'vue'
import { ModalType, useModal } from '@/composables/useModal'
import CircleFilled from '@/components/icons/circle-filled.vue'

const { showModal } = useModal()
const page = ref()
</script>

<template>
  <IonPage ref="page">
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent :fullscreen="true" class="ion-padding">
      <IonGrid class="flex flex-col justify-between h-full mx-6 text-center">
        <IonRow class="flex flex-col ion-justify-content-center">
          <h1 class="mb-6 text-5xl font-semibold">
            Easy Pay!
          </h1>
          <p class="text-2xl font-medium">
            Easy payments by scanning QR code
          </p>
        </IonRow>
        <IonRow class="flex flex-col ion-justify-content-center">
          <p class="text-2xl">
            Pay in many places
          </p>
          <div class="flex flex-row flex-wrap justify-center w-5/6 gap-10 mx-auto mt-8">
            <div v-for="i in 5">
              <CircleFilled class="w-14 fill-blue-500" />
              <p>Logo</p>
            </div>
          </div>
        </IonRow>
        <IonRow class="ion-justify-content-between">
          <IonButton class="w-full text-xl font-bold" expand="block" @click="() => showModal(ModalType.NewPin)">
            Get Started
          </IonButton>
          <IonButton class="font-bold" fill="clear" @click="() => showModal(ModalType.PromoCode)">
            I have a promo code
          </IonButton>
          <IonButton class="font-bold" fill="clear" :disabled="true" @click="() => showModal(ModalType.Login)">
            Login
          </IonButton>
        </IonRow>
      </IonGrid>
    </IonContent>
  </IonPage>
</template>

<style scoped>
ion-toolbar {
    --background: none;
}

ion-icon.icon-extra-large {
    font-size: 96px;
    padding: 32px;
}
</style>
