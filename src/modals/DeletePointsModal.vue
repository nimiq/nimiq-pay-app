<script setup lang="ts">
import { useLogger } from '@/composables/useLogger'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { usePoints } from '@/stores/points'
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'

const { closeModal } = useModal()
const { deleteAccount } = usePoints()
const logger = useLogger('DeletePointsModal')

async function handleDeletePointsAccount() {
  const { success, error } = await deleteAccount()
  if (success) {
    useToast().setToast({
      message: i18n.t('Points account deleted successfully'),
    })
  }
  else {
    logger.error('Failed to delete Points account', error)
    useToast().setToast({
      message: error || i18n.t('Failed to delete Points account'),
      type: 'error',
    })
  }

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
  <div class="flex flex-col items-center h-full p-8 pt-0 text-center">
    <h1 class="text-2xl font-bold">
      {{ $t('Really delete your Cryptocity Points account?') }}
    </h1>
    <p class="mt-5 font-medium text-pumpkin">
      {{ $t('Deleting your phone number from the Cryptocity Points system will result in the permanent loss of any Points you currently hold.') }}
    </p>

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base red-button" @click="handleDeletePointsAccount">
      <span>
        {{ $t('Delete Points Account') }}
      </span>
    </IonButton>
  </div>
</template>

<style scoped>
.red-button {
  --background: radial-gradient(100% 100% at 100% 100%, #CC3047 0%, #D94432 100%);
}
</style>
