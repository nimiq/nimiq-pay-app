<script setup lang="ts">
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonRow, IonSpinner, IonToolbar } from '@ionic/vue'
import { chevronForwardOutline, close } from 'ionicons/icons'
import { type Ref, onMounted, ref } from 'vue'
import { computedAsync, until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { Modal, useModal } from '@/composables/useModal'
import TaskCard from '@/components/TaskCard.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import { useFiat } from '@/stores/fiat'
import { usePoints } from '@/stores/points'
import { useApp } from '@/stores/app'

const { formatCurrency, getPriceNow, getPriceAt } = useFiat()
const { pointsBalance } = storeToRefs(usePoints())
const { phoneNumberVerified } = storeToRefs(useApp())
const { getAllTasks } = usePoints()
const { closeModal, showModal } = useModal()
const tasks = ref<Task[]>([])
const isTaskShown = ref(false)
const currentPrice: Ref<number> = computedAsync(async () => {
  const { data, error } = await getPriceNow()
  if (error || !data) {
    console.error(error)
    const { data: lastKnownPrice, error: priceAtError } = await getPriceAt(Date.now())
    if (priceAtError || !lastKnownPrice) {
      console.error(priceAtError)
      return 0
    }
    return lastKnownPrice
  }

  return data
}, 0)

onMounted(async () => {
  // If phone number is not verified, show the modal
  if (!phoneNumberVerified.value)
    await showModal(Modal.NewPhone)

  const { data, error } = await getAllTasks()
  if (error || !data) {
    console.error(error)
    return
  }
  tasks.value = data
    .sort((a, b) => a.order - b.order)
    .sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed')
        return 1
      if (a.status !== 'completed' && b.status === 'completed')
        return -1
      return 0
    })
  await until(tasks).changed({ timeout: 1000 })
  isTaskShown.value = true
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
    <IonGrid class="flex flex-col gap-y-2">
      <IonRow class="flex items-center ion-justify-content-center">
        <CryptoCityLogo class="h-11 w-9" />
        <h1 class="text-5xl font-normal">
          {{ pointsBalance }}
        </h1>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <p class="text-base font-semibold text-space/60">
          $ {{ formatCurrency(pointsBalance * currentPrice) }}
        </p>
      </IonRow>
      <IonRow class="mb-4 ion-justify-content-center">
        <IonButton fill="clear" class="text-base font-bold normal-case text-sky" @click="showModal(Modal.ExpiringPoints, { isOnTop: true })">
          <CryptoCityLogo slot="start" class="h-5 w-[18px] mr-[6px]" />
          0 expiring soon
          <IonIcon slot="end" :icon="chevronForwardOutline" class="text-space/50" />
        </IonButton>
      </IonRow>
      <!-- Featured -->
      <IonRow>
        <p class="ml-1 text-sm font-bold uppercase text-space/60">
          Featured
        </p>
      </IonRow>

      <!-- Referral -->
      <IonRow class="mb-8">
        <!-- TODO: get amount from API -->
        <TaskCard large class="text-white" style="background: var(--radial-gradient-orange);" @click="showModal(Modal.Referral, { isOnTop: true })">
          Invite a friend and earn up to 200 Points both!
        </TaskCard>
      </IonRow>

      <!-- Earn Points -->
      <IonRow>
        <p class="ml-1 text-sm font-bold uppercase text-space/60">
          Earn Points
        </p>
      </IonRow>
      <!-- Tasks -->
      <Transition name="slide-fade" mode="out-in">
        <IonRow v-if="isTaskShown" class="grid grid-cols-2 gap-2">
          <IonCol v-for="task in tasks" :key="task.id" class="col-span-1 last:odd:col-span-2">
            <!-- TODO: Do we really need different bg? -->
            <TaskCard :task="task" class="h-full text-white" style="background: var(--radial-gradient-light-blue);">
              {{ task.description }}
            </TaskCard>
          </IonCol>
        </IonRow>
        <IonRow v-else class="flex flex-col items-center justify-center gap-4 mt-8">
          <IonSpinner />
          <p>
            Loading tasks...
          </p>
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
