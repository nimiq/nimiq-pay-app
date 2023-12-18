<script setup lang="ts">
import { IonBackButton, IonButtons, IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useModal } from '@/composables/useModal'
import { Fiat, useApp } from '@/stores/app'
import ModalTemplate from '@/components/ModalTemplate.vue'

const { closeModal } = useModal()
const { selectedFiat } = storeToRefs(useApp())
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <div class="w-full h-full">
      <p class="text-sm font-bold text-left uppercase text-space/60">
        Settings
      </p>
      <IonList lines="none" class="mt-4">
        <IonItem>
          <IonSelect label="Language" placeholder="English" class="text-lg font-semibold">
            <IonSelectOption value="english">
              English
            </IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem>
          <IonSelect
            label="Currency" :placeholder="selectedFiat" class="text-lg font-semibold"
            @ion-change="selectedFiat = $event.detail.value"
          >
            <IonSelectOption v-for="currency in Fiat" :key="currency" :value="currency">
              {{ currency }}
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
