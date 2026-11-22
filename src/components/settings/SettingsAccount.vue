<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { Modal, useModal } from '@/composables/useModal'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

const emit = defineEmits(stepEmits)
const { showModal } = useModal()
const { phoneNumberVerified } = storeToRefs(useApp())

// Deleting the points account unverifies the phone; this page is then empty and hidden from the root.
watch(phoneNumberVerified, (verified) => {
  if (!verified)
    emit('back')
})
</script>

<template>
  <div class="w-full flex flex-col pt-4">
    <IonList lines="none">
      <IonItem v-if="phoneNumberVerified" button :detail="false" class="text-cherry" @click="showModal(Modal.DeletePoints, { isOnTop: true, isSmall: true })">
        <IonLabel>{{ $t('Delete Cryptocity Points account') }}</IonLabel>
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
