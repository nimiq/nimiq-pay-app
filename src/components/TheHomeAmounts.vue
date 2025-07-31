<script setup lang="ts">
import PriceChange from '@/components/PriceChange.vue'
import { usePrice } from '@/composables/usePrice'
import { useLocks } from '@/stores/locks'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useSync } from '@/stores/sync'
import { IonSkeletonText } from '@ionic/vue'
import { FiatAmount } from '@nimiq/vue3-components'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const { remoteBalance: balance } = storeToRefs(useRemoteSigner())
const { isTransactionPending } = storeToRefs(useSync())
const { isProcessingRemote } = storeToRefs(useLocks())
const { fiat, crypto } = usePrice(balance)

/**
 * Show skeleton if:
 *  - Balance is not set (fetching)
 *  - The nodes are not synced (we don't know the balance yet)
 *  - The HTLC is being created and the tx is not mined yet (balance -1)
 *  - The balance is 0 and the HTLC is not active yet (could be because there is an extension or the HTLC was not found when previously there was an active HTLC)
 */
const showSkeleton = computed(() => balance.value < 0 || (balance.value === 0 && isTransactionPending.value) || isProcessingRemote.value)
</script>

<template>
  <div class="w-full flex flex-col items-center gap-y-8">
    <div v-if="showSkeleton" class="max-w-[80%] w-48 flex flex-col items-center gap-y-2">
      <IonSkeletonText animated class="w-full h-11" />
      <div class="w-full h-5 flex gap-x-4 px-2">
        <IonSkeletonText animated class="small w-3/5" />
        <IonSkeletonText animated class="small w-2/5" />
      </div>
    </div>
    <div v-else class="flex flex-col items-center gap-y-2">
      <FiatAmount class="text-5xl font-normal text-space" :amount="fiat.total" :currency="fiat.currency" :hide-decimals="false" :max-relative-deviation="1" />
      <div class="text-space/60 flex gap-x-4 font-semibold">
        <span class="whitespace-nowrap">{{ crypto.formatted }}</span>
        <PriceChange />
      </div>
    </div>
  </div>
</template>

<style scoped>
ion-skeleton-text {
  --border-radius: 6px;
  --background: rgba(31, 35, 72, .1);
}

ion-skeleton-text.small {
  --border-radius: 3px;
}
</style>
