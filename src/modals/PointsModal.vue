<script setup lang="ts">
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonRefresher, IonRefresherContent, IonRow, IonSpinner, IonToolbar } from '@ionic/vue'
import { chevronForwardOutline, close } from 'ionicons/icons'
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { Modal, useModal } from '@/composables/useModal'
import TaskCard from '@/components/TaskCard.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import { usePrice } from '@/composables/usePrice'
import { usePoints } from '@/stores/points'
import { useApp } from '@/stores/app'
import { FlowName } from '@/lib/flows/steps.types'
import { initializeFlow } from '@/lib/flows'

const { pointsBalance, tasks } = storeToRefs(usePoints())
const { fiat } = usePrice(pointsBalance)
const { phoneNumberVerified } = storeToRefs(useApp())
const { updatePointsBalance, updateTasks } = usePoints()
const { closeModal, showModal } = useModal()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
        <IonButton @click="() => closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="ion-padding">
    <IonRefresher slot="fixed" @ion-refresh="handleRefresh($event)">
      <IonRefresherContent />
    </IonRefresher>

    <IonGrid class="flex flex-col gap-y-2">
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
      <!-- Featured -->
      <IonRow>
        <p class="ml-1 text-sm font-bold uppercase text-space/60">
          {{ $t('Featured') }}
        </p>
      </IonRow>

      <!-- Referral -->
      <IonRow class="mb-8">
        <!-- TODO: get amount from API -->
        <TaskCard large class="text-white" style="background: var(--radial-gradient-orange);" @click="showModal(Modal.Referral, { isOnTop: true })">
          {{ $t('Invite a friend and earn up to 200 Points each!') }}
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
          <IonSpinner />
          <p>{{ $t('Loading tasks…') }}</p>
        </IonRow>
      </Transition>
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

ion-spinner {
  --color: rgb(59 130 246);
}
</style>
