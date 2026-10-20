<script setup lang="ts">
import { IonButton } from '@ionic/vue'

defineProps<{
  title: string
  message?: string
  confirmLabel: string
  confirmColor?: string
}>()

defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <!-- Covers the chat card it is placed in (absolute, always on top) -->
  <div class="absolute inset-0 bg-black/30 flex items-center justify-center z-10 rounded-2xl p-6">
    <div class="bg-white rounded-2xl p-6 flex flex-col gap-4 shadow-lg w-full max-w-xs">
      <p class="text-space font-semibold text-base text-center">
        {{ title }}
      </p>
      <p v-if="message" class="text-space/60 text-sm text-center leading-relaxed">
        {{ message }}
      </p>
      <div class="flex gap-3">
        <IonButton fill="clear" expand="block" class="flex-1 h-0" @click.stop="$emit('cancel')">
          {{ $t('Cancel') }}
        </IonButton>
        <IonButton fill="solid" expand="block" class="flex-1 h-0" :color="confirmColor" @click.stop="$emit('confirm')">
          {{ confirmLabel }}
        </IonButton>
      </div>
    </div>
  </div>
</template>
