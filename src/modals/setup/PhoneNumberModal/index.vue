<script setup lang="ts">
import { markRaw } from 'vue'
import { IonNav } from '@ionic/vue'
import EnterPhone from './EnterPhone.vue'
</script>

<template>
  <IonNav data-phone-nav :root="markRaw(EnterPhone)" />
</template>
