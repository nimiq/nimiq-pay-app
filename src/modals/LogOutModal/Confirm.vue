<script setup lang="ts">
import { inject } from 'vue'
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { StorageManager } from '@/lib/storage-manager'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { Modal, useModal } from '@/composables/useModal'

const storageManager = inject(StorageManager.KEY) as StorageManager
const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const { closeModal, showModal } = useModal()
const router = useRouter()

async function handleConfirm() {
  if (storageManager.isBackupDone().value || instantPayWallet.balance.value === 0) {
    // TODO: ask for pin
    await storageManager.deleteDatabase()
    router.replace('/setup')
  }
  else {
    showModal(Modal.LogoutWarning, { isOnTop: true, isSmall: true })
  }
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
      Are you sure you want to log out?
    </h1>
    <p class="self-start mt-4 text-base text-center text-space/60">
      Log in again with your backup words.
      <br>
      Please ensure that you have them available before logging out.
    </p>

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base" @click="handleConfirm">
      Confirm
    </IonButton>
  </div>
</template>
