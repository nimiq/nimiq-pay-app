<script setup lang="ts">
import { markRaw } from 'vue'
import { IonNav } from '@ionic/vue'
import Intro from './Intro.vue'
</script>

<template>
  <IonNav data-backup-nav :root="markRaw(Intro)" />
</template>
