<script setup lang="ts">
import { inject, markRaw, onBeforeUnmount, onMounted } from 'vue'
import { IonBackButton, IonButton, IonButtons, IonGrid, IonIcon, IonRow, IonToggle, loadingController } from '@ionic/vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { useRouter } from 'vue-router'
import { basket } from 'ionicons/icons'
import PayScanner from './PayScanner.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { useModal } from '@/composables/useModal'

const { closeModal } = useModal()
const nav = (document.querySelector('[data-pay-nav]')) as Nav & HTMLElement

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const pendingPayment = instantPayWallet.getPendingPayment()
const router = useRouter()

if (pendingPayment === null)
  router.back()

async function pay() {
  if (pendingPayment === null)
    return
  const loading = await loadingController.create({})
  loading.present()
  await instantPayWallet.completePendingPayment(pendingPayment)
  loading.dismiss()
  closeModal()
}

async function cancel() {
  instantPayWallet.cancelPendingPayment()
}

onBeforeUnmount(cancel)

async function handleBack() {
  await nav.push(markRaw(PayScanner))
}
onMounted(() => {
  // Removing previous page (more than 1 in case there has been a back navigation) to destroy it and allow to start the barcode scanner again when navigating back to this page
  nav.removeIndex(0, 10)
})
</script>

<template>
  <ModalTemplate>
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton @click="handleBack" />
      </IonButtons>
    </template>
    <IonGrid class="flex flex-col h-full">
      <IonRow v-if="pendingPayment?.label" class="flex items-center gap-2 text-blue-500 ion-justify-content-center">
        <IonIcon :icon="basket" size="large" />
        <h1>{{ pendingPayment?.label }}</h1>
      </IonRow>
      <IonRow class="flex flex-col mt-16 ion-justify-content-center">
        <p v-if="pendingPayment?.fiatAmount" class="text-6xl">
          {{ pendingPayment?.fiatAmount }} {{ pendingPayment?.fiatUnit }}
        </p>
        <p class="mt-4 text-2xl text-blue-300" :class="{ 'text-6xl text-blue-500 mt-0': !pendingPayment?.fiatAmount }">
          {{ (pendingPayment?.amount ?? 0) / 100000 }} NIM
        </p>
        <p class="mt-2 text-2xl text-blue-300">
          {{ (pendingPayment?.fee ?? 0) / 100000 }} NIM fee
        </p>
      </IonRow>
      <IonRow class="flex flex-col items-center my-auto ion-justify-content-center">
        <IonToggle :disabled="true" label-placement="end" checked class="text-xl font-semibold text-blue-500">
          Use BonusNIM
        </IonToggle>
        <p class="mt-4">
          You pay 10.00€ with BonusNIM
          <br>
          You pay 40.00€ with your NIM balance
        </p>
      </IonRow>
      <IonRow class="w-3/5 mx-auto mt-auto min-w-fit ion-justify-content-center">
        <IonButton size="large" expand="block" class="w-full" @click="pay">
          Pay
        </IonButton>
      </IonRow>
    </IonGrid>
  </ModalTemplate>
</template>
