<script setup lang="ts">
import InfoIcon from '@/components/icons/info.vue'
import { IonButton } from '@ionic/vue'

defineEmits<{ done: [] }>()
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="flex items-baseline gap-2 mt-auto">
      <InfoIcon class="size-3 stroke-[1.5] text-space/50 shrink-0" />
      <p class="text-space/60 text-pretty">
        {{ $t('The backup is a list of 12 English words. Please make sure no one can see your screen before continuing.') }}
      </p>
    </div>
    <IonButton size="small" class="self-stretch my-6 text-base font-bold" @click="$emit('done')">
      {{ $t('No one can see me') }}
    </IonButton>
  </div>
</template>
