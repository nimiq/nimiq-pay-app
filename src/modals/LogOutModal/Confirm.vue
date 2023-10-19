<script setup lang="ts">
import { inject } from 'vue'
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { StorageManager } from '@/lib/storage-manager'
import { ModalType, useModal } from '@/composables/useModal'

const storageManager = inject(StorageManager.KEY) as StorageManager
const { closeModal, showModal } = useModal()
const router = useRouter()

async function handleConfirm() {
  if (storageManager.isBackupDone().value) {
    // TODO: ask for pin
    await storageManager.deleteDatabase()
    router.replace('/setup')
  }
  else {
    showModal(ModalType.LogoutWarning, { isOnTop: true, isSmall: true})
  }
}
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full p-8 text-center gap-y-4">
    <h1 class="mb-4">
      Are you sure you want to log out?
    </h1>
    <p class="self-start px-4 mb-8 text-xl text-center">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do.
    </p>

    <IonButton class="self-end w-full mt-16 font-semibold" @click="handleConfirm">
      Confirm
    </IonButton>
  </div>
</template>
