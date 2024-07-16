<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { IonSkeletonText } from '@ionic/vue'
import { usePrice } from '@/composables/usePrice'
import { useRemoteSigner } from '@/stores/remote-signer'
import PriceChange from '@/components/PriceChange.vue'

const { remoteBalance: balance } = storeToRefs(useRemoteSigner())

const { fiat, crypto } = usePrice(balance)
</script>

<template>
  <div class="w-full flex flex-col items-center gap-y-8">
    <div v-if="balance < 0" class="max-w-[80%] w-48 flex flex-col items-center gap-y-2">
      <IonSkeletonText animated class="w-full h-11" />
      <div class="w-full h-5 flex gap-x-4 px-2">
        <IonSkeletonText animated class="small w-3/5" />
        <IonSkeletonText animated class="small w-2/5" />
      </div>
    </div>
    <div v-else class="flex flex-col items-center gap-y-2">
      <h1 class="text-5xl font-normal">
        {{ fiat.formatted }}
      </h1>
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
