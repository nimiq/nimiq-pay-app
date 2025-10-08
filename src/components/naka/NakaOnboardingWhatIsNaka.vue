<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import NakaCard from '@/components/naka/NakaCard.vue'
import { stepEmits } from '@/lib/flows/steps.types'

defineEmits(stepEmits)
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="flex flex-1 items-center justify-center">
      <NakaCard class="translate-y-[-50%]" />
    </div>
    <IonButton size="small" class="self-stretch my-6 text-base font-bold mt-auto" @click="$emit('done')">
      {{ $t('Got it') }}
    </IonButton>
  </div>
</template>
