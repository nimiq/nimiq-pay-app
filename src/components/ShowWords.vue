<script setup lang="ts">
import MnemonicDisplay from '@/components/MnemonicDisplay.vue'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { useLocalWallet } from '@/stores/local-wallet'
import { PrivacyScreen } from '@capacitor-community/privacy-screen'
import { IonButton } from '@ionic/vue'
import { ScreenshotEvent } from '@rdlabo/capacitor-screenshot-event'
import { computed, onUnmounted, watch } from 'vue'

const props = defineProps({ isVisible: Boolean })

defineEmits<{ done: [] }>()

const logger = useLogger('ShowWords')
const { isAndroid } = useDevice()

const words = computed(() => {
  const { data, error } = useLocalWallet().getWords()
  if (error || !data) {
    logger.error('Error getting words', error)
    return null
  }
  return data
})

ScreenshotEvent.addListener('userDidTakeScreenshot', () => {
  logger.log('Screenshot taken')
  useToast().setToast({
    message: i18n.t('Store screenshot safely'),
    type: 'warning',
    duration: 10000,
  })
})

watch(() => props.isVisible, (isVisible) => {
  if (isVisible) {
    // TODO: there is no way (yet) to enable privacy screen without restricting screenshots in Android
    if (!isAndroid)
      PrivacyScreen.enable()
    ScreenshotEvent.startWatchEvent()
  }
  else {
    PrivacyScreen.disable()
    ScreenshotEvent.removeWatchEvent()
  }
})
onUnmounted(() => {
  PrivacyScreen.disable()
  ScreenshotEvent.removeWatchEvent()
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
