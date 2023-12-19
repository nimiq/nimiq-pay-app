<script setup lang="ts">
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePrice } from '@/composables/usePrice'
import { useRemoteSigner } from '@/stores/remote-signer'

const { remoteBalance: balance } = storeToRefs(useRemoteSigner())

const { fiat, crypto } = usePrice(balance)
</script>

<template>
  <div class="flex flex-col items-center w-full gap-y-8">
    <div class="flex flex-col items-center gap-y-2">
      <!-- TODO Define how we want to load this value. Show loading state? Show the closest previous fiat price? -->
      <h1>{{ fiat.formatted }}</h1>
      <div class="flex gap-x-4">
        <span class="text-space/50">{{ crypto.formatted }}</span>
        <span class="text-space/50">🚧24h</span>
      </div>
    </div>
  </div>
</template>
