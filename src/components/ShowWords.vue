<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { asyncComputed } from '@vueuse/core'
import MnemonicDisplay from '@/components/MnemonicDisplay.vue'
import { useLocalWallet } from '@/stores/local-wallet'
import { i18n } from '@/i18n/i18n-setup'

defineEmits<{ done: []; skip: [] }>()

const words = asyncComputed(() => useLocalWallet().getWords().then(({ data }) => data || []), [i18n.t('Loading...')])
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <MnemonicDisplay :recovery-words="words" class="mt-8" />
    <IonButton size="small" class="text-base font-bold mt-auto mb-6 self-stretch" @click="$emit('done')">
      {{ $t('Continue') }}
    </IonButton>
  </div>
</template>
