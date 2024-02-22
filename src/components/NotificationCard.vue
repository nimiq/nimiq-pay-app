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
  <div class="p-4 text-xl rounded-md min-h-[10rem] h-full relative ion-activatable ripple-parent bg-white shadow-card">
    <!-- Padding to prevent miss click in card when wanting to click on close button -->
    <IonIcon :icon="close" class="absolute pb-2 pl-2 top-2 right-2 text-space/40" @click.stop="handleClose" />
    <div class="w-[50vw]">
      <span class="text-lg font-bold text-sky">
        <slot />
      </span>
      <p class="mt-2 text-base text-space/60">
        <slot name="subtitle" />
      </p>
    </div>
    <IonRippleEffect />
  </div>
</template>
