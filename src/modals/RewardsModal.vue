<script setup lang="ts">
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonRow, IonSpinner, IonToolbar } from '@ionic/vue'
import { chevronForwardOutline, close } from 'ionicons/icons'
import { inject, onMounted, ref, watch } from 'vue'
import { until } from '@vueuse/core'
import { ModalType, useModal } from '@/composables/useModal'
import TaskCard from '@/components/TaskCard.vue'
import { BonusWallet } from '@/lib/bonus-wallet'

const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const { closeModal, showModal } = useModal()
const tasks = ref<Task[]>([])
const isTaskShown = ref(false)

onMounted(async () => {
  tasks.value = (await bonusWallet.getTasks()).sort((a, b) => a.order - b.order)
  await until(tasks).changed({ timeout: 1000 })
  isTaskShown.value = true
  // console.log(tasks.value)
  // const task = await bonusWallet.getTask(tasks.value[0].id)
  // console.log(task)
})
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click="() => closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="ion-padding">
    <IonGrid class="flex flex-col gap-y-2">
      <IonRow class="ion-justify-content-center">
        <!-- TODO: get this from API -->
        <h1 class="text-5xl font-light">
          4000 NIM
        </h1>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <p class="">
          3,44 €
        </p>
      </IonRow>
      <IonRow class="ion-justify-content-center">
        <IonButton fill="clear" class="font-medium" @click="showModal(ModalType.ExpiringRewards, { isOnTop: true })">
          800 NIM expiring soon <IonIcon slot="end" :icon="chevronForwardOutline" />
        </IonButton>
      </IonRow>
      <!-- Earn NIM -->
      <IonRow>
        <p class="mt-4 ml-1 text-lg font-semibold">
          Earn NIM
        </p>
      </IonRow>

      <!-- Referral -->
      <IonRow class="mt-4">
        <TaskCard highlight large>
          Invite a friend and earn up to 20€ both!
        </TaskCard>
      </IonRow>

      <!-- Tasks -->
      <Transition mode="out-in">
        <IonRow v-if="isTaskShown" class="flex gap-2">
          <IonCol v-for="task in tasks" :key="task.id">
            <!-- TODO: Do we really need different bg? -->
            <TaskCard :reward="task.reward_amount / 1e5" class="h-full" :class="{ 'bg-blue-200/80': !(task.order % 3) }">
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
