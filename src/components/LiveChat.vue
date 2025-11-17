<script setup lang="ts">
import { IonButton, IonButtons, IonIcon, IonTitle, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
/**
 * This component displays the live chat inline widget when enabled.
 * It works together with the LiveChatBadge component, which displays the badge and handles all chat logic.
 * This component is always mounted to ensure the placeholder is present in the DOM when the widget (re-)initializes.
 */
import { storeToRefs } from 'pinia'
import { useLiveChat } from '@/stores/livechat'
import LoadingSpinnerIcon from './icons/loading-spinner.vue'

const { shown, loading } = storeToRefs(useLiveChat())
</script>

<template>
  <div class="overlay" :class="{ visible: shown }">
    <div class="w-6 h-6 -mt-6 ml-24 border-[12px] border-l-transparent border-r-transparent border-t-transparent border-b-white" />
    <div class="bg-white rounded-2xl overflow-hidden flex flex-col h-full">
      <IonToolbar>
        <IonTitle slot="start" class="font-bold text-2xl tracking-normal">
          Live Chat
        </IonTitle>
        <IonButtons slot="end">
          <IonButton @click.stop="shown = false">
            <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
      <div v-if="loading" class="text-center mb-10 flex flex-row gap-2 h-full items-center justify-center">
        <LoadingSpinnerIcon class="size-6 opacity-50" />
        <span class="text-space/50 text-xl font-semibold">{{ $t('Loading...')  }}</span>
      </div>
      <!-- Add this div in your DOM where you want the inline div to be inserted by Chatlio, change height/width to fit your needs -->
      <div id="chatlioWidgetPlaceholder" class="w-full flex-grow" />
    </div>
  </div>
</template>

<style scoped>
.overlay {
  --top-margin: 65px;
  position: fixed;
  top: -9999px;
  left: -9999px;
  bottom: 0.5rem;
  right: 0.5rem;
  width: calc(100% - 1rem);
  height: calc(100% - var(--top-margin) - 0.5rem);
  visibility: hidden;
  z-index: 1000;
}
.overlay.visible {
  top: var(--top-margin);
  left: 0.5rem;
  visibility: visible;
}
</style>
