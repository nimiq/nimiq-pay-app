<script setup lang="ts">
import NakaCard from '@/components/icons/naka-card.vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { useIssuerWebSocket } from '../../lib/issuer-websocket'
import { NakaCardStatus, useNaka } from '../../stores/naka'

const emit = defineEmits(stepEmits)

const { card } = useNaka()

const { isReady } = useIssuerWebSocket()

function setPaymentRequest() { // eslint-disable-line unused-imports/no-unused-vars
  emit('done', 'potato')
}
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <template v-if="card">
      <NakaCard class="w-full h-auto" />
      <div v-if="!isReady" class="mt-6 text-orange-400 font-semibold">
        {{ $t('Connecting to issuer server...') }}
      </div>
      <div v-else-if="card.statusId === NakaCardStatus.Active" class="mt-6 text-[#0075E1] opacity-60">
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
