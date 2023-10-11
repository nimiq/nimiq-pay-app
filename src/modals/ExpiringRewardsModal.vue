<script setup lang="ts">
import { IonGrid, IonRow } from '@ionic/vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
</script>

<template>
  <ModalTemplate>
    <template #title>
      Expiring BonusNIM
    </template>
    <IonGrid class="flex flex-col self-start mt-8 gap-y-6">
      <!-- TODO: get this from API -->
      <IonRow v-for="i in 5" :key="i" class="flex justify-between w-full text-blue-500">
        <span class="text-xl">July</span>
        <div class="flex flex-col text-end">
          <span class="text-lg">3,44 €</span>
          <span class="text-sm text-blue-300">4000 NIM</span>
        </div>
      </IonRow>
    </IonGrid>
  </ModalTemplate>
</template>
