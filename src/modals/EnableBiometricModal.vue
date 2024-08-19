<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useBiometric } from '@/composables/useBiometric'
import ModalTemplate from '@/components/ModalTemplate.vue'
import PinInput from '@/components/PinInput.vue'
import { hash } from '@/composables/useDecrypt'
import { useApp } from '@/stores/app'
import { i18n } from '@/i18n/i18n-setup'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'

const { isBiometricEnabled, setPinToSecureStorage } = useBiometric()
const { closeModal } = useModal()
const { pinHash } = storeToRefs(useApp())
const errorMsg = ref('')

async function handleSubmit(pin: string) {
  if (pin.length < 4)
    return false

  if (hash(pin) !== pinHash.value) {
    errorMsg.value = i18n.t('Invalid PIN')
    window.setTimeout(() => {
      errorMsg.value = ''
    }, 2000)
    return
  }

  const { success, error } = await setPinToSecureStorage(pin)
  if (success) {
    isBiometricEnabled.value = true
    useToast().setToast({ message: i18n.t('Biometric authentication enabled') })
    closeModal()
  }
  else if (error) {
    errorMsg.value = error
    window.setTimeout(() => {
      errorMsg.value = ''
    }, 2000)
  }
  else {
    errorMsg.value = i18n.t('An unknown error ocurred, biometric cannot be used')
    window.setTimeout(() => {
      errorMsg.value = ''
    }, 2000)
  }
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ $t('Biometric Authentication') }}
    </template>
    <template #subtitle>
      {{ $t('Enter your PIN to enable biometric authentication') }}
    </template>
    <PinInput :input-length="4" :error-msg="errorMsg" :should-auto-focus="true" @done="handleSubmit" />
  </ModalTemplate>
</template>
