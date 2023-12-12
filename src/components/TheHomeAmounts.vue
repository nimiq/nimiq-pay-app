<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { PriceStatus, usePrice } from '@/composables/usePrice'
import { useRemoteSigner } from '@/stores/remote-signer'

const { remoteBalance: balance } = storeToRefs(useRemoteSigner())

const { fiat, crypto, closestPreviousFiatPrice, state } = usePrice(balance)
</script>

<template>
  <div class="flex flex-col items-center w-full gap-y-8">
    <div v-if="PriceStatus.Initial === state || PriceStatus.Loading === state" class="w-10 h-6 bg-space/5 animate-pulse" />
    <div v-else class="flex flex-col items-center gap-y-2">
      <!-- TODO Define how we want to load this value. Show loading state? Show the closest previous fiat price? -->
      <h1>{{ fiat.formatted || closestPreviousFiatPrice.formatted }}</h1>
      <div class="flex gap-x-4">
        <span class="text-space/50">{{ crypto.formatted }}</span>
        <span class="text-space/50">🚧24h</span>
      </div>
    </div>
  </div>
</template>
