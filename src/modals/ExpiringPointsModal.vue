<script setup lang="ts">
import { IonGrid } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ $t('Expiring Points') }}
    </template>
    <template #subtitle>
      {{ $t('These Points are made for spending. Get out there and help drive crypto adoption.') }}
    </template>
    <IonGrid class="flex flex-col self-start mt-8 gap-y-6">
      <!-- TODO: get this from API -->
      <!-- <IonRow v-for="i in 5" :key="i" class="flex justify-between w-full">
        <span class="text-base font-semibold">July</span>
        <div class="flex flex-col text-end">
          <div class="flex items-center gap-x-1">
            <CryptoCityLogo class="h-4 w-5 [&>path]:fill-space/40" />
            <span class="text-base font-bold">4000</span>
          </div>
          <span class="text-sm text-space/60">$3,44</span>
        </div>
      </IonRow> -->
    </IonGrid>
  </ModalTemplate>
</template>
