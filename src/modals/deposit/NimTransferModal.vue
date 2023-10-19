<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, toastController } from '@ionic/vue'
import { inject } from 'vue'
import { Clipboard } from '@capacitor/clipboard'
import { Browser } from '@capacitor/browser'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'
import AddressDisplay from '@/components/AddressDisplay.vue'
import NimLogo from '@/components/icons/nimiq-logo.vue'

const { closeModal, closeAllModals } = useModal()
const nimiqWallet = inject(NimiqWallet.KEY) as NimiqWallet

async function handleOpenWallet() {
  const url = new URL(`https://wallet.nimiq${import.meta.env.DEV && '-testnet'}.com/nimiq:${nimiqWallet.address.value?.toUserFriendlyAddress().replace(/ /g, '')}`)
  await Browser.open({ url: url.toString(), toolbarColor: '#E9B213' })
  Browser.addListener('browserFinished', () => {
    // TODO: check if tx incoming
    Browser.removeAllListeners()
    closeAllModals()
  })
}

async function handleCopy() {
  await Clipboard.write({
    string: nimiqWallet.address.value?.toUserFriendlyAddress(),
  })
  const toast = await toastController.create({
    message: 'Address copied to clipboard',
    duration: 1500,
    position: 'bottom',
  })

  await toast.present()
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
      Send NIM to this address
    </template>
    <template #subtitle>
      Lorem ipsum dolor sit amet, consectetur adipiscing.
    </template>
    <div class="grid h-full grid-[1fr_8fr_1fr] justify-items-center items-center">
      <NimLogo class="w-20 h-20 fill-blue-500" />
      <AddressDisplay class="w-4/5 min-w-[18rem] my-4" :address="nimiqWallet.address.value?.toUserFriendlyAddress() || 'Error' " />
      <div class="self-end w-full">
        <IonButton expand="block" @click="handleOpenWallet">
          Open Wallet
        </IonButton>
        <IonButton expand="block" fill="clear" class="mt-4" @click="handleCopy">
          Copy address
        </IonButton>
      </div>
    </div>
  </ModalTemplate>
</template>
