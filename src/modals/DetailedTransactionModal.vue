<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { basket, close } from 'ionicons/icons'
import { type PropType, onMounted } from 'vue'
import { useModal } from '@/composables/useModal'
import type { Transaction } from '@/types/transactions'

defineProps({
  tx: {
    type: Object as PropType<Transaction>,
    required: true,
  },
})

const { closeModal } = useModal()

// function getDate(ts: number) {
//   const date = new Date(ts * 1e3)
//   return `${date.getDate().toString().padStart(2, '0')} ${date.toLocaleString('default', { month: 'long' })}`
// }
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.stop="closeModal()" />
      </IonButtons>
      <IonButtons slot="end">
        <IonButton @click.stop="closeModal()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent>
    <div class="flex items-center justify-center mt-6 mb-8 gap-x-3">
      <IonIcon :icon="basket" class="w-8 h-8 p-1 rounded-full bg-space/5" />
      <span class="text-2xl font-bold"> {{ tx.title }} </span>
    </div>
    <div class="mb-20 text-center">
      <p v-if="tx.fiatAmount" class="mb-2 text-3xl uppercase text-space/60">
        {{ tx.fiatUnit }} {{ tx.fiatAmount.toLocaleString() }}
      </p>
      <p class="text-5xl">
        {{ (tx.value / 1e5).toLocaleString() }} NIM
      </p>
    </div>
    <!--
      <div class="flex items-center justify-center mb-8 text-blue-500 bg-blue-100 h-44">
      Map Address
    </div>
    -->
    <div class="flex flex-col px-6 text-lg gap-y-8">
      <p class="flex justify-between text-space/60">
        <span>Status</span>
        <span>{{ tx.status }}</span>
      </p>
      <p class="flex justify-between text-space/60">
        <span>Date</span>
        <span>{{ (new Date(tx.ts * 1e3)).toLocaleDateString() }}</span>
      </p>
      <p v-if="tx.location" class="flex justify-between text-space/60">
        <span>Location</span>
        <span>{{ tx.location }}</span>
      </p>
    </div>
  </IonContent>
</template>
