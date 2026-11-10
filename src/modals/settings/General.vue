<script setup lang="ts">
import type { IonToggleCustomEvent, ToggleChangeEventDetail } from '@ionic/core'
import { IonBackButton, IonButtons, IonItem, IonList, IonSelect, IonSelectOption, IonToggle } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useModal } from '@/composables/useModal'
import { useNotifications } from '@/composables/useNotifications'
import { LANGUAGE_LABELS, setLanguage, SUPPORTED_LANGUAGES } from '@/i18n/i18n-setup'
import { DECIMALS, Fiat, PushNotificationsStatus, useApp } from '@/stores/app'

const { closeModal } = useModal()
const { language, selectedFiat, pushNotificationsStatus, showAnimations, decimalsAmount } = storeToRefs(useApp())
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
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <div class="w-full h-full flex flex-col">
      <p class="text-space/60 text-sm font-bold text-left uppercase">
        {{ $t('General') }}
      </p>
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
          <IonToggle :checked="pushNotificationsStatus === PushNotificationsStatus.GRANTED" @ion-change="handlePushNotificationsToggle">
            {{ $t('Receive Push Notifications') }}
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
