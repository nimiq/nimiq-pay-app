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
    <IonGrid class="flex flex-col self-start mt-8 gap-y-6" />
  </ModalTemplate>
</template>
