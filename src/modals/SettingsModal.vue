<script setup lang="ts">
import { IonBackButton, IonButtons } from '@ionic/vue'
import { computedAsync, onLongPress, useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import AppsIcon from '@/components/icons/apps.vue'
import CreditCardIcon from '@/components/icons/credit-card.vue'
import FingerprintIcon from '@/components/icons/fingerprint.vue'
import IdVerificationIcon from '@/components/icons/id-verification.vue'
import SettingsIcon from '@/components/icons/settings.vue'
import MenuItem from '@/components/MenuItem.vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { isMiniAppsEnabled } from '@/lib'
import { getBundleVersion, logDiagnostics } from '@/lib/diagnostics'
import { useApp } from '@/stores/app'

const logger = useLogger('SettingsModal')

const { showModal, closeModal } = useModal()
const { phoneNumberVerified } = storeToRefs(useApp())

const htmlRefHook = ref<HTMLElement | null>(null)

const bundleVersion = computedAsync(getBundleVersion)

async function onLongPressCallback() {
  await logDiagnostics()
  logger.sendReport()
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
      <div class="flex flex-col gap-y-6 pt-4">
        <MenuItem
          :icon="SettingsIcon"
          :title="$t('General')"
          aria-label="General"
          @click="showModal(Modal.SettingsGeneral, { isOnTop: true })"
        />
        <MenuItem
          :icon="FingerprintIcon"
          :title="$t('Security')"
          aria-label="Security"
          @click="showModal(Modal.SettingsSecurity, { isOnTop: true })"
        />
        <MenuItem
          :icon="CreditCardIcon"
          :title="$t('Payments')"
          aria-label="Payments"
          @click="showModal(Modal.SettingsPayments, { isOnTop: true })"
        />
        <MenuItem
          v-if="isMiniAppsEnabled"
          :icon="AppsIcon"
          :title="$t('Mini Apps')"
          aria-label="Mini Apps"
          @click="showModal(Modal.SettingsMiniApps, { isOnTop: true })"
        />
        <MenuItem
          v-if="phoneNumberVerified"
          :icon="IdVerificationIcon"
          :title="$t('Account')"
          aria-label="Account"
          @click="showModal(Modal.SettingsAccount, { isOnTop: true })"
        />
      </div>
      <code ref="htmlRefHook" class="mt-auto p-4 pb-0 text-sm opacity-60" @click="handleVersionClick">v{{ bundleVersion }}</code>
    </div>
  </ModalTemplate>
</template>
