<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
</script>

<template>
  <IonPage>
    <IonContent :force-overscroll="false" :scroll-x="false" :scroll-y="false">
      <!-- eslint-disable-next-line vue/html-self-closing -- self closing iframe is invalid html which the i18n extractor can't parse -->
      <iframe class="h-full w-screen absolute" sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation" src="https://crypto-map.je-cf9.workers.dev/"></iframe>
    </IonContent>
  </IonPage>
</template>

<style scoped>
ion-content::part(scroll) {
  padding-top: var(--ion-safe-area-top, 0);
}
</style>
