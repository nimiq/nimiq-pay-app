<script setup lang="ts">
import NakaVerificationCheckIcon from '@/components/icons/naka-id-verification.vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'

const emit = defineEmits(stepEmits)

async function register() {
  // eslint-disable-next-line no-console
  console.log('Naka: Here your SDK should be called')

  emit('done')
}
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <div class="flex flex-1 items-center justify-center">
      <NakaVerificationCheckIcon class="translate-y-[-10%]" />
    </div>
    <p class="text-center mb-4 text-opacity-60">
      {{ $t('By proceeding, you are agreeing to NAKA\'s Terms & Conditions and Privacy Policy') }}
    </p>
    <IonButton size="small" class="self-stretch my-6 text-base font-bold mt-auto" @click="register">
      {{ $t('Verify ID') }}
    </IonButton>
  </div>
</template>
