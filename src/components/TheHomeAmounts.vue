<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { usePrice } from '@/composables/usePrice'
import { useRemoteSigner } from '@/stores/remote-signer'
import PriceChange from '@/components/PriceChange.vue'

const { remoteBalance: balance } = storeToRefs(useRemoteSigner())

const { fiat, crypto } = usePrice(balance)
</script>

<template>
  <div class="flex flex-col items-center w-full gap-y-8">
    <div class="flex flex-col items-center gap-y-2">
      <!-- TODO Define how we want to load this value. Show loading state? Show the closest previous fiat price? -->
      <h1 class="text-5xl font-normal">
        {{ fiat.formatted }}
      </h1>
      <div class="flex font-semibold gap-x-4 text-space/60">
        <span>{{ crypto.formatted }}</span>
        <PriceChange />
      </div>
    </div>
  </div>
</template>
