<script setup lang="ts">
import MnemonicDisplay from '@/components/MnemonicDisplay.vue'
import { useLocalWallet } from '@/stores/local-wallet'
import { IonButton } from '@ionic/vue'
import { computed } from 'vue'

defineEmits<{ done: [], skip: [] }>()

const words = computed(() => {
  const { data, error } = useLocalWallet().getWords()
  if (error || !data) {
    console.error('Error getting words', error)
    return null
  }
  return data
})
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <MnemonicDisplay v-if="words" :recovery-words="words" class="mt-[30%]" />
    <p v-else class="text-center mt-[30%]">
      {{ $t('Loading') }}...
    </p>
    <IonButton size="small" class="self-stretch mt-auto mb-6 text-base font-bold" @click="$emit('done')">
      {{ $t('Continue') }}
    </IonButton>
  </div>
</template>
