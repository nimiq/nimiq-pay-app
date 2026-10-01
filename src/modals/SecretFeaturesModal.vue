<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { ref } from 'vue'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { sha256Hex } from '@/lib/crypto'

const logger = useLogger('SecretFeaturesModal')

const featureString = ref('')

async function handleEnableFeature() {
  logger.log(`Enabling secret feature: ${featureString.value}`)
  const hashedString = sha256Hex(featureString.value)
  // Add secret features as `case '<sha256 of password>':` branches
  switch (hashedString) {
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
