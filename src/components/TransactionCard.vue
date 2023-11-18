<script setup lang="ts">
import { IonIcon, IonItem } from '@ionic/vue'
import { basket } from 'ionicons/icons'
import type { PropType } from 'vue'
import { Modal, useModal } from '@/composables/useModal'
import { TransactionType } from '@/lib/storage-manager'

defineProps({
  tx: {
    type: Object as PropType<Transaction>,
    required: true,
  },
})

const { showModal } = useModal()
</script>

<template>
  <IonItem
    :button="true" :detail="false"
    style="--padding-start: 0; --padding-end: 0; --inner-padding-end: 0; --inner-padding-start: 0;"
    class="my-6 rounded"
    @click="showModal(Modal.DetailedTransaction, { isOnTop: true, componentProps: { tx } })"
  >
    <div class="flex items-center w-full text-blue-500 gap-x-2">
      <IonIcon slot="start" :icon="basket" size="large" />
      <div>
        <p class="text-xl">
          {{ tx.title }}
        </p>
        <p class="text-blue-300">
          {{ tx.datetime }}
        </p>
      </div>
      <div class="ml-auto text-right">
        <p class="text-xl">
          {{ tx.fiatAmount }}
        </p>
        <p class="text-blue-300" :class="{ 'text-blue-500 text-xl': !tx.fiatAmount }">
          {{ (tx.amount / 1e5).toFixed(2) }} NIM
        </p>
      </div>
    </div>
  </IonItem>
</template>
