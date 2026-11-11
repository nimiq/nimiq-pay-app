<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonItem, IonLabel, IonList, IonToggle } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useModal } from '@/composables/useModal'
import { useApp } from '@/stores/app'
import { useMiniApps } from '@/stores/mini-apps'

const { closeModal } = useModal()
const { reopenMiniAppWebviewAfterResume } = storeToRefs(useApp())
const miniApps = useMiniApps()
const { deviceIdConsent } = storeToRefs(miniApps)

// Consent is keyed by origin; drop the scheme for display.
const deviceIdOrigins = computed(() => Object.keys(deviceIdConsent.value)
  .map(origin => ({ origin, label: origin.replace(/^https?:\/\//, '') })))
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

      <p class="text-space/60 text-sm font-bold text-left uppercase mt-6">
        {{ $t('Device ID access') }}
      </p>
      <p class="text-space/60 text-base mt-1">
        {{ $t('Mini Apps you allowed to read an ID for this device.') }}
      </p>
      <IonList lines="none">
        <IonItem v-for="{ origin, label } in deviceIdOrigins" :key="origin">
          <IonLabel class="truncate">
            {{ label }}
          </IonLabel>
          <IonButton slot="end" fill="clear" class="normal-case font-bold" :aria-label="`Revoke device ID access for ${label}`" @click="miniApps.revokeDeviceIdConsent(origin)">
            {{ $t('Revoke') }}
          </IonButton>
        </IonItem>
        <IonItem v-if="!deviceIdOrigins.length">
          <IonLabel class="text-space/60">
            {{ $t('No Mini App has access') }}
          </IonLabel>
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
