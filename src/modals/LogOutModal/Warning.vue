<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonToolbar } from '@ionic/vue'
import { close } from 'ionicons/icons'
import InfoIcon from '@/components/icons/info.vue'
import { useModal } from '@/composables/useModal'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'

const { closeAllModals } = useModal()
</script>

<template>
  <IonHeader class="ion-no-border">
    <IonToolbar>
      <IonButtons slot="end">
        <IonButton @click.stop="() => closeAllModals()">
          <IonIcon :icon="close" class="text-white bg-[#DADADA] rounded-full p-1 w-5 h-5" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
  <div class="flex flex-col items-center h-full p-8 pt-0 text-center">
    <h1 class="text-2xl font-bold">
      {{ $t('Backup your account before logging out') }}
    </h1>
    <div class="flex items-start justify-center mt-8 font-semibold gap-x-2 text-pumpkin">
      <InfoIcon class="h-6 w-5 stroke-[1.5] text-pumpkin" />
      <span>{{ $t('Your account, funds and data will be lost if you log out without a backup.') }}</span>
    </div>

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base" @click="initializeFlow(FlowName.Backup, { analyticsSource: 'logout_warning' })">
      {{ $t('Backup Account') }}
    </IonButton>
  </div>
</template>
