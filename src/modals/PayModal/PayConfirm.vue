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
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { useModal } from '@/composables/useModal'
import InfoIcon from '@/components/icons/info.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'

enum CanUsePointsState {
  NO_PENDING_PAYMENT = 'no_pending_payment',
  NOT_CPL = 'not_cpl',
  NOT_ENOUGH_POINTS = 'not_enough_points',
  CAN_USE_POINTS = 'can_use_points',
}

const { closeModal, showNotificationAlert } = useModal()
const nav = (document.querySelector('[data-pay-nav]')) as Nav & HTMLElement

const instantPayWallet = inject(InstantPayWallet.KEY) as InstantPayWallet
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const nimiqNetworkClient = inject(NimiqNetworkClient.KEY) as NimiqNetworkClient
const pendingPayment = instantPayWallet.getPendingPayment()
const router = useRouter()
const isPayingWithPoints = ref(false)
const canUsePoints = computedAsync(async () => {
  if (pendingPayment === null) {
    router.back()
    return CanUsePointsState.NO_PENDING_PAYMENT
  }

  if (pendingPayment.rail !== 'CPL')
    return CanUsePointsState.NOT_CPL
  const balance = await bonusWallet.getParticipantBalance()
  return (pendingPayment.amount || 0) < balance ? CanUsePointsState.CAN_USE_POINTS : CanUsePointsState.NOT_ENOUGH_POINTS
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
  return pendingPayment.fiatAmount ? paymentDetails.value?.cashback.percentage * pendingPayment.fiatAmount / 100 : paymentDetails.value?.cashback.amount_in_luna / 1e5
})

async function pay() {
  if (pendingPayment === null)
    return
  const loading = await loadingController.create({})
  loading.present()
  setTimeout(() => {
    loading.dismiss()
  }, 1 * 60 * 1e3)
  // TODO: Handle errors
  // TODO: check if payment is still valid when paying directly with NIM
  await instantPayWallet.completePendingPayment(pendingPayment, isPayingWithPoints.value)
  await loading.dismiss()

  showNotificationAlert('Payment successful')
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
    <div class="grid w-full h-full grid-rows-[2fr_1fr]">
      <div class="flex flex-col items-center self-start">
        <!-- Store Name -->
        <div v-if="pendingPayment?.label" class="flex items-center justify-center mb-8 gap-x-3">
          <IonIcon :icon="basket" class="w-8 h-8 p-1 rounded-full bg-space/5" />
          <span class="text-2xl font-bold"> {{ pendingPayment?.label }} </span>
        </div>
        <!-- Payment Amount -->
        <div class="flex flex-col justify-center gap-y-2">
          <div v-if="pendingPayment?.fiatAmount" class="flex items-center justify-center gap-x-2">
            <span class="text-3xl uppercase text-space/60">{{ pendingPayment?.fiatAmount }} {{ pendingPayment?.fiatUnit }}</span>
            <InfoIcon class="w-4 h-4 stroke-2 opacity-60" />
          </div>
          <p class="text-5xl">
            {{ (pendingPayment?.amount || 0) / 1e5 }} NIM
          </p>
          <p class="text-base font-semibold text-space/60">
            Fees might apply ~{{ (pendingPayment?.fee || 0) / 1e5 }} NIM
          </p>
          <!-- Cashback -->
          <Transition name="slide-fade" mode="out-in">
            <!-- TODO: use component -->
            <div v-if="cashbackAmount && instantPayWallet.balanceRaw.value > (pendingPayment?.amount || 0)" class="flex items-start justify-center mt-8 mb-auto font-semibold gap-x-2">
              <InfoIcon class="h-6 transition-colors stroke-2" :class="{ 'text-space/60': isPayingWithPoints }" />
              <span class="transition-colors" :class="{ 'text-space/60': isPayingWithPoints }">
                This purchase gets you {{ cashbackAmount }} {{ pendingPayment?.fiatUnit?.toUpperCase() || 'NIM' }} in CC Points.
              </span>
            </div>
          </Transition>
        </div>
      </div>
      <div class="flex flex-col items-center self-end justify-between w-full h-full">
        <!-- Use Points Toggle -->
        <IonToggle v-if="paymentDetails?.valid" :disabled="canUsePoints !== CanUsePointsState.CAN_USE_POINTS" label-placement="end" class="mb-4" @ion-change="(e) => isPayingWithPoints = e.detail.checked">
          <div class="flex items-center text-lg">
            <span class="mr-2">Use</span>
            <CryptoCityLogo class="w-5 h-5 mr-1" />
            <span>{{ ((pendingPayment?.amount || 0) / 1e5).toLocaleString() }}</span>
          </div>
        </IonToggle>
        <!-- Message under Toggle -->
        <div class="mb-auto font-semibold">
          <Transition name="slide-fade" mode="out-in">
            <p v-if="instantPayWallet.balanceRaw.value < (pendingPayment?.amount || 0) && canUsePoints !== CanUsePointsState.CAN_USE_POINTS" class="text-pumpkin">
              You don't have enough NIM for this purchase.
            </p>
            <p v-else-if="canUsePoints === CanUsePointsState.NOT_ENOUGH_POINTS" class="text-space/60">
              You don't have enough CC Points for this purchase.
            </p>
            <p v-else class="text-space/60">
              There is no cashback reward when paying with CC Points.
            </p>
          </Transition>
        </div>
        <!-- TODO: how to display this? -->
        <p v-if="isPayingWithPoints && paymentDetails?.reason" class="mt-auto text-red-500 -top-6">
          {{ paymentDetails?.reason }}
        </p>
        <p v-if="nimiqNetworkClient.consensusState.value !== 'established'" class="mt-auto text-red-500 -top-6">
          Consensus {{ nimiqNetworkClient.consensusState.value }}
        </p>
        <!-- Pay Button -->
        <IonButton size="large" expand="block" class="w-11/12 max-w-xs min-w-[10rem]" :disabled="nimiqNetworkClient.consensusState.value !== 'established' || (isPayingWithPoints && !isPaymentValid)" @click="() => pay()">
          Pay
        </IonButton>
      </div>
    </div>
  </ModalTemplate>
</template>
