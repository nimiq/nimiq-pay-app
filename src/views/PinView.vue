<script setup lang="ts">
import { Keyboard } from '@capacitor/keyboard'
import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { IonContent, IonGrid, IonHeader, IonPage, IonToolbar } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PinInput from '@/components/PinInput.vue'
import { useDecrypt } from '@/composables/useDecrypt'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { clearSession, getSession, hasPendingSession } from '@/composables/useMiniAppSession'
import { i18n } from '@/i18n/i18n-setup'
import { promiseWithTimeout } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'

const logger = useLogger('PinView')
const { dbExists } = storeToRefs(useConn())
const { decrypt, decrypted } = useDecrypt()
const router = useRouter()
const errorMsg = ref('')

// Each unlock phase must finish within this window; a hang past it surfaces a visible error
// instead of a silently stuck PIN screen. Generous so slow devices / DB migrations don't trip it.
const UNLOCK_PHASE_TIMEOUT = 15 * 1e3

// Biometric and manual entry can both emit done, so a second submit must not start while one runs.
let isSubmitting = false

// Escape hatch to export logs if login fails here (Settings is unreachable while stuck): hold the
// title ~1s. distanceThreshold:false so a small finger movement during the hold — or IonContent
// stealing the pointermove — can't cancel it (the old 3s + default threshold was unreliable).
const titleRef = ref<HTMLElement | null>(null)
onLongPress(titleRef, () => logger.sendReport(), { delay: 1000, distanceThreshold: false, modifiers: { prevent: true } })

async function handleSubmit(pin: string) {
  if (pin.length < 4 || isSubmitting)
    return false
  isSubmitting = true
  // Reset so a repeated identical error still reaches PinInput's watcher and clears its spinner.
  errorMsg.value = ''

  logger.log('🔓 handleSubmit: PIN submitted', { length: pin.length })
  // Anything that throws OR hangs here (decrypt, mini-app reconnect, navigation) must surface as a
  // visible, recoverable error — otherwise the failure is swallowed and the user is left silently
  // stuck on the PIN screen. Each phase is timeout-guarded so a hang cannot wedge the screen.
  try {
    logger.log('🔓 handleSubmit: decrypt start')
    const error = await promiseWithTimeout(decrypt(pin), UNLOCK_PHASE_TIMEOUT)
    logger.log('🔓 handleSubmit: decrypt done', { error })
    if (error) {
      errorMsg.value = error
      window.setTimeout(() => {
        errorMsg.value = ''
      }, 2000)
      return
    }

    // A Mini App hidden before the reload is relaunched, not reattached: its page may
    // have navigated off origin while no host was listening, and the plugin can't
    // report the current URL. Cookies stay so the user remains logged in.
    const session = getSession()
    if (session) {
      logger.log('🔓 handleSubmit: Mini App relaunch start')
      try {
        const { launchMiniApp } = await import('@/lib/mini-app-launcher')
        const app = useApp()
        await promiseWithTimeout(launchMiniApp({
          url: session.url,
          title: session.title,
          source: 'resume',
          language: app.language,
          userFiat: app.selectedFiat,
          keepCookies: true,
        }), UNLOCK_PHASE_TIMEOUT)
        logger.log('🔓 handleSubmit: Mini App relaunch done')
      }
      catch (err) {
        logger.error('Failed to relaunch Mini App session:', err)
        await clearSession()
        try {
          await InAppBrowser.close()
        }
        catch {}
      }
    }

    logger.log('🔓 handleSubmit: router.replace(/app) start')
    const navigationFailure = await promiseWithTimeout(router.replace('/app'), UNLOCK_PHASE_TIMEOUT)
    // A failed navigation resolves instead of throwing; surface it, or PinInput's spinner never clears.
    if (navigationFailure)
      throw navigationFailure
    logger.log('🔓 handleSubmit: router.replace(/app) done')
  }
  catch (err) {
    logger.error('Login failed after PIN entry', err)
    errorMsg.value = i18n.t('Something went wrong decrypting the database. Try reloading the app.')
    window.setTimeout(() => {
      errorMsg.value = ''
    }, 4000)
  }
  finally {
    isSubmitting = false
  }
}

function shown() {
  const input = document.querySelector('input')
  window.setTimeout(() => {
    input?.focus()
    try {
      if (useDevice().isAndroid)
        Keyboard.show()
    }
    catch (error) {
      logger.error('Failed to show keyboard', error)
    }
  }, 200)
}

onMounted(async () => {
  if (!dbExists.value) {
    // No wallet — clear any stale session and close orphaned webview
    await clearSession()
    try {
      InAppBrowser.close()
    }
    catch {}
    router.replace('/setup')
  }
  else if (decrypted.value) {
    router.replace('/app')
  }
  else {
    // PIN screen shown — only close webview if there's no pending session to preserve
    if (!hasPendingSession()) {
      try {
        InAppBrowser.close()
      }
      catch {}
    }
  }
  shown()
})
</script>

<template>
  <IonPage class="bg-[#F8F8F8]">
    <IonHeader class="ion-no-border">
      <IonToolbar />
    </IonHeader>
    <IonContent class="ion-padding text-center" style="--background: #F8F8F8">
      <IonGrid class="h-full flex flex-col" aria-label="Enter PIN">
        <h1 ref="titleRef" class="font-bold">
          {{ $t('Enter PIN') }}
        </h1>
        <PinInput :input-length="4" :error-msg="errorMsg" :can-use-biometric="true" show-loading @done="handleSubmit" />
      </IonGrid>
    </IonContent>
  </IonPage>
</template>
