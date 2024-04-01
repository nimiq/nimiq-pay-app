<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import InfoIcon from '@/components/icons/info.vue'

defineEmits<{ done: [] }>()
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="mt-auto flex gap-2 items-baseline">
      <InfoIcon class="size-3 stroke-[1.5] text-space/50 shrink-0" />
      <p class="text-space/60 text-pretty">
        The backup is a list of 12 words. Please make sure no one can see your screen before continuing.
      </p>
    </div>
    <IonButton size="small" class="text-base font-bold my-6 self-stretch" @click="$emit('done')">
      {{ $t('No one can see me') }}
    </IonButton>
  </div>
</template>
