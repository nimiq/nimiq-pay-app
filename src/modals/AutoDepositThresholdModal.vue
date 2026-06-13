<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import AmountInput from '@/components/AmountInput.vue'
import { useModal } from '@/composables/useModal'
import { Crypto, DECIMALS, useApp } from '@/stores/app'

const { closeModal } = useModal()
const { htlcThreshold } = storeToRefs(useApp())

// AmountInput works in luna (smallest units): it displays value / 10^decimals and emits luna.
// Edit a local copy so closing without saving discards the change.
const valueLuna = ref(htlcThreshold.value)

function save() {
  htlcThreshold.value = Math.max(0, Math.round(valueLuna.value || 0))
  closeModal()
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
  <div class="flex flex-col items-center p-8 pt-0 text-center">
    <h1 class="text-2xl font-bold text-balance">
      {{ $t('Auto-deposit threshold') }}
    </h1>
    <p class="mt-3 font-medium text-space/60 text-pretty">
      {{ $t('Incoming funds accumulate until they reach this amount before a deposit is created. Set to 0 to deposit immediately.') }}
    </p>

    <AmountInput v-model="valueLuna" :decimals="DECIMALS[Crypto.NIM]" suffix="NIM" class="threshold-input mt-8" />

    <IonButton class="w-11/12 mx-auto mt-10 text-base" @click="save">
      {{ $t('Save') }}
    </IonButton>
  </div>
</template>

<style scoped>
/* AmountInput defaults to a very large (text-7xl) number; tone it down for the settings input. */
.threshold-input {
  font-size: 2.75rem;
}

/* AmountInput sets an inline width that grows with the typed value; floor it so it never collapses
   to a sliver when empty/short, while still widening as more digits are entered. */
.threshold-input :deep(input) {
  min-width: 4rem;
}
</style>
