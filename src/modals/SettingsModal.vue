<script setup lang="ts">
import { IonBackButton, IonButtons, IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { App } from '@capacitor/app'
import { computedAsync, onLongPress } from '@vueuse/core'
import { ref } from 'vue'
import { useModal } from '@/composables/useModal'
import { Fiat, useApp } from '@/stores/app'
import ModalTemplate from '@/components/ModalTemplate.vue'
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage } from '@/i18n/i18n-setup'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('SettingsModal')

const { closeModal } = useModal()
const { language, selectedFiat } = storeToRefs(useApp())
const htmlRefHook = ref<HTMLElement | null>(null)

const appVersion = computedAsync(async () => {
  try {
    return (await App.getInfo()).version
  }
  catch (e) {
    logger.error('Error getting app version:', e)
    return '0.0.0'
  }
})

function onLongPressCallback() {
  logger.sendReport()
}

onLongPress(
  htmlRefHook,
  onLongPressCallback,
  { modifiers: { prevent: true }, delay: 3 * 1e3 },
)
</script>

<template>
  <ModalTemplate :close-all="true">
    <template #leftButton>
      <IonButtons slot="start">
        <IonBackButton default-href="/" @click.prevent="closeModal()" />
      </IonButtons>
    </template>
    <div class="flex flex-col w-full h-full">
      <p class="text-sm font-bold text-left uppercase text-space/60">
        {{ $t('Settings') }}
      </p>
      <IonList lines="none">
        <IonItem>
          <IonSelect
            :label="$t('Language')" :value="language" class="text-lg font-semibold"
            @ion-change="setLanguage($event.detail.value)"
          >
            <IonSelectOption v-for="lang in SUPPORTED_LANGUAGES" :key="lang" :value="lang">
              {{ LANGUAGE_LABELS[lang] }}
            </IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem>
          <IonSelect
            :label="$t('Currency')" :value="selectedFiat" class="text-lg font-semibold"
            @ion-change="selectedFiat = $event.detail.value"
          >
            <IonSelectOption v-for="currency in Fiat" :key="currency" :value="currency">
              {{ currency }}
            </IonSelectOption>
          </IonSelect>
        </IonItem>
      </IonList>
      <code ref="htmlRefHook" class="p-4 pb-0 mt-auto text-sm opacity-60">v{{ appVersion }}</code>
    </div>
  </ModalTemplate>
</template>

<style scoped>
ion-item {
  --padding-start: 0;
  --padding-end: 0;
}
</style>
