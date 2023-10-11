<script setup lang="ts">
import { markRaw } from 'vue'
import { IonNav } from '@ionic/vue'
import PayScanner from './PayScanner.vue'
</script>

<template>
  <IonNav data-pay-nav :root="markRaw(PayScanner)" />
</template>
