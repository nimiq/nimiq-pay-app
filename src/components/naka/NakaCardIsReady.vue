<script setup lang="ts">
import NakaCard from '@/components/icons/naka-card.vue'
</script>

<template>
  <div class="flex flex-col items-center pb-8">
    <NakaCard />
    <h2 class="z-10 mt-4 flex justify-center items-center gap-x-3 text-2xl font-bold text-balance text-center small:mt-0">
      {{ $t('NAKA Card is Ready!') }}
    </h2>
    <p class="z-10 mt-2 text-pretty text-center opacity-60">
      {{ $t('Tap on the PAY button and  pay in a few steps, in many locations.') }}
    </p>
  </div>
</template>
