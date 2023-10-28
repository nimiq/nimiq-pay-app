<script setup lang="ts">
import { IonGrid, IonRow } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
</script>

<template>
  <ModalTemplate>
    <template #title>
      Expiring CC Points
    </template>
    <IonGrid class="flex flex-col self-start mt-8 gap-y-6">
      <!-- TODO: get this from API -->
      <IonRow v-for="i in 5" :key="i" class="flex justify-between w-full text-blue-500">
        <span class="text-xl">July</span>
        <div class="flex flex-col text-end">
          <span class="text-lg">3,44 €</span>
          <div class="flex items-center gap-x-1">
            <CryptoCityLogo class="h-3" />
            <span class="text-sm text-blue-300">4000</span>
          </div>
        </div>
      </IonRow>
    </IonGrid>
  </ModalTemplate>
</template>
