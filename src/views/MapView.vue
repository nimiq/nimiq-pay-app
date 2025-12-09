<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useApp } from '@/stores/app'

const MAP_URL = 'https://crypto-map.je-cf9.workers.dev/'

const { language } = storeToRefs(useApp())

const mapUrl = computed(() => {
  const langParam = `?lang=${language.value}`
  return `${MAP_URL}${langParam}`
})
</script>

<template>
  <IonPage>
    <IonContent :force-overscroll="false" :scroll-x="false" :scroll-y="false">
      <!-- eslint-disable-next-line vue/html-self-closing -- self closing iframe is invalid html which the i18n extractor can't parse -->
      <iframe class="fullscreen-iframe absolute" sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation" :src="mapUrl"></iframe>
    </IonContent>
  </IonPage>
</template>

<style scoped>
ion-content::part(scroll) {
  padding-top: var(--ion-safe-area-top, 0);
}

.fullscreen-iframe {
  height: 100%;
  height: -webkit-fill-available;
  width: 100vw;
}
</style>
