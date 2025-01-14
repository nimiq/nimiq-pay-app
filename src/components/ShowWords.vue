<script setup lang="ts">
import MnemonicDisplay from '@/components/MnemonicDisplay.vue'
import { useLocalWallet } from '@/stores/local-wallet'
import { PrivacyScreen } from '@capacitor-community/privacy-screen'
import { IonButton } from '@ionic/vue'
import { computed, onUnmounted, watch } from 'vue'

const props = defineProps({ isVisible: Boolean })
defineEmits<{ done: [] }>()
const words = computed(() => {
  const { data, error } = useLocalWallet().getWords()
  if (error || !data) {
    console.error('Error getting words', error)
    return null
  }
  return data
})

watch(() => props.isVisible, (isVisible) => {
  if (isVisible) {
    PrivacyScreen.enable()
  }
  else {
    PrivacyScreen.disable()
  }
})
onUnmounted(() => PrivacyScreen.disable())
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
