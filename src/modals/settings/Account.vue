<script setup lang="ts">
import { IonBackButton, IonButtons, IonItem, IonLabel, IonList } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { Modal, useModal } from '@/composables/useModal'
import { useApp } from '@/stores/app'

const { showModal, closeModal } = useModal()
const { phoneNumberVerified } = storeToRefs(useApp())
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <div class="w-full h-full flex flex-col">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        {{ $t('Account') }}
      </p>
      <IonList lines="none">
        <IonItem v-if="phoneNumberVerified" button :detail="false" class="text-cherry" @click="showModal(Modal.DeletePoints, { isOnTop: true, isSmall: true })">
          <IonLabel>{{ $t('Delete Cryptocity Points account') }}</IonLabel>
        </IonItem>
      </IonList>
    </div>
  </ModalTemplate>
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-start: 0;
  --padding-end: 0;
}
</style>
