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
  <div class="p-4 text-xl rounded-md h-full relative ion-activatable ripple-parent bg-white shadow-card">
    <!-- Padding to prevent miss click in card when wanting to click on close button -->
    <button aria-label="close notification card" class="absolute pb-2 pl-2 top-2 right-2 text-space/40" @click.stop="handleClose">
      <IonIcon :icon="close" />
    </button>
    <div class="w-[50vw]">
      <!-- Margin to give some space for the close button to prevent overlapping -->
      <span class="block text-lg font-bold text-sky leading-tight mr-4">
        <slot />
      </span>
      <p class="mt-2 text-base text-space/60">
        <slot name="subtitle" />
      </p>
    </div>
    <IonRippleEffect />
  </div>
</template>
