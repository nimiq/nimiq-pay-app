<script setup lang="ts">
import type { PropType } from 'vue'
import TransactionAmounts from './TransactionAmounts.vue'
import type { ExternalTransaction } from '@/types/transactions'

defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, tx: { type: Object as PropType<ExternalTransaction>, required: true } })
</script>

<template>
  <div v-if="tx" class="flex flex-col items-center justify-center mt-8">
    <TransactionAmounts :tx="tx" />

    <div class="grid w-[calc(100vw-16px)] mt-10 border rounded-md border-space/10">
      <!-- TODO Replace the box below this with the map -->
      <div class="bg-space/[0.06] grid place-content-center text-space font-bold font-mono h-60">
        🚧 Map Preview 🚧
      </div>
    </div>

    <div v-if="tx" class="grid justify-between w-full grid-cols-[1fr,auto] gap-y-4 mt-10 text-space/60 text-lg [&>*:nth-child(even)]:text-right">
      <div>Status</div>
      <div class="capitalize">
        {{ tx.status || 'Unknown' }}
      </div>

      <div>Date</div>
      <div>
        {{ new Date(tx.timestamp).toLocaleString() }}
      </div>

      <!-- TODO Add the geo location name -->
    </div>
  </div>
</template>
