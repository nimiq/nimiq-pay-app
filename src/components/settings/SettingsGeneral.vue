<script setup lang="ts">
import type { IonToggleCustomEvent, ToggleChangeEventDetail } from '@ionic/core'
import { IonItem, IonList, IonSelect, IonSelectOption, IonToggle } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useNotifications } from '@/composables/useNotifications'
import { LANGUAGE_LABELS, setLanguage, SUPPORTED_LANGUAGES } from '@/i18n/i18n-setup'
import { stepEmits } from '@/lib/flows/steps.types'
import { DECIMALS, Fiat, PushNotificationsStatus, useApp } from '@/stores/app'

// Declared so Flow's step listeners (e.g. `select`) don't fall through as native DOM listeners on the root.
defineEmits(stepEmits)

const { language, selectedFiat, pushNotificationsStatus, showAnimations, decimalsAmount, showHiddenTransactions } = storeToRefs(useApp())
const { unregisterNotifications, registerNotifications, requestLocalNotificationsPermission } = useNotifications()
const nimDecimalsOptions = [0, 2, DECIMALS.NIM]

async function handlePushNotificationsToggle(event: IonToggleCustomEvent<ToggleChangeEventDetail>) {
  if (event.detail.checked && pushNotificationsStatus.value !== PushNotificationsStatus.GRANTED) {
    await registerNotifications()
    await requestLocalNotificationsPermission()
  }
  else if (!event.detail.checked && pushNotificationsStatus.value === PushNotificationsStatus.GRANTED) {
    await unregisterNotifications()
  }
}
</script>

<template>
  <div class="w-full flex flex-col pt-4">
    <IonList lines="none">
      <IonItem>
        <IonSelect
          :label="$t('Language')" :value="language"
          @ion-change="setLanguage($event.detail.value)"
        >
          <IonSelectOption v-for="lang in SUPPORTED_LANGUAGES" :key="lang" :value="lang">
            {{ LANGUAGE_LABELS[lang] }}
          </IonSelectOption>
        </IonSelect>
      </IonItem>

      <IonItem>
        <IonSelect
          :label="$t('Currency')" :value="selectedFiat"
          @ion-change="selectedFiat = $event.detail.value"
        >
          <IonSelectOption v-for="currency in Fiat" :key="currency" :value="currency">
            {{ currency }}
          </IonSelectOption>
        </IonSelect>
      </IonItem>

      <IonItem>
        <IonSelect
          :label="$t('Minimum NIM Decimals')" :value="decimalsAmount"
          @ion-change="decimalsAmount = $event.detail.value"
        >
          <IonSelectOption v-for="decimals in nimDecimalsOptions" :key="decimals" :value="decimals">
            {{ decimals || 'None' }}
          </IonSelectOption>
        </IonSelect>
      </IonItem>

      <IonItem>
        <IonToggle :checked="!showAnimations" @ion-change="showAnimations = !$event.detail.checked">
          {{ $t('Reduce Animations') }}
        </IonToggle>
      </IonItem>

      <IonItem>
        <IonToggle :checked="showHiddenTransactions" @ion-change="showHiddenTransactions = $event.detail.checked">
          {{ $t('Show hidden transactions') }}
        </IonToggle>
      </IonItem>

      <IonItem>
        <IonToggle :checked="pushNotificationsStatus === PushNotificationsStatus.GRANTED" @ion-change="handlePushNotificationsToggle">
          {{ $t('Receive Push Notifications') }}
        </IonToggle>
      </IonItem>
    </IonList>
  </div>
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-start: 0;
  --padding-end: 0;
}
</style>
