<script setup lang="ts">
import { PrivacyScreen } from '@capawesome/capacitor-privacy-screen'
import { IonButton } from '@ionic/vue'
import { computed, watch } from 'vue'
import MnemonicDisplay from '@/components/MnemonicDisplay.vue'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { useLocalWallet } from '@/stores/local-wallet'

const props = defineProps({ isVisible: Boolean })

defineEmits<{ done: [] }>()

const logger = useLogger('ShowWords')

const words = computed(() => {
  const { data, error } = useLocalWallet().getWords()
  if (error || !data) {
    logger.error('Error getting words', error)
    return null
  }
  return data
})

const { isIOS } = useDevice()

watch(() => props.isVisible, (isVisible, _, onCleanup) => {
  if (!isVisible)
    return

  // enable() sets FLAG_SECURE on Android, which would block screenshots of the words there.
  if (isIOS)
    PrivacyScreen.enable()

  const listener = PrivacyScreen.addListener('screenshotTaken', () => {
    logger.log('Screenshot taken')
    useToast().setToast({
      message: i18n.t('Store screenshot safely'),
      type: 'warning',
      duration: 10000,
    })
  })

  onCleanup(() => {
    if (isIOS)
      PrivacyScreen.disable()
    listener.then(handle => handle.remove())
  })
}, { immediate: true })
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
