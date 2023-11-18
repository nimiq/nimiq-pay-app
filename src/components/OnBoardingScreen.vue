<script setup lang="ts">
import { IonButton } from '@ionic/vue'

const emit = defineEmits<{ (e: 'done'): void }>()
</script>

<template>
  <div>
    <IonButton @click="emit('done')">
      Done
    </IonButton>
  </div>
</template>
