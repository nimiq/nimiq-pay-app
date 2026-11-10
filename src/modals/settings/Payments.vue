<script setup lang="ts">
import { IonBackButton, IonButtons, IonItem, IonLabel, IonList, IonNote } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { Modal, useModal } from '@/composables/useModal'
import { toCoins } from '@/composables/usePrice'
import { Crypto, useApp } from '@/stores/app'

const { showModal, closeModal } = useModal()
const { htlcThreshold } = storeToRefs(useApp())

// Threshold is stored in luna; show it in NIM. Edited via the AutoDepositThreshold modal.
const htlcThresholdNim = computed(() => toCoins(htlcThreshold.value, Crypto.NIM))
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
        {{ $t('Payments') }}
      </p>
      <IonList lines="none">
        <IonItem button :detail="false" @click="showModal(Modal.AutoDepositThreshold, { isOnTop: true, isSmall: true })">
          <IonLabel>{{ $t('Auto-deposit threshold') }}</IonLabel>
          <IonNote slot="end" class="text-lg">
            {{ htlcThresholdNim }} NIM
          </IonNote>
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
