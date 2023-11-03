<script setup lang="ts">
import { IonIcon, IonItem } from '@ionic/vue'
import { basket } from 'ionicons/icons'
import type { PropType } from 'vue'
import { ModalType, useModal } from '@/composables/useModal'

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
    style="--padding-start: 0; --padding-end: 0; --inner-padding-end: 0; --inner-padding-start: 0; --background: transparent;"
    class="my-6 rounded"
    @click="showModal(ModalType.DetailedTransaction, { isOnTop: true, componentProps: { tx } })"
  >
    <div class="flex items-center w-full text-space gap-x-3">
      <IonIcon slot="start" :icon="basket" size="large" class="p-1 rounded-full w-7 h-7 bg-space/5" />
      <div class="font-semibold">
        <p class="text-base">
          {{ tx.title }}
        </p>
        <p class="text-sm text-space/50">
          {{ tx.datetime }}
        </p>
      </div>
      <div class="ml-auto text-right">
        <p class="text-base font-bold">
          {{ tx.fiatUnit?.toLocaleUpperCase() }} {{ tx.fiatAmount }}
        </p>
        <p class="text-sm font-semibold text-space/50" :class="{ 'text-blue-500 text-xl': !tx.fiatAmount }">
          {{ (tx.amount / 1e5).toFixed(2) }} NIM
        </p>
      </div>
    </div>
  </IonItem>
</template>
