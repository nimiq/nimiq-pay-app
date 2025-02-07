<script setup lang="ts">
import CardDetails from '@/components/CardDetails.vue'
import NakaCard from '@/components/icons/naka-card.vue'

import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useNaka } from '@/stores/naka'

defineEmits(stepEmits)

const { card } = useNaka()

const cardDetails = {
  cardNumber: card?.cardNumber,
  cvv: card?.cvv,
  expiryDate: card?.expiryDate,
}
</script>

<template>
  <div>
    <NakaCard class="w-[calc(100vw-128px)] h-max" />

    <div class="mt-8 flex items-center gap-6">
      <button class="secondary">
        {{ $t('Show details') }}
      </button>
      <button class="secondary" @click="$emit('navigateTo', { step: StepName.NakaCardToggleFreeze })">
        {{ $t('Freeze card') }}
      </button>
    </div>

    <CardDetails v-bind="cardDetails" class="mt-12" />

    <h2 class="mt-12 text-[13px] font-bold tracking-wider uppercase text-space/60 lh-none">
      {{ $t('Payment limits') }}
    </h2>

    <button @click="$emit('navigateTo', { step: StepName.NakaCardDelete })">
      {{ $t('Block') }}
    </button>
  </div>
</template>

<style scoped>
button.secondary {
  background: rgba(31, 35, 72, 0.06);
  @apply px-4 py-1.5 rounded-full text-sm text-space font-bold;
}
</style>
