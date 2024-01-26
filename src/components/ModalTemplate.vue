<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonGrid, IonHeader, IonIcon, IonRow, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useModal } from '@/composables/useModal'

const props = defineProps({
  closeAll: {
    type: Boolean,
    default: false,
  },
  onClosing: {
    type: Function,
    default: () => {},
  },
})

const { closeModal, closeAllModals } = useModal()

function handleClose() {
  if (props.closeAll)
    closeAllModals()
  else
    closeModal()
  props.onClosing()
}
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <slot name="leftButton" />
      <IonButtons slot="end">
        <IonButton @click.stop="handleClose">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent class="text-center" style="--padding-top: 16px; --padding-bottom: 16px;">
    <IonGrid class="flex flex-col h-full gap-4 mx-6">
      <IonRow v-if="$slots.title" class="ion-justify-content-center">
        <h1 class="text-2xl font-bold text-balance">
          <slot name="title" />
        </h1>
      </IonRow>
      <IonRow v-if="$slots.subtitle" class="ion-justify-content-center">
        <p class="text-lg font-normal text-space/60 text-pretty">
          <slot name="subtitle" />
        </p>
      </IonRow>
      <IonRow v-if="$slots.error" class="text-lg text-space/60">
        <slot name="error" />
      </IonRow>
      <IonRow class="flex-1 ion-justify-content-center ion-align-items-center">
        <slot />
      </IonRow>
    </IonGrid>
  </IonContent>
</template>
