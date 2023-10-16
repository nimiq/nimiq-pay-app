<script setup lang="ts">
import { IonIcon, IonRippleEffect } from '@ionic/vue'
import { close } from 'ionicons/icons'

const emit = defineEmits({
  close: () => true,
})

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="p-4 pr-8 text-xl font-bold text-blue-600 bg-blue-100 rounded-lg min-h-[10rem] relative ion-activatable ripple-parent">
    <!-- Padding to prevent miss click in card when wanting to click on close button -->
    <IonIcon :icon="close" class="absolute pb-2 pl-2 top-2 right-3" @click.stop="handleClose" />
    <p class="w-[50vw] snap-start">
      <slot />
    </p>
    <IonRippleEffect />
  </div>
</template>
