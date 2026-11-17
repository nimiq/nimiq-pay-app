<script setup lang="ts">
import { computedAsync, onLongPress, useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import AppsIcon from '@/components/icons/apps.vue'
import CreditCardIcon from '@/components/icons/credit-card.vue'
import FingerprintIcon from '@/components/icons/fingerprint.vue'
import IdVerificationIcon from '@/components/icons/id-verification.vue'
import SettingsIcon from '@/components/icons/settings.vue'
import MenuItem from '@/components/MenuItem.vue'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { isMiniAppsEnabled } from '@/lib'
import { getBundleVersion, logDiagnostics } from '@/lib/diagnostics'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'

const emit = defineEmits(stepEmits)

const logger = useLogger('SettingsRoot')

const { showModal } = useModal()
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
  <div class="w-full flex-1 flex flex-col">
    <div class="flex flex-col gap-y-6 pt-8">
      <MenuItem
        :icon="SettingsIcon"
        :title="$t('General')"
        aria-label="General"
        @click="emit('navigateTo', { step: StepName.SettingsGeneral })"
      />
      <MenuItem
        :icon="FingerprintIcon"
        :title="$t('Security')"
        aria-label="Security"
        @click="emit('navigateTo', { step: StepName.SettingsSecurity })"
      />
      <MenuItem
        :icon="CreditCardIcon"
        :title="$t('Payments')"
        aria-label="Payments"
        @click="emit('navigateTo', { step: StepName.SettingsPayments })"
      />
      <MenuItem
        v-if="isMiniAppsEnabled"
        :icon="AppsIcon"
        :title="$t('Mini Apps')"
        aria-label="Mini Apps"
        @click="emit('navigateTo', { step: StepName.SettingsMiniApps })"
      />
      <MenuItem
        v-if="phoneNumberVerified"
        :icon="IdVerificationIcon"
        :title="$t('Account')"
        aria-label="Account"
        @click="emit('navigateTo', { step: StepName.SettingsAccount })"
      />
    </div>
    <code ref="htmlRefHook" class="mt-auto mx-auto p-4 text-sm opacity-60" @click="handleVersionClick">v{{ bundleVersion }}</code>
  </div>
</template>
