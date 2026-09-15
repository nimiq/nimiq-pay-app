<script setup lang="ts">
import type { IonToggleCustomEvent, ToggleChangeEventDetail } from '@ionic/core'
import { App } from '@capacitor/app'
import { Device } from '@capacitor/device'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { IonBackButton, IonButtons, IonItem, IonLabel, IonList, IonNote, IonSelect, IonSelectOption, IonToggle } from '@ionic/vue'
import { computedAsync, onLongPress, useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeMount, ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useBiometric } from '@/composables/useBiometric'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { useNotifications } from '@/composables/useNotifications'
import { toCoins } from '@/composables/usePrice'
import { LANGUAGE_LABELS, setLanguage, SUPPORTED_LANGUAGES } from '@/i18n/i18n-setup'
import { isMiniAppsEnabled } from '@/lib'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { Crypto, DECIMALS, Fiat, PushNotificationsStatus, useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { useRemoteSigner } from '@/stores/remote-signer'

const logger = useLogger('SettingsModal')

const { showModal, closeModal } = useModal()
const { isBiometricSupported, isBiometricEnabled, updateBiometryInfo } = useBiometric()
const { getAllRemoteSigners } = useRemoteSigner()
const {
  language,
  selectedFiat,
  pushNotificationsStatus,
  phoneNumberVerified,
  showAnimations,
  decimalsAmount,
  htlcThreshold,
  reopenMiniAppWebviewAfterResume,
} = storeToRefs(useApp())

// Threshold is stored in luna; show it in NIM. Edited via the AutoDepositThreshold modal.
const htlcThresholdNim = computed(() => toCoins(htlcThreshold.value, Crypto.NIM))
const { headChangePendingDrainLock, htlcCheckLock, headChangeUpdatesLock, isNetworkReconnecting, isProcessingRemote, isSendingTx, isSyncingWallets, isUpdatingTransactions } = storeToRefs(useLocks())

const { unregisterNotifications, registerNotifications, requestLocalNotificationsPermission } = useNotifications()
const htmlRefHook = ref<HTMLElement | null>(null)
const nimDecimalsOptions = [0, 2, DECIMALS.NIM]

const bundleVersion = computedAsync(async () => {
  try {
    const version = (await CapacitorUpdater.current()).bundle.version
    if (version)
      return version
  }
  catch (e) {
    logger.error('Error getting bundle version:', e)
  }

  try {
    return (await App.getInfo()).version
  }
  catch (e) {
    logger.error('Error getting native version:', e)
    return '0.0.0'
  }
})
async function onLongPressCallback() {
  logger.log({
    headChangePendingDrainLock: headChangePendingDrainLock.value,
    htlcCheckLock: htlcCheckLock.value,
    headChangeUpdatesLock: headChangeUpdatesLock.value,
    isNetworkReconnecting: isNetworkReconnecting.value,
    isProcessingRemote: isProcessingRemote.value,
    isSendingTx: isSendingTx.value,
    isSyncingWallets: isSyncingWallets.value,
    isUpdatingTransactions: isUpdatingTransactions.value,
  })

  logger.log('Remote signers:', await getAllRemoteSigners())
  logger.log('Device Info:', await Device.getInfo())
  logger.log(`Nimiq Pay bundle v${bundleVersion.value}`)
  logger.sendReport()
}

async function handlePushNotificationsToggle(event: IonToggleCustomEvent<ToggleChangeEventDetail>) {
  if (event.detail.checked && pushNotificationsStatus.value !== PushNotificationsStatus.GRANTED) {
    await registerNotifications()
    await requestLocalNotificationsPermission()
  }
  else if (!event.detail.checked && pushNotificationsStatus.value === PushNotificationsStatus.GRANTED) {
    await unregisterNotifications()
  }
}

function handleBiometricToggle(event: IonToggleCustomEvent<ToggleChangeEventDetail>) {
  if (event.detail.checked)
    showModal(Modal.EnableBiometric, { isOnTop: true })
  else
    isBiometricEnabled.value = false
}

const clickCount = ref(0)
const { start: startClickTimer, stop: stopClickTimer } = useTimeoutFn(() => {
  clickCount.value = 0
}, 2000, { immediate: false })

function handleVersionClick() {
  startClickTimer()

  clickCount.value++

  if (clickCount.value >= 5) {
    logger.log('Opening Secret Features Modal')
    clickCount.value = 0
    stopClickTimer()
    showModal(Modal.SecretFeatures)
  }
}

onLongPress(
  htmlRefHook,
  onLongPressCallback,
  { modifiers: { prevent: true }, delay: 3 * 1e3 },
)

onBeforeMount(updateBiometryInfo)
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
          <IonSelect
            :label="$t('Minimum NIM Decimals')" :value="decimalsAmount"
            @ion-change="decimalsAmount = $event.detail.value"
          >
            <IonSelectOption v-for="decimals in nimDecimalsOptions" :key="decimals" :value="decimals">
              {{ decimals || 'None' }}
            </IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem button :detail="false" @click="showModal(Modal.AutoDepositThreshold, { isOnTop: true, isSmall: true })">
          <IonLabel>{{ $t('Auto-deposit threshold') }}</IonLabel>
          <IonNote slot="end" class="text-lg">
            {{ htlcThresholdNim }} NIM
          </IonNote>
        </IonItem>

        <IonItem>
          <IonToggle :checked="pushNotificationsStatus === PushNotificationsStatus.GRANTED" @ion-change="handlePushNotificationsToggle">
            {{ $t('Receive Push Notifications') }}
          </IonToggle>
        </IonItem>

        <IonItem v-if="isBiometricSupported">
          <IonToggle :checked="isBiometricEnabled" @ion-change="handleBiometricToggle">
            {{ $t('Biometric Authentication') }}
          </IonToggle>
        </IonItem>

        <IonItem>
          <IonToggle :checked="!showAnimations" @ion-change="showAnimations = !$event.detail.checked">
            {{ $t('Reduce Animations') }}
          </IonToggle>
        </IonItem>

        <IonItem v-if="isMiniAppsEnabled">
          <IonToggle :checked="reopenMiniAppWebviewAfterResume" @ion-change="reopenMiniAppWebviewAfterResume = $event.detail.checked">
            {{ $t('Reopen Mini App on unlock') }}
          </IonToggle>
        </IonItem>

        <!-- TODO: fix this -->
        <IonItem button :detail="false" @click="initializeFlow(FlowName.ChangePin)">
          <IonLabel>{{ $t('Change PIN') }}</IonLabel>
        </IonItem>

        <IonItem v-if="phoneNumberVerified" button :detail="false" class="text-cherry" @click="showModal(Modal.DeletePoints, { isOnTop: true, isSmall: true })">
          <IonLabel>{{ $t('Delete Cryptocity Points account') }}</IonLabel>
        </IonItem>
      </IonList>
      <code ref="htmlRefHook" class="mt-auto p-4 pb-0 text-sm opacity-60" @click="handleVersionClick">v{{ bundleVersion }}</code>
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
