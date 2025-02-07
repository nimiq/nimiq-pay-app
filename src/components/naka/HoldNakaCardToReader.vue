<script setup lang="ts">
import NakaCard from '@/components/icons/naka-card.vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { NakaCardStatus, useNaka } from '../../stores/naka'
import { onMounted, onUnmounted } from 'vue'

const { card } = useNaka()

const emit = defineEmits(stepEmits)

onMounted(() => {
  // TODO: Start websocket connection to issuer server
})

onUnmounted(() => {
  // TODO: Close websocket connection to issuer server
})

function setPaymentRequest() {
  emit('done', 'potato')
}
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <template v-if="card">
      <NakaCard class="w-full h-auto" />
      <div v-if="card.statusId === NakaCardStatus.Active" class="mt-6 text-[#0075E1] opacity-60">
        {{ $t('Hold near the terminal to pay') }}
      </div>
    </template>
    <div v-else>
      No NAKA card found
    </div>
    <!-- <button v-if="card && card.statusId === NakaCardStatus.Active"
      class="mt-auto text-sm font-bold mb-16 text-gray-400 border border-gray-400 border-solid px-3 py-1 rounded-full"
      @click="setPaymentRequest"
    >
      Simulate NFC tap-to-pay
    </button> -->
  </div>
</template>
