<script setup lang="ts">
import { IonBackButton, IonButtons, IonItem, IonList, IonToggle } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useModal } from '@/composables/useModal'
import { useApp } from '@/stores/app'

const { closeModal } = useModal()
const { reopenMiniAppWebviewAfterResume } = storeToRefs(useApp())
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <div class="w-full h-full flex flex-col">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        {{ $t('Mini Apps') }}
      </p>
      <IonList lines="none">
        <IonItem>
          <IonToggle :checked="reopenMiniAppWebviewAfterResume" @ion-change="reopenMiniAppWebviewAfterResume = $event.detail.checked">
            {{ $t('Reopen Mini App on unlock') }}
          </IonToggle>
        </IonItem>
      </IonList>
    </div>
  </ModalTemplate>
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-start: 0;
  --padding-end: 0;
}
</style>
