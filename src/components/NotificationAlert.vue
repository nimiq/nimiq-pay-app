<script setup lang="ts">
import { IonGrid, IonRow } from '@ionic/vue'
import CheckIcon from '@/components/icons/check.vue'

defineProps<{
  title: string
  subtitle?: string
  message?: string
  extra?: string
}>()
</script>

<template>
  <IonGrid class="px-10 py-8 min-h-[18rem] text-center flex flex-col">
    <IonRow class="ion-justify-content-center">
      <CheckIcon class="w-16" />
    </IonRow>
    <IonRow class="my-auto ion-justify-content-center">
      <h2 class="text-3xl font-semibold">
        {{ title }}
      </h2>
      <p class="text-opacity-90">
        {{ subtitle }}
      </p>
    </IonRow>
    <IonRow class="ion-justify-content-center">
      <p class="text-5xl">
        {{ message }}
      </p>
    </IonRow>
    <IonRow class="ion-justify-content-center">
      <p class="text-lg">
        {{ extra }}
      </p>
    </IonRow>
  </IonGrid>
</template>
