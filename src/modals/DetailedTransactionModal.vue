<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { basket, close } from 'ionicons/icons'
import type { PropType } from 'vue'
import { useModal } from '@/composables/useModal'
import { TransactionStatus, TransactionType } from '@/lib/storage-manager'

defineProps({
  tx: {
    type: Object as PropType<Transaction>,
    required: true,
  },
})

const { closeModal } = useModal()

function getDate(ts: number) {
  const date = new Date(ts * 1e3)
  return `${date.getDate().toString().padStart(2, '0')} ${date.toLocaleString('default', { month: 'long' })}`
}
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent>
    <h1 class="flex items-center justify-center mt-4 mb-12 text-4xl font-normal gap-x-2">
      <IonIcon :icon="basket" />
      {{ tx.title }}
    </h1>
    <div class="mb-8 text-center">
      <p v-if="tx.fiatAmount" class="text-5xl">
        {{ tx.fiatAmount.toFixed(2) }}{{ tx.fiatUnit }}
      </p>
      <p class="mt-3 text-2xl text-blue-300" :class="{ 'text-5xl text-blue-500': !tx.fiatAmount }">
        {{ (tx.amount / 1e5).toFixed(2) }} NIM
      </p>
    </div>
    <div class="flex items-center justify-center mb-8 text-blue-500 bg-blue-100 h-44">
      Map Address
    </div>
    <div class="flex flex-col px-4 text-xl gap-y-8">
      <p class="flex justify-between">
        <span class="text-blue-400">Status</span>
        <span>{{ TransactionStatus[tx.status] }}</span>
      </p>
      <p class="flex justify-between">
        <span class="text-blue-400">Date</span>
        <span>{{ getDate(tx.ts) }}</span>
      </p>
      <p v-if="tx.location" class="flex justify-between">
        <span class="text-blue-400">Location</span>
        <span>{{ tx.location }}</span>
      </p>
      <p class="flex justify-between">
        <span class="text-blue-400">Payment</span>
        <span>{{ tx.amount / 1e5 }} NIM</span>
      </p>
    </div>
  </IonContent>
</template>
