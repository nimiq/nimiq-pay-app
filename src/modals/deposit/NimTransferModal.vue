<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonIcon } from '@ionic/vue'
import { qrCodeOutline } from 'ionicons/icons'
import { Clipboard } from '@capacitor/clipboard'
import { Browser } from '@capacitor/browser'
import { storeToRefs } from 'pinia'
import { Modal, useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'
import AddressDisplay from '@/components/AddressDisplay.vue'
import NimLogo from '@/components/icons/nimiq-logo.vue'
import { useLocalWallet } from '@/stores/local-wallet'

const { closeModal, closeAllModals, showModal, showNotificationAlert } = useModal()
const { localAddress } = storeToRefs(useLocalWallet())

async function handleOpenWallet() {
  // const url = new URL(`https://wallet.nimiq${import.meta.env.DEV ? '-testnet' : ''}.com/nimiq:${nimiqWallet.address.value?.toUserFriendlyAddress().replace(/ /g, '')}`)
  const url = new URL(`https://wallet.nimiq-testnet.com/nimiq:${localAddress.value.toUserFriendlyAddress().replace(/ /g, '')}`)
  await Browser.open({ url: url.toString(), toolbarColor: '#E9B213' })
  Browser.addListener('browserFinished', () => {
    // TODO: check if tx incoming
    Browser.removeAllListeners()
    closeAllModals()
  })
}

async function handleCopy() {
  await Clipboard.write({
    string: localAddress.value.toUserFriendlyAddress(),
  })
  await showNotificationAlert('Address copied to clipboard')
}

async function handleOpenCashlinkScanner() {
  await closeAllModals()
  showModal(Modal.CashlinkScanner, { isFullscreen: true })
}
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <template #title>
      Send NIM to top up
    </template>
    <template #subtitle>
      Send a transaction to the address below. Top up as much as you like.
    </template>
    <div class="flex flex-col items-center justify-center mt-8">
      <NimLogo class="w-16 mb-8 h-14" />
      <AddressDisplay class="w-4/5 min-w-[18rem] my-4" :address="localAddress.toUserFriendlyAddress() || 'Error' " />
    </div>
    <div>
      <IonButton expand="block" fill="clear" class="text-base font-semibold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleOpenCashlinkScanner">
        <IonIcon slot="start" :icon="qrCodeOutline" />
        Scan Cashlink
      </IonButton>
    </div>
    <div class="self-end w-full">
      <IonButton expand="block" class="text-base" @click="handleOpenWallet">
        Open Wallet
      </IonButton>
      <IonButton expand="block" fill="clear" class="text-base font-semibold normal-case" style="--padding-top: 8px; --padding-bottom: 8px;" @click="handleCopy">
        Copy address
      </IonButton>
    </div>
  </ModalTemplate>
</template>
