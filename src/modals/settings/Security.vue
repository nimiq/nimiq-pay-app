<script setup lang="ts">
import type { IonToggleCustomEvent, ToggleChangeEventDetail } from '@ionic/core'
import { IonBackButton, IonButtons, IonItem, IonLabel, IonList, IonToggle } from '@ionic/vue'
import { onBeforeMount } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useBiometric } from '@/composables/useBiometric'
import { Modal, useModal } from '@/composables/useModal'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'

const { showModal, closeModal } = useModal()
const { isBiometricSupported, isBiometricEnabled, updateBiometryInfo } = useBiometric()

function handleBiometricToggle(event: IonToggleCustomEvent<ToggleChangeEventDetail>) {
  if (event.detail.checked)
    showModal(Modal.EnableBiometric, { isOnTop: true })
  else
    isBiometricEnabled.value = false
}

onBeforeMount(updateBiometryInfo)
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
        {{ $t('Security') }}
      </p>
      <IonList lines="none">
        <IonItem v-if="isBiometricSupported">
          <IonToggle :checked="isBiometricEnabled" @ion-change="handleBiometricToggle">
            {{ $t('Biometric Authentication') }}
          </IonToggle>
        </IonItem>

        <!-- TODO: fix this -->
        <IonItem button :detail="false" @click="initializeFlow(FlowName.ChangePin)">
          <IonLabel>{{ $t('Change PIN') }}</IonLabel>
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
