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
import InfoIcon from '@/components/icons/info.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'

const { closeModal, showNotificationAlert } = useModal()
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
  // TODO: check if payment is still valid when paying directly with NIM
  await instantPayWallet.completePendingPayment(pendingPayment, isPayingWithPoints.value)
  await loading.dismiss()

  const title = pendingPayment?.fiatAmount ? `You paid ${pendingPayment?.fiatAmount} ${pendingPayment?.fiatUnit}` : `You paid ${pendingPayment?.amount / 1e5} NIM`
  const subtitle = pendingPayment?.fiatAmount ? `${pendingPayment?.amount / 1e5} NIM` : undefined
  const extra = cashbackAmount.value ? `You get ${cashbackAmount.value / 1e5} NIM cash back in CC Points!` : undefined
  await showNotificationAlert({ title, subtitle, extra })

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
    <div class="grid w-full h-full grid-rows-3">
      <div class="flex flex-col items-center self-start">
        <div v-if="pendingPayment?.label" class="flex items-center justify-center gap-x-2">
          <IonIcon :icon="basket" size="large" />
          <h1>{{ pendingPayment?.label }}</h1>
        </div>
        <div class="flex flex-col justify-center mt-6 gap-y-3">
          <div v-if="pendingPayment?.fiatAmount" class="flex items-center justify-center text-4xl uppercase gap-x-2">
            <span>{{ pendingPayment?.fiatAmount }} {{ pendingPayment?.fiatUnit }}</span>
            <InfoIcon class="h-5 stroke-2 opacity-70" />
          </div>
          <p class="text-6xl">
            {{ (pendingPayment?.amount || 0) / 1e5 }} NIM
          </p>
          <p class="">
            Fees might apply &nbsp; ~{{ (pendingPayment?.fee || 0) / 1e5 }} NIM
          </p>
        </div>
      </div>
      <div class="flex items-end justify-center">
        <IonToggle :disabled="!canUsePoints" label-placement="end" class="mb-4 text-2xl font-semibold text-blue-500" @ion-change="(e) => isPayingWithPoints = e.detail.checked">
          <div class="flex items-center">
            <span class="mr-3">Use</span>
            <CryptoCityLogo class="h-5 mr-2" />
            <span>{{ ((pendingPayment?.amount || 0) / 1e5).toLocaleString() }}</span>
          </div>
        </IonToggle>
      </div>
      <div class="flex flex-col items-center self-end justify-between w-full h-full">
        <Transition name="slide-fade" mode="out-in">
          <!-- TODO: use component< -->
          <div v-if="cashbackAmount" class="flex items-start px-2 py-2 mt-4 mb-auto text-lg border border-blue-500 rounded-md">
            <InfoIcon class="h-6 stroke-2" />
            <span>You get {{ (cashbackAmount / 1e5).toFixed(2) }} NIM cash back in CC Points for this transaction!</span>
          </div>
        </Transition>
        <!-- TODO: how to display this? -->
        <p v-if="paymentDetails?.reason" class="text-red-500 -top-6">
          {{ paymentDetails?.reason }}
        </p>
        <IonButton size="large" expand="block" class="w-full mt-auto" :disabled="!isPaymentValid" @click="() => pay()">
          Pay
        </IonButton>
      </div>
    </div>
  </ModalTemplate>
</template>
