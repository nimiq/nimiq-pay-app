<script setup lang="ts">
import { IonIcon, IonItem } from '@ionic/vue'
import { basket } from 'ionicons/icons'
import { type PropType, computed, onMounted } from 'vue'
import { Modal, useModal } from '@/composables/useModal'

const props = defineProps({
  tx: {
    type: Object as PropType<Transaction>,
    required: true,
  },
})

const { showModal } = useModal()
const direction = computed(() => {
  if (!props.tx)
    return 1
  return props.tx.type === 'deposit' ? 1 : -1
})

onMounted(() => {
  console.log(props)
})
</script>

<template>
  <IonItem
    :button="true" :detail="false"
    style="--padding-start: 0; --padding-end: 0; --inner-padding-end: 0; --inner-padding-start: 0; --background: transparent;"
    class="my-6 rounded"
    @click="showModal(Modal.DetailedTransaction, { isOnTop: true, componentProps: { tx } })"
  >
    <div class="flex items-center w-full text-space gap-x-3">
      <IonIcon slot="start" :icon="basket" size="large" class="p-1 rounded-full w-7 h-7 bg-space/5" />
      <div class="font-semibold">
        <p class="text-base">
          {{ tx.type === 'deposit' ? 'Top Up' : tx.title }}
        </p>
        <p class="text-sm text-space/50">
          {{ tx.datetime }}
        </p>
      </div>
      <div class="ml-auto text-right">
        <p v-if="tx.fiatAmount" class="text-base font-bold">
          {{ direction * tx.fiatAmount }} {{ tx.fiatUnit?.toLocaleUpperCase() }}
        </p>
        <p :class="tx.fiatAmount ? 'text-sm font-semibold text-space/50' : '!text-space !text-base !font-bold'">
          {{ (direction * tx.amount / 1e5).toFixed(2) }} NIM
        </p>
      </div>
    </div>
  </IonItem>
</template>
