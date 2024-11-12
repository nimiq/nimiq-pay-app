<script setup lang="ts">
import MnemonicDisplay from '@/components/MnemonicDisplay.vue'
import { i18n } from '@/i18n/i18n-setup'
import { useLocalWallet } from '@/stores/local-wallet'
import { IonButton } from '@ionic/vue'
import { asyncComputed } from '@vueuse/core'

defineEmits<{ done: [], skip: [] }>()

const words = asyncComputed(() => useLocalWallet().getWords().then(({ data }) => data || []), [i18n.t('Loading...')])
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <MnemonicDisplay :recovery-words="words" class="mt-[30%]" />
    <IonButton size="small" class="self-stretch mt-auto mb-6 text-base font-bold" @click="$emit('done')">
      {{ $t('Continue') }}
    </IonButton>
  </div>
</template>
