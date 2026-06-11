<script setup lang="ts">
import { App } from '@capacitor/app'
import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { StatusBar, Style } from '@capacitor/status-bar'
import { EdgeToEdge } from '@capawesome/capacitor-android-edge-to-edge-support'
import { Posthog } from '@capawesome/capacitor-posthog'
import { CameraPreview } from '@capgo/camera-preview'
import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { IonApp, IonFab, IonFabButton, IonIcon, IonRouterOutlet } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { bugOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NetworkOverrideBadge from '@/components/NetworkOverrideBadge.vue'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { Modal, useModal } from '@/composables/useModal'
import { trackCurrentAppOpen } from '@/lib/analytics'
import { shouldPreserveMiniAppSession, shouldReloadAppAfterBackground } from '@/lib/app-resume'
import { isDev } from '@/lib/index'
import { isMockEnabled } from '@/lib/mock-mode'
import { useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'

const logger = useLogger('App.vue')
const router = useRouter()

const devFabRef = ref<HTMLElement | null>(null)
const isDevFabHidden = ref(false)
onLongPress(
  devFabRef,
  () => { isDevFabHidden.value = true },
  { modifiers: { prevent: true }, delay: 3 * 1e3 },
)

onMounted(async () => {
  // Stop scanning in case it was still active
  document.body.classList.remove('native-qr-scanner-modal-open')
  try {
    await CameraPreview.stop()
  }
  catch {}

  if (!useDevice().isWeb) {
    try {
      await StatusBar.setBackgroundColor({ color: '#F8F8F8' })
      await StatusBar.setStyle({ style: Style.Light })
      await SystemBars.setStyle({ style: SystemBarsStyle.Light })
      await EdgeToEdge.setStatusBarColor({ color: '#F8F8F8' })
      await EdgeToEdge.setNavigationBarColor({ color: '#FFFFFF' })
    }
    catch (error) {
      logger.error('Failed to set status bar style', error)
    }
  }

  // Moved here because it was not locking if calling lock too early
  if (!useDevice().isWeb) {
    try {
      await ScreenOrientation.lock({ orientation: 'portrait' })
    }
    catch (error) {
      logger.error('Failed to lock screen orientation', error)
    }
  }
})

App.addListener('appUrlOpen', async (event) => {
  const { handleDeepLink } = await import('@/lib/deep-link')
  await handleDeepLink(event)
})

let lastPauseTimestamp = 0
App.addListener('pause', () => {
  const { isAppInBackground } = storeToRefs(useLocks())
  lastPauseTimestamp = Date.now()
  isAppInBackground.value = true
})

App.addListener('resume', async () => {
  const { reopenMiniAppWebviewAfterResume } = storeToRefs(useApp())
  const now = Date.now()
  const timeInBackground = now - lastPauseTimestamp
  logger.log(`App resumed, time in background: ${timeInBackground / 1000}s`)
  // To prevent unexpected behavior (consensus stuck, etc.) we reload the app if it was in background for more than 2 minutes
  if (shouldReloadAppAfterBackground(lastPauseTimestamp, now)) {
    logger.log('Reloading app after being in background for more than 2 minutes')
    await logger.forceSaveToFile()

    // If a mini-app webview is open, keep it only when auto-reopen is enabled
    const { getActiveMiniAppSession } = await import('@/composables/useMiniAppHost')
    const { clearSession, saveSession } = await import('@/composables/useMiniAppSession')
    const activeSession = getActiveMiniAppSession()
    const preserveSession = shouldPreserveMiniAppSession({
      hasActiveMiniAppSession: !!activeSession,
      reopenMiniAppWebviewAfterResume: reopenMiniAppWebviewAfterResume.value,
    })

    if (preserveSession && activeSession) {
      try {
        await InAppBrowser.hide()
        saveSession(activeSession)
        logger.log('Mini-app webview hidden, session saved for reconnection after PIN')
      }
      catch (err) {
        logger.error('Failed to hide webview, falling back to close:', err)
        await clearSession()
        try {
          await InAppBrowser.close()
        }
        catch {}
      }
    }
    else {
      await clearSession()
      if (activeSession && !reopenMiniAppWebviewAfterResume.value)
        logger.log('Mini-app webview auto-reopen disabled, closing webview on app reload')
      try {
        await InAppBrowser.close()
      }
      catch {}
    }

    lastPauseTimestamp = 0
    router.go(0)
  }
  const { useRemoteSignerApi } = await import('@/composables/useApi')
  const { useNimiqNetwork } = await import('@/stores/nimiq-network')
  const { height: localHeight } = storeToRefs(useNimiqNetwork())
  const { isAppStarting, isAppInBackground } = storeToRefs(useLocks())
  isAppInBackground.value = false

  if (isAppStarting.value)
    return

  trackCurrentAppOpen('resume')

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

  try {
  // Reload feature flags, it may have changed but not updated until app is closed and reopened
    await Posthog.reloadFeatureFlags()
  }
  catch {}
})
</script>

<template>
  <IonApp>
    <IonRouterOutlet />
    <NetworkOverrideBadge />
    <!-- DEV -->
    <!-- Hidden in mock mode (clean screenshots); DevModal stays reachable via the menu header long-press -->
    <IonFab v-if="isDev && !isDevFabHidden && !isMockEnabled" slot="fixed" horizontal="end" vertical="bottom" style="z-index: 999999;">
      <IonFabButton ref="devFabRef" @click="useModal().showModal(Modal.Dev, { isOnTop: true })">
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
