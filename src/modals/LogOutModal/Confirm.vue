<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { HCESdk } from 'capacitor-monetplus-hce'
import { close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNaka } from '@/stores/naka'
import { useRemoteSigner } from '@/stores/remote-signer'

const logger = useLogger('LogOutModal/Confirm')

const { closeModal, showModal } = useModal()
const router = useRouter()
const { hasDoneBackup } = storeToRefs(useApp())
const { remoteBalance } = storeToRefs(useRemoteSigner())
const { localBalance } = storeToRefs(useLocalWallet())
const { hasCard } = storeToRefs(useNaka())
const { deleteDatabase } = useConn()

async function handleConfirm() {
  logger.log('handleConfirm', { hasDoneBackup: hasDoneBackup.value, localBalance: localBalance.value, remoteBalance: remoteBalance.value })
  if (hasDoneBackup.value || (remoteBalance.value === 0 && localBalance.value === 0)) {
    // TODO: ask for pin
    if (hasCard.value) {
      await HCESdk.initialize({ storageName: 'naka-card' })
      const { cards } = await HCESdk.getAllSucceededCards()
      logger.log('Cards: in SDK storage', cards)
      for (const card of cards) {
        logger.log('Deactivating card', card)
        await HCESdk.deactivateCard({ cardId: card.id })
      }
    }
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
    <h1 class="text-2xl font-bold text-balance">
      {{ $t('Are you sure you want to log out?') }}
    </h1>
    <p class="self-start mt-4 text-base text-center whitespace-pre-line text-space/60 text-balance">
      {{ $t('Log in again with your recovery words.\nPlease ensure that you have them available before logging out.') }}
    </p>

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base" @click="handleConfirm">
      {{ $t('Confirm') }}
    </IonButton>
  </div>
</template>
