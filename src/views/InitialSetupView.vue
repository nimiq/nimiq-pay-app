<script setup lang="ts">
import { IonNav } from '@ionic/vue'
import { markRaw } from 'vue'
import Initial from '@/modals/setup/Initial.vue'
</script>

<template>
  <IonNav data-ion-nav :root="markRaw(Initial)" />
</template>
