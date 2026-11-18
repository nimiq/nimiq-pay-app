<script setup lang="ts">
import type { IonToggleCustomEvent, ToggleChangeEventDetail } from '@ionic/core'
import { IonItem, IonLabel, IonList, IonToggle } from '@ionic/vue'
import { onBeforeMount } from 'vue'
import { useBiometric } from '@/composables/useBiometric'
import { Modal, useModal } from '@/composables/useModal'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'

// Declared so Flow's step listeners (e.g. `select`) don't fall through as native DOM listeners on the root.
defineEmits(stepEmits)

const { showModal } = useModal()
const { isBiometricSupported, isBiometricEnabled, updateBiometryInfo } = useBiometric()

async function handleBiometricToggle(event: IonToggleCustomEvent<ToggleChangeEventDetail>) {
  if (!event.detail.checked) {
    isBiometricEnabled.value = false
    return
  }
  const modal = await showModal(Modal.EnableBiometric, { isOnTop: true })
  await modal?.onDidDismiss()
  // The toggle flipped itself on before the modal opened. `:checked` didn't change if the user
  // cancelled, so Vue won't re-render it; sync it to the store by hand.
  event.target.checked = isBiometricEnabled.value
}

onBeforeMount(updateBiometryInfo)
</script>

<template>
  <div class="w-full flex flex-col pt-4">
    <IonList lines="none">
      <IonItem v-if="isBiometricSupported">
        <IonToggle :checked="isBiometricEnabled" @ion-change="handleBiometricToggle">
          {{ $t('Biometric Authentication') }}
        </IonToggle>
      </IonItem>

      <IonItem button :detail="false" @click="initializeFlow(FlowName.ChangePin, { isOnTop: true })">
        <IonLabel>{{ $t('Change PIN') }}</IonLabel>
      </IonItem>

      <IonItem button :detail="false" @click="initializeFlow(FlowName.Backup, { isOnTop: true, analyticsSource: 'settings' })">
        <IonLabel>{{ $t('Backup Account') }}</IonLabel>
      </IonItem>
    </IonList>
  </div>
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-start: 0;
  --padding-end: 0;
}
</style>
