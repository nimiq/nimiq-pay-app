<script setup lang="ts">
import { IonIcon, IonRippleEffect } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'

defineProps({
  progress: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    default: 0,
  },
  taskName: {
    type: String,
    default: '',
  },
  reward: {
    type: Number,
    default: 0,
  },
  highlight: {
    type: Boolean,
    default: false,
  },
  large: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div
    class="p-4 pr-10 text-xl font-semibold text-blue-600 bg-blue-100 rounded-lg min-h-[10rem] relative ion-activatable ripple-parent overflow-hidden"
    :class="{ 'text-blue-50 bg-blue-500': highlight }"
  >
    <IonIcon :icon="chevronForwardOutline" size="large" class="absolute right-0 bottom-2" />
    <span v-if="total" class="absolute text-sm top-2 right-3">
      {{ progress }}/{{ total }}
    </span>
    <div class="flex flex-col gap-y-2">
      <h2 class="text-lg font-semibold" :class="{ 'text-blue-50 !font-bold': highlight, '!text-xl w-3/4': large }">
        <slot />
      </h2>
      <p v-if="reward" class="text-lg font-light">
        You earn {{ reward }} NIM
      </p>
    </div>
    <IonRippleEffect />
  </div>
</template>
