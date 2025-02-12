<script setup lang="ts">
import type { URLOpenListenerEvent } from '@capacitor/app'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { isDev } from '@/lib/index'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { OrientationType, ScreenOrientation } from '@capawesome/capacitor-screen-orientation'
import { CameraPreview } from '@capgo/camera-preview'
import { IonApp, IonFab, IonFabButton, IonIcon } from '@ionic/vue'
import { until } from '@vueuse/core'
import { bugOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'

const logger = useLogger('App.vue')
const router = useRouter()

onMounted(async () => {
  if (!useDevice().isWeb) {
    try {
      await ScreenOrientation.lock({ type: OrientationType.PORTRAIT_PRIMARY })
    }
    catch (error) {
      logger.error('Failed to lock screen orientation', error)
    }
  }

  // Stop scanning in case it was still active
  document.body.classList.remove('native-qr-scanner-modal-open')
  try {
    await CameraPreview.stop()
  }
  catch {}
})

if (!useDevice().isWeb) {
  try {
    if (useDevice().isAndroid) {
      StatusBar.setBackgroundColor({ color: '#F8F8F8' })
      StatusBar.setOverlaysWebView({ overlay: false })
    }
    StatusBar.setStyle({ style: Style.Light })
  }
  catch (error) {
    logger.error('Failed to set status bar style', error)
  }
}

App.addListener('appUrlOpen', async (event: URLOpenListenerEvent) => {
  // Wait until the pin code is entered to show the payment request modal
  const { useDecrypt } = await import('@/composables/useDecrypt')
  await until(useDecrypt().decrypted).toBeTruthy()
  // Detect if the app was open with the lightning scheme
  const url = new URL(event.url)
  // TODO: accept also nimiq: scheme?
  if (url.protocol === 'lightning:') {
    // Open the payment request modal
    initializeFlow(FlowName.NimOrPointsPayment, { qrCodeScanner: url.toString() })
  }
})

let lastPauseTimestamp = 0
App.addListener('pause', () => lastPauseTimestamp = Date.now())

App.addListener('resume', async () => {
  const timeInBackground = Date.now() - lastPauseTimestamp
  logger.log(`App resumed, time in background: ${timeInBackground / 1000}s`)
  // To prevent unexpected behavior (consensus stuck, etc.) we reload the app if it was in background for more than 2 minutes
  if (lastPauseTimestamp !== 0 && timeInBackground > 2 * 60 * 1000) {
    logger.log('Reloading app after being in background for more than 2 minutes')
    await logger.forceSaveToFile()
    lastPauseTimestamp = 0
    router.go(0)
  }
  const { useRemoteSignerApi } = await import('@/composables/useApi')
  const { useNimiqNetwork } = await import('@/stores/nimiq-network')
  const { height: localHeight } = storeToRefs(useNimiqNetwork())

  const { getStatus } = useRemoteSignerApi()
  const { data, hasError } = await getStatus()
  if (hasError)
    return
  const { blockHeight: remoteHeight } = data

  logger.log('App resumed', { localHeight: localHeight.value, remoteHeight })
  if (localHeight.value < remoteHeight - Nimiq.Policy.BLOCKS_PER_BATCH) {
    logger.log('Local height is behind remote height, reconnecting...')
    useNimiqNetwork().reconnect()
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
  --max-width: calc(100vw - 20px);
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
