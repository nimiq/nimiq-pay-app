<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import { useSlots } from 'vue'
import { useModal } from '@/composables/useModal'

defineProps({
  closeAll: {
    type: Boolean,
    default: false,
  },
})

const { closeModal, closeAllModals } = useModal()

const slots = useSlots()
const hasSlot = (name: string) => !!slots[name]
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <slot name="leftButton" />
      <IonButtons slot="end">
        <IonButton @click.stop="closeAll ? closeAllModals() : closeModal()">
          <IonIcon :icon="close" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <IonContent>
    <div class="flex flex-col h-full gap-4 px-12 text-center text-space">
      <h1>
        <slot name="title" />
      </h1>
      <p class="text-xl font-semibold opacity-80">
        <slot name="subtitle" />
      </p>

      <p v-if="hasSlot('error')" class="mt-4 text-tomato">
        <slot name="error" />
      </p>

      <div class="flex-1 mx-auto">
        <slot />
      </div>
    </div>
  </IonContent>
</template>
