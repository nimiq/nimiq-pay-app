<script setup lang="ts">
import { Keyboard } from '@capacitor/keyboard'
import { IonContent, IonGrid, IonHeader, IonPage, IonToolbar } from '@ionic/vue'
import { onLongPress } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PinInput from '@/components/PinInput.vue'
import { useDecrypt } from '@/composables/useDecrypt'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { closeActiveMiniApp } from '@/composables/useMiniAppHost'
import { clearSession, getSession, hasPendingSession } from '@/composables/useMiniAppSession'
import { i18n } from '@/i18n/i18n-setup'
import { DEFERRED_DEEPLINK_KEY } from '@/lib/app-resume'
import { promiseWithTimeout } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'

const logger = useLogger('PinView')
const { dbExists } = storeToRefs(useConn())
const { decrypt, decrypted } = useDecrypt()
const router = useRouter()
const errorMsg = ref('')

const UNLOCK_PHASE_TIMEOUT = 15 * 1e3

let isSubmitting = false

const titleRef = ref<HTMLElement | null>(null)
onLongPress(titleRef, () => logger.sendReport(), { delay: 1000, distanceThreshold: false, modifiers: { prevent: true } })

async function handleSubmit(pin: string) {
  if (pin.length < 4 || isSubmitting)
    return false
  isSubmitting = true
  errorMsg.value = ''

  logger.log('🔓 handleSubmit: PIN submitted', { length: pin.length })
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
    const deferredDeepLink = sessionStorage.getItem(DEFERRED_DEEPLINK_KEY)
    sessionStorage.removeItem(DEFERRED_DEEPLINK_KEY)
    const session = getSession()
    if (session && deferredDeepLink) {
      await clearSession()
      await closeActiveMiniApp().catch(() => {})
    }
    else if (session) {
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
          await closeActiveMiniApp()
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
    if (deferredDeepLink) {
      const { handleDeepLink } = await import('@/lib/deep-link')
      void handleDeepLink({ url: deferredDeepLink }).catch(err => logger.error('Deferred deeplink failed:', err))
    }
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
    await clearSession()
    void closeActiveMiniApp().catch(() => {})
    router.replace('/setup')
  }
  else if (decrypted.value) {
    router.replace('/app')
  }
  else {
    if (!hasPendingSession())
      void closeActiveMiniApp().catch(() => {})
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
