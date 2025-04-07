<script setup lang="ts">
import NakaCard from '@/components/naka/NakaCard.vue'
</script>

<template>
  <div class="flex flex-col items-center pb-8">
    <NakaCard />
    <h2 class="z-10 mt-4 flex justify-center items-center gap-x-3 text-2xl font-bold text-balance text-center small:mt-0">
      {{ $t('Your NAKA Card is ready!') }}
    </h2>
    <p class="z-10 mt-2 text-pretty text-center opacity-60">
      {{ $t('Your ID has been successfully verified. Tap ‘Pay’ on the start screen and chose NAKA to pay.') }}
    </p>
  </div>
</template>
