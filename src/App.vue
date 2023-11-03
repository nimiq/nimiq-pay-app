<script setup lang="ts">
import { IonApp, IonFab, IonFabButton, IonIcon, isPlatform } from '@ionic/vue'
import { bugOutline } from 'ionicons/icons'
import { RouterView, useRouter } from 'vue-router'
import { StatusBar } from '@capacitor/status-bar'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { ModalType, useModal } from '@/composables/useModal'

const isDev = true || import.meta.env.DEV

StatusBar.setBackgroundColor({ color: '#F8F8F8' })
StatusBar.setOverlaysWebView({ overlay: false })

useRouter().afterEach(async () => {
  await useModal().closeModal()
  // Just in case the barcode has started scanning and the app has been navigated away from
  document.body.classList.remove('scanner-active')
  await BarcodeScanner.showBackground()
  await BarcodeScanner.stopScan()
})
</script>

<template>
  <IonApp>
    <RouterView />
    <!-- DEV -->
    <IonFab v-if="isDev" slot="fixed" horizontal="end" vertical="bottom" style="z-index: 999999;">
      <IonFabButton @click="() => useModal().showModal(ModalType.Dev, { isOnTop: true })">
        <IonIcon :icon="bugOutline" />
      </IonFabButton>
    </IonFab>
    <!-- !DEV -->
  </IonApp>
</template>

<style>
/* TODO: move this to variables or something */
ion-toolbar {
  --background: transparent;
}

input.pin {
  font-size: 40px;
  letter-spacing: clamp(10px, 8vw, 10rem);
  @apply w-full border-0 outline-none text-center caret-transparent ml-8;
}

input.phone {
  font-size: 20px;
}

ion-modal ion-toolbar {
    --border-color: transparent;
    --background: var(--ion-background-color, #fff);
}

.sc-ion-buttons-md-s ion-button,
.sc-ion-buttons-ios-s ion-button {
  --padding-top: 9px;
  --padding-bottom: 10px;
  --padding-start: 12px;
  --padding-end: 12px;
}

ion-button {
  --border-radius: 10rem !important;
  --padding-start: 12px;
  --padding-end: 12px;
  --padding-top: 22px;
  --padding-bottom: 22px;
  @apply uppercase font-bold;
}

ion-button:not(.button-clear){
  --background: var(--radial-gradient-light-blue);
}

ion-back-button {
  @apply text-space/30;
}

body.scanner-active ion-app>:not(ion-modal) {
    display: none;
}

body.scanner-active ion-content, body.scanner-active .ion-page, body.scanner-active ion-modal {
    --background: none;
}

/* TODO: Remove this */
p, a, h1, h2, h3, h4, h5, h6, svg {
  color: #1f2348;
}
</style>
