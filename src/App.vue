<script setup lang="ts">
import { IonApp, IonFab, IonFabButton, IonIcon } from '@ionic/vue'
import type { URLOpenListenerEvent } from '@capacitor/app'
import { App } from '@capacitor/app'
import { bugOutline } from 'ionicons/icons'
import { RouterView } from 'vue-router'
import { StatusBar, Style } from '@capacitor/status-bar'

import { OrientationType, ScreenOrientation } from '@capawesome/capacitor-screen-orientation'
import { onMounted } from 'vue'
import { until } from '@vueuse/core'
import { useDevice } from './composables/useDevice'
import { Modal, useModal } from '@/composables/useModal'
import { isDev } from '@/lib/index'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'

onMounted(async () => {
  if (!useDevice().isWeb)
    await ScreenOrientation.lock({ type: OrientationType.PORTRAIT_PRIMARY })
})

if (!useDevice().isWeb) {
  StatusBar.setBackgroundColor({ color: '#F8F8F8' })
  StatusBar.setStyle({ style: Style.Light })
  StatusBar.setOverlaysWebView({ overlay: false })
}

App.addListener('appUrlOpen', async (event: URLOpenListenerEvent) => {
  // Wait until the pin code is entered to show the payment request modal
  const { useDecrypt } = await import('@/composables/useDecrypt')
  await until(useDecrypt().decrypted).toBeTruthy()
  // Detect if the app was open with the lightning scheme
  const url = new URL(event.url)
  if (url.protocol === 'lightning:') {
    // Open the payment request modal
    initializeFlow(FlowName.NimOrPointsPayment, { qrCodeScanner: url.toString() })
  }
})
</script>

<template>
  <IonApp>
    <RouterView />
    <!-- DEV -->
    <IonFab v-if="isDev" slot="fixed" horizontal="end" vertical="bottom" style="z-index: 999999;">
      <IonFabButton @click="useModal().showModal(Modal.Dev, { isOnTop: true })">
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

/* iOS shit... */
.ios ion-modal {
  --border-radius: 20px;
}

.md ion-modal {
  --border-radius: 20px 20px 0 0;
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

ion-toast.notification-alert-toast{
  --background: #fff;
  --border-radius: 100px;
  --box-shadow: 0px 0px 4.12454px 0px rgba(31, 35, 72, 0.03), 0px 0px 12.51868px 0px rgba(31, 35, 72, 0.05), 0px 0px 32.00036px 0px rgba(31, 35, 72, 0.06), 0px 0px 80px 0px rgba(31, 35, 72, 0.07);
  --width: fit-content;
  padding-top: 100px;
}

ion-toast.notification-alert-toast::part(container){
  padding: 0 6px;
}

ion-toast.notification-alert-toast::part(icon) {
    width: 16px;
    height: 16px;
}

ion-toast.notification-alert-toast::part(message) {
    @apply text-black text-lg font-semibold;
}

body.scanner-active ion-app>:not(ion-modal) {
    display: none;
}

body.scanner-active ion-content, body.scanner-active .ion-page, body.scanner-active ion-modal {
    --background: none;
}

/* TODO: Remove this */
p, a, h1, h2, h3, h4, h5, h6 {
  @apply text-space;
}
</style>
