<script setup lang="ts">
import { IonBackButton, IonButtons, IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/vue'
import { useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'

const { closeModal } = useModal()
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal" />
      </IonButtons>
    </template>
    <div class="w-full h-full">
      <div class="font-semibold">
        <p class="text-left uppercase">
          Settings
        </p>
      </div>
      <IonList lines="none">
        <IonItem>
          <IonSelect label="Language" placeholder="English">
            <IonSelectOption value="english">
              English
            </IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem>
          <IonSelect label="Currency" placeholder="USD">
            <IonSelectOption value="usd">
              USD
            </IonSelectOption>
          </IonSelect>
        </IonItem>
      </IonList>
    </div>
  </ModalTemplate>
</template>

<style scoped>
ion-item {
  --padding-start: 0;
  --padding-end: 0;
}
</style>
