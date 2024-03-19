<script setup lang="ts">
import { IonAlert, IonBackButton, IonButtons, IonIcon, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonToggle } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { App } from '@capacitor/app'
import { computedAsync, onLongPress } from '@vueuse/core'
import { ref } from 'vue'
import { useModal } from '@/composables/useModal'
import { Fiat, PushNotificationsStatus, useApp } from '@/stores/app'
import ModalTemplate from '@/components/ModalTemplate.vue'
import ItemDivider from '@/components/ItemDivider.vue'
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage } from '@/i18n/i18n-setup'
import { useLogger } from '@/composables/useLogger'
import { useNotifications } from '@/composables/useNotifications'

const logger = useLogger('SettingsModal')

const { closeModal } = useModal()
const { language, selectedFiat, pushNotificationsStatus } = storeToRefs(useApp())
const { unregisterNotifications, registerNotifications } = useNotifications()
const htmlRefHook = ref<HTMLElement | null>(null)

const appVersion = computedAsync(async () => {
  try {
    return (await App.getInfo()).version
  }
  catch (e) {
    logger.error('Error getting app version:', e)
    return '0.0.0'
  }
})

const deleteAlertButtons = [
  {
    text: 'Cancel',
    role: 'cancel',
  },
  {
    text: 'OK',
    role: 'confirm',
    handler: handleDeletePoints,
  },
]

function onLongPressCallback() {
  logger.sendReport()
}

async function handlePushNotificationsToggle(event: CustomEvent) {
  if (event.detail.checked && pushNotificationsStatus.value !== PushNotificationsStatus.GRANTED)
    registerNotifications()

  else if (!event.detail.checked && pushNotificationsStatus.value === PushNotificationsStatus.GRANTED)
    unregisterNotifications()
}

function handleDeletePoints() {
  console.log('TODO') // eslint-disable-line no-console
}

onLongPress(
  htmlRefHook,
  onLongPressCallback,
  { modifiers: { prevent: true }, delay: 3 * 1e3 },
)
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <div class="flex flex-col w-full h-full">
      <p class="text-sm font-bold text-left uppercase text-space/60">
        {{ $t('Settings') }}
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
          <IonToggle :checked="pushNotificationsStatus === PushNotificationsStatus.GRANTED" @ion-change="handlePushNotificationsToggle">
            Receive Push Notifications
          </IonToggle>
        </IonItem>

        <ItemDivider />

        <IonItem id="present-deletion-alert" button :detail="false">
          <IonLabel>{{ $t('Delete Cryptocity Points account') }}</IonLabel>
          <IonIcon slot="end" :icon="chevronForwardOutline" size="large" class="h-5 text-space/50" aria-hidden="true" />
        </IonItem>
      </IonList>
      <code ref="htmlRefHook" class="p-4 pb-0 mt-auto text-sm opacity-60">v{{ appVersion }}</code>
    </div>
  </ModalTemplate>
  <IonAlert
    trigger="present-deletion-alert"
    header="Are you sure?"
    sub-header="This action will permanently delete your points"
    message="To deter fraud, a secure log of deleted accounts will be retained for a period of 12 months. Should you decide to re-enroll, previous activities or data will not be recoverable."
    :buttons="deleteAlertButtons"
  />
</template>

<style scoped>
ion-item {
  @apply text-lg font-semibold;
  --padding-start: 0;
  --padding-end: 0;
}
</style>
