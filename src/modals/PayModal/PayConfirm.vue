<script setup lang="ts">
import { computed, inject, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import { IonBackButton, IonButton, IonButtons, IonGrid, IonIcon, IonRow, IonToggle, loadingController } from '@ionic/vue'
import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { useRouter } from 'vue-router'
import { basket } from 'ionicons/icons'
import { computedAsync } from '@vueuse/core'
import PayScanner from './PayScanner.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'
import { BonusWallet } from '@/lib/bonus-wallet'
import { useModal } from '@/composables/useModal'

const { closeModal } = useModal()
const nav = (document.querySelector('[data-pay-nav]')) as Nav & HTMLElement

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const pendingPayment = instantPayWallet.getPendingPayment()
const router = useRouter()
const isPayingWithPoints = ref(false)
const canUsePoints = computedAsync(async () => {
  if (pendingPayment === null) {
    router.back()
    return false
  }

  if (pendingPayment.rail !== 'CPL')
    return false
  const balance = await bonusWallet.getParticipantBalance()
  return (pendingPayment.amount || 0) < balance
})
const paymentDetails = computedAsync(async () => {
  if (pendingPayment === null)
    return null
  return await bonusWallet.verifyPayment(pendingPayment.rail!, pendingPayment.railId!, pendingPayment.address.toUserFriendlyAddress())
})
const isPaymentValid = computed(() => {
  return paymentDetails.value?.valid ?? false
})
const cashbackAmount = computed(() => {
  if (paymentDetails.value?.cashback === undefined || pendingPayment === null)
    return 0
  return paymentDetails.value?.cashback.amount_in_luna || (pendingPayment?.amount * paymentDetails.value?.cashback.percentage / 100)
})

async function pay() {
  if (pendingPayment === null)
    return
  const loading = await loadingController.create({})
  loading.present()
  // TODO: Handle errors
  await instantPayWallet.completePendingPayment(pendingPayment, isPayingWithPoints.value)
  loading.dismiss()
  closeModal()
}

async function cancel() {
  instantPayWallet.cancelPendingPayment()
}

async function handleBack() {
  cancel()
  await nav.push(markRaw(PayScanner))
}

onBeforeUnmount(cancel)
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
        <p v-if="pendingPayment?.fiatAmount" class="text-6xl uppercase">
          {{ pendingPayment?.fiatAmount }} {{ pendingPayment?.fiatUnit }}
        </p>
        <p class="mt-4 text-2xl text-blue-300" :class="{ 'text-6xl text-blue-500 mt-0': !pendingPayment?.fiatAmount }">
          {{ (pendingPayment?.amount ?? 0) / 1e5 }} NIM
        </p>
        <p class="mt-2 text-2xl text-blue-300">
          {{ (pendingPayment?.fee ?? 0) / 1e5 }} NIM fee
        </p>
      </IonRow>
      <IonRow class="flex flex-col items-center my-auto ion-justify-content-center">
        <IonToggle :disabled="!canUsePoints" label-placement="end" class="text-xl font-semibold text-blue-500" @ion-change="(e) => isPayingWithPoints = e.detail.checked">
          Use CC Points
        </IonToggle>
        <Transition name="slide-fade" mode="out-in">
          <p v-if="cashbackAmount" class="mt-8 text-lg font-semibold">
            You get {{ (cashbackAmount / 1e5).toFixed(2) }} NIM cash back in CC Points for this transaction!
          </p>
        </Transition>
      </IonRow>
      <IonRow class="relative w-3/5 mx-auto mt-auto min-w-fit ion-justify-content-center">
        <!-- TODO: how to display this? -->
        <p v-if="paymentDetails?.reason" class="absolute w-[90vw] text-red-500 -top-6">
          {{ paymentDetails?.reason }}
        </p>
        <IonButton size="large" expand="block" class="w-full" :disabled="!isPaymentValid" @click="() => pay()">
          Pay
        </IonButton>
      </IonRow>
    </IonGrid>
  </ModalTemplate>
</template>
