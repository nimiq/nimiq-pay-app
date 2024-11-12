<script setup lang="ts">
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import Gamepad from '@/components/icons/gamepad.vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import TaskCard from '@/components/TaskCard.vue'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { toCoins, usePrice } from '@/composables/usePrice'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { Crypto, useApp } from '@/stores/app'
import { usePoints } from '@/stores/points'
import { IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonRefresher, IonRefresherContent, IonRow, IonToolbar } from '@ionic/vue'
import { computedAsync } from '@vueuse/core'
import { chevronForwardOutline, close } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const logger = useLogger('PointsModal')

const { pointsBalance, tasks, isCampaignActive } = storeToRefs(usePoints())
const { fiat } = usePrice(pointsBalance)
const { phoneNumberVerified } = storeToRefs(useApp())
const { updatePointsBalance, updateTasks, getReferralInfo } = usePoints()
const { closeModal, showModal } = useModal()

const referralInfo = computedAsync(async () => {
  const { data, error } = await getReferralInfo()
  if (error) {
    logger.error('Error getting referral info:', error)
    return null
  }
  return data
})
const referralRewardAmount = computed(() => toCoins(referralInfo.value?.reward || 0, Crypto.NIM))
// const referralClaimsRemaining = computed(() => referralInfo.value?.claims_remaining || 0)

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

async function handleRefresh(event: CustomEvent) {
  await Promise.all([
    sleep(2000),
    updatePointsBalance(),
    updateTasks(),
  ])
  event.detail.complete()
}

onMounted(async () => {
  // If phone number is not verified, show the modal
  if (!phoneNumberVerified.value) {
    initializeFlow(FlowName.VerifyPhone)
    return
  }

  await updatePointsBalance()

  await updateTasks()
})
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <button aria-label="close points modal" class="px-3 py-2" @click="() => closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </button>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="ion-padding">
    <IonRefresher slot="fixed" @ion-refresh="handleRefresh($event)">
      <IonRefresherContent />
    </IonRefresher>

    <IonGrid class="flex flex-col h-full gap-y-2">
      <h2 class="max-w-sm mb-6 text-2xl font-bold text-center text-balance">
        {{ $t('Cryptocity Points') }}
      </h2>
      <IonRow class="flex flex-col items-center justify-center mb-10 gap-y-2">
        <h1 class="flex items-center text-5xl font-normal gap-x-2">
          <CryptoCityLogo class="h-11 w-9" />
          {{ (pointsBalance / 1e5).toLocaleString() }}
        </h1>
        <p class="text-base font-semibold text-space/60">
          {{ fiat.formatted }}
        </p>
        <button class="flex items-center text-base font-bold normal-case text-sky gap-x-2" @click="showModal(Modal.ExpiringPoints, { isOnTop: true })">
          <!-- Use three different message versions depending on whether amount is 0, 1, or more -->
          <i18n-t slot="start" keypath="No Points are currently expiring | {amount} is expiring soon | {amount} are expiring soon" :plural="0 /* TODO use actual amount */">
            <template #amount>
              <CryptoCityLogo class="h-4" />
              <span>
                {{ 0 /* TODO display actual amount. Remember to use toLocaleString() */ }}
              </span>
            </template>
          </i18n-t>
          <IonIcon :icon="chevronForwardOutline" class="text-space/50" />
        </button>
      </IonRow>
      <div v-if="isCampaignActive">
        <!-- Featured -->
        <IonRow>
          <p class="ml-1 text-sm font-bold uppercase text-space/60">
            {{ $t('Featured') }}
          </p>
        </IonRow>

        <!-- Referral -->
        <IonRow class="mb-8">
          <TaskCard large class="text-white" style="background: var(--radial-gradient-orange);" @click="showModal(Modal.Referral, { isOnTop: true })">
            {{ $tc('Invite a friend! | Invite a friend and get {amount} Point each! | Invite a friend and get {amount} Points each!', referralRewardAmount, { amount: referralRewardAmount.toLocaleString() }) }}
          </TaskCard>
        </IonRow>

        <!-- Earn Points -->
        <IonRow>
          <p class="ml-1 text-sm font-bold uppercase text-space/60">
            {{ $t('Earn Points') }}
          </p>
        </IonRow>
        <!-- Tasks -->
        <Transition name="slide-fade" mode="out-in">
          <IonRow v-if="tasks" class="grid grid-cols-2 gap-2">
            <IonCol v-for="task in tasks" :key="task.id" class="col-span-1 last:odd:col-span-2">
              <!-- TODO: Do we really need different bg? -->
              <TaskCard :task="task" class="h-full text-white" style="background: var(--radial-gradient-light-blue);">
                {{ task.description }}
              </TaskCard>
            </IonCol>
          </IonRow>
          <IonRow v-else class="flex flex-col items-center justify-center gap-4 mt-8">
            <LoadingSpinner class="w-8 h-8 m-auto text-sky" />
            <p>{{ $t('Loading tasks…') }}</p>
          </IonRow>
        </Transition>
      </div>
      <div v-else class="flex flex-col items-center justify-center gap-y-6 mt-[20%]">
        <Gamepad class="w-20 text-sky" />
        <p class="font-bold text-center whitespace-pre-line text-space/60">
          {{ $t('No tasks available.\nStay tuned.') }}
        </p>
      </div>
    </IonGrid>
  </IonContent>
</template>

<style scoped>
ion-col {
  --ion-grid-column-padding: 0;
}

ion-row {
  column-gap: 0.5rem;
}
</style>
