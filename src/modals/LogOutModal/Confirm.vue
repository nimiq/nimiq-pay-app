<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Modal, useModal } from '@/composables/useModal'
import { useApp } from '@/stores/app'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'

const { closeModal, showModal } = useModal()
const router = useRouter()
const { hasDoneBackup } = storeToRefs(useApp())
const { remoteBalance } = storeToRefs(useRemoteSigner())
const { localBalance } = storeToRefs(useLocalWallet())
const { deleteDatabase } = useConn()

async function handleConfirm() {
  // eslint-disable-next-line no-console
  console.log('handleConfirm', { hasDoneBackup: hasDoneBackup.value, localBalance: localBalance.value, remoteBalance: remoteBalance.value })
  if (hasDoneBackup.value || (remoteBalance.value === 0 && localBalance.value === 0)) {
    // TODO: ask for pin
    await deleteDatabase()
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
      {{ $t('Are you sure you want to log out?') }}
    </h1>
    <p class="self-start mt-4 text-base text-center text-space/60 whitespace-pre-line">
      {{ $t('Log in again with your backup words.\nPlease ensure that you have them available before logging out.') }}
    </p>

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base" @click="handleConfirm">
      {{ $t('Confirm') }}
    </IonButton>
  </div>
</template>
