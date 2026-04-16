<script setup lang="ts">
import { IonButton, IonButtons, IonToolbar } from '@ionic/vue'
import InfoIcon from '@/components/icons/info.vue'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
</script>

<template>
  <IonToolbar>
    <div class="flex items-center justify-between gap-2 p-2 m-2 text-sm rounded-lg" style="background: var(--radial-gradient-orange);">
      <div class="flex items-center gap-2">
        <InfoIcon class="size-4 stroke-[1.5] shrink-0 text-white" />
        <p class="font-bold text-white">
          {{ $t('There is no "Forgot Password"') }}
        </p>
      </div>
      <IonButtons>
        <IonButton
          fill="solid" class="font-bold text-white normal-case"
          size="small" @click="initializeFlow(FlowName.Backup, { analyticsSource: 'backup_banner' })"
        >
          <span class="text-nowrap">
            {{ $t('Recovery Words') }}
          </span>
        </IonButton>
      </IonButtons>
    </div>
  </IonToolbar>
</template>

<style scoped>
ion-button {
  --background: #ffffff33 !important;
}
</style>
