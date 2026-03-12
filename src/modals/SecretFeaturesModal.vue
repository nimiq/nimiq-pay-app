<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { hash } from '@/composables/useDecrypt'
import { useLogger } from '@/composables/useLogger'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { useFeatureFlags } from '@/stores/feature-flags'

const logger = useLogger('SecretFeaturesModal')
const { closeAllModals } = useModal()

const { isNakaAvailable } = storeToRefs(useFeatureFlags())

const featureString = ref('')

async function handleEnableFeature() {
  logger.log(`Enabling secret feature: ${featureString.value}`)
  const hashedString = hash(featureString.value)
  // Implementation to enable the secret feature goes here
  switch (hashedString) {
    case 'e8464944cd74488bad4709d1e786fc9f7effe1038cce62cb2eacc736fdbdd9b0': // hash for 'nimiq-x-naka'
      logger.log('Secret feature "NAKA Card" enabled!')
      isNakaAvailable.value = true
      useToast().setToast({
        type: 'success',
        message: 'NAKA Card feature enabled!', // No i18n needed, only for devs
      })
      closeAllModals()
      break
    default:
      logger.log('Invalid secret feature password entered')
      useToast().setToast({
        type: 'error',
        message: 'Invalid secret feature password.',
      })
      break
  }
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ $t('Enter feature password') }}
    </template>
    <input v-model="featureString" type="password" class="nq-input-box">

    <IonButton class="self-end w-11/12 mx-auto mt-32 text-base red-button" @click="handleEnableFeature">
      <span>
        {{ $t('Check') }}
      </span>
    </IonButton>
  </ModalTemplate>
</template>
